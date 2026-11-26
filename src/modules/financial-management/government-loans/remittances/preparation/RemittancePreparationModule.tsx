"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date, dateTime, isCalendarDate, peso } from "@/modules/financial-management/cooperative/members/format";
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
const actionableStatuses = new Set<Item["status"]>(["due", "overdue", "returned"]);

function statusDetail(row: Item) {
  if (row.status === "due" || row.status === "overdue" || row.status === "approved") return row.deadlineLabel;
  if (row.status === "returned") return row.payment?.returnReason ?? "Re-record required";
  if (row.status === "awaiting_payroll") return "No confirmed withholding";
  if (row.status === "nothing") return "No withholding for this month";
  return null;
}

function StatusBadge({ row }: { row: Item }) {
  const detail = statusDetail(row);
  return <div className="min-w-0 space-y-1">
    <Badge variant={row.status === "overdue" || row.status === "returned" ? "destructive" : row.reminder ? "secondary" : "outline"}>
      {remittanceStatuses[row.status]}
    </Badge>
    {detail && <p className="max-w-56 text-xs text-muted-foreground">{detail}</p>}
  </div>;
}

function SummaryPills({ items }: { items: Item[] }) {
  const counts = items.reduce<Partial<Record<Item["status"], number>>>((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, {});
  const actionable = items.filter(row => actionableStatuses.has(row.status));
  const total = remittanceTotals(actionable.map(row => ({ withheld: row.withheld ?? "0.00", penalty: null }))).withheld;
  const pills = [
    { key: "action", label: "Needs action", value: (counts.due ?? 0) + (counts.overdue ?? 0) + (counts.returned ?? 0), detail: total !== "0.00" ? peso(total) : null, tone: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" },
    { key: "pending", label: "Awaiting approval", value: counts.pending ?? 0, detail: null, tone: "border-border bg-muted/40" },
    { key: "payroll", label: "Awaiting Payroll", value: counts.awaiting_payroll ?? 0, detail: null, tone: "border-border bg-muted/40" },
    { key: "nothing", label: "Nothing to remit", value: counts.nothing ?? 0, detail: null, tone: "border-border bg-muted/40" },
  ];
  return <div className="flex flex-wrap gap-2 text-xs">
    {pills.map(pill => <span key={pill.key} className={"inline-flex items-center gap-2 rounded-full border px-3 py-1 " + pill.tone}>
      <span className="text-muted-foreground">{pill.label}</span>
      <strong className="tabular-nums">{pill.value}</strong>
      {pill.detail && <span className="text-muted-foreground">· {pill.detail}</span>}
    </span>)}
  </div>;
}

export function IncludedDeductions({ url, initiallyExpanded = false }: { url: string; initiallyExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [page, setPage] = useState(1);
  const [refresh, reload] = useState(0);
  const loaded = useLifecycleRead<Awaited<ReturnType<typeof listRemittanceDeductions>>>(expanded ? url + "&page=" + page : null, refresh);
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="space-y-2 text-sm">
    <summary className="cursor-pointer">Included Payroll deductions</summary>
    {expanded && <>
      {!loaded?.data && <p role={loaded?.error ? "alert" : "status"}>{loaded?.error ?? "Loading deductions…"}
        {loaded?.error && <Button type="button" variant="outline" size="sm" onClick={() => reload(value => value + 1)}>Retry</Button>}</p>}
      {loaded?.data && <div className="rounded-md border"><Table>
        <TableHeader><TableRow>{["Employee", "Loan", "Result", "Withheld"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{loaded.data.items.map((row, index) => <TableRow key={row.loanId + ":" + row.status + ":" + index}>
          <TableCell>{row.employee}</TableCell><TableCell>{row.loanReference}</TableCell>
          <TableCell>{row.status === "X" ? "Final pay" : row.status === "P" ? "Partial" : "Full"}</TableCell>
          <TableCell className="text-right tabular-nums">{peso(row.amount)}</TableCell>
        </TableRow>)}
          {!loaded.data.items.length && <TableRow><TableCell colSpan={4}>No withholding lines.</TableCell></TableRow>}
        </TableBody>
      </Table></div>}
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

function PreparationDialog({ selected, openMonth, businessDate, close, saved }: {
  selected: Item[]; openMonth: string; businessDate: string; close: () => void; saved: () => void;
}) {
  const [paymentDate, setPaymentDate] = useState(() => businessDate >= openMonth + "-01" ? businessDate : "");
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
        {(proofError || command.error) && <p role="alert" className="text-sm text-destructive">{proofError || command.error}</p>}
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
        {!saved && <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Loading remittance…"}
          {result?.error && <Button variant="outline" size="sm" onClick={() => reload(value => value + 1)}>Retry</Button>}</p>}
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

export function RemittancePreparationModule() {
  const [month, setMonth] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Item[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const skipUrlWrite = useRef(true);
  const query = new URLSearchParams({ page: String(page), ...(month ? { month } : {}), ...(agencyId ? { agencyId } : {}), ...(status ? { status } : {}) });
  const result = useLifecycleRead<View>(endpoint + "?" + query, refresh);
  const data = result?.data;
  const items = data?.items ?? [];
  const actionable = items.filter(row => actionableStatuses.has(row.status));
  const visible = status || showAll ? items : actionable;
  const selectable = visible.filter(row => row.canSelect);
  const selectedTotal = remittanceTotals(selection.map(row => ({ withheld: row.withheld ?? "0.00", penalty: null }))).withheld;
  const allSelected = selectable.length > 0 && selectable.every(row => selection.some(item => item.key === row.key));
  const hiddenSelection = selection.filter(row => !visible.some(item => item.key === row.key));
  const activeFilters = [month, agencyId, status].filter(Boolean).length;
  const reload = () => setRefresh(value => value + 1);

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
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
    setOrDelete("month", month);
    setOrDelete("agencyId", agencyId);
    setOrDelete("status", status);
    setOrDelete("page", page > 1 ? String(page) : "");
    setOrDelete("all", showAll ? "1" : "");
    const search = params.toString();
    const target = window.location.pathname + (search ? "?" + search : "") + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (target !== current) window.history.replaceState(window.history.state, "", target);
  }, [month, agencyId, status, page, showAll]);

  function toggle(row: Item) {
    setSelection(items => items.some(item => item.key === row.key)
      ? items.filter(item => item.key !== row.key) : items.length < maxRemittanceSelection ? [...items, row] : items);
  }

  function toggleAll() {
    const keys = new Set(selectable.map(row => row.key));
    setSelection(current => allSelected
      ? current.filter(row => !keys.has(row.key))
      : [...current, ...selectable.filter(row => !current.some(item => item.key === row.key))].slice(0, maxRemittanceSelection));
  }

  function clearFilters() {
    setMonth(""); setAgencyId(""); setStatus(""); setPage(1); setShowAll(false);
  }

  function openPreparing() {
    setNotice("");
    setSubmitted(false);
    setPreparing(true);
  }

  return <section className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">To remit</h2>
        <p className="text-sm text-muted-foreground">Select an agency-month with withholding, record the payment, then submit it for approval.</p>
      </div>
      <Button variant="outline" onClick={reload}>Refresh</Button>
    </div>
    {notice && <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
      <p role="status">{notice}</p>
      {submitted && <Button asChild size="sm" variant="outline"><Link href="/fm/government-loans/remittance-approval">View approval queue</Link></Button>}
    </div>}
    {data && <SummaryPills items={items} />}
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
        <label className="flex items-center gap-2 self-end py-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={!showAll} disabled={!!status}
            onChange={event => setShowAll(!event.target.checked)} />Action needed only
        </label>
        {activeFilters > 0 && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
      </div>
    </div>
    {!data && <div className="flex flex-wrap items-center gap-2">
      <p role={result?.error ? "alert" : "status"} className="text-sm text-muted-foreground">{result?.error ?? "Loading remittances…"}</p>
      {result?.error && <Button variant="outline" size="sm" onClick={reload}>Retry</Button>}
    </div>}
    {data && visible.length === 0 && <div className="space-y-2 rounded-md border p-4">
      <p className="text-sm text-muted-foreground">{activeFilters ? "No agency-months match these filters." : "No agency-months need remittance right now."}</p>
      {activeFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
        : items.length > 0 ? <Button variant="outline" size="sm" onClick={() => setShowAll(true)}>Show all {items.length} agency-months</Button> : null}
    </div>}
    {data && visible.length > 0 && <>
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card">
            <TableRow>
              <TableHead className="w-10"><input type="checkbox" className="size-4 accent-primary" aria-label="Select all actionable agency-months"
                checked={allSelected} disabled={!selectable.length} onChange={toggleAll} /></TableHead>
              {["Agency", "Payroll month", "Withheld", "Due date", "Status", "Payment"].map(label =>
                <TableHead key={label} className={label === "Withheld" ? "text-right" : undefined}>{label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>{visible.map(row => {
            const checked = selection.some(item => item.key === row.key);
            return <TableRow key={row.key}>
              <TableCell>{row.canSelect && <input type="checkbox" className="size-4 accent-primary" aria-label={"Select " + row.agency + " " + row.month}
                checked={checked} disabled={!checked && selection.length >= maxRemittanceSelection} onChange={() => toggle(row)} />}</TableCell>
              <TableCell>{row.agency}</TableCell><TableCell>{row.month}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.withheld)}</TableCell>
              <TableCell>{date(row.due)}</TableCell>
              <TableCell><StatusBadge row={row} /></TableCell>
              <TableCell>{row.payment && <Button size="sm" variant="outline" onClick={() => setDetailId(row.payment?.id)}>View</Button>}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </div>
      <div className="space-y-2 md:hidden">{visible.map(row => {
        const checked = selection.some(item => item.key === row.key);
        return <article key={row.key} className="space-y-3 rounded-lg border p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-medium">{row.agency}</p><p className="text-xs text-muted-foreground">Payroll month {row.month}</p></div>
            {row.canSelect ? <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="size-4 accent-primary" aria-label={"Select " + row.agency + " " + row.month}
                checked={checked} disabled={!checked && selection.length >= maxRemittanceSelection} onChange={() => toggle(row)} />Select
            </label> : <span className="text-xs text-muted-foreground">Not selectable</span>}
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div><dt className="text-xs text-muted-foreground">Withheld</dt><dd className="font-medium tabular-nums">{money(row.withheld)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Due date</dt><dd>{date(row.due)}</dd></div>
          </dl>
          <div className="flex items-end justify-between gap-2">
            <StatusBadge row={row} />
            {row.payment && <Button size="sm" variant="outline" onClick={() => setDetailId(row.payment?.id)}>View</Button>}
          </div>
        </article>;
      })}</div>
    </>}
    {(page > 1 || data?.hasMore) && <nav aria-label="Remittance pages" className="flex items-center gap-2">
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
    {preparing && data && <PreparationDialog selected={selection} openMonth={data.openMonth} businessDate={data.businessDate}
      close={() => setPreparing(false)} saved={() => {
        setPreparing(false); setSelection([]); setNotice("Remittances submitted for approval."); setSubmitted(true); reload();
      }} />}
    {detailId && <SavedRemittanceDialog id={detailId} close={() => setDetailId(undefined)} />}
  </section>;
}
