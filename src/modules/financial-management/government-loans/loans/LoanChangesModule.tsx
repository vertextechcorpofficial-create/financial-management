"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import type { getLoanChanges } from "../server/loan-changes";
import { changeLabels, type ChangeKind } from "./lifecycle";
import { loansApi, useLifecycleCommand, useLifecycleRead } from "./lifecycle-client";
import { monthAfter } from "./monthly-payroll";
import { registerStatusLabels, type LoanRegisterPage } from "./types";

type ChangeDetail = Awaited<ReturnType<typeof getLoanChanges>>;
const acknowledgementTemplate = "instruction_id,transmission_id,payroll_loan_id,effective_month,result,reference,date\r\n";

function ChangeReview({ id }: { id: number }) {
  const [refresh, setRefresh] = useState(0);
  const [selectedKind, setKind] = useState<ChangeKind>("AMORTIZATION");
  const [reversal, setReversal] = useState<number>();
  const [notice, setNotice] = useState("");
  const command = useLifecycleCommand();
  const url = loansApi + "/changes/" + id;
  const loaded = useLifecycleRead<ChangeDetail>(url, refresh);
  const reload = () => setRefresh(value => value + 1);
  const data = loaded?.data;
  if (!data) return <p role={loaded?.error ? "alert" : "status"}>{loaded?.error ?? "Loading loan changes…"}
    {loaded?.error && <Button variant="outline" size="sm" onClick={reload}>Retry</Button>}</p>;
  const { loan, history, statements, openMonth, businessDate } = data;
  const canChangeTerms = loan.active && loan.status !== "FINAL_PAY_REQUESTED";
  const kind = canChangeTerms ? selectedKind : "REFUND";
  const saved = () => { setNotice("Loan updated."); setReversal(undefined); reload(); };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    return command.run(url, { expectedRevision: data.loan.revision, note: fields.note,
      change: reversal ? { kind: "REVERSE", revision: reversal, reason: fields.reason } : { kind, ...fields } }, saved);
  }

  async function exportFile(instructionId: string) {
    await command.run(url + "?exchange=1", { kind: "EXPORT", expectedRevision: loan.revision, instructionId }, async response => {
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "loan-instruction-" + instructionId + ".csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      saved();
    });
  }

  return <section className="space-y-4 rounded-md border p-4">
    <h3 className="font-semibold">{loan.reference} · {loan.employee}</h3>
    <p className="text-sm">{loan.agency} · {registerStatusLabels[loan.status]} · Monthly amortization {peso(loan.amortization)}</p>
    {data.finalPay && <p className="text-sm">Final pay withheld {peso(data.finalPay.withheld)} · Unpaid agency balance {peso(data.finalPay.unpaid)}</p>}
    {notice && <p role="status">{notice}</p>}
    {command.error && <p role="alert" className="text-sm text-destructive">{command.error} <Button size="sm" variant="outline" onClick={reload}>Reload loan</Button></p>}
    <form key={loan.revision + ":" + kind + ":" + reversal} onSubmit={event => void submit(event)} className="space-y-3 rounded-md border p-3">
      {reversal ? <label className="block text-sm">Reason for reversing change #{reversal}<Textarea name="reason" required maxLength={500} /></label> :
        <><div className="flex flex-wrap gap-3">
          <label className="space-y-1 text-sm">Change
            <NativeSelect value={kind} onChange={event => setKind(event.target.value as ChangeKind)}>
              {Object.entries(changeLabels).filter(([value]) => canChangeTerms || value === "REFUND")
                .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect></label>
          {(kind === "AMORTIZATION" || kind === "REFUND") && <label className="space-y-1 text-sm">Amount (₱)
            <Input name="amount" inputMode="decimal" pattern="[0-9]{1,13}([.][0-9]{1,2})?" required /></label>}
          {(kind === "AMORTIZATION" || kind === "SUSPENSION") && <label className="space-y-1 text-sm">Effective month
            <Input name="month" type="month" min={openMonth} max={kind === "AMORTIZATION" ? monthAfter(openMonth, 2) : undefined}
              defaultValue={openMonth} required /></label>}
          {kind === "SUSPENSION" && <label className="space-y-1 text-sm">Through month
            <Input name="throughMonth" type="month" min={openMonth} defaultValue={openMonth} required /></label>}
          {(kind === "PAID_DIRECTLY" || kind === "REFUND") && <label className="space-y-1 text-sm">{kind === "REFUND" ? "Agency refund reference" : "Receipt or clearance reference"}
            <Input name="reference" maxLength={200} required /></label>}
          {kind === "SEPARATION" && <>
            <label className="space-y-1 text-sm">Separation date <Input name="separationDate" type="date" defaultValue={businessDate} required /></label>
            <label className="space-y-1 text-sm">Latest agency statement
              <NativeSelect name="statementId" required>
                {statements.items[0] ? <option value={statements.items[0].id}>
                  {date(statements.items[0].date)} · {peso(statements.items[0].balance)}
                </option> : <option value="">Record a statement in Agency balances</option>}
              </NativeSelect></label>
          </>}
        </div><label className="block space-y-1 text-sm">Note (optional)<Textarea name="note" maxLength={500} /></label></>}
      <div className="flex gap-2">
        <Button type="submit" disabled={command.busy || (!reversal && kind === "SEPARATION" && !statements.items.length)}>
          {reversal ? "Confirm reversal" : "Save change"}</Button>
        {reversal && <Button type="button" variant="outline" onClick={() => setReversal(undefined)} disabled={command.busy}>Cancel</Button>}
      </div>
    </form>
    <section className="space-y-2">
      <h4 className="font-medium">Change history and Payroll instructions</h4>
      {!history.length && <p className="text-sm text-muted-foreground">No changes recorded.</p>}
      {loan.renewal && <p className="text-sm">Renewal effective {loan.renewal.month} · Replacement loan #{loan.renewal.replacementId}</p>}
      {history.map(event => {
        const row = data.instructions.find(instruction => instruction.id === event.after_values.instructionId);
        return <div key={event.revision} className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">#{event.revision} · {event.after_values.remarks}{event.reversed ? " · Reversed" : ""}</p>
          <p>{event.actor_name} · {dateTime(event.occurred_at)}</p>
          {row && <p>{row.state.replaceAll("_", " ")} · Effective {row.effective_month}
            {typeof row.details.amount === "string" && " · " + peso(row.details.amount)}
            {typeof row.details.balance === "string" && " · Final-pay cap " + peso(row.details.balance)}
            {typeof row.details.reference === "string" && " · " + row.details.reference}</p>}
          {row?.details.payout != null && <p>Payroll payout confirmed.</p>}
          <div className="flex flex-wrap items-center gap-2">
            {!event.reversed && event.action !== "LOAN_TERMS_CHANGE_REVERSED" && row?.state !== "PAID" &&
              !(row?.action === "SEPARATION" && data.finalPay) &&
              event.after_values.recordedMonth === openMonth && <Button size="sm" variant="outline"
                disabled={command.busy} onClick={() => setReversal(event.revision)}>Reverse</Button>}
            {row && ["QUEUED", "EXPORTED", "RETRYABLE"].includes(row.state) && <Button size="sm" variant="outline"
              disabled={command.busy || !row.payroll_loan_id} onClick={() => void exportFile(row.id)}>Download instruction</Button>}
            {row && (row.state === "EXPORTED" || row.state === "ACKNOWLEDGED" && row.action === "REFUND") && <>
              <Button asChild size="sm" variant="outline"><a download="loan-change-acknowledgement.csv"
                href={"data:text/csv;charset=utf-8," + encodeURIComponent(acknowledgementTemplate +
                  [row.id, row.details.transmissionId, row.payroll_loan_id, row.effective_month, "", "", ""].join(",") + "\r\n")}>Acknowledgement template</a></Button>
              <label className="text-xs">Import Payroll acknowledgement
                <Input type="file" accept=".csv,text/csv" disabled={command.busy} onChange={event => {
                  const file = event.target.files?.[0];
                  if (file && file.size <= 8192) void file.text().then(csv => command.run(url + "?exchange=1",
                    { kind: "IMPORT", expectedRevision: loan.revision, instructionId: row.id, csv }, saved));
                  else if (file) setNotice("Choose an acknowledgement CSV under 8 KB.");
                  event.target.value = "";
                }} /></label>
            </>}
          </div>
        </div>;
      })}
    </section>
  </section>;
}

export function LoanChangesModule() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [id, select] = useState<number>();
  const [refresh, setRefresh] = useState(0);
  const result = useLifecycleRead<LoanRegisterPage>(loansApi + "/register?" +
    new URLSearchParams({ q: search, page: String(page), view: "all" }), refresh);
  return <div className="space-y-3">
    <h2 className="text-lg font-semibold">Loan changes</h2>
    <Input className="max-w-sm" aria-label="Find a loan" placeholder="Employee or loan reference" value={search}
      maxLength={120} onChange={event => { setSearch(event.target.value); setPage(1); }} />
    {!result?.data && <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Loading loans…"}
      {result?.error && <Button size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button>}</p>}
    {result?.data && <div className="flex flex-wrap gap-2">
      {result.data.items.map(loan => <Button key={loan.id} type="button" size="sm" variant={id === loan.id ? "default" : "outline"}
        onClick={() => select(loan.id)}>{loan.reference} · {loan.employee}</Button>)}
      {result.data.items.length === 0 && <p>No loans match.</p>}
    </div>}
    {(page > 1 || result?.data?.hasMore) && <nav className="flex gap-2" aria-label="Loan pages">
      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
      <Button size="sm" variant="outline" disabled={!result?.data?.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
    </nav>}
    {id && <ChangeReview key={id} id={id} />}
  </div>;
}
