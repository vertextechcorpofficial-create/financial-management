"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { deductionMonthLabel } from "../enrollment/rules";
import { RequestApiError } from "../requests/request-api";
import { agencyStatementDocumentUrl, readRegisterDetail, saveAgencyBalance } from "./api";
import { registerStatusLabels, statementSources, type RegisterLoanDetail } from "./types";

const money = (amount: string | null) => amount === null ? "—" : peso(amount);

function RecordBalanceForm({ detail, busy, setBusy, onCancel, onSaved, reload }: {
  detail: RegisterLoanDetail;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
  reload: () => void;
}) {
  const [error, setError] = useState<{ message: string; stale: boolean }>();
  const key = useRef<string | null>(null);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("attachment");
    if (file instanceof File && file.size === 0 && !file.name) form.delete("attachment");
    pending.current = true;
    setBusy(true);
    setError(undefined);
    key.current ??= consignmentRequestId();
    try {
      await saveAgencyBalance(detail.loan.id, detail.loan.revision, key.current, form);
      onSaved();
    } catch (cause) {
      setError({ message: cause instanceof Error ? cause.message : "Could not record the balance.",
        stale: cause instanceof RequestApiError && cause.status === 409 });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <form className="space-y-3 rounded-md border p-3" onSubmit={submit} onChange={() => {
    key.current = null;
    if (!error?.stale) setError(undefined);
  }}>
    <h3 className="text-sm font-semibold">Record agency balance</h3>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm">
        <span>Statement date</span>
        <Input name="date" type="date" defaultValue={detail.businessDate} max={detail.businessDate} disabled={busy} required />
      </label>
      <label className="space-y-1 text-sm">
        <span>Outstanding balance (₱)</span>
        <Input name="balance" inputMode="decimal" pattern="[0-9]{1,13}([.][0-9]{1,2})?" disabled={busy} required />
      </label>
      <label className="space-y-1 text-sm">
        <span>Source</span>
        <NativeSelect name="source" disabled={busy}>
          {statementSources.map(source => <option key={source}>{source}</option>)}
        </NativeSelect>
      </label>
    </div>
    <label className="block space-y-1 text-sm">
      <span>Note (optional)</span>
      <Textarea name="note" maxLength={500} disabled={busy} />
    </label>
    <label className="block space-y-1 text-sm">
      <span>Statement attachment (optional)</span>
      <Input name="attachment" type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy} aria-describedby="agency-statement-file-help" />
      <span id="agency-statement-file-help" className="text-xs text-muted-foreground">PDF, JPG, or PNG up to 5 MB.</span>
    </label>
    {error && <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{error.message}</p>
      {error.stale && <Button type="button" variant="outline" size="sm" onClick={reload}>Reload loan</Button>}
    </div>}
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={busy || error?.stale}>{busy ? "Saving…" : "Save balance"}</Button>
    </div>
  </form>;
}

export function LoanRegisterDialog({ id, startRecording, onClose, onSaved }: {
  id: number;
  startRecording: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [recording, setRecording] = useState(startRecording);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState<{ key: string; detail?: RegisterLoanDetail; error?: string }>();
  const key = id + ":" + page + ":" + refresh;
  const current = loaded?.key === key ? loaded : undefined;
  const detail = current?.detail;
  const loan = detail?.loan;
  const reload = () => setRefresh(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    void readRegisterDetail(id, page, controller.signal)
      .then(detail => { if (!controller.signal.aborted) setLoaded({ key, detail }); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoaded({ key, error: cause instanceof Error ? cause.message : "Could not load loan details." });
      });
    return () => controller.abort();
  }, [id, key, page]);

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{loan ? loan.reference + " · " + loan.employee : "Loan details"}</DialogTitle>
        <DialogDescription>{loan ? loan.agency + " · " + loan.program : "View loan terms and recorded agency statements."}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {!current && <p role="status" className="text-sm text-muted-foreground">Loading loan details…</p>}
        {current?.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{current.error}
          <Button type="button" variant="outline" size="sm" onClick={reload}>Retry</Button>
        </div>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {loan && detail && <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{registerStatusLabels[loan.status]}</Badge>
            {loan.active && loan.awaitingPayroll && <Badge variant="secondary">Awaiting Payroll results</Badge>}
            {loan.agencyBalance.stale && <Badge variant="destructive">Stale statement</Badge>}
            {!loan.agencyBalance.latest && <Badge variant="outline">No statement</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-3">
            {[
              ["Agency reference", loan.agencyReference], ["First deduction month", deductionMonthLabel(loan.firstDeductionMonth)],
              ["Loan amount", peso(loan.principal)], ["Monthly amortization", peso(loan.amortization)], ["Installments counted", loan.counted + " / " + loan.term],
              ["System estimate", money(loan.estimate)], ["Latest agency statement", loan.agencyBalance.latest ? peso(loan.agencyBalance.latest.balance) +
                " · " + date(loan.agencyBalance.latest.date) : "—"], ["Adjusted agency balance", money(loan.agencyBalance.adjusted)],
              ["Difference", money(loan.agencyBalance.difference)],
            ].map(([label, value]) => <div key={label}>
              <dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd>
            </div>)}
          </dl>
          {loan.renewal && <p className="text-sm">Replacement loan #{loan.renewal.replacementId} starts in {deductionMonthLabel(loan.renewal.month)}.</p>}

          {loan.active && (recording ? <RecordBalanceForm detail={detail} busy={busy} setBusy={setBusy}
            onCancel={() => setRecording(false)} reload={reload}
            onSaved={() => {
              setNotice("Agency balance recorded."); setRecording(false); setPage(1); reload(); onSaved();
            }} /> :
            <Button type="button" onClick={() => { setNotice(""); setRecording(true); }}>Record balance</Button>)}

          <section className="space-y-2" aria-label="Statement history">
            <h3 className="text-sm font-semibold">Statement history</h3>
            {detail.statements.items.length ? <div className="rounded-md border"><Table>
              <TableHeader><TableRow>
                <TableHead>Statement date</TableHead><TableHead>Balance</TableHead><TableHead>Source</TableHead><TableHead>Recorded by</TableHead>
              </TableRow></TableHeader>
              <TableBody>{detail.statements.items.map(statement => <TableRow key={statement.id}>
                <TableCell>{date(statement.date)}</TableCell>
                <TableCell>{peso(statement.balance)}</TableCell>
                <TableCell>{statement.source}
                  {statement.note && <p className="max-w-56 whitespace-normal break-words text-xs text-muted-foreground">{statement.note}</p>}
                  {statement.attachmentName && <a className="block max-w-56 break-all text-xs text-primary underline"
                    href={agencyStatementDocumentUrl(id, statement.id)}>{statement.attachmentName}</a>}
                </TableCell>
                <TableCell>{statement.recordedBy}<p className="text-xs text-muted-foreground">{dateTime(statement.recordedAt)} PHT</p></TableCell>
              </TableRow>)}</TableBody>
            </Table></div> : <p className="text-sm text-muted-foreground">No agency statements recorded.</p>}
            {(page > 1 || detail.statements.hasMore) && <nav aria-label="Statement history pages" className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page === 1 || recording} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm">Page {page}</span>
              <Button type="button" variant="outline" size="sm" disabled={!detail.statements.hasMore || recording} onClick={() => setPage(page + 1)}>Next</Button>
            </nav>}
          </section>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}
