"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { changeLabels } from "../loans/lifecycle";
import { useRetainedLifecycleRead } from "../loans/lifecycle-client";
import { registerStatusLabels } from "../loans/types";
import type { reportAgencyRemittances, reportEmployeeLedger, reportEmployees, reportLedgerLoan } from "../server/loan-reports";
import { CopyReport, ReportControls, ReportHeader, ReportMetric, useReportView, type ReportView } from "./ReportControls";

const base = "/api/fm/government-loans/reports";
const labels = { D: "Deducted", P: "Partial", F: "Failed", X: "Final pay", AWAITING: "Awaiting Payroll", NO_RESULT: "No loan result" };
const refunds = { QUEUED: "Awaiting export", EXPORTED: "Awaiting Payroll", ACKNOWLEDGED: "Awaiting payout", RETRYABLE: "Retry required",
  REVERSING: "Reversal pending", PAID: "Paid out", CANCELLED: "Cancelled" };
const money = (value: string | null) => value === null ? "—" : peso(value);
const idText = (value: string | null, label: string) => value ? <span className="block break-all text-xs text-muted-foreground">{label} {value}</span> : null;
const monthLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" })
  .format(new Date(value + "-01T00:00:00Z"));

function agencyTone(name: string) {
  const value = name.toLowerCase();
  if (value.includes("pag-ibig") || value.includes("hdmf")) return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (value.includes("sss") || value.includes("social security")) return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (value.includes("bank")) return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return "text-muted-foreground";
}

export function AgencyBadge({ name, code }: { name: string; code?: string }) {
  return <Badge variant="outline" className={agencyTone(name)} title={name}>
    <span className="max-w-36 truncate">{code || name}</span>
  </Badge>;
}

function deductionTone(status: keyof typeof labels) {
  if (status === "D") return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (status === "P" || status === "X") return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  if (status === "F") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "text-muted-foreground";
}

function remittanceTone(status: string, daysLate: number | null) {
  if (status === "approved") return daysLate && daysLate > 0
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (status === "pending") return "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (status === "overdue" || status === "returned") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "text-muted-foreground";
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return <div className="space-y-2 rounded-lg border p-3">{Array.from({ length: rows }, (_, index) =>
    <Skeleton key={index} className="h-10 w-full" style={{ opacity: 1 - index * 0.12 }} />)}</div>;
}

export function ReadFeedback({ error, retry, message }: { error?: string; retry: () => void; message: string }) {
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <p role={error ? "alert" : "status"}>{error ?? message}</p>
    {error && <Button size="sm" variant="outline" onClick={retry}>Retry</Button>}
  </div>;
}

export function ReportPages({ page, more, change, label }: { page: number; more: boolean; change: (page: number) => void; label: string }) {
  if (page === 1 && !more) return null;
  return <nav aria-label={label} className="flex items-center gap-2 text-sm">
    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => change(page - 1)}>Previous</Button>
    <span>Page {page}</span>
    <Button size="sm" variant="outline" disabled={!more} onClick={() => change(page + 1)}>Next</Button>
  </nav>;
}

function PayrollRows({ employeeId, loanId }: { employeeId: number; loanId: number }) {
  const [refresh, retry] = useState(0);
  const loaded = useRetainedLifecycleRead<Awaited<ReturnType<typeof reportLedgerLoan>>>(base + "/employee-ledger?" +
    new URLSearchParams({ employeeId: String(employeeId), loanId: String(loanId) }), refresh);
  const data = loaded.data;
  if (!data) return loaded.error ? <ReadFeedback error={loaded.error} retry={() => retry(value => value + 1)} message="Loading loan history…" />
    : <TableSkeleton rows={3} />;
  return <div className={cn("space-y-3", loaded.pending && "opacity-60")}>
    <h4 className="text-sm font-semibold">Monthly deductions</h4>
    <div className="hidden overflow-x-auto rounded-md border md:block"><Table>
      <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
        {["Payroll month", "Result", "Expected", "Deducted", "Agency remittance"].map(label => <TableHead key={label}>{label}</TableHead>)}
      </TableRow></TableHeader><TableBody>
        {data.deductions.map(row => <TableRow key={row.month}>
          <TableCell>{monthLabel(row.month)}{idText(row.receiptId, "Receipt revision " + (row.revision ?? ""))}</TableCell>
          <TableCell><Badge variant="outline" className={deductionTone(row.status)}>{labels[row.status]}</Badge>
            {row.unpaid !== null && <span className="block text-xs">{money(row.unpaid)} unpaid</span>}</TableCell>
          <TableCell>{money(row.expected)}</TableCell><TableCell>{money(row.actual)}</TableCell>
          <TableCell>{row.remittance ? <>
            {row.remittance.state === "APPROVED" ? "Included in approved remittance" : "Awaiting approval"}
            <div>{row.remittance.reference} · {date(row.remittance.date)} · {money(row.remittance.included)}</div>
            {row.remittance.olderSource && <span className="block text-xs">Remittance uses an earlier Payroll receipt.</span>}
            {idText(row.remittance.receiptId, "Filed revision " + row.remittance.revision)}
            {idText(row.remittance.approvalId ?? row.remittance.id, row.remittance.approvalId ? "Approval" : "Remittance")}
          </> : "—"}</TableCell>
        </TableRow>)}
        {!data.deductions.length && <TableRow><TableCell colSpan={5}>No deduction history.</TableCell></TableRow>}
      </TableBody></Table></div>
    <div className="space-y-2 md:hidden">{data.deductions.map(row => <article key={row.month} className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{monthLabel(row.month)}</p>
        <Badge variant="outline" className={deductionTone(row.status)}>{labels[row.status]}</Badge></div>
      <dl className="grid grid-cols-2 gap-2">
        <div><dt className="text-xs text-muted-foreground">Expected</dt><dd>{money(row.expected)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Deducted</dt><dd>{money(row.actual)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Unpaid</dt><dd>{money(row.unpaid)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Remittance</dt><dd>{row.remittance ? (row.remittance.state === "APPROVED" ? "Approved" : "Pending") : "—"}</dd></div>
      </dl>
      {row.remittance && <p className="text-xs text-muted-foreground">{row.remittance.reference} · {date(row.remittance.date)} · {money(row.remittance.included)}</p>}
    </article>)}
      {!data.deductions.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No deduction history.</p>}
    </div>
    <h4 className="text-sm font-semibold">Loan events</h4>
    {!data.events.length && !data.loan.renewal && <p className="text-sm text-muted-foreground">No loan events.</p>}
    <ul className="divide-y text-sm">
      {data.loan.renewal && <li className="py-2">Renewed in {monthLabel(data.loan.renewal.month)} · Replacement loan #{data.loan.renewal.replacementId}</li>}
      {data.events.map(event => <li className="break-words py-2" key={event.revision}>
        <div className="font-medium">{event.loanChange ? changeLabels[event.loanChange.kind] :
          event.action === "LOAN_TERMS_CHANGE_REVERSED" ? "Reversal" : "Loan change"} · Revision {event.revision}
          {event.reversed && <span className="ml-2 text-muted-foreground">Reversed</span>}</div>
        <div>{dateTime(event.at)} PHT · {event.actor} · {event.remarks}</div>
        {event.reversedRevision && <div>Reverses revision {event.reversedRevision}</div>}
        {event.loanChange && <div>Effective {monthLabel(event.loanChange.month)}{event.loanChange.throughMonth && " through " + monthLabel(event.loanChange.throughMonth)}
          {event.loanChange.previousAmount && " · " + money(event.loanChange.previousAmount) + " →"}
          {event.loanChange.amount && " " + money(event.loanChange.amount)}
          {event.loanChange.separationDate && " · Separated " + date(event.loanChange.separationDate)}
          {event.loanChange.balance && " · Agency balance " + money(event.loanChange.balance)}
          {event.loanChange.reference && " · " + event.loanChange.reference}</div>}
      </li>)}
    </ul>
    <h4 className="text-sm font-semibold">Agency refunds</h4>
    {!data.refunds.length && <p className="text-sm text-muted-foreground">No agency refunds.</p>}
    <ul className="divide-y text-sm">{data.refunds.map(refund => <li className="break-words py-2" key={refund.id}>
      {money(refund.amount)} · {refund.reference} · {monthLabel(refund.month)} · {refunds[refund.state]}
      {refund.payout && <div>Payout {refund.payout.reference} · {date(refund.payout.date)}</div>}
    </li>)}</ul>
  </div>;
}

export function EmployeeLedgerReport({ actorId }: { actorId?: number }) {
  const state = useReportView("ledger", actorId);
  const [q, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, retry] = useState(0);
  const employeeId = state.view.filters.employeeId;
  const options = useRetainedLifecycleRead<Awaited<ReturnType<typeof reportEmployees>>>(base + "/employees?" +
    new URLSearchParams({ q, page: String(page) }), refresh);
  const copyUrl = employeeId ? base + "/employee-ledger?" + state.params : null;
  return <section className="space-y-4">
    <ReportHeader title="Employee Loan Ledger" subtitle="Each amortization deducted from the employee's pay and when it was remitted to the agency. Employees can use the remittance references if a payment does not appear in the agency's records.">
      {copyUrl && <CopyReport key={copyUrl} url={copyUrl + "&format=csv"} filename="government-loans-employee-ledger.csv" countLabel="loans" />}
    </ReportHeader>
    <div className="space-y-2 rounded-lg border p-3">
      <label className="grid max-w-sm gap-1 text-sm">Search employees with verified loans
        <Input value={q} maxLength={120} placeholder="Name or employee ID" onChange={event => { setSearch(event.target.value); setPage(1); }} />
      </label>
      {!options.data && !options.error && <TableSkeleton rows={2} />}
      {options.error && <ReadFeedback error={options.error} retry={() => retry(value => value + 1)} message="Loading employees…" />}
      {options.data && <>
        <div className={cn("flex flex-wrap gap-2", options.pending && "opacity-60")}>{options.data.items.map(option => <Button type="button" size="sm" variant="outline"
          aria-pressed={employeeId === String(option.id)} key={option.id} onClick={() => {
            state.apply({ ...state.view, filters: { ...state.view.filters, employeeId: String(option.id), agency: "" } });
          }}>
          {option.name} · {option.id}</Button>)}</div>
        {!options.data.items.length && <p className="text-sm text-muted-foreground">No employees with verified loans match.</p>}
        <ReportPages page={page} more={options.data.hasMore} change={setPage} label="Employee pages" />
      </>}
    </div>
    <EmployeeLoans key={employeeId ?? "unselected"} employeeId={employeeId} state={state} />
  </section>;
}

function EmployeeLoans({ employeeId, state }: { employeeId: string | undefined; state: ReportView }) {
  const [refresh, retry] = useState(0);
  const [loan, setLoan] = useState<number>();
  const url = base + "/employee-ledger?" + state.params;
  const ledger = useRetainedLifecycleRead<Awaited<ReturnType<typeof reportEmployeeLedger>>>(employeeId ? url : null, refresh);
  const data = ledger.data;
  return <div className="space-y-3">
    {employeeId && <h3 className="font-semibold">{data?.employee ?? "Employee " + employeeId} · Loan ledger</h3>}
    <ReportControls state={state}>
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
      <label className="grid gap-1 text-sm">Agency<NativeSelect aria-label="Agency" name="agency"
        defaultValue={state.view.filters.agency ?? ""}>
        <option value="">All agencies</option>
        {!data && state.view.filters.agency && <option value={state.view.filters.agency}>{state.view.filters.agency}</option>}
        {data?.agencies.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </NativeSelect></label>
      <label className="grid gap-1 text-sm">Loan status<NativeSelect aria-label="Loan status" name="status"
        defaultValue={state.view.filters.status ?? ""}>
        <option value="">Active and closed</option><option value="active">Active</option><option value="closed">Closed</option>
      </NativeSelect></label>
    </ReportControls>
    {data && <>
      <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-3", ledger.pending && "opacity-60")}>
        <ReportMetric label="Matching loans" value={String(data.total)} detail="After filters" />
        <ReportMetric label="Active loans" value={String(data.active)} detail="Open schedules" tone="accent" />
        <ReportMetric label="Estimated balance" value={money(data.totalEstimated)} detail="System estimate" />
      </div>
    </>}
    {!employeeId && <p className="text-sm text-muted-foreground">Select an employee to view their loan ledger.</p>}
    {employeeId && !data && !ledger.error && <TableSkeleton rows={4} />}
    {employeeId && ledger.error && <ReadFeedback error={ledger.error} retry={() => retry(value => value + 1)} message="Loading loan ledger…" />}
    {data && !data.loans.length && <p className="text-sm text-muted-foreground">No verified loans match these filters.</p>}
    {data?.loans.map(item => <article key={item.id} className="space-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h4 className="font-medium">{item.reference} · {item.agency}</h4>
          <p className="text-sm text-muted-foreground">{item.program} · {item.agencyReference}</p></div>
        <div className="flex items-center gap-2"><AgencyBadge name={item.agency} />
          <Badge variant="outline" className={item.active ? "border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300" : "text-muted-foreground"}>
            {registerStatusLabels[item.status]}</Badge></div>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-muted-foreground">Installments paid</dt><dd>{item.counted} of {item.term}</dd>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary"
            style={{ width: Math.min(100, item.term ? item.counted / item.term * 100 : 0) + "%" }} /></div></div>
        <div><dt className="text-muted-foreground">Paid before enrollment</dt><dd>{item.alreadyPaid}</dd></div>
        <div><dt className="text-muted-foreground">Estimated balance</dt><dd>{money(item.estimate)}</dd></div>
        <div><dt className="text-muted-foreground">Agency statement</dt><dd>{money(item.agencyBalance.latest?.balance ?? null)}
          {item.agencyBalance.latest && " · " + date(item.agencyBalance.latest.date)}</dd></div>
      </dl>
      <Button type="button" size="sm" variant="outline" aria-expanded={loan === item.id}
        onClick={() => setLoan(previous => previous === item.id ? undefined : item.id)}>
        {loan === item.id ? "Hide" : "View"} history for {item.reference}</Button>
      {loan === item.id && employeeId && <PayrollRows employeeId={Number(employeeId)} loanId={item.id} />}
    </article>)}
    {data && <ReportPages page={state.page} more={data.hasMore} change={state.setPage} label="Ledger pages" />}
  </div>;
}

const remittanceFilters = { awaiting_payroll: "Awaiting Payroll", nothing: "Nothing to remit", open: "Not yet remitted",
  pending: "Awaiting approval", returned: "Returned", on_time: "Remitted on time", late: "Remitted late" };

export function RemittanceReport({ actorId }: { actorId?: number }) {
  const state = useReportView("remittances", actorId);
  const [refresh, retry] = useState(0);
  const url = base + "/remittances?" + state.params;
  const report = useRetainedLifecycleRead<Awaited<ReturnType<typeof reportAgencyRemittances>>>(url, refresh);
  const data = report.data;
  return <section className="space-y-3">
    <ReportHeader title="Remittance Report" subtitle="Deductions and remittances by agency and month, with payment references, days late and penalties.">
      {data && <CopyReport key={url} url={url + "&format=csv"} filename="government-loans-remittances.csv" countLabel="records" />}
    </ReportHeader>
    <ReportControls state={state}>
      <label className="grid gap-1 text-sm">Payroll month
        <Input type="month" name="month" defaultValue={state.view.filters.month ?? ""} max={data?.openMonth} />
      </label>
      <label className="grid gap-1 text-sm">Payroll year
        <Input type="number" name="year" min={1000} max={data?.openMonth.slice(0, 4) ?? 9999}
          defaultValue={state.view.filters.year ?? ""} />
      </label>
      <label className="grid gap-1 text-sm">Agency<NativeSelect aria-label="Agency" name="agency"
        defaultValue={state.view.filters.agency ?? ""}>
        <option value="">All agencies</option>
        {!data && state.view.filters.agency && <option value={state.view.filters.agency}>{state.view.filters.agency}</option>}
        {data?.agencies.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </NativeSelect></label>
      <label className="grid gap-1 text-sm">Remittance status<NativeSelect aria-label="Remittance status" name="status"
        defaultValue={state.view.filters.status ?? ""}>
        <option value="">All statuses</option>
        {Object.entries(remittanceFilters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </NativeSelect></label>
    </ReportControls>
    {!data && !report.error && <TableSkeleton rows={6} />}
    {report.error && <ReadFeedback error={report.error} retry={() => retry(value => value + 1)} message="Loading remittance report…" />}
    {data && <>
      <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-4", report.pending && "opacity-60")}>
        <ReportMetric label="Remitted principal" value={money(data.totals.remitted)} detail={`${data.totals.payments} approved payment(s)`} tone="accent" />
        <ReportMetric label="Late remittances" value={String(data.totals.late)} detail="Approved late" tone={data.totals.late ? "warning" : undefined} />
        <ReportMetric label="Penalties" value={money(data.totals.penalties)} detail="Approved penalties" />
        <ReportMetric label="Outstanding" value={money(data.totals.outstanding)} detail={`${data.totals.awaiting} awaiting Payroll`}
          tone={data.totals.outstanding && data.totals.outstanding !== "0.00" ? "critical" : undefined} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">{data.total} agency-month record(s) · {data.totals.awaiting} awaiting Payroll</p>
      </div>
      <div className={cn("hidden overflow-x-auto rounded-lg border md:block", report.pending && "opacity-60")}>
        <Table>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
            {["Agency", "Payroll month", "Withheld", "Remitted principal", "Outstanding", "Due date", "Payment date", "Days late", "Penalty", "Reference", "Status"]
              .map(label => <TableHead key={label} className={["Withheld", "Remitted principal", "Outstanding", "Days late", "Penalty"].includes(label) ? "text-right" : undefined}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {data.items.map(row => <TableRow key={row.key}>
              <TableCell><AgencyBadge name={row.agency} code={row.code} /></TableCell>
              <TableCell className="whitespace-nowrap">{monthLabel(row.month)}{idText(row.receipt?.id ?? null, "Receipt revision " + (row.receipt?.revision ?? ""))}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.withheld)}</TableCell><TableCell className="text-right tabular-nums">{money(row.remitted)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.outstanding)}</TableCell>
              <TableCell className="whitespace-nowrap">{date(row.due)}</TableCell><TableCell className="whitespace-nowrap">{date(row.paidOn)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.daysLate ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{money(row.penalty)}</TableCell>
              <TableCell>{row.reference ?? "—"}
                {idText(row.approvalId ?? row.remittanceId, row.approvalId ? "Approval" : "Remittance")}
                {row.filedReceipt && row.filedReceipt.id !== row.receipt?.id && idText(row.filedReceipt.id, "Filed Payroll revision " + row.filedReceipt.revision)}</TableCell>
              <TableCell><Badge variant="outline" className={remittanceTone(row.status, row.daysLate)}>{row.label}</Badge></TableCell>
            </TableRow>)}
            {!data.items.length && <TableRow><TableCell colSpan={11}>No remittance records for this period.</TableCell></TableRow>}
          </TableBody>
          {data.items.length > 0 && <TableFooter><TableRow>
            <TableCell colSpan={2}>Total (filtered)</TableCell>
            <TableCell className="text-right tabular-nums">{money(data.totals.withheld)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(data.totals.remitted)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(data.totals.outstanding)}</TableCell>
            <TableCell colSpan={3} />
            <TableCell className="text-right tabular-nums">{money(data.totals.penalties)}</TableCell>
            <TableCell colSpan={2} />
          </TableRow></TableFooter>}
        </Table>
      </div>
      <div className={cn("space-y-2 md:hidden", report.pending && "opacity-60")}>{data.items.map(row => <article key={row.key} className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><AgencyBadge name={row.agency} code={row.code} /><p className="mt-1 font-medium">{monthLabel(row.month)}</p></div>
          <Badge variant="outline" className={remittanceTone(row.status, row.daysLate)}>{row.label}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <div><dt className="text-xs text-muted-foreground">Withheld</dt><dd className="tabular-nums">{money(row.withheld)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Remitted</dt><dd className="tabular-nums">{money(row.remitted)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Outstanding</dt><dd className="tabular-nums">{money(row.outstanding)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Penalty</dt><dd className="tabular-nums">{money(row.penalty)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Due</dt><dd>{date(row.due)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Paid</dt><dd>{date(row.paidOn)}{row.daysLate !== null && " · " + row.daysLate + " day(s) late"}</dd></div>
        </dl>
        {row.reference && <p className="break-all text-xs text-muted-foreground">{row.reference}</p>}
      </article>)}
        {!data.items.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No remittance records for this period.</p>}
      </div>
      <ReportPages page={state.page} more={data.hasMore} change={state.setPage} label="Remittance report pages" />
    </>}
  </section>;
}
