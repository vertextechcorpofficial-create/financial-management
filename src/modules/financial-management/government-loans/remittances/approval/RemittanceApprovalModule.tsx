"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { useLifecycleCommand, useLifecycleRead, useRetainedLifecycleRead } from "../../loans/lifecycle-client";
import type { bulkApproveRemittances, listApprovalAgencies, listRemittanceApproval, reviewRemittanceApproval } from "../../server/remittance-approval";
import { REQUEST_SLA_DAYS } from "../../approval/rules";
import { IncludedDeductions } from "../preparation/RemittancePreparationModule";
import { dayDifference, remittanceChannels, remittanceTotals } from "../preparation/rules";
import { remittanceApprovalPageSizes, remittanceApprovalSorts, type RemittanceApprovalSort } from "./types";

const api = "/api/fm/government-loans/remittance-approval";
type Queue = Awaited<ReturnType<typeof listRemittanceApproval>>;
type Review = Awaited<ReturnType<typeof reviewRemittanceApproval>>;
type BulkResult = Awaited<ReturnType<typeof bulkApproveRemittances>>;
type Direction = "asc" | "desc";

const formatMoney = (value: string | null) => value === null ? "Unavailable" : peso(value);
const checkLabel = { pass: "Passed", warning: "Warning", block: "Blocked", na: "Not applicable" };
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", month: "short", year: "numeric",
}).format(new Date(month + "-01T00:00:00Z"));

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message}<Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function agencyTone(name: string) {
  const value = name.toLowerCase();
  if (value.includes("pag-ibig") || value.includes("hdmf")) return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (value.includes("sss") || value.includes("social security")) return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (value.includes("bank")) return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return "text-muted-foreground";
}

function AgencyBadge({ name, code }: { name: string; code: string }) {
  return <Badge variant="outline" className={agencyTone(name)} title={name}>
    <span className="max-w-36 truncate">{code || name}</span>
  </Badge>;
}

function WaitingBadge({ days }: { days: number }) {
  const label = `${days} ${days === 1 ? "day" : "days"}`;
  if (days > REQUEST_SLA_DAYS) return <Badge variant="destructive">{label} · Overdue</Badge>;
  if (days === REQUEST_SLA_DAYS) return <Badge variant="outline" className="text-amber-700 dark:text-amber-400">{label} · SLA due</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

function SummaryCard({ label, value, detail, active, tone, onClick }: {
  label: string; value: string; detail?: string; active?: boolean; tone?: "warning" | "accent"; onClick?: () => void;
}) {
  const content = <>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
  </>;
  const className = cn("rounded-lg border bg-card p-3 text-left",
    active && "border-primary/60 bg-primary/5",
    !active && tone === "warning" && "border-amber-300/70 dark:border-amber-900",
    !active && tone === "accent" && "border-primary/30 bg-primary/5");
  return onClick ? <button type="button" aria-pressed={active} onClick={onClick}
    className={cn(className, "transition-colors hover:bg-muted/50")}>{content}</button> : <div className={className}>{content}</div>;
}

function SortHeader({ label, sortKey, sort, direction, align, onSort }: {
  label: string; sortKey: RemittanceApprovalSort; sort: RemittanceApprovalSort; direction: Direction; align?: "right";
  onSort: (key: RemittanceApprovalSort) => void;
}) {
  const active = sortKey === sort;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return <TableHead aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
    className={align === "right" ? "text-right" : undefined}>
    <button type="button" onClick={() => onSort(sortKey)}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap", align === "right" && "justify-end", active && "text-foreground")}>
      {label}<Icon className="size-3.5 opacity-60" />
    </button>
  </TableHead>;
}

function Pager({ label, page, size, total, onPage, onSize }: {
  label: string; page: number; size: number; total: number; onPage: (page: number) => void; onSize: (size: number) => void;
}) {
  if (!total) return null;
  const start = (page - 1) * size + 1;
  const end = Math.min(page * size, total);
  return <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <p className="text-muted-foreground">Showing {start}–{end} of {total}</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">Rows
        <NativeSelect aria-label={`${label} rows per page`} className="w-20" value={size}
          onChange={event => onSize(Number(event.target.value))}>
          {remittanceApprovalPageSizes.map(value => <option key={value} value={value}>{value}</option>)}
        </NativeSelect>
      </label>
      <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <Button type="button" variant="outline" size="sm" disabled={end >= total} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  </div>;
}

function DecisionBadge({ action }: { action: string }) {
  return action === "APPROVE"
    ? <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">Approved &amp; posted</Badge>
    : <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Returned</Badge>;
}

function ReviewDialog({ id, close, saved }: { id: string; close: () => void; saved: (message: string) => void }) {
  const url = api + "/" + id;
  const [revision, reload] = useState(0);
  const [reason, setReason] = useState("");
  const [acknowledgedToken, acknowledge] = useState("");
  const loaded = useLifecycleRead<Review>(url, revision);
  const command = useLifecycleCommand();
  const data = loaded?.data;
  const pending = data?.payment.state === "PENDING";
  const blocked = data?.evidence.checks.some(check => check.status === "block");
  const warnings = data?.evidence.checks.some(check => check.status === "warning");
  const acknowledged = acknowledgedToken === data?.token;
  const totals = data ? remittanceTotals([{ withheld: data.payment.withheld, penalty: data.payment.entered_penalty }]) : null;
  const waitingDays = data ? Math.max(0, dayDifference(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(data.payment.submitted_at)),
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date()),
  )) : 0;
  const details = data ? [
    ["Agency", data.evidence.agencyName], ["Employer account", data.evidence.employerNumber ?? "Unavailable"],
    ["Payroll month", monthLabel(data.payment.payroll_month)], ["Payment period", data.payment.payment_date.slice(0, 7)],
    ["Deadline", date(data.payment.due_date)], ["Paid on", date(data.payment.payment_date)],
    ["Payment channel", remittanceChannels[data.batch.channel]], [data.evidence.referenceLabel, data.payment.payment_reference],
    ["Prepared by", data.batch.preparedBy + " · " + dateTime(data.batch.submittedAt) + " PHT"],
    ["Payroll receipt", "Filed revision " + data.payment.source_snapshot.receiptRevision +
      (data.evidence.latestReceipt ? " · Checked revision " + data.evidence.latestReceipt.revision : "")],
    ["Billing revision checked", data.evidence.billingRevision?.number ?? "Unavailable"],
  ] : [];

  function decide(action: "APPROVE" | "RETURN") {
    if (!data) return;
    void command.run(url, { action, token: data.token, acknowledgeWarnings: action === "APPROVE" && acknowledged,
      reason: action === "RETURN" ? reason.trim() : "" }, () => saved(action === "APPROVE" ? "Remittance approved." : "Remittance returned."));
  }

  return <Dialog open onOpenChange={open => { if (!open && !command.busy) close(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl" showCloseButton={false}>
      <DialogHeader className="shrink-0 border-b p-4">
        <DialogTitle>{data ? "Review " + data.payment.agency_name + " remittance" : "Review remittance"}</DialogTitle>
        <DialogDescription>{data ? monthLabel(data.payment.payroll_month) + " Payroll · " + data.payment.payment_reference : "Payment evidence and approval checks"}</DialogDescription>
        {data && <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <Badge variant={data.payment.state === "PENDING" ? "outline" : data.payment.state === "APPROVED" ? "secondary" : "destructive"}>
            {data.payment.state === "PENDING" ? "Pending" : data.payment.state === "APPROVED" ? "Approved" : "Returned"}
          </Badge>
          {data.payment.state === "PENDING" && <Badge variant="outline">{waitingDays} {waitingDays === 1 ? "day" : "days"} waiting</Badge>}
          <Badge variant="outline">Due {date(data.payment.due_date)}</Badge>
          <Badge variant="outline">{peso(data.payment.entered_penalty)} penalty</Badge>
        </div>}
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {!data && !loaded?.error && <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-52 w-full" /></div>}
        {!data && loaded?.error && <p role="alert" className="text-sm text-destructive">{loaded.error}</p>}
        {data && totals && <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Amount paid", totals.withheld], ["Entered penalty", totals.penalties],
              ["Total cash out", totals.cashOut], [data.decision ? "Withholding owed after decision" : "Remaining withholding owed", data.liability.remaining]] as const)
              .map(([label, value]) => <div key={label} className="rounded-md border p-2 text-sm">
                <dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{formatMoney(value)}</dd></div>)}
          </dl>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="space-y-2 rounded-md border p-3">
              <h3 className="font-semibold">Payment details</h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 break-words text-sm">
                {details.map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>)}
              </dl>
              <p className="break-all text-sm">{data.batch.proofName}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <a className="underline" href={url + "?proof=1&inline=1"} target="_blank" rel="noreferrer">Preview proof</a>
                <a className="underline" href={url + "?proof=1"}>Download proof</a>
              </div>
            </section>
            <section className="rounded-md border p-3">
              <h3 className="font-semibold">Approval checks</h3>
              <ul className="divide-y text-sm">
                {data.evidence.checks.map(check => <li key={check.label} className="space-y-1 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-1"><span>{check.label}</span>
                    <Badge variant={check.status === "block" ? "destructive" : check.status === "warning" ? "secondary" : "outline"}>{checkLabel[check.status]}</Badge></div>
                  <div className="text-muted-foreground">{check.detail}</div>
                </li>)}
              </ul>
              {data.evidence.billingAmounts && <p className="mt-2 text-sm text-muted-foreground">
                Billed {formatMoney(data.evidence.billingAmounts.billed)} · Deducted {formatMoney(data.evidence.billingAmounts.deduction)}
                {" · Difference " + formatMoney(data.evidence.billingAmounts.difference)}</p>}
            </section>
          </div>
          <IncludedDeductions url={url + "?deductions=1"} initiallyExpanded />
          {pending && <div className="space-y-2">
            {warnings && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acknowledged}
              onChange={event => acknowledge(event.target.checked ? data.token : "")} /> I reviewed the warnings.</label>}
            <label className="block text-sm">Reason required to return
              <Textarea value={reason} maxLength={500} disabled={command.busy} onChange={event => setReason(event.target.value)} /></label>
          </div>}
          {data.decision && <p className="rounded-md border p-3 text-sm">
            {data.decision.action === "APPROVE" ? "Approved" : "Returned"} by {data.decision.actor} · {dateTime(data.decision.at)} PHT
            {data.decision.reason && <span className="block break-words">{data.decision.reason}</span>}</p>}
        </>}
        {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t p-4">
        <Button variant="outline" disabled={command.busy} onClick={close}>Close</Button>
        {(loaded?.error || command.error) && <Button variant="outline" disabled={command.busy} onClick={() => reload(value => value + 1)}>Refresh review</Button>}
        {pending && <>
          <Button variant="outline" disabled={command.busy || !reason.trim()} onClick={() => decide("RETURN")}>Return to preparer</Button>
          <Button disabled={command.busy || blocked || (warnings && !acknowledged)} onClick={() => decide("APPROVE")}>Approve &amp; post</Button>
        </>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function RemittanceApprovalModule() {
  const [q, setSearch] = useState("");
  const [agency, setAgency] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [sort, setSort] = useState<RemittanceApprovalSort>("waiting");
  const [direction, setDirection] = useState<Direction>("asc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySize, setHistorySize] = useState(10);
  const [revision, reload] = useState(0);
  const [reviewId, review] = useState<string>();
  const [selected, select] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [skips, setSkips] = useState<{ id: string; reference: string; reason: string | null }[]>([]);
  const [bulkOpen, openBulk] = useState(false);
  const skipUrlWrite = useRef(true);
  const command = useLifecycleCommand();
  const agencies = useLifecycleRead<Awaited<ReturnType<typeof listApprovalAgencies>>>(api + "?agencies=1");

  const params = new URLSearchParams({ page: String(page), size: String(size), sort, direction,
    historyPage: String(historyPage), historySize: String(historySize) });
  if (q.trim()) params.set("q", q.trim());
  if (agency) params.set("agencyId", agency);
  if (overdue) params.set("overdue", "1");
  const loaded = useRetainedLifecycleRead<Queue>(api + "?" + params, revision);
  const data = loaded.data;
  const pendingItems = data?.pending ?? [];
  const selection = pendingItems.filter(row => selected.includes(row.id));
  const all = pendingItems.length > 0 && selection.length === pendingItems.length;
  const selectionTotals = remittanceTotals(selection.map(row => ({ withheld: row.amount, penalty: row.penalty })));
  const hasFilters = Boolean(q.trim() || agency || overdue);
  const summary = data?.summary;

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const readSort = params.get("rap_sort");
      const readDirection = params.get("rap_direction");
      const readSize = Number(params.get("rap_size"));
      const readHistorySize = Number(params.get("rap_historySize"));
      setSearch(params.get("rap_q") ?? "");
      setAgency(params.get("rap_agency") ?? "");
      setOverdue(params.get("rap_overdue") === "1");
      setSort(readSort && readSort in remittanceApprovalSorts ? readSort as RemittanceApprovalSort : "waiting");
      setDirection(readDirection === "desc" ? "desc" : "asc");
      setSize([10, 25, 50].includes(readSize) ? readSize : 25);
      setHistorySize([10, 25, 50].includes(readHistorySize) ? readHistorySize : 10);
      setPage(Math.max(1, Number(params.get("rap_page")) || 1));
      setHistoryPage(Math.max(1, Number(params.get("rap_historyPage")) || 1));
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
    setOrDelete("rap_q", q.trim());
    setOrDelete("rap_agency", agency);
    setOrDelete("rap_overdue", overdue ? "1" : "");
    setOrDelete("rap_sort", sort !== "waiting" ? sort : "");
    setOrDelete("rap_direction", direction !== "asc" ? direction : "");
    setOrDelete("rap_size", size !== 25 ? String(size) : "");
    setOrDelete("rap_page", page > 1 ? String(page) : "");
    setOrDelete("rap_historySize", historySize !== 10 ? String(historySize) : "");
    setOrDelete("rap_historyPage", historyPage > 1 ? String(historyPage) : "");
    const next = params.toString();
    const target = window.location.pathname + (next ? "?" + next : "") + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (target !== current) window.history.replaceState(window.history.state, "", target);
  }, [agency, direction, historyPage, historySize, overdue, page, q, size, sort]);

  function refresh() {
    reload(value => value + 1);
    select([]);
  }

  function filterChanged(update: () => void) {
    update();
    setPage(1);
    select([]);
  }

  function clearFilters() {
    setSearch("");
    setAgency("");
    setOverdue(false);
    setPage(1);
    select([]);
  }

  function changeSort(next: RemittanceApprovalSort) {
    if (next === sort) setDirection(value => value === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection("asc"); }
    setPage(1);
    select([]);
  }

  function confirmBulk() {
    void command.run(api + "/bulk", { ids: selection.map(row => row.id) }, async response => {
      const result: BulkResult = await response.json();
      const approved = result.items.filter(row => row.approved).length;
      setSkips(result.items.filter(row => !row.approved).map(row => ({
        ...row, reference: selection.find(item => item.id === row.id)?.reference ?? row.id,
      })));
      setNotice(approved + " approved · " + (result.items.length - approved) + " skipped");
      openBulk(false);
      setPage(1);
      setHistoryPage(1);
      refresh();
    });
  }

  return <div className="min-w-0 space-y-6">
    <div>
      <h2 className="text-base font-semibold">Remittance Approval</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Check each paid remittance against its proof of payment and the amount payroll withheld, then approve it so it posts.
      </p>
    </div>
    {notice && <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
    {!!skips.length && <ul className="list-inside list-disc break-words text-sm">
      {skips.map(row => <li key={row.id}>{row.reference} · {row.reason}</li>)}</ul>}
    <section aria-labelledby="remittance-queue" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="remittance-queue" className="font-semibold">Waiting for approval</h2>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loaded.pending}>Refresh queue</Button>
      </div>
      {summary ? <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-4", loaded.pending && "opacity-60")}>
        <SummaryCard label="Pending" value={String(summary.pending)}
          detail={summary.pending ? `Oldest ${summary.oldestWaitingDays} ${summary.oldestWaitingDays === 1 ? "day" : "days"}` : "Nothing waiting"}
          active={!overdue} onClick={() => filterChanged(() => setOverdue(false))} />
        <SummaryCard label="Overdue" value={String(summary.overdue)} tone="warning" active={overdue}
          onClick={() => filterChanged(() => setOverdue(value => !value))} />
        <SummaryCard label="Amount paid" value={peso(summary.amount)} detail="Pending remittances" tone="accent" />
        <SummaryCard label="Penalties" value={peso(summary.penalty)} detail="Entered penalties" />
      </div> : loaded.error ? null : <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(value => <Skeleton key={value} className="h-[86px] rounded-lg" />)}
      </div>}
      <div className="flex flex-wrap items-end gap-3">
        <Input aria-label="Search remittance approvals" placeholder="Reference, preparer, or agency" className="max-w-sm"
          maxLength={120} value={q} onChange={event => filterChanged(() => setSearch(event.target.value))} />
        <NativeSelect aria-label="Filter by agency" value={agency} disabled={!agencies?.data} onChange={event => {
          filterChanged(() => setAgency(event.target.value));
        }}>
          <option value="">{agencies?.error ? "Agency list unavailable" : "All agencies"}</option>
          {agencies?.data?.map(option => <option key={option.id} value={option.id}>{option.display_name}</option>)}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={overdue} onChange={event => {
            filterChanged(() => setOverdue(event.target.checked));
          }} /> Waiting more than {REQUEST_SLA_DAYS} days
        </label>
        {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
      </div>
      {agencies?.error && <LoadError message={agencies.error} retry={() => refresh()} />}
      {loaded.error && <LoadError message={loaded.error} retry={refresh} />}
      {!!selection.length && <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 p-2 text-sm shadow-sm backdrop-blur">
        <span>{selection.length} selected</span>
        <span className="text-muted-foreground">{peso(selectionTotals.withheld)} paid · {peso(selectionTotals.penalties ?? "0.00")} penalties</span>
        <Button type="button" variant="outline" size="sm" onClick={() => select([])}>Clear selection</Button>
        <Button type="button" size="sm" onClick={() => openBulk(true)}>Bulk approve</Button>
      </div>}
      {!data && !loaded.error && <div className="space-y-2 rounded-lg border p-3"><Skeleton className="h-9 w-full" />{[0, 1, 2, 3, 4].map(value => <Skeleton key={value} className="h-12 w-full" />)}</div>}
      {data && <>
        <div className={cn("hidden overflow-x-auto rounded-lg border md:block", loaded.pending && "opacity-60")}>
          <Table>
            <caption className="sr-only">Remittances waiting for approval</caption>
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
              <TableHead className="w-10"><input type="checkbox" className="size-4 accent-primary" aria-label="Select all pending remittances on this page"
                checked={all} disabled={!pendingItems.length} onChange={event => select(event.target.checked ? pendingItems.map(row => row.id) : [])} /></TableHead>
              <SortHeader label="Agency" sortKey="agency" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Month" sortKey="month" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Paid" sortKey="amount" sort={sort} direction={direction} align="right" onSort={changeSort} />
              <SortHeader label="Penalty" sortKey="penalty" sort={sort} direction={direction} align="right" onSort={changeSort} />
              <SortHeader label="Paid on" sortKey="paymentDate" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Reference" sortKey="reference" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Prepared" sortKey="preparedBy" sort={sort} direction={direction} onSort={changeSort} />
              <SortHeader label="Waiting" sortKey="waiting" sort={sort} direction={direction} onSort={changeSort} />
            </TableRow></TableHeader>
            <TableBody>
              {!pendingItems.length && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span>{hasFilters ? "No remittances match these filters." : "Nothing waiting for approval."}</span>
                  {hasFilters && <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
                </div>
              </TableCell></TableRow>}
              {pendingItems.map(row => <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => review(row.id)}>
                <TableCell onClick={event => event.stopPropagation()}><input type="checkbox" className="size-4 accent-primary"
                  aria-label={"Select " + row.reference} checked={selected.includes(row.id)} onChange={event =>
                    select(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} /></TableCell>
                <TableCell><AgencyBadge name={row.agency} code={row.agencyCode} /></TableCell>
                <TableCell className="whitespace-nowrap">{monthLabel(row.month)}</TableCell>
                <TableCell className="text-right tabular-nums">{peso(row.amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{peso(row.penalty)}</TableCell>
                <TableCell className="whitespace-nowrap">{date(row.paymentDate)}</TableCell>
                <TableCell>
                  <Button type="button" size="sm" variant="link" className="h-auto px-0" onClick={event => { event.stopPropagation(); review(row.id); }}>{row.reference}</Button>
                  {row.proofName && <a className="block text-xs underline" href={api + "/" + row.id + "?proof=1&inline=1"} target="_blank"
                    rel="noreferrer" onClick={event => event.stopPropagation()}>Preview proof</a>}
                </TableCell>
                <TableCell><span className="block max-w-36 truncate" title={row.preparedBy}>{row.preparedBy}</span>
                  <span className="block text-xs text-muted-foreground">{date(row.submittedAt)}</span></TableCell>
                <TableCell><WaitingBadge days={row.waitingDays} /></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        <div className={cn("space-y-2 md:hidden", loaded.pending && "opacity-60")}>{pendingItems.map(row => <article key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <AgencyBadge name={row.agency} code={row.agencyCode} />
              <p className="mt-1 break-all font-medium">{row.reference}</p>
              <p className="text-xs text-muted-foreground">{monthLabel(row.month)} payroll</p>
            </div>
            <input type="checkbox" className="mt-1 size-4 accent-primary" aria-label={"Select " + row.reference}
              checked={selected.includes(row.id)} onChange={event =>
                select(current => event.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} />
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div><dt className="text-xs text-muted-foreground">Amount paid</dt><dd className="tabular-nums">{peso(row.amount)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Penalty</dt><dd className="tabular-nums">{peso(row.penalty)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Paid on</dt><dd>{date(row.paymentDate)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Waiting</dt><dd><WaitingBadge days={row.waitingDays} /></dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">{row.preparedBy} · {dateTime(row.submittedAt)} PHT</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {row.proofName ? <a className="text-sm underline" href={api + "/" + row.id + "?proof=1&inline=1"}>Preview proof</a> : <span className="text-xs text-muted-foreground">No proof file</span>}
            <Button type="button" variant="outline" size="sm" onClick={() => review(row.id)}>Review</Button>
          </div>
        </article>)}</div>
        <Pager label="Pending remittances" page={page} size={size} total={data.total}
          onPage={value => { setPage(value); select([]); }} onSize={value => { setSize(value); setPage(1); select([]); }} />
      </>}
    </section>
    {data && <section aria-labelledby="remittance-history" className="space-y-3">
      <div>
        <h2 id="remittance-history" className="font-semibold">Recent decisions</h2>
        <p className="text-sm text-muted-foreground">Approved and returned remittances, newest first.</p>
      </div>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <caption className="sr-only">Recent remittance approval decisions</caption>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
            {["Agency", "Payroll month", "Amount", "Reference", "Decision", "Decided by"].map(label =>
              <TableHead key={label} className={label === "Amount" ? "text-right" : undefined}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {!data.history.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No decisions yet.</TableCell></TableRow>}
            {data.history.map(row => <TableRow key={row.decisionId} className="cursor-pointer hover:bg-muted/50" onClick={() => review(row.id)}>
              <TableCell><AgencyBadge name={row.agency} code="" /></TableCell>
              <TableCell className="whitespace-nowrap">{monthLabel(row.month)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(row.amount)}</TableCell>
              <TableCell><Button type="button" size="sm" variant="link" className="h-auto px-0" onClick={event => { event.stopPropagation(); review(row.id); }}>{row.reference}</Button></TableCell>
              <TableCell><DecisionBadge action={row.action} />
                {row.reason && <span className="block max-w-xs break-words text-xs text-muted-foreground">{row.reason}</span>}</TableCell>
              <TableCell>{row.actor}<span className="block text-xs text-muted-foreground">{dateTime(row.at)} PHT</span></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-2 md:hidden">{data.history.map(row => <article key={row.decisionId} className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <AgencyBadge name={row.agency} code="" />
            <p className="mt-1 break-all font-medium">{row.reference}</p>
            <p className="text-xs text-muted-foreground">{monthLabel(row.month)} payroll</p>
          </div>
          <DecisionBadge action={row.action} />
        </div>
        <p className="tabular-nums">{peso(row.amount)}</p>
        {row.reason && <p className="break-words text-xs text-muted-foreground">{row.reason}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{row.actor} · {dateTime(row.at)} PHT</span>
          <Button type="button" variant="outline" size="sm" onClick={() => review(row.id)}>View decision</Button>
        </div>
      </article>)}
        {!data.history.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No decisions yet.</p>}
      </div>
      <Pager label="Decision history" page={historyPage} size={historySize} total={data.totalHistory}
        onPage={setHistoryPage} onSize={value => { setHistorySize(value); setHistoryPage(1); }} />
    </section>}
    {reviewId && <ReviewDialog key={reviewId} id={reviewId} close={() => review(undefined)} saved={message => {
      review(undefined); setNotice(message); setSkips([]); setPage(1); setHistoryPage(1); refresh();
    }} />}
    <Dialog open={bulkOpen} onOpenChange={open => { if (!command.busy) openBulk(open); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader><DialogTitle>Bulk approve {selection.length} remittance(s)</DialogTitle>
          <DialogDescription>Each remittance will be checked again. Any row with warnings or blockers will be skipped with a reason.</DialogDescription></DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto">
          <ul className="divide-y rounded-md border text-sm">
            {selection.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="break-words">{row.reference} · {row.agency} · {monthLabel(row.month)}</span>
              <span className="tabular-nums">{peso(row.amount)}</span>
            </li>)}
          </ul>
          <p className="text-sm text-muted-foreground">Selected total: <span className="font-medium text-foreground">{peso(selectionTotals.withheld)}</span> paid
            {" · "}{peso(selectionTotals.penalties ?? "0.00")} penalties</p>
          {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={command.busy} onClick={() => openBulk(false)}>Cancel</Button>
          <Button disabled={command.busy || !selection.length} onClick={confirmBulk}>Approve &amp; post</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
