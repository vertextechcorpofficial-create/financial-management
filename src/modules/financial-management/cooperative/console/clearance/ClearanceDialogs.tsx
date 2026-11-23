"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LoanMemberSelect } from "../../loans/LoanMemberSelect";
import { CooperativeDocuments } from "../../members/MemberDocuments";
import { dateTime, peso } from "../../members/format";
import type { MemberDocument } from "../../members/types";
import type { ClearanceActionResult } from "../../server/clearance-commands";
import type { ClearanceDetail, ClearanceMemberChoices } from "../../server/clearance-store";
import { caseStatusChip, ConsoleDialog, Kv, Panel } from "../components/ui";
import { formatDate } from "../format";
import { CLEARANCE_REASONS } from "../types";
import { ClearanceSettlementPreview, PostedClearance } from "./ClearanceSettlementPreview";
import { clearanceEndpoint, useClearanceData, useClearanceMutation } from "./useClearanceData";

type Draft = Pick<ClearanceDetail, "reason" | "separationDate" | "notes">;
type Saved = (result: ClearanceActionResult) => void;
type Changes = ReturnType<typeof useClearanceMutation>;
const emptyDraft: Draft = { reason: "RESIGNATION", separationDate: "", notes: "" };

function DraftFields({ draft, setDraft, disabled, errors = {} }: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  disabled: boolean;
  errors?: Record<string, string>;
}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="block space-y-1 text-sm">Separation reason
      <NativeSelect className="w-full" value={draft.reason} disabled={disabled}
        onChange={event => setDraft({ ...draft, reason: event.target.value as Draft["reason"] })}>
        {Object.entries(CLEARANCE_REASONS).map(([reason, label]) => <option key={reason} value={reason}>{label}</option>)}
      </NativeSelect>
      {errors.reason && <span className="block text-xs text-destructive">{errors.reason}</span>}
    </label>
    <label className="block space-y-1 text-sm">Separation date
      <Input type="date" required value={draft.separationDate} disabled={disabled} aria-invalid={Boolean(errors.separationDate)}
        onChange={event => setDraft({ ...draft, separationDate: event.target.value })} />
      {errors.separationDate && <span className="block text-xs text-destructive">{errors.separationDate}</span>}
    </label>
    <label className="block space-y-1 text-sm sm:col-span-2">Notes (optional)
      <Textarea value={draft.notes} maxLength={300} disabled={disabled} aria-invalid={Boolean(errors.notes)}
        onChange={event => setDraft({ ...draft, notes: event.target.value })} />
      {errors.notes && <span className="block text-xs text-destructive">{errors.notes}</span>}
    </label>
  </div>;
}

function SaveError({ error }: { error: Changes["error"] }) {
  if (!error) return null;
  return <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error.message}</p>;
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
    description="Save a draft for an active member. You can verify final pay after attaching the approved confirmation."
    footer={<>
      <Button variant="outline" disabled={mutation.busy} onClick={onClose}>Close</Button>
      <Button type="submit" form="start-clearance" disabled={mutation.busy || !member || !draft.separationDate}>
        {mutation.busy ? "Saving…" : "Save draft"}
      </Button>
    </>}>
    <form className="space-y-4" id="start-clearance" onSubmit={submit}>
      <SaveError error={mutation.error} />
      <LoanMemberSelect member={member} members={choices.data?.members ?? []} page={page}
        hasMore={choices.data?.hasMore ?? false} loading={choices.loading} error={choices.error} disabled={mutation.busy}
        search={search} onSearchChange={value => { setSearch(value); setPage(1); }}
        onPageChange={setPage} onRetry={choices.reload} onSelect={setMember} />
      <DraftFields draft={draft} setDraft={setDraft} disabled={mutation.busy} errors={mutation.error?.fields} />
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
  const mutation = useClearanceMutation();
  const canEdit = detail?.status === "DRAFT" && !resource.loading && !resource.error;

  function refresh(message?: string) {
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

  return <>
    <ConsoleDialog open wide title={detail ? detail.reference : "Clearance details"}
      description={detail ? `${detail.member.name} · ${detail.member.employeeNumber}` : "Review the case and its documents."}
      onOpenChange={open => { if (!open && !mutation.busy && !cancelling && !evidenceFile) onClose(); }}
      footer={<>
        <Button variant="outline" disabled={mutation.busy} onClick={onClose}>Close</Button>
        {canEdit && !editing && <>
          <Button variant="outline" onClick={() => setCancelling(true)}>Cancel draft</Button>
          <Button onClick={() => {
            mutation.clearError();
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
      {resource.loading && <p role="status" className="text-sm text-muted-foreground">Loading clearance…</p>}
      {resource.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        {resource.error}<Button variant="outline" size="sm" onClick={resource.reload}>Retry</Button>
      </div>}
      <SaveError error={mutation.error} />
      {detail && <>
        <div className="flex items-center gap-2">
          {caseStatusChip(detail.status)}
          <span className="text-xs text-muted-foreground">{detail.member.department ?? ""}</span>
        </div>
        {editing ? <form id="edit-clearance" onSubmit={saveDraft} className="space-y-3 rounded-lg border p-3">
          <DraftFields draft={editing} setDraft={draft => setEditing({ ...draft, revision: editing.revision })}
            disabled={mutation.busy} errors={mutation.error?.fields} />
          {(mutation.reloadRequired || editing.revision !== detail.revision) &&
            <Button type="button" variant="outline" disabled={resource.loading} onClick={() => {
              setEditing(undefined);
              mutation.clearError();
              resource.reload();
            }}>Reload draft</Button>}
        </form> : <Kv rows={[
          ["Separation reason", CLEARANCE_REASONS[detail.reason]],
          ["Separation date", formatDate(detail.separationDate)],
          ["Notes", <span className="whitespace-pre-wrap break-words" key="notes">{detail.notes || "—"}</span>],
          ...(detail.cancellationReason ? [["Cancellation reason", detail.cancellationReason] as [string, string]] : []),
        ]} />}
        <Tabs defaultValue="settlement" className="min-w-0">
          <TabsList>
            <TabsTrigger value="settlement">Settlement</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
          <TabsContent value="settlement" className="space-y-3">
            <Panel title="Final pay available for withholding">
              {detail.evidence && detail.finalPay !== null ? <Kv rows={[
                ["Verified amount", peso(detail.finalPay)],
                ["Source", detail.evidence.source === "HR" ? "HR" : "Payroll"],
                ["Reference", detail.evidence.reference],
                ["Evidence", <a key="file" className="break-all underline underline-offset-2"
                  href={`${path}/documents/${detail.evidence.documentId}`} target="_blank" rel="noreferrer">{detail.evidence.filename}</a>],
                ["Verified by", `${detail.evidence.verifier} · ${dateTime(detail.evidence.verifiedAt)}`],
              ]} /> : <div className="space-y-1 text-sm">
                <p className="font-medium">Final pay pending</p>
                {detail.status === "DRAFT" && <p className="text-muted-foreground">Attach an approved HR or Payroll confirmation in Documents and use it as final-pay evidence.</p>}
              </div>}
            </Panel>
            {detail.status === "DRAFT" && !resource.loading && !resource.error &&
              <ClearanceSettlementPreview key={detail.revision} path={path} revision={detail.revision}
                canConfirm={!editing} onRefresh={message => { if (message) refresh(message); else resource.reload(); }} />}
            {detail.settlement && <PostedClearance settlement={detail.settlement} reversal={detail.reversal} />}
            {detail.status === "DRAFT" && <Panel title="Settlement readiness">
              <Kv rows={[
                ["Documents on file", `${detail.documents.onFile} of ${detail.documents.required} required`],
                ["Document requirement", detail.documents.blocks.length ? "Settlement blocked by missing documents"
                  : detail.documents.warnings.length ? "Missing documents are warnings" : "Document requirements met"],
              ]} />
              <DocumentAlerts detail={detail} />
            </Panel>}
          </TabsContent>
          <TabsContent value="documents" className="space-y-3">
            <DocumentAlerts detail={detail} />
            <CooperativeDocuments endpoint={path + "/documents"} required={detail.rules} uploadTypes={detail.uploadTypes}
              storageReady={detail.storageReady} canEdit={Boolean(canEdit && !editing)}
              onChanged={() => refresh()}
              renderFileAction={file => <Button type="button" variant="ghost" size="sm"
                onClick={() => setEvidenceFile(file)} aria-label={`Use ${file.filename} as final-pay evidence`}>
                Verify final pay
              </Button>} />
          </TabsContent>
        </Tabs>
        <Panel title="Clearance history">
          <ol className="divide-y text-sm">
            {detail.history.map(entry => <li key={entry.id} className="space-y-1 py-2">
              <p className="font-medium">{historyLabels[entry.action] ?? entry.action}</p>
              <p className="text-xs text-muted-foreground">{entry.actorName ?? `User ${entry.actorId}`} · {entry.occurredAtManila}</p>
              {entry.reason && <p className="break-words text-xs">{entry.reason}</p>}
            </li>)}
          </ol>
        </Panel>
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
        refresh(`Final pay verified for ${result.reference}.`);
      }} onReload={resource.reload} />}
  </>;
}

function DocumentAlerts({ detail }: { detail: ClearanceDetail }) {
  const { warnings, blocks } = detail.documents;
  return <>
    {!!blocks.length && <p role="alert" className="mt-2 rounded-md border border-destructive/30 p-2.5 text-sm text-destructive">
      Required for settlement · {blocks.join(", ")}
    </p>}
    {!!warnings.length && <p className="mt-2 rounded-md border border-amber-300 p-2.5 text-sm text-amber-900 dark:text-amber-200">
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
  return <ConsoleDialog open title={`Cancel ${detail.reference}?`} description="The case and its files will remain available in clearance history."
    onOpenChange={open => { if (!open && !mutation.busy) onClose(); }}
    footer={<>
      <Button variant="outline" disabled={mutation.busy} onClick={onClose}>Back</Button>
      <Button type="submit" form="cancel-clearance" variant="destructive" disabled={mutation.busy || mutation.reloadRequired || !reason.trim()}>
        {mutation.busy ? "Cancelling…" : "Confirm cancellation"}
      </Button>
    </>}>
    <form id="cancel-clearance" className="space-y-3" onSubmit={cancel}>
      <SaveError error={mutation.error} />
      <label className="block space-y-1 text-sm">Cancellation reason
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
      <p className="text-sm">Evidence · <a href={`${path}/documents/${file.id}`} target="_blank" rel="noreferrer"
        className="break-all underline underline-offset-2">{file.filename}</a></p>
      <label className="block space-y-1 text-sm">Approved by
        <NativeSelect value={source} onChange={event => { setSource(event.target.value as "HR" | "PAYROLL"); setConfirmed(false); }}
          disabled={mutation.busy}><option value="HR">HR</option><option value="PAYROLL">Payroll</option></NativeSelect>
      </label>
      <label className="block space-y-1 text-sm">HR or payroll reference
        <Input value={reference} maxLength={120} required disabled={mutation.busy}
          onChange={event => { setReference(event.target.value); setConfirmed(false); }} />
      </label>
      <label className="block space-y-1 text-sm">Verified amount available (PHP)
        <Input value={amount} inputMode="decimal" maxLength={13} required disabled={mutation.busy}
          aria-invalid={Boolean(mutation.error?.fields.amount)} onChange={event => { setAmount(event.target.value); setConfirmed(false); }} />
        {mutation.error?.fields.amount && <span className="block text-xs text-destructive">{mutation.error.fields.amount}</span>}
      </label>
      <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
        <input className="mt-1" type="checkbox" checked={confirmed} disabled={mutation.busy} onChange={event => setConfirmed(event.target.checked)} />
        I checked the approved record and confirm the amount still available for withholding for this member.
      </label>
      {mutation.reloadRequired && <Button type="button" variant="outline" onClick={() => { onClose(); onReload(); }}>Reload case</Button>}
    </form>
  </ConsoleDialog>;
}
