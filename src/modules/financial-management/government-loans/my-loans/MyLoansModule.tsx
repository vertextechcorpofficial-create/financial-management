"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date, peso } from "@/modules/financial-management/cooperative/members/format";
import { PostingDisputesModule } from "../loans/PostingDisputesModule";
import { useLifecycleRead } from "../loans/lifecycle-client";
import { registerStatusLabels } from "../loans/types";
import { LoanRequestsModule } from "../requests/LoanRequestsModule";
import type { EmployeeChoice } from "../requests/types";
import type { listOwnLoans, readOwnLoan } from "../server/loan-reports";

const endpoint = "/api/fm/government-loans/my-loans";
type History = Awaited<ReturnType<typeof readOwnLoan>>;
type Loan = Awaited<ReturnType<typeof listOwnLoans>>["loans"][number];

const monthFormat = new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" });
const monthLabel = (value: string) => monthFormat.format(new Date(value + "-01T00:00:00Z"));
const displayAmount = (value: string | null) => value === null ? "—" : peso(value);
const deductionLabels: Record<History["deductions"][number]["status"], string> = {
  D: "Full deduction", P: "Partial deduction", F: "Not deducted", X: "Final pay",
  AWAITING: "Awaiting Payroll", NO_RESULT: "No result reported",
};
const refundLabels: Record<Loan["refunds"][number]["state"], string> = {
  QUEUED: "Queued for Payroll", EXPORTED: "Sent to Payroll", ACKNOWLEDGED: "Acknowledged by Payroll",
  RETRYABLE: "Awaiting Payroll retry", REVERSING: "Reversal pending", PAID: "Paid", CANCELLED: "Cancelled",
};

function LoanNotices({ loan }: { loan: Loan }) {
  const { notice, refunds, agency, reference } = loan;
  return <>
    {notice && <li className="rounded-lg border p-3">
      <p className="font-medium">{reference} · {agency} · {monthLabel(notice.month)} · {deductionLabels[notice.status]}</p>
      <p>Expected {peso(notice.expected)} · Withheld {peso(notice.actual)} · Shortfall {peso(notice.shortfall)}</p>
      <p className="text-muted-foreground">{notice.catchUp
        ? notice.catchUpScheduled ? `The agency's catch-up policy applies this shortfall to the ${monthLabel(notice.catchUpMonth)} Payroll schedule.`
          : "The agency allows Payroll catch-up, but the next month has no scheduled catch-up. Check with Payroll for the settlement instructions."
        : `The agency policy requires you to settle the ${peso(notice.shortfall)} shortfall directly with ${agency}.`}</p>
    </li>}
    {refunds.map(refund => <li key={refund.id} className="rounded-lg border p-3">
      <p className="font-medium">{reference} · {agency} · {monthLabel(refund.month)} refund</p>
      <p>{peso(refund.amount)} · {refundLabels[refund.state]}{refund.reference && ` · Agency reference ${refund.reference}`}</p>
      {refund.payout && <p className="text-muted-foreground">Paid {date(refund.payout.date)} · Payroll reference {refund.payout.reference}</p>}
    </li>)}
  </>;
}

function LoanHistory({ loan }: { loan: Loan }) {
  const [refresh, setRefresh] = useState(0);
  const result = useLifecycleRead<History>(endpoint + "/" + loan.id, refresh);
  return <>
    <DialogHeader>
      <DialogTitle>{loan.reference} · {loan.program}</DialogTitle>
      <DialogDescription>{loan.agency} · Monthly deductions</DialogDescription>
    </DialogHeader>
    {result?.error ? <div role="alert" className="space-y-2">
      <p>{result.error}</p><Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button>
    </div> : !result?.data ? <p role="status">Loading deductions…</p> : !result.data.deductions.length
      ? <p className="text-sm text-muted-foreground">No monthly deductions on record.</p>
      : <div className="min-h-0 overflow-auto rounded-md border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Payroll month</TableHead><TableHead>Result</TableHead><TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Withheld</TableHead><TableHead className="text-right">Final pay remainder</TableHead>
          </TableRow></TableHeader>
          <TableBody>{result.data.deductions.map(row => <TableRow key={row.month}>
            <TableCell>{monthLabel(row.month)}</TableCell><TableCell>{deductionLabels[row.status]}</TableCell>
            <TableCell className="text-right">{peso(row.expected)}</TableCell>
            <TableCell className="text-right">{displayAmount(row.actual)}</TableCell>
            <TableCell className="text-right">{displayAmount(row.unpaid)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>}
  </>;
}

export function MyLoansModule({ applicant }: { applicant: Pick<EmployeeChoice, "id" | "name"> }) {
  const [refresh, setRefresh] = useState(0);
  const [agency, setAgency] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Loan>();
  const result = useLifecycleRead<Awaited<ReturnType<typeof listOwnLoans>>>(endpoint, refresh);
  const loans = result?.data?.loans ?? [];
  const visible = loans.filter(loan => (!agency || String(loan.agencyId) === agency) && (!status || loan.active === (status === "active")));
  return <div className="space-y-6">
    <section aria-label="Loan requests"><LoanRequestsModule applicant={applicant} /></section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Loan history</h2>
      {result?.error ? <div role="alert" className="space-y-2">
        <p>{result.error}</p><Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>Retry</Button>
      </div> : !result?.data ? <p role="status">Loading your loans…</p> : <>
        {loans.some(loan => loan.notice || loan.refunds.length) && <section className="space-y-2">
          <h3 className="font-semibold">Notices</h3>
          <ul className="space-y-2 text-sm">{loans.map(loan => <LoanNotices key={loan.id} loan={loan} />)}</ul>
        </section>}
        {loans.length > 0 && <div className="flex flex-wrap gap-3 text-sm">
          <label>Agency <NativeSelect value={agency} onChange={event => setAgency(event.target.value)}>
            <option value="">All agencies</option>
            {[...new Map(loans.map(loan => [loan.agencyId, loan.agency]))].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </NativeSelect></label>
          <label>Show <NativeSelect value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">All loans</option><option value="active">Active loans</option><option value="closed">Closed loans</option>
          </NativeSelect></label>
        </div>}
        {!visible.length && <p className="text-sm text-muted-foreground">{loans.length ? "No loans match these filters." : "You have no loans on record."}</p>}
        <div className="grid gap-3 lg:grid-cols-2">{visible.map(loan => <article key={loan.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-semibold">{loan.reference} · {loan.program}</h3><p className="text-sm text-muted-foreground">{loan.agency}</p></div>
            <Badge variant="outline">{registerStatusLabels[loan.status]}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Monthly amortization</dt><dd>{peso(loan.amortization)}</dd></div>
            <div><dt className="text-muted-foreground">Installments paid</dt><dd>{loan.counted} / {loan.term}</dd></div>
            <div><dt className="text-muted-foreground">Estimated balance</dt><dd>{displayAmount(loan.estimate)}</dd></div>
          </dl>
          <Button variant="outline" size="sm" onClick={() => setSelected(loan)} aria-label={`View deductions for ${loan.reference}`}>View deductions</Button>
        </article>)}</div>
      </>}
    </section>
    <PostingDisputesModule self />
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
        {selected && <LoanHistory key={selected.id} loan={selected} />}
      </DialogContent>
    </Dialog>
  </div>;
}
