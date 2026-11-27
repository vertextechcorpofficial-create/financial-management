"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, Copy, Download, History, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { copyText } from "@/modules/financial-management/property-ledger/utils/clipboard";
import { MetricCard, MetricCardsSkeleton, ListRowsSkeleton, StatusChip, TableRowsSkeleton } from "../components/ui";
import { useLifecycleCommand, useRetainedLifecycleRead } from "../loans/lifecycle-client";
import { AgencyRollforward } from "./AgencyRollforward";
import type { closeGovernmentLoanMonth, viewMonthEndClose } from "../server/month-end-close";

const endpoint = "/api/fm/government-loans/month-end-close";
type View = Awaited<ReturnType<typeof viewMonthEndClose>>;
type Snapshot = Awaited<ReturnType<typeof closeGovernmentLoanMonth>>;
type Checklist = Snapshot["checklist"];
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", month: "short", year: "numeric",
}).format(new Date(month + "-01T00:00:00Z"));
const formatMoney = (value: string | null | undefined) => value == null ? "—" : peso(value);

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
    {message}<Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function SummaryCard({ label, value, detail, icon, tone = "slate", alert = false }: {
  label: string; value: string; detail?: string; icon: ComponentType<{ className?: string }>;
  tone?: "emerald" | "sky" | "amber" | "rose" | "slate"; alert?: boolean;
}) {
  return <MetricCard icon={icon} label={label} value={value} detail={detail} tone={tone} alert={alert} />;
}

function ChecklistPanel({ checklist, closed = false, setupHref }: {
  checklist: Checklist; closed?: boolean; setupHref?: string;
}) {
  const blocked = !checklist.payroll;
  const status = closed ? "Closed" : blocked ? "Blocked" : checklist.openItemCount ? `${checklist.openItemCount} open item(s)` : "Ready to close";
  return <section className="overflow-hidden rounded-lg border bg-card" aria-labelledby="close-checklist">
    <div className="flex flex-wrap items-start justify-between gap-2 border-b p-4">
      <div>
        <h3 id="close-checklist" className="font-semibold">{closed ? "Saved close checklist" : "Close checklist"} · {monthLabel(checklist.month)}</h3>
        <p className="text-sm text-muted-foreground">Locks through {date(checklist.endDate)} · opens {monthLabel(checklist.nextMonth)}</p>
      </div>
      <StatusChip status={closed ? "closed" : blocked ? "blocked" : checklist.openItemCount ? "warning" : "ready"} label={status} />
    </div>
    <div className="flex flex-wrap items-start justify-between gap-2 border-b p-4">
      <div className="min-w-0">
        <h4 className="font-medium">Payroll deductions received</h4>
        <p className="text-sm text-muted-foreground">
          {checklist.payroll ? `Confirmed revision ${checklist.payroll.revision} · ${checklist.resultCount} result(s) · ${dateTime(checklist.payroll.receivedAt)} PHT`
            : "Confirm complete Payroll results before closing."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!checklist.payroll && setupHref && <Link className="text-sm underline" href={setupHref}>Set up Payroll coverage</Link>}
        <StatusChip status={checklist.payroll ? "passed" : "blocked"} label={checklist.payroll ? "Passed" : "Blocked"} />
      </div>
    </div>
    {checklist.groups.map(group => {
      const awaitingPayroll = group.key === "billing" && !checklist.payroll;
      return <div key={group.key} className="border-b p-4 last:border-b-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-medium">{group.label}</h4>
            <p className="text-sm text-muted-foreground">
              {group.items.length ? `${group.items.length} item(s) need attention` : awaitingPayroll ? "Awaiting Payroll results" : "All clear"}
            </p>
          </div>
          <Badge variant="outline"
            className={group.items.length ? "text-amber-700 dark:text-amber-400" : undefined}>
            {group.items.length ? `${group.items.length} open` : awaitingPayroll ? "Awaiting Payroll" : "Passed"}
          </Badge>
        </div>
        {!!group.items.length && <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">View {group.items.length} item(s)</summary>
          <ul className="mt-2 max-h-60 divide-y overflow-y-auto rounded-md border">
            {group.items.map(entry => <li key={entry.key} className="break-words p-2">
              <div>{entry.label}</div><div className="text-muted-foreground">{entry.detail}</div>
            </li>)}
          </ul>
        </details>}
      </div>;
    })}
    {!!checklist.finalPay.length && <details className="border-b p-4 text-sm">
      <summary className="cursor-pointer font-medium">Reported final pay results ({checklist.finalPay.length})</summary>
      <ul className="mt-2 max-h-60 divide-y overflow-y-auto rounded-md border">
        {checklist.finalPay.map(entry => <li key={entry.key} className="break-words p-2">
          <div>{entry.label}</div><div className="text-muted-foreground">{entry.detail}</div>
        </li>)}
      </ul>
    </details>}
  </section>;
}

function CloseDialog({ current, onClose, onSaved }: { current: NonNullable<View["current"]>; onClose: () => void; onSaved: (snapshot: Snapshot) => void }) {
  const [reason, setReason] = useState("");
  const command = useLifecycleCommand();
  const { checklist, token } = current;
  return <Dialog open onOpenChange={open => { if (!open && !command.busy) onClose(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Close {monthLabel(checklist.month)}</DialogTitle>
        <DialogDescription>This locks the period through {date(checklist.endDate)} and opens {monthLabel(checklist.nextMonth)}.</DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-2 gap-2 rounded-md border p-3 text-sm">
        <div><dt className="text-muted-foreground">Payroll</dt><dd>{checklist.payroll ? `Revision ${checklist.payroll.revision}` : "Missing"}</dd></div>
        <div><dt className="text-muted-foreground">Open items</dt><dd>{checklist.openItemCount}</dd></div>
        <div><dt className="text-muted-foreground">Period ends</dt><dd>{date(checklist.endDate)}</dd></div>
        <div><dt className="text-muted-foreground">Next period</dt><dd>{monthLabel(checklist.nextMonth)}</dd></div>
      </dl>
      {checklist.openItemCount > 0 && <label className="grid gap-2 text-sm">
        Reason for closing with {checklist.openItemCount} open item(s)
        <Textarea value={reason} maxLength={1000} disabled={command.busy} onChange={event => setReason(event.target.value)} />
        <span className="text-xs text-muted-foreground">Open items are carried into {monthLabel(checklist.nextMonth)}.</span>
      </label>}
      <DialogFooter>
        <Button variant="outline" disabled={command.busy} onClick={onClose}>Cancel</Button>
        <Button variant={checklist.openItemCount ? "destructive" : "default"}
          disabled={command.busy || (checklist.openItemCount > 0 && !reason.trim())}
          onClick={() => void command.run(endpoint, { month: checklist.month, token, reason: reason.trim() },
            async response => onSaved(await response.json()))}>{command.busy ? "Closing…" : "Confirm close"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function CloseHistory({ history, selectedMonth, page, size, total, loading, onPage, onSize, onSelect }: {
  history: View["history"]; selectedMonth: string; page: number; size: number; total: number;
  loading: boolean; onPage: (page: number) => void; onSize: (size: number) => void; onSelect: (month: string) => void;
}) {
  const start = total ? (page - 1) * size + 1 : 0;
  const end = Math.min(page * size, total);
  return <section className="space-y-3" aria-labelledby="close-history">
    <div>
      <h2 id="close-history" className="font-semibold">Close history</h2>
      <p className="text-sm text-muted-foreground">Closed periods, newest first. Select a period to inspect its saved checklist and rollforward.</p>
    </div>
    {!history.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No closed periods yet.</p>}
    {!!history.length && <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <caption className="sr-only">Closed Government Loans periods</caption>
          <TableHeader><TableRow>
            {["Month", "Closed by", "Closed at", "Open items", "Reason", "Action"].map(label =>
              <TableHead key={label}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRowsSkeleton rows={3} columns={6} /> : history.map(row => <TableRow key={row.id} className={cn("cursor-pointer hover:bg-muted/50", selectedMonth === row.month && "bg-muted/40")}
            onClick={() => onSelect(row.month)}>
            <TableCell className="whitespace-nowrap">{monthLabel(row.month)}
              {row.nextMonth && <span className="block text-xs text-muted-foreground">opened {monthLabel(row.nextMonth)}</span>}</TableCell>
            <TableCell>{row.actor}</TableCell>
            <TableCell><time dateTime={row.closedAt}>{dateTime(row.closedAt)} PHT</time></TableCell>
            <TableCell>{row.openItemCount ? <Badge variant="outline" className="text-amber-700 dark:text-amber-400">{row.openItemCount} open</Badge> : "—"}</TableCell>
            <TableCell className="max-w-64 whitespace-pre-wrap break-words">{row.reason ?? "—"}</TableCell>
            <TableCell><Button type="button" size="sm" variant="outline" aria-label={`View ${row.month}`}
              onClick={event => { event.stopPropagation(); onSelect(row.month); }}>View {monthLabel(row.month)}</Button></TableCell>
          </TableRow>)}
          </TableBody>
        </Table>
      </div>
      {loading ? <ListRowsSkeleton rows={3} className="md:hidden" /> : <div className="space-y-2 md:hidden">{history.map(row => <article key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="font-medium">{monthLabel(row.month)}</p>
            {row.nextMonth && <p className="text-xs text-muted-foreground">Opened {monthLabel(row.nextMonth)}</p>}</div>
          {row.openItemCount ? <Badge variant="outline" className="text-amber-700 dark:text-amber-400">{row.openItemCount} open</Badge> : <Badge variant="outline">Clean close</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{row.actor} · {dateTime(row.closedAt)} PHT</p>
        {row.reason && <p className="break-words text-xs text-muted-foreground">{row.reason}</p>}
        <Button type="button" size="sm" variant="outline" aria-label={`View ${row.month}`} onClick={() => onSelect(row.month)}>View {monthLabel(row.month)}</Button>
      </article>)}</div>}
    </>}
    {total > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-muted-foreground">Showing {start}–{end} of {total}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">Rows
          <NativeSelect aria-label="Close history rows per page" className="w-20" value={size}
            onChange={event => onSize(Number(event.target.value))}>
            {[10, 25, 50].map(value => <option key={value} value={value}>{value}</option>)}
          </NativeSelect>
        </label>
        <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button type="button" variant="outline" size="sm" disabled={end >= total} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>}
  </section>;
}

export function MonthEndCloseModule({ setupHref }: { setupHref?: string } = {}) {
  const [revision, reload] = useState(0);
  const [review, setReview] = useState<View["current"]>(null);
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [exporting, setExporting] = useState(false);
  const skipUrlWrite = useRef(true);
  const params = new URLSearchParams({ page: String(page), historySize: String(size) });
  if (month) params.set("month", month);
  const loaded = useRetainedLifecycleRead<View>(endpoint + "?" + params, revision);
  const coverage = loaded.data;
  const current = coverage?.current;
  const saved = coverage?.saved;
  const displayed = saved ?? current;
  const openMonth = coverage?.openMonth ?? "";
  const selectedMonth = month || openMonth;
  const exportUrl = (format: "checklist-csv" | "rollforward-csv") =>
    endpoint + "?" + new URLSearchParams({ format, month: displayed!.checklist.month }).toString();
  const months = new Map<string, string>();
  if (openMonth) months.set(openMonth, `${monthLabel(openMonth)} · open`);
  for (const row of coverage?.history ?? []) if (!months.has(row.month)) months.set(row.month, `${monthLabel(row.month)} · closed`);
  if (month && !months.has(month)) months.set(month, `${monthLabel(month)} · closed`);

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const readMonth = params.get("mec_month");
      const readSize = Number(params.get("mec_size"));
      setMonth(readMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(readMonth) ? readMonth : "");
      setPage(Math.max(1, Number(params.get("mec_page")) || 1));
      setSize([10, 25, 50].includes(readSize) ? readSize : 10);
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
    setOrDelete("mec_month", month);
    setOrDelete("mec_page", page > 1 ? String(page) : "");
    setOrDelete("mec_size", size !== 10 ? String(size) : "");
    const next = params.toString();
    const target = window.location.pathname + (next ? "?" + next : "") + window.location.hash;
    const currentLocation = window.location.pathname + window.location.search + window.location.hash;
    if (target !== currentLocation) window.history.replaceState(window.history.state, "", target);
  }, [month, page, size]);

  function refresh() {
    reload(value => value + 1);
  }

  function selectMonth(next: string) {
    setMonth(next === openMonth ? "" : next);
    setReview(null);
  }

  async function copyExport(format: "checklist-csv" | "rollforward-csv") {
    if (!displayed) return;
    setExporting(true);
    try {
      const response = await fetch(exportUrl(format));
      if (!response.ok) throw new Error("Export failed");
      await copyText(await response.text());
      toast.success(format === "checklist-csv" ? "Checklist CSV copied." : "Rollforward CSV copied.");
    } catch {
      toast.error("Could not copy the CSV.");
    } finally {
      setExporting(false);
    }
  }

  const checklist = displayed?.checklist;
  const rollforward = displayed?.rollforward;
  const payrollOk = Boolean(checklist?.payroll);
  const openItems = checklist?.openItemCount ?? 0;
  const earlier = rollforward?.totals.earlier ?? null;
  const earlierOpen = earlier !== null && earlier !== "0.00" && !earlier.startsWith("-");

  return <div className="min-w-0 space-y-6">
    <div>
      <h2 className="text-base font-semibold">Month-End Close</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Confirm the month is complete, then lock it. Closing is the last step after payroll has reported deductions and the remittances
        that fell due have been paid and approved.
      </p>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">Period
          <NativeSelect aria-label="Close period" value={selectedMonth} disabled={!coverage}
            onChange={event => selectMonth(event.target.value)}>
            {!selectedMonth && <option value="">Select period</option>}
            {[...months].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </NativeSelect>
        </label>
        {month && openMonth && <Button type="button" variant="outline" size="sm" onClick={() => selectMonth(openMonth)}>Open current month</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={refresh} disabled={loaded.pending}>Refresh checklist</Button>
        {displayed && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" disabled={exporting || loaded.pending}>Export</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Month-end files</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void copyExport("checklist-csv")}><Copy className="size-4" />Copy checklist CSV</DropdownMenuItem>
            <DropdownMenuItem asChild><a href={exportUrl("checklist-csv")}><Download className="size-4" />Download checklist CSV</a></DropdownMenuItem>
            <DropdownMenuSeparator />
            {rollforward && <>
              <DropdownMenuItem onSelect={() => void copyExport("rollforward-csv")}><Copy className="size-4" />Copy rollforward CSV</DropdownMenuItem>
              <DropdownMenuItem asChild><a href={exportUrl("rollforward-csv")}><Download className="size-4" />Download rollforward CSV</a></DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
    </div>
    {loaded.error && <LoadError message={loaded.error} retry={refresh} />}
    {!coverage && !loaded.error && <div className="space-y-3">
      <MetricCardsSkeleton />
      <Skeleton className="h-72 w-full rounded-lg" />
      <Skeleton className="h-56 w-full rounded-lg" />
    </div>}
    {coverage && !displayed && <div className="flex flex-wrap items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
      <span>Set the Government Loans open month to begin.</span>
      {setupHref && <Link className="underline" href={setupHref}>Open Period setup</Link>}
    </div>}
    {displayed && checklist && <>
      <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-4", loaded.pending && "opacity-60")}>
        <SummaryCard label="Payroll" value={payrollOk ? "Received" : "Missing"}
          detail={checklist.payroll ? `${checklist.resultCount} result(s) · revision ${checklist.payroll.revision}` : "Required before closing"}
          icon={payrollOk ? CheckCircle2 : AlertTriangle} tone={payrollOk ? "emerald" : "rose"} alert={!payrollOk} />
        <SummaryCard label={saved ? "Open items at close" : "Open items"} value={String(openItems)}
          detail={saved ? "Carried into the next period" : openItems ? `Carried into ${monthLabel(checklist.nextMonth)}` : "Ready to close"}
          icon={ClipboardList} tone={openItems ? "amber" : "emerald"} alert={openItems > 0} />
        <SummaryCard label="Closing balance" value={formatMoney(rollforward?.totals.closing)} detail="Withheld, not yet remitted"
          icon={Landmark} tone="sky" />
        <SummaryCard label="Earlier months" value={formatMoney(earlier)}
          detail={earlierOpen ? saved ? "Closed with an older balance" : "Resolve before closing" : earlier === null ? "Rollforward unavailable" : "No older balance"}
          icon={History} tone={earlierOpen ? "rose" : "slate"} alert={earlierOpen} />
      </div>
      {saved && <section className="space-y-2 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Period status</h2>
          <StatusChip status="closed" label="Closed" />
        </div>
        <p className="text-sm text-muted-foreground">Closed by {saved.actor} on {dateTime(saved.closedAt)} PHT</p>
        {saved.nextMonth && <p className="text-sm text-muted-foreground">Opened {monthLabel(saved.nextMonth)}</p>}
        {saved.checklist.openItemCount ? <div className="rounded-md border border-amber-300/70 bg-amber-50/40 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
          Closed with {saved.checklist.openItemCount} open item(s). These were carried into the next period.
        </div> : <p className="text-sm text-muted-foreground">Closed with all checks passed.</p>}
        {saved.reason && <p className="whitespace-pre-wrap break-words text-sm">{saved.reason}</p>}
      </section>}
      {current && <>
      <ChecklistPanel checklist={current.checklist} setupHref={setupHref} />
        {!current.checklist.payroll && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Payroll&apos;s deduction report for {monthLabel(current.checklist.month)} is required before closing.
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Closing locks {monthLabel(current.checklist.month)} and opens {monthLabel(current.checklist.nextMonth)}.
            {current.checklist.openItemCount > 0 && ` ${current.checklist.openItemCount} open item(s) will be carried forward.`}
          </p>
          <Button type="button" variant={current.checklist.openItemCount ? "destructive" : "default"}
            disabled={!current.checklist.payroll} onClick={() => setReview(current)}>
            {current.checklist.payroll && current.checklist.openItemCount
              ? `Close with ${current.checklist.openItemCount} open item(s)` : `Close ${monthLabel(current.checklist.month)}`}
          </Button>
        </div>
      </>}
    {saved && <ChecklistPanel checklist={saved.checklist} closed />}
      <AgencyRollforward rollforward={displayed.rollforward} onOpenMonth={selectMonth} />
    </>}
    {coverage && <CloseHistory history={coverage.history} selectedMonth={month}
      page={coverage.historyPage} size={coverage.pageSizeHistory} total={coverage.totalHistory} loading={loaded.pending}
      onPage={setPage} onSize={value => { setSize(value); setPage(1); }} onSelect={selectMonth} />}
    {review && <CloseDialog current={review} onClose={() => setReview(null)} onSaved={snapshot => {
      toast.success(`${monthLabel(snapshot.month)} closed. ${monthLabel(snapshot.nextMonth)} is now open.`);
      setReview(null); setMonth(""); setPage(1); refresh();
    }} />}
  </div>;
}
