"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle, CalendarDays, CheckCircle2, FileText, FileWarning, FolderClosed, HandCoins, History,
  LayoutDashboard, ShieldCheck, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LoanMemberSelect } from "../../loans/LoanMemberSelect";
import { CooperativeDocuments } from "../../members/MemberDocuments";
import { MetricCard, PersonAvatar, SectionHeading } from "../../members/components";
import { dateTime, peso } from "../../members/format";
import type { MemberDocument } from "../../members/types";
import type { ClearanceActionResult } from "../../server/clearance-commands";
import type { ClearanceDetail, ClearanceMemberChoices } from "../../server/clearance-store";
import { caseStatusChip, ConsoleDialog, Kv, Panel, StatusChip } from "../components/ui";
import { formatDate } from "../format";
import { CLEARANCE_REASONS } from "../types";
import { ClearanceSettlementPreview, PostedClearance } from "./ClearanceSettlementPreview";
import { ClearanceDetailSkeleton, HistoryTimeline } from "./components";
import { clearanceEndpoint, useClearanceData, useClearanceMutation } from "./useClearanceData";

type Draft = Pick<ClearanceDetail, "reason" | "separationDate" | "notes">;
type Saved = (result: ClearanceActionResult) => void;
type Changes = ReturnType<typeof useClearanceMutation>;
const emptyDraft: Draft = { reason: "RESIGNATION", separationDate: "", notes: "" };
const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";

function DraftFields({ draft, setDraft, disabled, errors = {} }: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  disabled: boolean;
  errors?: Record<string, string>;
}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="block space-y-1.5 text-sm">Separation reason
      <NativeSelect className="w-full" value={draft.reason} disabled={disabled}
        onChange={event => setDraft({ ...draft, reason: event.target.value as Draft["reason"] })}>
        {Object.entries(CLEARANCE_REASONS).map(([reason, label]) => <option key={reason} value={reason}>{label}</option>)}
      </NativeSelect>
      {errors.reason && <span className="block text-xs text-destructive">{errors.reason}</span>}
    </label>
    <label className="block space-y-1.5 text-sm">Separation date
      <Input type="date" required value={draft.separationDate} disabled={disabled} aria-invalid={Boolean(errors.separationDate)}
        onChange={event => setDraft({ ...draft, separationDate: event.target.value })} />
      {errors.separationDate && <span className="block text-xs text-destructive">{errors.separationDate}</span>}
    </label>
    <label className="block space-y-1.5 text-sm sm:col-span-2">Notes (optional)
      <Textarea value={draft.notes} maxLength={300} disabled={disabled} aria-invalid={Boolean(errors.notes)}
        onChange={event => setDraft({ ...draft, notes: event.target.value })} />
      {errors.notes && <span className="block text-xs text-destructive">{errors.notes}</span>}
    </label>
  </div>;
}

function SaveError({ error }: { error: Changes["error"] }) {
  if (!error) return null;
  return <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
    <p className="min-w-0 break-words">{error.message}</p>
  </div>;
}

export function StartClearanceDialog({ onClose, onSaved }: { onClose: () => void; onSaved: Saved }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [member, setMember] = useState<ClearanceMemberChoices["members"][number]>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ q: search, page: String(page) });
  const choices = useClearanceData<ClearanceMemberChoices>(`${clearanceEndpoint}/members?${params}`, 180);
  const mutation = useClearanceMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member) return;
    const result = await mutation.save(clearanceEndpoint, "POST", { memberId: member.id, ...draft });
    if (result) onSaved(result);
    else choices.reload();
  }

  return <ConsoleDialog open onOpenChange={open => { if (!open && !mutation.busy) onClose(); }} title="Start clearance"
    description="Save a draft for an active member. You can attach documents and verify final pay before settlement."
    footer={<>
      <Button variant="outline" disabled={mutation.busy} onClick={onClose}>Close</Button>
      <Button type="submit" form="start-clearance" disabled={mutation.busy || !member || !draft.separationDate}>
        {mutation.busy ? "Saving…" : "Save draft"}
      </Button>
    </>}>
    <form className="space-y-5" id="start-clearance" onSubmit={submit}>
      <SaveError error={mutation.error} />
      <section className="space-y-3">
        <SectionHeading step="1" title="Member" description="Only active members without an open clearance appear here." />
        <LoanMemberSelect member={member} members={choices.data?.members ?? []} page={page}
          hasMore={choices.data?.hasMore ?? false} loading={choices.loading} error={choices.error} disabled={mutation.busy}
          search={search} onSearchChange={value => { setSearch(value); setPage(1); }}
          onPageChange={setPage} onRetry={choices.reload} onSelect={setMember} />
      </section>
      <section className="space-y-3">
        <SectionHeading step="2" title="Separation details" description="These details drive the settlement date and eligibility checks." />
        <DraftFields draft={draft} setDraft={setDraft} disabled={mutation.busy} errors={mutation.error?.fields} />
      </section>
      <p className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
        Save the draft first. Attach the separation papers and verify final pay from the case detail before settling.
      </p>
    </form>
  </ConsoleDialog>;
}

const historyLabels: Record<string, string> = {
  CLEARANCE_STARTED: "Draft created", CLEARANCE_UPDATED: "Draft updated",
  CLEARANCE_FINAL_PAY_VERIFIED: "Final pay verified", CLEARANCE_FINAL_PAY_RESET: "Final pay returned to pending",
  CLEARANCE_CANCELLED: "Draft cancelled",
  CLEARANCE_SETTLED: "Settlement posted and membership closed",
  CLEARANCE_REVERSED: "Settlement accounting reversed",
  CLEARANCE_JOURNAL_POSTED: "Settlement journal posted",
  CLEARANCE_JOURNAL_REVERSED: "Settlement journal reversed",
};

function historyTone(action: string): "emerald" | "rose" | "slate" {
  if (action.includes("REVERSED") || action.includes("CANCELLED")) return "rose";
  if (action === "CLEARANCE_SETTLED" || action === "CLEARANCE_JOURNAL_POSTED" || action === "CLEARANCE_FINAL_PAY_VERIFIED") return "emerald";
  return "slate";
}

export function ClearanceDetailDialog({ id, onClose, onChanged }: {
  id: number;
  onClose: () => void;
  onChanged: (message?: string) => void;
}) {
  const path = `${clearanceEndpoint}/${id}`;
  const resource = useClearanceData<ClearanceDetail>(path);
  const detail = resource.data;
  const [editing, setEditing] = useState<Draft & { revision: number }>();
  const [cancelling, setCancelling] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<MemberDocument>();
  const [tab, setTab] = useState("overview");
  const [flash, setFlash] = useState("");
  const mutation = useClearanceMutation();
  const canEdit = detail?.status === "DRAFT" && !resource.loading && !resource.error;

  function refresh(message?: string) {
    if (message) setFlash(message);
    resource.reload();
    onChanged(message);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !canEdit) return;
    const result = await mutation.save(path, "PATCH", editing);
    if (result) {
      setEditing(undefined);
      refresh(`${result.reference} updated.`);
    }
  }

  const title = detail ? (
    <span className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={detail.member.name} size="lg" />
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 break-words">{detail.member.name}</span>
          {caseStatusChip(detail.status)}
          {detail.reversal && <StatusChip status="REVERSED" label="Reversed" />}
        </span>
        <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
          {detail.reference} · {CLEARANCE_REASONS[detail.reason]}
        </span>
      </span>
    </span>
  ) : "Clearance details";

  const historyEntries = detail?.history.map(entry => ({
    id: entry.id,
    text: historyLabels[entry.action] ?? entry.action,
    actor: entry.actorName ?? (entry.actorId ? `User ${entry.actorId}` : null),
    at: entry.occurredAtManila,
    reason: entry.reason,
    tone: historyTone(entry.action),
  })) ?? [];

  const documentDetail = detail ? (
    detail.documents.blocks.length ? `${detail.documents.blocks.length} blocking`
      : detail.documents.warnings.length ? `${detail.documents.warnings.length} warning${detail.documents.warnings.length === 1 ? "" : "s"}`
        : "Requirements met"
  ) : "";

  return <>
    <ConsoleDialog open wide title={title}
      description={detail ? `Exit clearance · Filed ${formatDate(detail.createdAt)}` : "Review the case, documents, and settlement."}
      onOpenChange={open => { if (!open && !mutation.busy && !cancelling && !evidenceFile) onClose(); }}
      footerClassName="sticky bottom-0 z-20 -mx-6 -mb-6 mt-4 border-t bg-background/95 px-6 py-3 backdrop-blur"
      footer={<>
        <Button variant="outline" disabled={mutation.busy} onClick={onClose}>Close</Button>
        {canEdit && !editing && <>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setCancelling(true)}>Cancel draft</Button>
          <Button onClick={() => {
            mutation.clearError();
            setFlash("");
            setEditing({ reason: detail.reason, separationDate: detail.separationDate, notes: detail.notes, revision: detail.revision });
          }}>Edit draft</Button>
        </>}
        {editing && <>
          <Button variant="outline" disabled={mutation.busy} onClick={() => { setEditing(undefined); mutation.clearError(); }}>Discard edits</Button>
          <Button type="submit" form="edit-clearance"
            disabled={mutation.busy || mutation.reloadRequired || !canEdit || editing.revision !== detail.revision}>
            {mutation.busy ? "Saving…" : "Save changes"}
          </Button>
        </>}
      </>}>
      {resource.loading && !detail && <ClearanceDetailSkeleton />}
      {resource.error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">{resource.error}</p>
        <Button variant="outline" size="sm" onClick={resource.reload}>Retry</Button>
      </div>}
      {flash && <div role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <p className="min-w-0 flex-1">{flash}</p>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setFlash("")} aria-label="Dismiss notice">
          <X className="size-4" />
        </Button>
      </div>}
      {detail && <>
        {editing && <form id="edit-clearance" onSubmit={saveDraft} className="space-y-3 rounded-xl border bg-muted/20 p-3">
          <SectionHeading title="Edit draft" description="Update the separation details. The case remains a draft until settlement." />
          <SaveError error={mutation.error} />
          <DraftFields draft={editing} setDraft={draft => setEditing({ ...draft, revision: editing.revision })}
            disabled={mutation.busy} errors={mutation.error?.fields} />
          {(mutation.reloadRequired || editing.revision !== detail.revision) &&
            <Button type="button" variant="outline" disabled={resource.loading} onClick={() => {
              setEditing(undefined);
              mutation.clearError();
              resource.reload();
            }}>Reload draft</Button>}
        </form>}
        <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
          <TabsList className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
            <TabsTrigger value="overview" className={tabTriggerClass}><LayoutDashboard className="size-3.5" /> Overview</TabsTrigger>
            <TabsTrigger value="settlement" className={tabTriggerClass}><Wallet className="size-3.5" /> Settlement</TabsTrigger>
            <TabsTrigger value="documents" className={tabTriggerClass}><FolderClosed className="size-3.5" /> Documents</TabsTrigger>
            <TabsTrigger value="history" className={tabTriggerClass}><History className="size-3.5" /> History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard icon={Wallet} label="Posted savings" value={peso(detail.savings)} detail="Before settlement" tone="emerald" />
              <MetricCard icon={HandCoins} label="Final pay" value={detail.finalPay === null ? "Pending" : peso(detail.finalPay)}
                detail={detail.evidence ? `${detail.evidence.source === "HR" ? "HR" : "Payroll"} · ${formatDate(detail.evidence.verifiedAt)}` : "Not verified"}
                tone={detail.finalPay === null ? "amber" : "sky"} alert={detail.finalPay === null && detail.status === "DRAFT"} />
              <MetricCard icon={FolderClosed} label="Documents"
                value={detail.documents.required === 0 ? "None" : `${detail.documents.onFile}/${detail.documents.required}`}
                detail={documentDetail}
                tone={detail.documents.blocks.length ? "rose" : detail.documents.warnings.length ? "amber" : "emerald"}
                alert={detail.documents.blocks.length > 0} />
              <MetricCard icon={CalendarDays} label="Separation date" value={<span className="text-base">{formatDate(detail.separationDate)}</span>}
                detail={CLEARANCE_REASONS[detail.reason]} tone="slate" />
            </div>

            <Panel title="Case details">
              <Kv rows={[
                ["Clearance", detail.reference],
                ["Member", `${detail.member.name} · ${detail.member.employeeNumber}`],
                ["Department", detail.member.department ?? "—"],
                ["Reason", CLEARANCE_REASONS[detail.reason]],
                ["Separation date", formatDate(detail.separationDate)],
                ["Filed", formatDate(detail.createdAt)],
                ["Updated", formatDate(detail.updatedAt)],
                ["Notes", <span className="whitespace-pre-wrap break-words" key="notes">{detail.notes || "—"}</span>],
                ...(detail.cancellationReason ? [["Cancellation reason", detail.cancellationReason] as [string, string]] : []),
              ]} />
            </Panel>

            {detail.status === "DRAFT" && <Panel title="Settlement readiness" description="Posting checks are recalculated when the settlement is confirmed."
              actions={<Button type="button" size="sm" variant="outline" onClick={() => setTab("settlement")}>Review settlement</Button>}>
              <Kv rows={[
                ["Documents on file", `${detail.documents.onFile} of ${detail.documents.required} required`],
                ["Document requirement", detail.documents.blocks.length ? "Settlement blocked by missing documents"
                  : detail.documents.warnings.length ? "Missing documents are warnings" : "Document requirements met"],
              ]} />
              <DocumentAlerts detail={detail} />
            </Panel>}
          </TabsContent>

          <TabsContent value="settlement" className="mt-4 space-y-4">
            {detail.status === "CANCELLED" ? (
              <Panel title="Settlement">
                <p className="text-sm text-muted-foreground">This clearance was cancelled before settlement.</p>
                {detail.cancellationReason && <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">{detail.cancellationReason}</p>}
              </Panel>
            ) : <>
              <FinalPayPanel detail={detail} path={path} onOpenDocuments={() => setTab("documents")} />
              {detail.settlement
                ? <PostedClearance settlement={detail.settlement} reversal={detail.reversal} />
                : detail.status === "DRAFT"
                  ? <ClearanceSettlementPreview key={detail.revision} path={path} revision={detail.revision}
                    canConfirm={!editing} onRefresh={refresh} onOpenDocuments={() => setTab("documents")} />
                  : <Panel title="Settlement"><p className="text-sm text-muted-foreground">No settlement record is available for this case.</p></Panel>}
            </>}
          </TabsContent>

          <TabsContent value="documents" className="mt-4 space-y-4">
            <Panel title="Document compliance" description="Compliance is checked again when the settlement is confirmed.">
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard icon={FolderClosed} label="On file" value={`${detail.documents.onFile}/${detail.documents.required}`}
                  detail="Required documents" tone="sky" />
                <MetricCard icon={FileWarning} label="Warnings" value={detail.documents.warnings.length}
                  detail="Missing but not blocking" tone={detail.documents.warnings.length ? "amber" : "slate"} />
                <MetricCard icon={FileText} label="Blocking" value={detail.documents.blocks.length}
                  detail="Required for settlement" tone={detail.documents.blocks.length ? "rose" : "slate"}
                  alert={detail.documents.blocks.length > 0} />
              </div>
              <DocumentAlerts detail={detail} />
            </Panel>
            <CooperativeDocuments endpoint={path + "/documents"} required={detail.rules} uploadTypes={detail.uploadTypes}
              storageReady={detail.storageReady} canEdit={Boolean(canEdit && !editing)}
              onChanged={() => refresh()}
              renderFileAction={file => <Button type="button" variant="ghost" size="sm"
                onClick={() => setEvidenceFile(file)} aria-label={`Use ${file.filename} as final-pay evidence`}>
                Verify final pay
              </Button>} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Panel title="Clearance history" description="Every action recorded for this case.">
              <HistoryTimeline entries={historyEntries} />
            </Panel>
          </TabsContent>
        </Tabs>
      </>}
    </ConsoleDialog>
    {detail && cancelling && <CancelDraftDialog detail={detail} path={path} onClose={() => setCancelling(false)}
      onSaved={result => {
        setCancelling(false);
        refresh(`${result.reference} cancelled.`);
      }} onReload={resource.reload} />}
    {detail && evidenceFile && <FinalPayDialog detail={detail} path={path} file={evidenceFile} onClose={() => setEvidenceFile(undefined)}
      onSaved={result => {
        setEvidenceFile(undefined);
        setTab("settlement");
        refresh(`Final pay verified for ${result.reference}.`);
      }} onReload={resource.reload} />}
  </>;
}

function FinalPayPanel({ detail, path, onOpenDocuments }: { detail: ClearanceDetail; path: string; onOpenDocuments: () => void }) {
  return <Panel title="Final pay" description="The approved amount available for withholding at separation.">
    {detail.evidence && detail.finalPay !== null ? (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard icon={HandCoins} label="Verified amount" value={peso(detail.finalPay)}
            detail={detail.evidence.source === "HR" ? "HR confirmation" : "Payroll confirmation"} tone="emerald" />
          <MetricCard icon={FileText} label="Reference" value={detail.evidence.reference}
            detail={detail.evidence.filename} tone="slate" />
          <MetricCard icon={ShieldCheck} label="Verified by" value={detail.evidence.verifier}
            detail={dateTime(detail.evidence.verifiedAt)} tone="sky" />
        </div>
        <p className="text-xs text-muted-foreground">Evidence · <a className="break-all underline underline-offset-2"
          href={`${path}/documents/${detail.evidence.documentId}`} target="_blank" rel="noreferrer">{detail.evidence.filename}</a></p>
      </div>
    ) : (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Final pay is not verified</p>
            <p className="mt-0.5 text-xs">Attach the approved HR or payroll confirmation in Documents, then use it as final-pay evidence.</p>
          </div>
        </div>
        {detail.status === "DRAFT" && <Button size="sm" variant="outline" onClick={onOpenDocuments}>Open documents</Button>}
      </div>
    )}
  </Panel>;
}

function DocumentAlerts({ detail }: { detail: ClearanceDetail }) {
  const { warnings, blocks } = detail.documents;
  return <>
    {!!blocks.length && <p role="alert" className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">
      Required for settlement · {blocks.join(", ")}
    </p>}
    {!!warnings.length && <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      Missing documents · {warnings.join(", ")}
    </p>}
  </>;
}

type DecisionProps = { detail: ClearanceDetail; path: string; onClose: () => void; onSaved: Saved; onReload: () => void };

function CancelDraftDialog({ detail, path, onClose, onSaved, onReload }: DecisionProps) {
  const [reason, setReason] = useState("");
  const [revision] = useState(detail.revision);
  const mutation = useClearanceMutation();
  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await mutation.save(path, "POST", { action: "cancel", revision, reason });
    if (result) onSaved(result);
  }
  return <ConsoleDialog open title={`Cancel ${detail.reference}?`} description="The case and its files remain available in clearance history."
    onOpenChange={open => { if (!open && !mutation.busy) onClose(); }}
    footer={<>
      <Button variant="outline" disabled={mutation.busy} onClick={onClose}>Back</Button>
      <Button type="submit" form="cancel-clearance" variant="destructive" disabled={mutation.busy || mutation.reloadRequired || !reason.trim()}>
        {mutation.busy ? "Cancelling…" : "Confirm cancellation"}
      </Button>
    </>}>
    <form id="cancel-clearance" className="space-y-3" onSubmit={cancel}>
      <SaveError error={mutation.error} />
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm font-medium">{detail.member.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {detail.reference} · {CLEARANCE_REASONS[detail.reason]} · {formatDate(detail.separationDate)}
        </p>
      </div>
      <label className="block space-y-1.5 text-sm">Cancellation reason
        <Textarea value={reason} maxLength={500} required disabled={mutation.busy} onChange={event => setReason(event.target.value)} />
      </label>
      {mutation.reloadRequired && <Button type="button" variant="outline" onClick={() => { onClose(); onReload(); }}>Reload case</Button>}
    </form>
  </ConsoleDialog>;
}

function FinalPayDialog({ detail, path, file, onClose, onSaved, onReload }: DecisionProps & { file: MemberDocument }) {
  const [source, setSource] = useState<"HR" | "PAYROLL">("HR");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [revision] = useState(detail.revision);
  const mutation = useClearanceMutation();
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await mutation.save(path, "POST", { action: "verify-final-pay", revision, source, amount, reference, documentId: file.id, confirmed });
    if (result) onSaved(result);
  }
  return <ConsoleDialog open title="Verify final pay" description={`${detail.reference} · ${detail.member.name}`}
    onOpenChange={open => { if (!open && !mutation.busy) onClose(); }}
    footer={<>
      <Button variant="outline" disabled={mutation.busy} onClick={onClose}>Close</Button>
      <Button type="submit" form="verify-final-pay"
        disabled={mutation.busy || mutation.reloadRequired || !confirmed || !reference.trim() || !amount.trim()}>
        {mutation.busy ? "Saving…" : "Save verification"}
      </Button>
    </>}>
    <form className="space-y-3" id="verify-final-pay" onSubmit={verify}>
      <SaveError error={mutation.error} />
      <div className="rounded-xl border bg-muted/20 p-3 text-sm">
        <p className="text-[11px] font-medium text-muted-foreground">Evidence</p>
        <a href={`${path}/documents/${file.id}`} target="_blank" rel="noreferrer"
          className="mt-1 block break-all underline underline-offset-2">{file.filename}</a>
      </div>
      <label className="block space-y-1.5 text-sm">Approved by
        <NativeSelect value={source} onChange={event => { setSource(event.target.value as "HR" | "PAYROLL"); setConfirmed(false); }}
          disabled={mutation.busy}><option value="HR">HR</option><option value="PAYROLL">Payroll</option></NativeSelect>
      </label>
      <label className="block space-y-1.5 text-sm">HR or payroll reference
        <Input value={reference} maxLength={120} required disabled={mutation.busy}
          onChange={event => { setReference(event.target.value); setConfirmed(false); }} />
      </label>
      <label className="block space-y-1.5 text-sm">Verified amount available (PHP)
        <Input value={amount} inputMode="decimal" maxLength={13} required disabled={mutation.busy}
          aria-invalid={Boolean(mutation.error?.fields.amount)} onChange={event => { setAmount(event.target.value); setConfirmed(false); }} />
        <span className="block text-xs text-muted-foreground">Enter 0.00 if no amount is available.</span>
        {mutation.error?.fields.amount && <span className="block text-xs text-destructive">{mutation.error.fields.amount}</span>}
      </label>
      <label className="flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-sm">
        <input className="mt-1" type="checkbox" checked={confirmed} disabled={mutation.busy} onChange={event => setConfirmed(event.target.checked)} />
        I checked the approved record and confirm the amount still available for withholding for this member.
      </label>
      {mutation.reloadRequired && <Button type="button" variant="outline" onClick={() => { onClose(); onReload(); }}>Reload case</Button>}
    </form>
  </ConsoleDialog>;
}
