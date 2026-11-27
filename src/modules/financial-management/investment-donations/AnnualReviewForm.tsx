"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, RefreshCcw, Save } from "lucide-react";
import { reviewItems, type ReviewEvent } from "./annual-review";
import { submitLedger } from "./ledger-api";
import { mutationError, mutationToast } from "./mutation-toast";

export function AnnualReviewForm({ fiscalStart, record, mode, canPrepare, canApprove, actor, actorName = "", history = [] }: {
  mode: "prepare" | "approve";
  fiscalStart: string; record?: ReviewEvent; canPrepare: boolean; canApprove: boolean; actor: number; actorName?: string;
  history?: readonly ReviewEvent[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const signed = record?.action === "sign";
  const complete = record?.checks.length === reviewItems.length && record.checks.every(Boolean);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "draft";
    if (intent === "draft" ? mode !== "prepare" || !canPrepare : mode !== "approve" || !canApprove) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await submitLedger("annual-review", { type: intent, fiscalStart, revision: record?.revision ?? 0,
        checks: intent === "draft" ? reviewItems.map((_, index) => data.has(`check-${index}`)) : undefined,
        reason: intent === "reopen" ? data.get("reason") : undefined });
      mutationToast(result.ok, result.ok ? "Annual review updated." : result.message); setFeedback(undefined);
      if (result.ok) router.refresh();
    } catch { mutationError("Review save could not be confirmed. Refresh before retrying."); setFeedback(undefined); }
    finally { setSaving(false); }
  }
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{mode === "prepare" ? "Review the ledger evidence for all five items and save the checklist. Sign-off is available in the annual-review approver workspace." : "Review the saved checklist and evidence, then sign off or reopen the review. A different authenticated actor must approve the checklist after the financial year has ended."} Actions are recorded under the authenticated user.</p>
    {record && <p className="text-sm">{signed ? `Signed by ${Number(record.actor) === actor && actorName ? `${actorName} (you)` : "Finance team member"} on ${record.occurred_at.slice(0, 10)}` :
      "Checklist draft saved"} · Revision {record.revision}</p>}
    {record?.stale && <p role="alert" className="text-sm text-destructive">Stale review: ledger evidence has changed or its saved fingerprint is missing. {signed ? "Reopen and prepare a fresh checklist; the prior signature does not attest to current evidence." : "Save a fresh checklist before approval."}</p>}
    <form key={record?.revision ?? 0} onSubmit={submit} className="space-y-2">
      <fieldset disabled={mode !== "prepare" || signed || !canPrepare || saving} className="space-y-1">
        <legend className="font-medium">Review checklist</legend>
        {reviewItems.map((item, index) => <label key={item} className="flex items-center gap-2">
          <input type="checkbox" name={`check-${index}`} defaultChecked={record?.checks[index] ?? false} />{item}
        </label>)}
      </fieldset>
       {mode === "prepare" && !signed && <Button type="submit" value="draft" disabled={saving || !canPrepare} title={!canPrepare ? "Transactional posting service or prepare permission is unavailable." : undefined}><Save aria-hidden="true" /> Save checklist</Button>}
    </form>
    {mode === "approve" && !signed && <form onSubmit={submit}><Button type="submit" value="sign" disabled={saving || !canApprove || !complete || !record || record.stale || Number(record.prepared_by) === actor}
      title={!record || !complete ? "Save all five review items in the preparer workspace first." : !canApprove ? "Transactional posting service or approval permission is unavailable." : undefined}><Check aria-hidden="true" /> Sign off saved checklist</Button></form>}
    {!signed && !complete && <p className="text-sm text-muted-foreground">All five reviewed items must be saved in the preparer workspace before sign-off.</p>}
    {mode === "approve" && canApprove && signed && <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label>Reopen reason<Input name="reason" maxLength={500} required /></label>
      <Button type="submit" value="reopen" variant="outline" disabled={saving}><RefreshCcw aria-hidden="true" /> Reopen review</Button>
    </form>}
    {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
    {history.length > 0 && <details><summary className="cursor-pointer font-medium">Review history</summary>
      <div className="overflow-x-auto"><table className="mt-2 w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Revision</th><th className="p-2">Action</th><th className="p-2">User</th><th className="p-2">When</th><th className="p-2">Reason</th></tr></thead>
         <tbody>{history.map(row => <tr key={`${row.fiscal_start}:${row.revision}`} className="border-b"><td className="p-2">{row.revision}</td><td className="p-2">{row.action === "sign" ? "Approved" : row.action === "reopen" ? "Reopened" : "Draft saved"}</td><td className="p-2">{Number(row.actor) === actor && actorName ? `${actorName} (you)` : "Finance team member"}</td><td className="p-2 whitespace-nowrap">{row.occurred_at.slice(0, 10)}</td><td className="p-2">{row.reason ?? "—"}</td></tr>)}</tbody></table></div>
    </details>}
  </div>;
}
