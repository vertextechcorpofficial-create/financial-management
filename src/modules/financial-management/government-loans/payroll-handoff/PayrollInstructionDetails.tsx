import { Badge } from "@/components/ui/badge";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { deductionMonthLabel } from "../enrollment/rules";
import { handoffStatusLabels, type PayrollHandoffView } from "./types";

export function PayrollInstructionDetails({ payload, state, reason, acknowledgements, updatedAt, fileExchange, lastImport, evidenceHref }:
  PayrollHandoffView & { evidenceHref?: (revision: number) => string }) {
  const { start, stop } = payload;
  const startAck = acknowledgements.find(item => item.instructionId === start.id);
  const stopAck = stop && acknowledgements.find(item => item.instructionId === stop.id);
  const receiptSource = (revision: number | undefined) => revision !== undefined && evidenceHref && <a className="text-primary underline" href={evidenceHref(revision)}>
    Download acknowledgement CSV
  </a>;
  return <div className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={state === "NEEDS_REVIEW" ? "destructive" : "secondary"}>{handoffStatusLabels[state]}</Badge>
      <span className="text-xs text-muted-foreground">Updated {dateTime(updatedAt)} PHT</span>
    </div>
    {reason && <p className="break-words">{reason}</p>}
    {!fileExchange && state !== "ACCEPTED" && <p>Confirm the outcome of the earlier delivery with Payroll before retrying this handoff.</p>}
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <dt className="font-medium">Start deduction</dt>
        <dd>{start.agencyReference} · {deductionMonthLabel(start.effectiveMonth)}</dd>
        <dd>{peso(start.monthlyAmount)} per month · {start.remainingInstallments} installment{start.remainingInstallments === 1 ? "" : "s"} left</dd>
        {(startAck?.payrollLoanId ?? start.payrollLoanId) && <dd>Payroll loan {startAck?.payrollLoanId ?? start.payrollLoanId}</dd>}
        <dd className="break-all text-xs text-muted-foreground">{start.id}</dd>
        {startAck && <dd className="break-words">Payroll receipt {startAck.receiptId}{startAck.cutoffId ? " · cutoff " + startAck.cutoffId : ""} · {dateTime(startAck.acknowledgedAt)} PHT</dd>}
        {startAck?.sourceRevision && startAck.sourceRevision !== lastImport?.revision && evidenceHref && <dd>{receiptSource(startAck.sourceRevision)}</dd>}
        {startAck?.schedule && <dd>
          {startAck.schedule.deductions.map(deduction => `Cutoff ${deduction.cutoffId} · ${peso(deduction.amount)}`).join(" / ")}
        </dd>}
      </div>
      {stop && <div className="space-y-1">
        <dt className="font-medium">Stop prior deduction</dt>
        <dd>Payroll loan {stop.payrollLoanId} · {deductionMonthLabel(stop.effectiveMonth)}</dd>
        {stop.enrollmentId && <dd>Prior enrollment {stop.enrollmentId}</dd>}
        <dd className="break-all text-xs text-muted-foreground">{stop.id}</dd>
        {stopAck && <dd className="break-words">Payroll receipt {stopAck.receiptId}{stopAck.cutoffId ? " · cutoff " + stopAck.cutoffId : ""} · {dateTime(stopAck.acknowledgedAt)} PHT</dd>}
        {stopAck?.sourceRevision && stopAck.sourceRevision !== lastImport?.revision && stopAck.sourceRevision !== startAck?.sourceRevision && evidenceHref &&
          <dd>{receiptSource(stopAck.sourceRevision)}</dd>}
      </div>}
    </dl>
    {lastImport && <p className="break-words text-muted-foreground">
      {evidenceHref ? <a className="text-primary underline" href={evidenceHref(lastImport.revision)}>{lastImport.name}</a> : lastImport.name}
      {" · Imported by " + lastImport.importedBy + " · " + dateTime(lastImport.importedAt) + " PHT"}
    </p>}
  </div>;
}
