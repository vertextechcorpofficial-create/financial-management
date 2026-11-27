"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Inbox, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date, dateTime, isCalendarDate, peso } from "@/modules/financial-management/cooperative/members/format";
import { copyText } from "@/modules/financial-management/property-ledger/utils/clipboard";
import { CardGridSkeleton, DetailSkeleton, EmptyState, MetricCard, MetricCardsSkeleton, StatusChip, TableRowsSkeleton } from "../../components/ui";
import { useLifecycleCommand, useLifecycleRead } from "../../loans/lifecycle-client";
import type { listRemittanceDeductions, listRemittancePreparation, previewRemittancePreparation, readPreparedRemittance } from "../../server/remittance-preparation";
import { maxRemittanceProofBytes, maxRemittanceSelection, remittanceChannels, remittancePenalty, remittanceStatuses, remittanceTotals,
  type RemittanceChannel } from "./rules";

const endpoint = "/api/fm/government-loans/remittances/preparation";
type View = Awaited<ReturnType<typeof listRemittancePreparation>>;
type Item = View["items"][number];
type Preview = Awaited<ReturnType<typeof previewRemittancePreparation>>;
type Saved = Exclude<Awaited<ReturnType<typeof readPreparedRemittance>>, Response>;
const money = (value: string | null) => value === null ? "—" : peso(value);
const validAmount = /^(?:\d{1,13})(?:\.\d{1,2})?$/;
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", month: "short", year: "numeric",
}).format(new Date(month + "-01T00:00:00Z"));

function agencyTone(name: string) {
  const value = name.toLowerCase();
  if (value.includes("pag-ibig") || value.includes("hdmf")) return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (value.includes("sss") || value.includes("social security")) return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (value.includes("bank")) return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return "text-muted-foreground";
}

function AgencyBadge({ name, code }: { name: string; code: string }) {
  return <Badge variant="outline" className={agencyTone(name)}>{code || name}</Badge>;
}

function policyLabel(policy: Item["policy"]) {
  const deadline = policy.deadlineRule === "FIXED_DAY" ? `day ${policy.deadlineDay} of the following month` : "end of the following month";
  const penalty = policy.penaltyBasis === "NONE" ? "no penalty"
    : `${policy.penaltyRatePercent}% · ${policy.penaltyBasis.replaceAll("_", " ").toLowerCase()}`;
  return `${deadline} · ${penalty}`;
}

function statusDetail(row: Item) {
  if (row.status === "due" || row.status === "overdue" || row.status === "approved") return row.deadlineLabel;
  if (row.status === "returned") return row.payment?.returnReason ?? "Re-record required";
  if (row.status === "awaiting_payroll") return "No confirmed withholding";
  if (row.status === "nothing") return "No withholding for this month";
  return null;
}

function StatusBadge({ row }: { row: Item }) {
  const dueToday = row.status === "due" && row.deadlineLabel === "due today";
  const detail = dueToday ? null : statusDetail(row);
  return <div className="min-w-0 space-y-1">
    <StatusChip status={row.status} label={dueToday ? row.label : remittanceStatuses[row.status]} />
    {detail && <p className="max-w-56 text-xs text-muted-foreground">{detail}</p>}
  </div>;
}

function SummaryPills({ data }: { data: View }) {
  const counts = data.counts;
  const actionable = data.actionable;
  return <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
    <MetricCard icon={AlertTriangle} label="Needs action" value={actionable.count}
      detail={actionable.withheld !== "0.00" ? peso(actionable.withheld) + " withheld" : "Nothing to remit"}
      tone="amber" alert={actionable.count > 0} />
    <MetricCard icon={Clock3} label="Awaiting approval" value={counts.pending} detail="Prepared, not yet approved" tone="sky" />
    <MetricCard icon={Clock3} label="Awaiting Payroll" value={counts.awaiting_payroll} detail="No confirmed Payroll result" tone="slate" />
    <MetricCard icon={CheckCircle2} label="Nothing to remit" value={counts.nothing} detail="No withholding for the month" tone="emerald" />
  </div>;
}

export function IncludedDeductions({ url, initiallyExpanded = false }: { url: string; initiallyExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [page, setPage] = useState(1);
  const [refresh, reload] = useState(0);
  const [copied, setCopied] = useState(false);
  const loaded = useLifecycleRead<Awaited<ReturnType<typeof listRemittanceDeductions>>>(expanded ? url + "&page=" + page : null, refresh);
  function copyList() {
    const rows = loaded?.data?.items ?? [];
    const label = (status: string) => status === "X" ? "Final pay" : status === "P" ? "Partial" : "Full";
    const csv = [["Employee", "Loan", "Result", "Withheld"],
      ...rows.map(row => [row.employee, row.loanReference, label(row.status), row.amount])]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    void copyText(csv).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => undefined);
  }
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="space-y-2 text-sm">
    <summary className="cursor-pointer">Included Payroll deductions</summary>
    {expanded && <>
      {!loaded?.data && (loaded?.error
        ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span className="min-w-0 flex-1">{loaded.error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => reload(value => value + 1)}>Retry</Button>
        </div>
        : <div className="rounded-md border"><Table><TableBody><TableRowsSkeleton rows={4} columns={4} /></TableBody></Table></div>)}
      {loaded?.data && <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{loaded.data.items.length} deduction line(s) on this page</p>
          <Button type="button" size="sm" variant="outline" disabled={!loaded.data.items.length} onClick={copyList}>
            {copied ? "Copied" : "Copy list (CSV)"}
          </Button>
        </div>
        <div className="rounded-md border"><Table>
          <TableHeader><TableRow>{["Employee", "Loan", "Result", "Withheld"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{loaded.data.items.map((row, index) => <TableRow key={row.loanId + ":" + row.status + ":" + index}>
            <TableCell>{row.employee}</TableCell><TableCell>{row.loanReference}</TableCell>
            <TableCell>{row.status === "X" ? "Final pay" : row.status === "P" ? "Partial" : "Full"}</TableCell>
            <TableCell className="text-right tabular-nums">{peso(row.amount)}</TableCell>
          </TableRow>)}
            {!loaded.data.items.length && <TableRow><TableCell colSpan={4}>No withholding lines.</TableCell></TableRow>}
          </TableBody>
        </Table></div>
      </>}
      {(page > 1 || loaded?.data?.hasMore) && <nav aria-label="Deduction pages" className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
        <Button type="button" size="sm" variant="outline" disabled={!loaded?.data?.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
      </nav>}
    </>}
  </details>;
}

function SumCards({ totals, showPenaltyHint = false }: { totals: ReturnType<typeof remittanceTotals>; showPenaltyHint?: boolean }) {
  return <div className="space-y-1">
    <dl className="grid gap-2 text-sm sm:grid-cols-3">
      {([["Withheld principal", totals.withheld], ["Penalties", totals.penalties], ["Total cash out", totals.cashOut]] as const).map(([label, value]) =>
        <div key={label} className="rounded-md border p-3">
          <dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{money(value)}</dd>
        </div>)}
    </dl>
    {showPenaltyHint && <p className="text-xs text-muted-foreground">Choose a payment date to compute penalties and total cash out.</p>}
  </div>;
}

function MissingFields({ missing }: { missing: string[] }) {
  if (!missing.length) return null;
  return <p role="status" className="text-xs text-muted-foreground">To continue, provide {missing.join(", ")}.</p>;
}

function PreparationDialog({ selected, openMonth, close, saved }: {
  selected: Item[]; openMonth: string; close: () => void; saved: () => void;
}) {
  const [paymentDate, setPaymentDate] = useState("");
  const [channel, setChannel] = useState<RemittanceChannel | "">("");
  const [sharedReference, setSharedReference] = useState("");
  const [references, setReferences] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [proof, setProof] = useState<File>();
  const [proofError, setProofError] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const command = useLifecycleCommand();
  const validDate = isCalendarDate(paymentDate);
  const dateClosed = validDate && paymentDate < openMonth + "-01";
  const validOverrides = Object.values(overrides).every(value => !value.trim() || validAmount.test(value.trim()));
  const referencesReady = selected.every(row => references[row.key]?.trim());
  const ready = validDate && !dateClosed && !!channel && validOverrides && referencesReady;
  const input = { paymentDate: validDate ? paymentDate : null, channel: channel || null,
    items: selected.map(row => ({ agencyId: row.agencyId, month: row.month,
      reference: references[row.key]?.trim() ?? "", penaltyOverride: overrides[row.key]?.trim() || null,
    })) };
  const computed = selected.map(row => validDate ? remittancePenalty(row.withheld!, paymentDate, row.due, row.policy) : null);
  const computedTotals = remittanceTotals(selected.map((row, index) => ({
    withheld: row.withheld!, penalty: validOverrides && computed[index] ? overrides[row.key]?.trim() || computed[index].computedPenalty : null,
  })));
  const reviewMissing = [
    !validDate || dateClosed ? "a valid payment date" : null,
    !channel ? "a payment channel" : null,
    !referencesReady ? "a reference for every agency-month" : null,
  ].filter((value): value is string => Boolean(value));
  const submitMissing = [
    ...reviewMissing,
    !proof ? "proof of payment" : null,
    !preview ? "reviewed totals" : null,
  ].filter((value): value is string => Boolean(value));
  const checklist = [
    { label: "Payment date", done: validDate && !dateClosed },
    { label: "Channel", done: !!channel },
    { label: "References", done: referencesReady },
    { label: "Proof", done: !!proof },
  ];

  function review() {
    setPreview(undefined);
    return command.run(endpoint + "?preview=1", input, async response => setPreview(await response.json() as Preview));
  }

  function submit() {
    if (!preview || !proof || !ready) return;
    const form = new FormData();
    form.set("payment", JSON.stringify({ ...input, token: preview.token }));
    form.set("proof", proof);
    return command.run(endpoint, form, saved);
  }

  return <Dialog open onOpenChange={open => { if (!open && !command.busy) close(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>Record remittance</DialogTitle>
        <DialogDescription>{selected.length} selected agency-month(s) · <span className="text-destructive">*</span> required</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto px-1">
        <SumCards totals={preview?.totals ?? computedTotals} showPenaltyHint={!validDate} />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {checklist.map(item => <li key={item.label} className={item.done ? "text-emerald-700 dark:text-emerald-400" : undefined}>
            <span aria-hidden>{item.done ? "✓" : "○"}</span> {item.label}
          </li>)}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">Payment date <span className="text-destructive" aria-hidden>*</span>
            <Input type="date" min={openMonth + "-01"} value={paymentDate} disabled={command.busy} aria-required="true" autoFocus
              onChange={event => { setPaymentDate(event.target.value); setPreview(undefined); }} />
            <span className="block text-xs text-muted-foreground">Must be on or after {openMonth}-01 (open month).</span>
          </label>
          <label className="space-y-1 text-sm">Payment channel <span className="text-destructive" aria-hidden>*</span>
            <NativeSelect value={channel} disabled={command.busy} aria-required="true" onChange={event => {
              setChannel(event.target.value as RemittanceChannel | ""); setPreview(undefined);
            }}>
              <option value="">Choose payment channel</option>{Object.entries(remittanceChannels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect></label>
          <label className="space-y-1 text-sm">Proof of payment <span className="text-destructive" aria-hidden>*</span>
            <Input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={command.busy} aria-required="true" onChange={event => {
              const file = event.target.files?.[0];
              const oversized = !!file && file.size > maxRemittanceProofBytes;
              setProof(oversized ? undefined : file);
              setProofError(oversized ? "Choose a PDF, JPG, or PNG up to 5 MB." : "");
            }} /></label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">Same reference for all (optional)
            <Input maxLength={200} value={sharedReference} disabled={command.busy} onChange={event => setSharedReference(event.target.value)} /></label>
          <Button type="button" variant="outline" disabled={!sharedReference.trim() || command.busy} onClick={() => {
            setReferences(Object.fromEntries(selected.map(row => [row.key, sharedReference]))); setPreview(undefined);
          }}>Apply to all rows</Button>
        </div>
        {selected.map((row, index) => {
          const server = preview?.rows.find(item => item.key === row.key);
          const penalty = server?.computedPenalty ?? computed[index]?.computedPenalty;
          const late = server?.daysLate ?? computed[index]?.daysLate;
          return <section key={row.key} className="space-y-2 rounded-md border p-3">
            <h3 className="font-medium">{row.agency} · {row.month}</h3>
            <p className="text-sm">Withheld {peso(server?.withheld ?? row.withheld)} · Deadline {date(server?.due ?? row.due)}
              {!!late && " · " + late + " day(s) late"}</p>
            {server?.source.partialCount ? <p className="text-sm text-muted-foreground">{server.source.partialCount} partial deduction(s) included</p> : null}
            {server?.source.missingBilling && <p className="text-sm text-amber-800 dark:text-amber-300">Agency billing is missing.</p>}
            {!!server?.source.discrepancies && <p className="text-sm text-amber-800 dark:text-amber-300">{server.source.discrepancies} billing difference(s) to review</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-sm">{row.referenceLabel} · {row.agencyCode} {row.month} <span className="text-destructive" aria-hidden>*</span>
                <Input maxLength={200} value={references[row.key] ?? ""} disabled={command.busy} aria-required="true" onChange={event => {
                  setReferences(values => ({ ...values, [row.key]: event.target.value })); setPreview(undefined);
                }} /></label>
              {validDate && <label className="space-y-1 text-sm">Penalty override · {row.agencyCode} {row.month} (optional)
                <Input inputMode="decimal" maxLength={16} placeholder={penalty ?? "0.00"} value={overrides[row.key] ?? ""}
                  disabled={command.busy || row.policy.penaltyBasis === "NONE"} onChange={event => {
                    setOverrides(values => ({ ...values, [row.key]: event.target.value })); setPreview(undefined);
                  }} />
                <span className="block text-xs text-muted-foreground">{row.policy.penaltyBasis === "NONE" ? "No penalty is configured for this agency." : "Computed " + money(penalty ?? null)}</span>
              </label>}
            </div>
            <IncludedDeductions url={endpoint + "?" + new URLSearchParams({ deductions: "1", agencyId: String(row.agencyId), month: row.month })} />
          </section>;
        })}
        {dateClosed && <p role="alert" className="text-sm text-destructive">The payment date falls in a closed accounting period.</p>}
        {!validOverrides && <p role="alert" className="text-sm text-destructive">Enter penalties with at most two decimal places.</p>}
        {proofError && <p role="alert" className="text-sm text-destructive">{proofError}</p>}
        {!preview && <MissingFields missing={reviewMissing} />}
        {preview && <p role="status" className="text-sm">Preview ready. Confirm the details and proof before submitting.</p>}
        {preview && !proof && <p role="status" className="text-xs text-muted-foreground">Attach proof of payment to submit.</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" type="button" disabled={command.busy} onClick={close}>Cancel</Button>
        <Button variant="outline" type="button" disabled={command.busy || !ready} onClick={() => void review()}>Review totals</Button>
        <Button type="button" disabled={command.busy || !proof || !preview || !ready} onClick={() => void submit()}>Submit for approval</Button>
      </div>
      {submitMissing.length > 0 && (proof || preview) && <p className="text-right text-xs text-muted-foreground">Still needed: {submitMissing.join(", ")}.</p>}
    </DialogContent>
  </Dialog>;
}

function SavedRemittanceDialog({ id, close }: { id: string; close: () => void }) {
  const [refresh, reload] = useState(0);
  const result = useLifecycleRead<Saved>(endpoint + "/" + id, refresh);
  const saved = result?.data;
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl">
      <DialogHeader><DialogTitle>Remittance details</DialogTitle>
        <DialogDescription>{saved ? saved.payment.agency_name + " · " + saved.payment.payroll_month : "Review proof and Payroll deductions."}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto px-1 text-sm">
        {!saved && (result?.error
          ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span className="min-w-0 flex-1">{result.error}</span>
            <Button variant="outline" size="sm" onClick={() => reload(value => value + 1)}>Retry</Button>
          </div>
          : <DetailSkeleton />)}
        {saved && <>
          <p>Payment {date(saved.batch.paymentDate)} · {remittanceChannels[saved.batch.channel]} · {saved.payment.payment_reference}</p>
          <p>Prepared by {saved.batch.preparedBy} · {dateTime(saved.batch.submittedAt)} PHT</p>
          <SumCards totals={remittanceTotals([{ withheld: saved.payment.withheld, penalty: saved.payment.entered_penalty }])} />
          <p>Computed penalty {peso(saved.payment.computed_penalty)}{saved.payment.penalty_overridden && " · Override recorded"}</p>
          {saved.payment.return_reason && <p>Return reason · {saved.payment.return_reason}</p>}
          {saved.payment.source_snapshot.missingBilling && <p>Agency billing was missing at preparation.</p>}
          {!!saved.payment.source_snapshot.discrepancies && <p>{saved.payment.source_snapshot.discrepancies} billing difference(s) at preparation</p>}
          <Button asChild variant="outline" size="sm"><a href={endpoint + "/" + id + "?proof=1"}>Download {saved.batch.proofName}</a></Button>
          <IncludedDeductions url={endpoint + "/" + id + "?deductions=1"} />
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}

function DeductionsDialog({ row, close }: { row: Item; close: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Remittance list · {row.agency} · {row.month}</DialogTitle>
        <DialogDescription>Withheld {money(row.withheld)} · due {date(row.due)} · {remittanceStatuses[row.status]}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto px-1">
        <IncludedDeductions url={endpoint + "?" + new URLSearchParams({ deductions: "1",
          agencyId: String(row.agencyId), month: row.month })} initiallyExpanded />
      </div>
    </DialogContent>
  </Dialog>;
}

type ViewMode = "cards" | "rows";

function RemittanceSkeleton({ cards }: { cards: boolean }) {
  return <div className="space-y-3" aria-busy="true" aria-label="Loading remittances">
    {cards
      ? <CardGridSkeleton count={6} height="h-40" />
      : <div className="rounded-md border"><Table><TableBody><TableRowsSkeleton rows={6} columns={8} /></TableBody></Table></div>}
  </div>;
}

export function RemittancePreparationModule() {
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [month, setMonth] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Item[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [listRow, setListRow] = useState<Item>();
  const [refresh, setRefresh] = useState(0);
  const skipUrlWrite = useRef(true);
  const grouped = viewMode === "cards";
  const query = new URLSearchParams({ page: String(page), ...(month ? { month } : {}), ...(agencyId ? { agencyId } : {}), ...(status ? { status } : {}),
    ...(grouped ? { grouped: "1" } : {}), ...(!grouped && !showAll && !status ? { action: "1" } : {}) });
  const result = useLifecycleRead<View>(endpoint + "?" + query, refresh);
  const data = result?.data;
  const items = data?.items ?? [];
  const selectable = items.filter(row => row.canSelect);
  const selectedTotal = remittanceTotals(selection.map(row => ({ withheld: row.withheld ?? "0.00", penalty: null }))).withheld;
  const allSelected = selectable.length > 0 && selectable.every(row => selection.some(item => item.key === row.key));
  const hiddenSelection = selection.filter(row => !items.some(item => item.key === row.key));
  const activeFilters = [month, agencyId, status].filter(Boolean).length;
  const reload = () => setRefresh(value => value + 1);

  const groups = new Map<number, { agencyId: number; agency: string; agencyCode: string; policy: Item["policy"]; rows: Item[] }>();
  for (const row of items) {
    const group = groups.get(row.agencyId) ?? { agencyId: row.agencyId, agency: row.agency, agencyCode: row.agencyCode, policy: row.policy, rows: [] };
    group.rows.push(row);
    groups.set(row.agencyId, group);
  }
  const agencyGroups = [...groups.values()];

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      setViewMode(params.get("view") === "rows" ? "rows" : "cards");
      setMonth(params.get("month") ?? "");
      setAgencyId(params.get("agencyId") ?? "");
      setStatus(params.get("status") ?? "");
      setPage(Math.max(1, Number(params.get("page")) || 1));
      setShowAll(params.get("all") === "1");
    };
    syncFromLocation();
    skipUrlWrite.current = true;
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (skipUrlWrite.current) { skipUrlWrite.current = false; return; }
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => value ? params.set(key, value) : params.delete(key);
    setOrDelete("view", viewMode === "rows" ? "rows" : "");
    setOrDelete("month", month);
    setOrDelete("agencyId", agencyId);
    setOrDelete("status", status);
    setOrDelete("page", page > 1 ? String(page) : "");
    setOrDelete("all", showAll ? "1" : "");
    const search = params.toString();
    const target = window.location.pathname + (search ? "?" + search : "") + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (target !== current) window.history.replaceState(window.history.state, "", target);
  }, [month, agencyId, status, page, showAll, viewMode]);

  function toggle(row: Item) {
    setSelection(current => current.some(item => item.key === row.key)
      ? current.filter(item => item.key !== row.key) : current.length < maxRemittanceSelection ? [...current, row] : current);
  }

  function toggleRows(rows: Item[]) {
    const keys = new Set(rows.filter(row => row.canSelect).map(row => row.key));
    if (!keys.size) return;
    const all = [...keys].every(key => selection.some(item => item.key === key));
    setSelection(current => all ? current.filter(item => !keys.has(item.key))
      : [...current, ...rows.filter(row => row.canSelect && !current.some(item => item.key === row.key))].slice(0, maxRemittanceSelection));
  }

  function clearFilters() {
    setMonth(""); setAgencyId(""); setStatus(""); setPage(1); setShowAll(false);
  }

  function changeView(next: ViewMode) {
    setViewMode(next);
    setPage(1);
    setShowAll(false);
  }

  function openPreparing() {
    setPreparing(true);
  }

  return <section className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">To remit</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Select the agency-months you paid, record the payment details with proof, and submit for a second-person approval. Use List for the per-employee breakdown.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Remittance view">
          {([["cards", "Agency cards"], ["rows", "All rows"]] as const).map(([value, label]) =>
            <Button key={value} type="button" size="sm" variant={viewMode === value ? "default" : "outline"}
              aria-pressed={viewMode === value} onClick={() => changeView(value)}>{label}</Button>)}
        </div>
        <Button variant="outline" onClick={reload}>Refresh</Button>
      </div>
    </div>
    {data ? <SummaryPills data={data} /> : !result?.error ? <div aria-busy="true" aria-label="Loading remittance summary"><MetricCardsSkeleton /></div> : null}
    <div className="flex flex-wrap items-end gap-2">
      <Button type="button" variant="outline" size="sm" className="md:hidden" aria-expanded={filtersOpen} aria-controls="remittance-filters"
        onClick={() => setFiltersOpen(value => !value)}>Filters{activeFilters ? ` (${activeFilters})` : ""}</Button>
      <div id="remittance-filters" className={`${filtersOpen ? "flex" : "hidden"} flex-wrap items-end gap-2 md:flex`}>
        <label className="space-y-1 text-sm">Agency
          <NativeSelect value={agencyId} onChange={event => { setAgencyId(event.target.value); setPage(1); }}>
            <option value="">All agencies</option>{data?.agencies.map(agency => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
          </NativeSelect></label>
        <label className="space-y-1 text-sm">Payroll month
          <Input type="month" max={data?.openMonth} value={month} onChange={event => { setMonth(event.target.value); setPage(1); }} /></label>
        <label className="space-y-1 text-sm">Status
          <NativeSelect value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>{Object.entries(remittanceStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </NativeSelect></label>
        {!grouped && <label className="flex items-center gap-2 self-end py-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={!showAll} disabled={!!status}
            onChange={event => setShowAll(!event.target.checked)} />Action needed only
        </label>}
        {activeFilters > 0 && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
      </div>
    </div>
    {!data && !result?.error && <RemittanceSkeleton cards={grouped} />}
    {!data && result?.error && <div className="flex flex-wrap items-center gap-2 text-sm">
      <p role="alert" className="text-destructive">{result.error}</p>
      <Button variant="outline" size="sm" onClick={reload}>Retry</Button>
    </div>}
    {data && items.length === 0 && <div className="space-y-2 rounded-xl border p-4">
      <EmptyState icon={activeFilters ? SearchX : Inbox}
        title={activeFilters ? "No agency-months match these filters" : "No agency-months need remittance right now"}
        description={activeFilters ? "Try a different filter or clear the filters." : "Remittances appear here when Payroll confirms withholding."}
        action={activeFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
          : !grouped ? <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>Show all months</Button> : undefined} />
    </div>}
    {data && items.length > 0 && grouped && <div className="space-y-3">
      {agencyGroups.map(group => {
        const groupRows = group.rows;
        const groupSelectable = groupRows.filter(row => row.canSelect);
        const allGroupSelected = groupSelectable.length > 0 && groupSelectable.every(row => selection.some(item => item.key === row.key));
        const liability = remittanceTotals(groupRows.filter(row => row.withheld !== null && row.status !== "approved")
          .map(row => ({ withheld: row.withheld!, penalty: null }))).withheld;
        return <article key={group.agencyId} className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <AgencyBadge name={group.agency} code={group.agencyCode} />
                <h3 className="break-all font-semibold">{group.agency}</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{policyLabel(group.policy)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Withheld, not yet remitted</p>
              <p className="text-xl font-semibold tabular-nums">{peso(liability)}</p>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10"><input type="checkbox" className="size-4 accent-primary" aria-label={`Select all ${group.agency} months`}
                  checked={allGroupSelected} disabled={!groupSelectable.length} onChange={() => toggleRows(groupRows)} /></TableHead>
                {["Month", "Withheld", "Due", "Status", "Paid", "Reference", "Penalty", "Action"].map(label =>
                  <TableHead key={label} className={label === "Withheld" || label === "Penalty" ? "text-right" : undefined}>{label}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>{groupRows.map(row => {
                const checked = selection.some(item => item.key === row.key);
                return <TableRow key={row.key}>
                  <TableCell>{row.canSelect && <input type="checkbox" className="size-4 accent-primary" aria-label={"Select " + row.agency + " " + row.month}
                    checked={checked} disabled={!checked && selection.length >= maxRemittanceSelection} onChange={() => toggle(row)} />}</TableCell>
                  <TableCell className="whitespace-nowrap">{monthLabel(row.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(row.withheld)}</TableCell>
                  <TableCell className="whitespace-nowrap">{date(row.due)}</TableCell>
                  <TableCell><StatusBadge row={row} /></TableCell>
                  <TableCell className="whitespace-nowrap">{row.payment ? date(row.payment.paymentDate) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.payment?.reference ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.payment ? money(row.payment.penalty) : "—"}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => setListRow(row)}>List</Button>
                    {row.payment && <Button size="sm" variant="ghost" onClick={() => setDetailId(row.payment?.id)}>View</Button>}
                  </div></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </div>
        </article>;
      })}
    </div>}
    {data && items.length > 0 && !grouped && <>
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card">
            <TableRow>
              <TableHead className="w-10"><input type="checkbox" className="size-4 accent-primary" aria-label="Select all actionable agency-months"
                checked={allSelected} disabled={!selectable.length} onChange={() => toggleRows(items)} /></TableHead>
              {["Agency", "Month", "Withheld", "Due", "Status", "Paid", "Reference", "Penalty", "Action"].map(label =>
                <TableHead key={label} className={label === "Withheld" || label === "Penalty" ? "text-right" : undefined}>{label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>{items.map(row => {
            const checked = selection.some(item => item.key === row.key);
            return <TableRow key={row.key}>
              <TableCell>{row.canSelect && <input type="checkbox" className="size-4 accent-primary" aria-label={"Select " + row.agency + " " + row.month}
                checked={checked} disabled={!checked && selection.length >= maxRemittanceSelection} onChange={() => toggle(row)} />}</TableCell>
              <TableCell><AgencyBadge name={row.agency} code={row.agencyCode} /></TableCell>
              <TableCell className="whitespace-nowrap">{monthLabel(row.month)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.withheld)}</TableCell>
              <TableCell className="whitespace-nowrap">{date(row.due)}</TableCell>
              <TableCell><StatusBadge row={row} /></TableCell>
              <TableCell className="whitespace-nowrap">{row.payment ? date(row.payment.paymentDate) : "—"}</TableCell>
              <TableCell className="font-mono text-xs">{row.payment?.reference ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{row.payment ? money(row.payment.penalty) : "—"}</TableCell>
              <TableCell><div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => setListRow(row)}>List</Button>
                {row.payment && <Button size="sm" variant="ghost" onClick={() => setDetailId(row.payment?.id)}>View</Button>}
              </div></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </div>
      <div className="space-y-2 md:hidden">{items.map(row => {
        const checked = selection.some(item => item.key === row.key);
        return <article key={row.key} className="space-y-3 rounded-lg border p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><AgencyBadge name={row.agency} code={row.agencyCode} /><p className="mt-1 text-xs text-muted-foreground">Payroll month {monthLabel(row.month)}</p></div>
            {row.canSelect ? <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="size-4 accent-primary" aria-label={"Select " + row.agency + " " + row.month}
                checked={checked} disabled={!checked && selection.length >= maxRemittanceSelection} onChange={() => toggle(row)} />Select
            </label> : <span className="text-xs text-muted-foreground">Not selectable</span>}
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div><dt className="text-xs text-muted-foreground">Withheld</dt><dd className="font-medium tabular-nums">{money(row.withheld)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Due</dt><dd>{date(row.due)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Paid</dt><dd>{row.payment ? date(row.payment.paymentDate) : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Penalty</dt><dd className="tabular-nums">{row.payment ? money(row.payment.penalty) : "—"}</dd></div>
          </dl>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <StatusBadge row={row} />
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setListRow(row)}>List</Button>
              {row.payment && <Button size="sm" variant="ghost" onClick={() => setDetailId(row.payment?.id)}>View</Button>}
            </div>
          </div>
        </article>;
      })}</div>
    </>}
    {!grouped && (page > 1 || data?.hasMore) && <nav aria-label="Remittance pages" className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
      <span className="text-sm">Page {page}</span>
      <Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
    </nav>}
    {data && <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-2 flex flex-wrap items-center gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur">
      <div className="min-w-0 flex-1 text-sm">
        {selection.length ? <><span className="font-medium">{selection.length} of {maxRemittanceSelection} selected</span><span className="text-muted-foreground"> · {peso(selectedTotal)} withheld</span></>
          : <span className="text-muted-foreground">Select an agency-month to record a remittance.</span>}
        {hiddenSelection.length > 0 && <span className="block text-xs text-amber-700 dark:text-amber-300">{hiddenSelection.length} selected row(s) hidden by filters.</span>}
      </div>
      <Button size="sm" disabled={!selection.length} onClick={openPreparing}>Record remittance</Button>
      {selection.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelection([])}>Clear</Button>}
    </div>}
    {preparing && data && <PreparationDialog selected={selection} openMonth={data.openMonth}
      close={() => setPreparing(false)} saved={() => {
        setPreparing(false); setSelection([]); toast.success("Remittances submitted for approval."); reload();
      }} />}
    {detailId && <SavedRemittanceDialog id={detailId} close={() => setDetailId(undefined)} />}
    {listRow && <DeductionsDialog row={listRow} close={() => setListRow(undefined)} />}
  </section>;
}
