"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewItems, type ReviewEvent } from "./annual-review";
import { submitLedger } from "./ledger-api";

export function AnnualReviewForm({ fiscalStart, record, canPrepare, canApprove, actor }: {
  fiscalStart: string; record?: ReviewEvent; canPrepare: boolean; canApprove: boolean; actor: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const signed = record?.action === "sign";
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
    } finally { setSaving(false); }
  }
  return <div className="space-y-3">
    {record && <p className="text-sm">{signed ? `Signed by user ${record.actor} on ${record.occurred_at.slice(0, 10)}` :
      `Draft prepared by user ${record.prepared_by}`}</p>}
    <form key={record?.revision ?? 0} onSubmit={submit} className="space-y-2">
      <fieldset disabled={signed || !canPrepare || saving} className="space-y-1">
        <legend className="font-medium">Review checklist</legend>
        {reviewItems.map((item, index) => <label key={item} className="flex items-center gap-2">
          <input type="checkbox" name={`check-${index}`} defaultChecked={record?.checks[index] ?? false} />{item}
        </label>)}
      </fieldset>
      {canPrepare && !signed && <Button type="submit" value="draft" disabled={saving}>Save checklist</Button>}
    </form>
    {canApprove && !signed && record?.checks.every(Boolean) && record.prepared_by !== actor &&
      <form onSubmit={submit}><Button type="submit" value="sign" disabled={saving}>Sign off saved checklist</Button></form>}
    {canApprove && signed && <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label>Reopen reason<Input name="reason" maxLength={500} required /></label>
      <Button type="submit" value="reopen" variant="outline" disabled={saving}>Reopen review</Button>
    </form>}
    {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
  </div>;
}
