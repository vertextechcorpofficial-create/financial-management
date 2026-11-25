"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { changeLabels } from "../loans/lifecycle";
import { useLifecycleRead } from "../loans/lifecycle-client";
import { registerStatusLabels } from "../loans/types";
import type { reportAgencyRemittances, reportEmployeeLedger, reportEmployees, reportLedgerLoan } from "../server/loan-reports";

const base = "/api/fm/government-loans/reports";
const labels = { D: "Deducted", P: "Partial", F: "Failed", X: "Final pay", AWAITING: "Awaiting Payroll", NO_RESULT: "No loan result" };
const refunds = { QUEUED: "Awaiting export", EXPORTED: "Awaiting Payroll", ACKNOWLEDGED: "Awaiting payout", RETRYABLE: "Retry required",
  REVERSING: "Reversal pending", PAID: "Paid out", CANCELLED: "Cancelled" };
const money = (value: string | null) => value === null ? "—" : peso(value);
const idText = (value: string | null, label: string) => value ? <span className="block break-all text-xs text-muted-foreground">{label} {value}</span> : null;

function ReadFeedback({ error, retry, message }: { error?: string; retry: () => void; message: string }) {
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <p role={error ? "alert" : "status"}>{error ?? message}</p>
    {error && <Button size="sm" variant="outline" onClick={retry}>Retry</Button>}
  </div>;
}

function ReportPages({ page, more, change, label }: { page: number; more: boolean; change: (page: number) => void; label: string }) {
  if (page === 1 && !more) return null;
  return <nav aria-label={label} className="flex items-center gap-2 text-sm">
    <Button size="sm" variant="outline" disabled={page === 1} onClick={() => change(page - 1)}>Previous</Button>
    <span>Page {page}</span>
    <Button size="sm" variant="outline" disabled={!more} onClick={() => change(page + 1)}>Next</Button>
  </nav>;
}

function PayrollRows({ employeeId, loanId }: { employeeId: number; loanId: number }) {
  const [refresh, retry] = useState(0);
  const loaded = useLifecycleRead<Awaited<ReturnType<typeof reportLedgerLoan>>>(base + "/employee-ledger?" +
    new URLSearchParams({ employeeId: String(employeeId), loanId: String(loanId) }), refresh);
  const data = loaded?.data;
  if (!data) return <ReadFeedback error={loaded?.error} retry={() => retry(value => value + 1)} message="Loading loan history…" />;
  return <div className="space-y-3">
    <h4 className="text-sm font-semibold">Monthly deductions</h4>
    <div className="rounded-md border"><Table><TableHeader><TableRow>
      {["Payroll month", "Result", "Expected", "Deducted", "Agency remittance"].map(label => <TableHead key={label}>{label}</TableHead>)}
    </TableRow></TableHeader><TableBody>
      {data.deductions.map(row => <TableRow key={row.month}>
        <TableCell>{row.month}{idText(row.receiptId, "Receipt revision " + (row.revision ?? ""))}</TableCell>
        <TableCell><Badge variant="outline">{labels[row.status]}</Badge>
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
    <h4 className="text-sm font-semibold">Loan events</h4>
    {!data.events.length && !data.loan.renewal && <p className="text-sm text-muted-foreground">No loan events.</p>}
    <ul className="divide-y text-sm">
      {data.loan.renewal && <li className="py-2">Renewed in {data.loan.renewal.month} · Replacement loan #{data.loan.renewal.replacementId}</li>}
      {data.events.map(event => <li className="break-words py-2" key={event.revision}>
        <div className="font-medium">{event.loanChange ? changeLabels[event.loanChange.kind] :
          event.action === "LOAN_TERMS_CHANGE_REVERSED" ? "Reversal" : "Loan change"} · Revision {event.revision}
          {event.reversed && <span className="ml-2 text-muted-foreground">Reversed</span>}</div>
        <div>{dateTime(event.at)} PHT · {event.actor} · {event.remarks}</div>
        {event.reversedRevision && <div>Reverses revision {event.reversedRevision}</div>}
        {event.loanChange && <div>Effective {event.loanChange.month}{event.loanChange.throughMonth && " through " + event.loanChange.throughMonth}
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
      {money(refund.amount)} · {refund.reference} · {refund.month} · {refunds[refund.state]}
      {refund.payout && <div>Payout {refund.payout.reference} · {date(refund.payout.date)}</div>}
    </li>)}</ul>
  </div>;
}

export function EmployeeLedgerReport() {
  const [q, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, retry] = useState(0);
  const [employee, select] = useState<{ id: number; name: string }>();
  const [loan, setLoan] = useState<number>();
  const options = useLifecycleRead<Awaited<ReturnType<typeof reportEmployees>>>(base + "/employees?" +
    new URLSearchParams({ q, page: String(page) }), refresh);
  const ledger = useLifecycleRead<Awaited<ReturnType<typeof reportEmployeeLedger>>>(
    employee ? base + "/employee-ledger?employeeId=" + employee.id : null, refresh);
  return <section className="space-y-4">
    <div className="space-y-2">
      <label className="grid max-w-sm gap-1 text-sm">Search employees with verified loans
        <Input value={q} maxLength={120} placeholder="Name or employee ID" onChange={event => { setSearch(event.target.value); setPage(1); }} />
      </label>
      {!options?.data && <ReadFeedback error={options?.error} retry={() => retry(value => value + 1)} message="Loading employees…" />}
      {options?.data && <>
        <div className="flex flex-wrap gap-2">{options.data.items.map(option => <Button type="button" size="sm" variant="outline"
          aria-pressed={employee?.id === option.id} key={option.id} onClick={() => { select(option); setLoan(undefined); }}>
          {option.name} · {option.id}</Button>)}</div>
        {!options.data.items.length && <p className="text-sm text-muted-foreground">No employees with verified loans match.</p>}
        <ReportPages page={page} more={options.data.hasMore} change={setPage} label="Employee pages" />
      </>}
    </div>
    {employee && <div className="space-y-2">
      <h3 className="font-semibold">{employee.name} · Loan ledger</h3>
      {!ledger?.data && <ReadFeedback error={ledger?.error} retry={() => retry(value => value + 1)} message="Loading loan ledger…" />}
      {ledger?.data && !ledger.data.loans.length && <p className="text-sm text-muted-foreground">No verified loans for this employee.</p>}
      {ledger?.data?.loans.map(item => <article key={item.id} className="space-y-2 rounded-md border p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h4 className="font-medium">{item.reference} · {item.agency}</h4><p className="text-sm text-muted-foreground">{item.program} · {item.agencyReference}</p></div>
          <Badge variant="outline">{registerStatusLabels[item.status]}</Badge>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-muted-foreground">Installments paid</dt><dd>{item.counted} of {item.term}</dd></div>
          <div><dt className="text-muted-foreground">Paid before enrollment</dt><dd>{item.alreadyPaid}</dd></div>
          <div><dt className="text-muted-foreground">Estimated balance</dt><dd>{money(item.estimate)}</dd></div>
          <div><dt className="text-muted-foreground">Agency statement</dt><dd>{money(item.agencyBalance.latest?.balance ?? null)}
            {item.agencyBalance.latest && " · " + date(item.agencyBalance.latest.date)}</dd></div>
        </dl>
        <Button type="button" size="sm" variant="outline" aria-expanded={loan === item.id}
          onClick={() => setLoan(previous => previous === item.id ? undefined : item.id)}>
          {loan === item.id ? "Hide" : "View"} history for {item.reference}</Button>
        {loan === item.id && <PayrollRows employeeId={employee.id} loanId={item.id} />}
      </article>)}
    </div>}
    {!employee && <p className="text-sm text-muted-foreground">Select an employee to view their loan ledger.</p>}
  </section>;
}

export function RemittanceReport() {
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, retry] = useState(0);
  const params = new URLSearchParams({ page: String(page) });
  if (period) params.set("month", period);
  const report = useLifecycleRead<Awaited<ReturnType<typeof reportAgencyRemittances>>>(base + "/remittances?" + params, refresh);
  return <section className="space-y-3">
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm">Payroll month
        <Input type="month" value={period} max={report?.data?.openMonth} onChange={event => { setPeriod(event.target.value); setPage(1); }} />
      </label>
      {period && <Button size="sm" variant="outline" onClick={() => { setPeriod(""); setPage(1); }}>Recent 14 months</Button>}
    </div>
    {!report?.data && <ReadFeedback error={report?.error} retry={() => retry(value => value + 1)} message="Loading remittance report…" />}
    {report?.data && <>
      <p className="text-sm text-muted-foreground">{report.data.total} agency-month record(s)</p>
      <div className="rounded-md border"><Table><TableHeader><TableRow>
        {["Agency", "Payroll month", "Withheld", "Remitted principal", "Outstanding", "Due date", "Payment date", "Days late", "Penalty", "Reference", "Status"]
          .map(label => <TableHead key={label}>{label}</TableHead>)}
      </TableRow></TableHeader><TableBody>
        {report.data.items.map(row => <TableRow key={row.key}>
          <TableCell>{row.code} · {row.agency}</TableCell>
          <TableCell>{row.month}{idText(row.receipt?.id ?? null, "Receipt revision " + (row.receipt?.revision ?? ""))}</TableCell>
          <TableCell>{money(row.withheld)}</TableCell><TableCell>{money(row.remitted)}</TableCell><TableCell>{money(row.outstanding)}</TableCell>
          <TableCell>{date(row.due)}</TableCell><TableCell>{date(row.paidOn)}</TableCell><TableCell>{row.daysLate ?? "—"}</TableCell>
          <TableCell>{money(row.penalty)}</TableCell><TableCell>{row.reference ?? "—"}
            {idText(row.approvalId ?? row.remittanceId, row.approvalId ? "Approval" : "Remittance")}
            {row.filedReceipt && row.filedReceipt.id !== row.receipt?.id &&
              idText(row.filedReceipt.id, "Filed Payroll revision " + row.filedReceipt.revision)}</TableCell>
          <TableCell><Badge variant="outline">{row.label}</Badge></TableCell>
        </TableRow>)}
        {!report.data.items.length && <TableRow><TableCell colSpan={11}>No remittance records for this period.</TableCell></TableRow>}
      </TableBody></Table></div>
      <ReportPages page={page} more={report.data.hasMore} change={setPage} label="Remittance report pages" />
    </>}
  </section>;
}
