"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime, peso } from "../../members/format";
import type { SettlementPreview } from "../../server/clearance-settlement";
import type { SettlementRecord, SettlementReversalRecord } from "../../server/clearance-records";
import { transactionLabels } from "../../transactions/entries";
import { Kv, Panel } from "../components/ui";
import { formatDate } from "../format";
import { useClearanceData, useClearanceMutation } from "./useClearanceData";

const amount = (value: string | null) => value === null ? "—" : peso(value);

export function ClearanceSettlementPreview({ path, revision, canConfirm, onRefresh }: {
  path: string;
  revision: number;
  canConfirm: boolean;
  onRefresh: (message?: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useClearanceMutation(error => {
    if (error.code === "CLEARANCE_STALE" || error.code === "CLEARANCE_READ_ONLY") onRefresh(error.message);
  });
  const { data, error, loading } = useClearanceData<SettlementPreview>(path + "/settlement-preview");
  const stale = data !== undefined && data.caseRevision !== revision;
  const preview = !loading && !error && !stale ? data : undefined;

  return <Panel title="Settlement preview" actions={
    <Button type="button" variant="outline" size="sm" disabled={loading || mutation.busy} onClick={() => onRefresh()}>Refresh preview</Button>
  }>
    {loading && <p role="status" className="text-sm text-muted-foreground">Calculating settlement…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {stale && <p role="alert" className="text-sm text-destructive">The clearance changed. Refresh the preview to see the latest draft.</p>}
    {preview && <SettlementAmounts preview={preview} />}
    {preview && <div className="mt-4 space-y-3 border-t pt-4">
      {preview.issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-destructive" aria-label="Posting requirements">
        {preview.issues.map(issue => <li key={issue}>{issue}</li>)}
      </ul>}
      {preview.later.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">
        {preview.later.map((item, index) => <li key={index}>{formatDate(item.date)} · {item.source} · {item.reference}</li>)}
      </ul>}
      <label className="flex items-start gap-2 text-sm">
        <input className="mt-1" type="checkbox" checked={confirmed}
          disabled={mutation.busy || !canConfirm || !preview.confirmable} onChange={event => setConfirmed(event.target.checked)} />
        I reviewed this settlement with the member and HR.
      </label>
      {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
      <Button type="button" disabled={mutation.busy || !canConfirm || !preview.confirmable || !confirmed} onClick={async () => {
        const result = await mutation.save(path, "POST", {
          action: "settle", fingerprint: preview.fingerprint, reviewedWithMemberAndHr: true,
        });
        if (result) onRefresh(`${result.reference} posted and membership closed.`);
      }}>{mutation.busy ? "Posting…" : "Settle & close membership"}</Button>
    </div>}
  </Panel>;
}

function SettlementAmounts({ preview }: { preview: SettlementPreview }) {
  const { annualRate, estimated, separationDate, calculatedAt, year, funding, loans, elapsed } = preview;
  const pendingPay = funding !== null && funding.finalPayApplied === null;
  const rate = annualRate?.replace(/\.0+$|(\.\d*?[1-9])0+$/, "$1");

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      {estimated ? "Estimate for" : "Balances as of"} {formatDate(separationDate)} · Calculated {dateTime(calculatedAt)}
    </p>
    {annualRate === null && <p role="status" className="rounded-md border border-amber-300 p-2.5 text-sm">
      Rate required. Add the approved {year} annual savings rate in Policies → Savings &amp; membership to calculate the dividend and offsets.
    </p>}
    {pendingPay && <p role="status" className="rounded-md border border-amber-300 p-2.5 text-sm">
      Verify final pay to calculate the remaining recovery. The amounts applied from savings and dividend are shown below.
    </p>}
    <Kv rows={[
      ["Posted savings at separation", peso(preview.savings)],
      [`Approved annual savings rate · ${year}`, rate === undefined ? "Rate required" : `${rate}%`],
      ["Elapsed year (30-day months)", `${elapsed} / 360 days`],
      ["Pro-rated dividend estimate", amount(preview.dividend)],
      ["Unpaid loan debt", peso(preview.debt), "total"],
    ]} />
    {funding && <div className="border-t pt-3">
      <Kv rows={[
        ["Savings plus dividend", peso(funding.available)],
        ["Applied from savings and dividend", peso(funding.savingsApplied)],
        ["Debt after savings and dividend", peso(funding.remainingAfterSavings)],
        ["Applied from verified final pay", pendingPay ? "Pending verification" : amount(funding.finalPayApplied)],
        ["Savings refund due", peso(funding.refund), "total"],
        ["Debt still owed after final pay", pendingPay ? "Pending verification" : amount(funding.remaining), "total"],
      ]} />
    </div>}
    <div>
      <h3 className="mb-2 text-sm font-semibold">Unpaid loans</h3>
      {loans.length ? <div className="overflow-x-auto rounded-md border [&>[data-slot=table-container]]:overflow-visible"
        role="region" aria-label="Unpaid loan settlement amounts" tabIndex={0}>
        <Table>
          <TableHeader>
            <TableRow>
              {["Loan", "Principal", "Interest due", "Accrued interest", "Goods installments", "Penalties",
                "Total owed", "From savings + dividend", "From final pay", "Recovered", "Still owed"].map((label, index) => (
                <TableHead key={label} className={index === 0 ? undefined : "text-right"}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loans.map(loan => <TableRow key={loan.id}>
              <TableCell className="font-medium">{loan.reference}</TableCell>
              {[loan.principal, loan.dueInterest, loan.accruedInterest, loan.goodsInstallments, loan.penalties, loan.debt,
                loan.savingsApplied, loan.finalPayApplied, loan.recovered, loan.remaining].map((value, index) => (
                <TableCell key={index} className="text-right tabular-nums">{amount(value)}</TableCell>
              ))}
            </TableRow>)}
          </TableBody>
        </Table>
      </div> : <p className="text-sm text-muted-foreground">No unpaid loans at separation.</p>}
    </div>
    {preview.allocations.length > 0 && <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Installment allocations</summary>
      <Table>
        <TableHeader><TableRow>
          {["Loan", "Installment", "Applied from", "Principal", "Interest or markup", "Penalty", "Applied"].map(label => <TableHead key={label}>{label}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{preview.allocations.map(row => <TableRow key={`${row.loanId}-${row.installmentNo}-${row.source}`}>
          <TableCell>{loans.find(loan => loan.id === row.loanId)?.reference}</TableCell>
          <TableCell>{row.installmentNo}</TableCell>
          <TableCell>{row.source === "SAVINGS" ? "Savings + dividend" : "Final pay"}</TableCell>
          {[row.principal, row.interest, row.penalty, row.total].map((value, index) => <TableCell key={index}>{peso(value)}</TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
    </details>}
    {preview.withdrawals.length > 0 && <div className="space-y-1 text-sm">
      <h3 className="font-semibold">Pending withdrawals to cancel</h3>
      <ul className="list-disc pl-5">
        {preview.withdrawals.map(row => <li key={row.id}>{row.reference} · {peso(row.amount)}</li>)}
      </ul>
    </div>}
    {preview.journalPreview.length > 0 && <div className="space-y-2">
      <h3 className="text-sm font-semibold">Proposed journal entries</h3>
      <Table>
        <TableHeader><TableRow>
          {["Entry", "Debit account", "Credit account", "Amount"].map(label => <TableHead key={label}>{label}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{preview.journalPreview.flatMap(journal => journal.pairs.map((pair, index) => <TableRow key={`${journal.category}-${index}`}>
          <TableCell>{transactionLabels[journal.category]}</TableCell>
          <TableCell>{pair.debit}</TableCell><TableCell>{pair.credit}</TableCell><TableCell>{peso(pair.amount)}</TableCell>
        </TableRow>))}</TableBody>
      </Table>
    </div>}
  </div>;
}

export function PostedClearance({ settlement, reversal }: { settlement: SettlementRecord; reversal: SettlementReversalRecord | null }) {
  return <Panel title="Posted settlement" description={`${settlement.postedByName} · ${dateTime(settlement.postedAt)}`}>
    <div className="space-y-3">
      <Kv rows={[
        ["Accounting status", reversal ? "Reversed" : "Posted"], ["Membership", "Separated"],
        ["Posting date", formatDate(settlement.date)], ["Savings before closure", peso(settlement.savingsBefore)],
        ["Dividend credited", peso(settlement.dividend)], ["Applied from savings and dividend", peso(settlement.savingsApplied)],
        ["Final pay applied", peso(settlement.finalPayApplied)], ["Refund payable", peso(settlement.refund)],
        ["Endorsed for collection", peso(settlement.remaining)],
        ["Withdrawals cancelled", settlement.withdrawals.map(row => row.reference).join(", ") || "—"],
      ]} />
      {settlement.loans.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-semibold">Loan outcomes</h3>
        <Kv rows={settlement.loans.map(loan => [loan.reference, `${peso(loan.recovered)} recovered · ${peso(loan.remaining)} owed`])} />
      </div>}
      {settlement.journals.length > 0 && <div className="space-y-2">
        <h3 className="text-sm font-semibold">Posted journals</h3>
        <Kv rows={settlement.journals.map(row => [`${row.number} · ${transactionLabels[row.category]}`, peso(row.amount)])} />
      </div>}
      {reversal && <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-semibold">Settlement reversal</h3>
        <p className="text-sm">{reversal.postedByName} · {dateTime(reversal.postedAt)} · {reversal.reason}</p>
        <Kv rows={[
          ["Savings restored", peso(reversal.savingsRestored)],
          ...reversal.journals.map(row => [row.number, `Reverses ${row.originalNumber}`] as [string, string]),
        ]} />
      </div>}
    </div>
  </Panel>;
}
