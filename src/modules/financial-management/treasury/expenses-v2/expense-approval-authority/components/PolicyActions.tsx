"use client";

import { useState } from "react";
import { Copy, FilePlus2, Send, ShieldCheck, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AuthorityPolicy } from "../types";
import type { WorkspaceCommand } from "../domain/workspace";
import { Field, Notice, ReferencePicker, utcInput, fromUtcInput } from "./shared";

type Action = "create" | "clone" | "submit" | "publish" | "revoke";
export function PolicyActions({ policy, busy, command, permissions }: { policy: AuthorityPolicy | null; busy: boolean; command: (value: WorkspaceCommand) => Promise<void>; permissions: { create: boolean; edit: boolean; submit: boolean; publish: boolean; revoke: boolean } }) {
  const [action, setAction] = useState<Action | null>(null), [name, setName] = useState("Expense authority policy"), [companyId, setCompanyId] = useState<number | null>(null);
  const [reason, setReason] = useState(""), [reference, setReference] = useState(""), [authorized, setAuthorized] = useState(false), [error, setError] = useState("");
  const [start, setStart] = useState(utcInput(new Date(Date.now() + 600_000))), [end, setEnd] = useState("");
  const open = (value: Action) => { setAction(value); setError(""); setReason(""); setAuthorized(false); setReference(""); setCompanyId(value === "clone" ? policy?.companyId || null : null); };
  return <><div className="flex flex-wrap gap-2">{permissions.create && <Button size="sm" onClick={() => open("create")} disabled={busy}><FilePlus2 />New draft</Button>}
    {policy && permissions.create && <Button size="sm" variant="outline" onClick={() => open("clone")} disabled={busy}><Copy />Clone version</Button>}
    {policy?.status === "DRAFT" && permissions.submit && <Button size="sm" variant="outline" onClick={() => open("submit")} disabled={busy}><Send />Submit for ratification</Button>}
    {policy?.status === "PENDING_RATIFICATION" && permissions.publish && <Button size="sm" variant="outline" onClick={() => open("publish")} disabled={busy}><ShieldCheck />Publish signed policy</Button>}
    {policy?.status === "PUBLISHED" && permissions.revoke && <Button size="sm" variant="ghost" onClick={() => open("revoke")} disabled={busy}><Ban />Revoke</Button>}
  </div><Dialog open={action !== null} onOpenChange={open => { if (!open && !busy) setAction(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader>
    <DialogTitle>{{ create: "Create policy draft", clone: "Clone policy into a new draft", submit: "Submit for ratification", publish: "Publish a signed policy", revoke: "Revoke policy" }[action || "create"]}</DialogTitle>
    <DialogDescription>Changes are persisted with an audit reason. Existing expense approval routing remains unchanged.</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); setError("");
      try {
        let value: WorkspaceCommand;
        if (action === "create" || action === "clone") {
          if (!companyId) throw new Error("Select a company.");
          value = { action: "CREATE_POLICY", companyId, name, reason, ...(action === "clone" && policy ? { sourceId: policy.id } : {}) };
        } else if (action === "publish" && policy) value = { action: "PUBLISH_POLICY", id: policy.id, effectiveFrom: fromUtcInput(start), effectiveTo: end ? fromUtcInput(end) : null, signedReference: reference, authorized: true, reason };
        else if (policy) value = { action: action === "submit" ? "SUBMIT_POLICY" : "REVOKE_POLICY", id: policy.id, reason };
        else throw new Error("Select a policy first.");
        await command(value); setAction(null);
      } catch (err) { setError((err as Error).message); }
    }}>
      {(action === "create" || action === "clone") && <><Field label="Policy name"><Input required minLength={3} maxLength={150} value={name} onChange={e => setName(e.target.value)} /></Field>
        {action === "clone" ? <p className="text-sm">Company #{companyId} · rules copied from v{policy?.version}. The new version starts as a draft.</p> : <ReferencePicker label="Company" kind="companies" value={companyId} onChange={setCompanyId} required />}</>}
      {action === "publish" && <><Notice>Publish only with management authorization and a signed policy reference. This records ratification; it does not enable enforcement in existing Expense Approval V2.</Notice>
        <Field label="Signed policy document reference" hint="Use a controlled document ID or URL. This reference is recorded, not a cryptographic signature verification."><Input value={reference} required minLength={5} maxLength={1000} onChange={e => setReference(e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Effective from (UTC)"><Input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="Effective until (UTC, optional)"><Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></Field></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" required checked={authorized} onChange={e => setAuthorized(e.target.checked)} />I am authorized by management to record this signed policy and its effective dates.</label></>}
      {action === "submit" && <Notice>Save all matrix edits first. Submission freezes this draft for ratification; later changes require a new cloned draft.</Notice>}
      {action === "revoke" && <Notice danger>Revocation takes effect for future evaluations. Historical snapshots are retained; no existing expense or disbursement is changed.</Notice>}
      <Field label="Audit reason"><Textarea value={reason} minLength={5} maxLength={2000} required onChange={e => setReason(e.target.value)} /></Field>
      {error && <Notice danger>{error}</Notice>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setAction(null)}>Cancel</Button>
        <Button disabled={busy || (action === "publish" && !authorized)} variant={action === "revoke" ? "destructive" : "default"}>{busy ? "Saving…" : "Confirm and save"}</Button></div>
    </form></DialogContent></Dialog></>;
}
