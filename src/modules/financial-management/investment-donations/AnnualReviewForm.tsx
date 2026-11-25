"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewItems, type ReviewEvent } from "./annual-review";
import { submitLedger } from "./ledger-api";

export function AnnualReviewForm({ fiscalStart, record, canPrepare, canApprove, actor, history = [] }: {
  fiscalStart: string; record?: ReviewEvent; canPrepare: boolean; canApprove: boolean; actor: number;
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
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await submitLedger("annual-review", { type: intent, fiscalStart, revision: record?.revision ?? 0,
        checks: intent === "draft" ? reviewItems.map((_, index) => data.has(`check-${index}`)) : undefined,
        reason: intent === "reopen" ? data.get("reason") : undefined });
      setFeedback({ ok: result.ok, text: result.ok ? "Annual review updated." : result.message });
      if (result.ok) router.refresh();
    } catch { setFeedback({ ok: false, text: "Review save could not be confirmed. Refresh before retrying." }); }
    finally { setSaving(false); }
  }
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Review the ledger evidence for all five items, save the checklist, then have a different authorized approver sign the saved revision. Sign-off is recorded under the authenticated user.</p>
    {record && <p className="text-sm">{signed ? `Signed by user ${record.actor} on ${record.occurred_at.slice(0, 10)}` :
      `Draft prepared by user ${record.prepared_by}`} · Revision {record.revision}</p>}
    <form key={record?.revision ?? 0} onSubmit={submit} className="space-y-2">
      <fieldset disabled={signed || !canPrepare || saving} className="space-y-1">
        <legend className="font-medium">Review checklist</legend>
        {reviewItems.map((item, index) => <label key={item} className="flex items-center gap-2">
          <input type="checkbox" name={`check-${index}`} defaultChecked={record?.checks[index] ?? false} />{item}
        </label>)}
      </fieldset>
      {!signed && <Button type="submit" value="draft" disabled={saving || !canPrepare} title={!canPrepare ? "Transactional posting service or prepare permission is unavailable." : undefined}>Save checklist</Button>}
    </form>
    {!signed && complete && record?.prepared_by !== actor &&
      <form onSubmit={submit}><Button type="submit" value="sign" disabled={saving || !canApprove} title={!canApprove ? "Transactional posting service or approval permission is unavailable." : undefined}>Sign off saved checklist</Button></form>}
    {!signed && complete && record?.prepared_by !== actor && !canApprove && <p className="text-sm text-muted-foreground">Sign-off is locked until the transactional posting service and annual-review approval permission are available.</p>}
    {!signed && !complete && <p className="text-sm text-muted-foreground">Save all five reviewed items to enable sign-off.</p>}
    {canApprove && !signed && complete && record?.prepared_by === actor && <p className="text-sm text-muted-foreground">A different authorized approver must sign this checklist.</p>}
    {canApprove && signed && <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label>Reopen reason<Input name="reason" maxLength={500} required /></label>
      <Button type="submit" value="reopen" variant="outline" disabled={saving}>Reopen review</Button>
    </form>}
    {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
    {history.length > 0 && <details><summary className="cursor-pointer font-medium">Review history</summary>
      <div className="overflow-x-auto"><table className="mt-2 w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Revision</th><th className="p-2">Action</th><th className="p-2">User</th><th className="p-2">When</th><th className="p-2">Reason</th></tr></thead>
        <tbody>{history.map(row => <tr key={`${row.fiscal_start}:${row.revision}`} className="border-b"><td className="p-2">{row.revision}</td><td className="p-2">{row.action}</td><td className="p-2">{row.actor}</td><td className="p-2 whitespace-nowrap">{row.occurred_at.slice(0, 19).replace("T", " ")}</td><td className="p-2">{row.reason ?? ""}</td></tr>)}</tbody></table></div>
    </details>}
  </div>;
}
