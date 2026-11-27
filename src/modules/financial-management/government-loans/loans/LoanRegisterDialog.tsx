"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { DetailSkeleton, PanelSkeleton, PersonAvatar, StatusChip, tabTriggerClass } from "../components/ui";
import { TabIcon } from "../components/tab-icons";
import { deductionMonthLabel } from "../enrollment/rules";
import type { getLoanChanges } from "../server/loan-changes";
import { RequestApiError } from "../requests/request-api";
import { agencyStatementDocumentUrl, readRegisterDetail, saveAgencyBalance } from "./api";
import { loansApi } from "./lifecycle-client";
import { registerStatusLabels, statementSources, type RegisterLoanDetail } from "./types";

export const loanPanels = ["overview", "statements", "changes", "instructions"] as const;
export type LoanPanel = typeof loanPanels[number];

const money = (amount: string | null) => amount === null ? "—" : peso(amount);
type ChangeDetail = Awaited<ReturnType<typeof getLoanChanges>>;

function instructionTone(state: ChangeDetail["instructions"][number]["state"]) {
  return state === "PAID" || state === "ACKNOWLEDGED" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
    : state === "RETRYABLE" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
    : state === "CANCELLED" ? "text-muted-foreground" : "";
}

function useLoanChanges(id: number, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data?: ChangeDetail; error?: string }>();
  useEffect(() => {
    if (!enabled || state?.data) return;
    const controller = new AbortController();
    fetch(loansApi + "/changes/" + id, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.message ?? "Could not load loan changes.");
        return body as ChangeDetail;
      })
      .then(data => { if (!controller.signal.aborted) setState({ data }); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setState({ error: cause instanceof Error ? cause.message : "Could not load loan changes." });
      });
    return () => controller.abort();
  }, [id, enabled, attempt, state?.data]);
  return { ...state, retry: () => { setState(undefined); setAttempt(value => value + 1); } };
}

function RecordBalanceForm({ detail, busy, setBusy, onCancel, onSaved, reload }: {
  detail: RegisterLoanDetail;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: () => void;
  reload: () => void;
}) {
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
    key.current ??= consignmentRequestId();
    try {
      await saveAgencyBalance(detail.loan.id, detail.loan.revision, key.current, form);
      onSaved();
    } catch (cause) {
      const stale = cause instanceof RequestApiError && cause.status === 409;
      toast.error(cause instanceof Error ? cause.message : "Could not record the balance.",
        stale ? { action: { label: "Reload loan", onClick: reload } } : undefined);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <form className="space-y-3 rounded-md border p-3" onSubmit={submit} onChange={() => {
    key.current = null;
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
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save balance"}</Button>
    </div>
  </form>;
}

function ChangesPanel({ state }: { state: ReturnType<typeof useLoanChanges> }) {
  if (!state.data && !state.error) return <PanelSkeleton label="Loading loan changes…" />;
  if (state.error && !state.data) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
    {state.error}<Button type="button" variant="outline" size="sm" onClick={state.retry}>Retry</Button>
  </div>;
  if (!state.data) return null;
  const { history, instructions } = state.data;
  if (!history.length) return <Empty className="border-0">
    <EmptyHeader>
      <EmptyMedia variant="icon"><span className="text-lg">#</span></EmptyMedia>
      <EmptyTitle>No changes recorded</EmptyTitle>
      <EmptyDescription>Amortization, suspension, separation, and refund changes appear here.</EmptyDescription>
    </EmptyHeader>
  </Empty>;
  return <div className="space-y-2">
    {history.map(event => {
      const instruction = instructions.find(row => row.id === event.after_values.instructionId);
      const change = event.after_values.loanChange;
      return <article key={event.revision} className="rounded-md border p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-medium">#{event.revision} · {event.after_values.remarks}
            {event.reversed && <Badge variant="outline" className="ml-2 text-muted-foreground">Reversed</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">{event.actor_name} · {dateTime(event.occurred_at)} PHT</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Recorded in {deductionMonthLabel(event.after_values.recordedMonth)}
          {change && ` · Effective ${deductionMonthLabel(change.month)}`}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
          {change?.amount && <span>Amount {peso(change.amount)}</span>}
          {change?.previousAmount && <span>Previous {peso(change.previousAmount)}</span>}
          {change?.throughMonth && <span>Through {deductionMonthLabel(change.throughMonth)}</span>}
          {change?.reference && <span>Reference {change.reference}</span>}
          {change?.balance && <span>Final-pay cap {peso(change.balance)}</span>}
        </div>
        {instruction && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className={instructionTone(instruction.state)}>{instruction.state.replaceAll("_", " ")}</Badge>
          <span className="text-muted-foreground">Effective {deductionMonthLabel(instruction.effective_month)}</span>
        </div>}
      </article>;
    })}
  </div>;
}

function InstructionsPanel({ state }: { state: ReturnType<typeof useLoanChanges> }) {
  if (!state.data && !state.error) return <PanelSkeleton label="Loading payroll instructions…" />;
  if (state.error && !state.data) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
    {state.error}<Button type="button" variant="outline" size="sm" onClick={state.retry}>Retry</Button>
  </div>;
  if (!state.data) return null;
  const { instructions } = state.data;
  if (!instructions.length) return <Empty className="border-0">
    <EmptyHeader>
      <EmptyMedia variant="icon"><span className="text-lg">↗</span></EmptyMedia>
      <EmptyTitle>No payroll instructions</EmptyTitle>
      <EmptyDescription>Queued and exported Payroll instructions for this loan appear here.</EmptyDescription>
    </EmptyHeader>
  </Empty>;
  return <div className="space-y-2">
    {instructions.map(instruction => <article key={instruction.id} className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">{instruction.action.replaceAll("_", " ")}</p>
        <Badge variant="outline" className={instructionTone(instruction.state)}>{instruction.state.replaceAll("_", " ")}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Effective {deductionMonthLabel(instruction.effective_month)} · Recorded {dateTime(instruction.recorded_at)} PHT</p>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
        {typeof instruction.details.amount === "string" && <span>Amount {peso(instruction.details.amount)}</span>}
        {typeof instruction.details.reference === "string" && <span>Reference {instruction.details.reference}</span>}
      </div>
      {instruction.payroll_loan_id === null && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Payroll loan is not linked yet.</p>}
    </article>)}
  </div>;
}

export function LoanRegisterDialog({ id, startRecording, panel, onPanelChange, onClose, onSaved }: {
  id: number;
  startRecording: boolean;
  panel: LoanPanel;
  onPanelChange: (panel: LoanPanel) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [recording, setRecording] = useState(startRecording);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; detail?: RegisterLoanDetail; error?: string }>();
  const [detail, setDetail] = useState<RegisterLoanDetail>();
  const key = id + ":" + page + ":" + refresh;
  const current = loaded?.key === key ? loaded : undefined;
  const error = current?.error;
  const pending = !!detail && !current?.detail;
  const reload = () => setRefresh(value => value + 1);
  const changes = useLoanChanges(id, true);
  const loan = detail?.loan;

  useEffect(() => {
    const controller = new AbortController();
    void readRegisterDetail(id, page, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setLoaded({ key, detail: result });
        setDetail(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoaded({ key, error: cause instanceof Error ? cause.message : "Could not load loan details." });
      });
    return () => controller.abort();
  }, [id, key, page]);

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>
          <span className="flex min-w-0 items-center gap-3">
            <PersonAvatar name={loan?.employee ?? "Loan"} size="lg" />
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 truncate">{loan?.employee ?? "Loan details"}</span>
                {loan && <StatusChip status={loan.status} label={registerStatusLabels[loan.status]} />}
              </span>
              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                {loan ? loan.reference + " · " + loan.agency + " · " + loan.program : "View loan terms, statements, changes, and payroll instructions."}
              </span>
            </span>
          </span>
        </DialogTitle>
        <DialogDescription className="sr-only">Loan details, statements, changes, and payroll instructions.</DialogDescription>
      </DialogHeader>
      {!detail && !error && <DetailSkeleton />}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <span className="min-w-0 flex-1">{error}</span>
        <Button type="button" variant="outline" size="sm" onClick={reload}>Retry</Button>
      </div>}
      {loan && detail && <Tabs value={panel} onValueChange={value => onPanelChange(value as LoanPanel)} className="min-h-0 flex-1 gap-3">
        <div className="overflow-x-auto">
          <TabsList variant="line" aria-label="Loan detail tabs" className="w-full justify-start">
            <TabsTrigger value="overview" className={tabTriggerClass}><TabIcon tabKey="overview" />Overview</TabsTrigger>
            <TabsTrigger value="statements" className={tabTriggerClass}><TabIcon tabKey="statements" />Statements{detail.statements.items.length ? ` (${detail.statements.items.length})` : ""}</TabsTrigger>
            <TabsTrigger value="changes" className={tabTriggerClass}><TabIcon tabKey="changes" />Changes</TabsTrigger>
            <TabsTrigger value="instructions" className={tabTriggerClass}><TabIcon tabKey="instructions" />Payroll instructions</TabsTrigger>
          </TabsList>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto pr-1 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
          <TabsContent value="overview" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {loan.active && loan.awaitingPayroll && <StatusChip status="pending" label="Awaiting Payroll results" />}
              {loan.agencyBalance.stale && <StatusChip status="warning" label="Stale statement" />}
              {!loan.agencyBalance.latest && <StatusChip status="missing" label="No statement" />}
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-3">
              {[
                ["Agency reference", loan.agencyReference], ["First deduction month", deductionMonthLabel(loan.firstDeductionMonth)],
                ["Loan amount", peso(loan.principal)], ["Monthly amortization", peso(loan.amortization)], ["Installments counted", loan.counted + " / " + loan.term],
                ["System estimate", money(loan.estimate)], ["Latest agency statement", loan.agencyBalance.latest ? peso(loan.agencyBalance.latest.balance) +
                  " · " + date(loan.agencyBalance.latest.date) : "—"], ["Adjusted agency balance", money(loan.agencyBalance.adjusted)],
                ["Difference", money(loan.agencyBalance.difference)],
              ].map(([label, value]) => <div key={label}>
                <dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium tabular-nums">{value}</dd>
              </div>)}
            </dl>
            {loan.renewal && <p className="text-sm">Replacement loan #{loan.renewal.replacementId} starts in {deductionMonthLabel(loan.renewal.month)}.</p>}

            {loan.active && (recording ? <RecordBalanceForm detail={detail} busy={busy} setBusy={setBusy}
              onCancel={() => setRecording(false)} reload={reload}
              onSaved={() => {
                toast.success("Agency balance recorded."); setRecording(false); setPage(1); reload(); onSaved();
              }} /> :
              <Button type="button" onClick={() => setRecording(true)}>Record balance</Button>)}
          </TabsContent>

          <TabsContent value="statements" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Statement history</h3>
                <p className="text-xs text-muted-foreground">Agency statements recorded for this loan, newest first.</p>
              </div>
              {loan.active && !recording && <Button type="button" size="sm" variant="outline"
                onClick={() => { setRecording(true); onPanelChange("overview"); }}>Record balance</Button>}
            </div>
            {detail.statements.items.length ? <div className="rounded-md border"><Table>
              <TableHeader><TableRow>
                <TableHead>Statement date</TableHead><TableHead className="text-right">Balance</TableHead>
                <TableHead>Source</TableHead><TableHead>Recorded by</TableHead>
              </TableRow></TableHeader>
              <TableBody>{detail.statements.items.map(statement => <TableRow key={statement.id}>
                <TableCell>{date(statement.date)}</TableCell>
                <TableCell className="text-right tabular-nums">{peso(statement.balance)}</TableCell>
                <TableCell>{statement.source}
                  {statement.note && <p className="max-w-56 whitespace-normal break-words text-xs text-muted-foreground">{statement.note}</p>}
                  {statement.attachmentName && <a className="block max-w-56 break-all text-xs text-primary underline"
                    href={agencyStatementDocumentUrl(id, statement.id)}>{statement.attachmentName}</a>}
                </TableCell>
                <TableCell>{statement.recordedBy}<p className="text-xs text-muted-foreground">{dateTime(statement.recordedAt)} PHT</p></TableCell>
              </TableRow>)}</TableBody>
            </Table></div> : <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon"><span className="text-lg">₱</span></EmptyMedia>
                <EmptyTitle>No agency statements yet</EmptyTitle>
                <EmptyDescription>Record the agency statement of account to compare it with the system estimate.</EmptyDescription>
              </EmptyHeader>
              {loan.active && <EmptyContent>
                <Button type="button" size="sm"
                  onClick={() => { setRecording(true); onPanelChange("overview"); }}>Record balance</Button>
              </EmptyContent>}
            </Empty>}
            {(page > 1 || detail.statements.hasMore) && <nav aria-label="Statement history pages" className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page === 1 || recording} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="text-sm">Page {page}</span>
              <Button type="button" variant="outline" size="sm" disabled={!detail.statements.hasMore || recording} onClick={() => setPage(page + 1)}>Next</Button>
            </nav>}
          </TabsContent>

          <TabsContent value="changes" className="space-y-3">
            <ChangesPanel state={changes} />
            <p className="text-sm text-muted-foreground">Need to record or reverse a change? <Link className="underline"
              href="/fm/government-loans/loans?tab=changes">Open Changes</Link>.</p>
          </TabsContent>

          <TabsContent value="instructions" className="space-y-3">
            <InstructionsPanel state={changes} />
            <p className="text-sm text-muted-foreground">Instruction delivery and acknowledgements are managed in <Link className="underline"
              href="/fm/government-loans/loans?tab=payroll-instructions">Payroll instructions</Link>.</p>
          </TabsContent>
        </div>
      </Tabs>}
    </DialogContent>
  </Dialog>;
}
