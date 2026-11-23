"use client";

import { useState } from "react";
import {
  AlertTriangle, Banknote, Loader2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Kv, Panel } from "../console/components/ui";
import { fieldErrorsFrom, MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { peso } from "../members/format";
import type { WithdrawalDecision, WithdrawalDetail } from "../server/withdrawals";

type Request = WithdrawalDetail["request"];
type Review = Extract<NonNullable<WithdrawalDetail["review"]>, { fingerprint: string }>;
type Action = "release" | "reject";

const actionDescriptions: Record<Action, string> = {
  release: "Post the savings payout and journal entry.",
  reject: "Close the request with a recorded reason.",
};

export function WithdrawalDecisionPanel({
  endpoint,
  request,
  review,
  onChanged,
  onStale,
}: {
  endpoint: string;
  request: Request;
  review: Review;
  onChanged: (result: WithdrawalDecision) => void;
  onStale: () => void;
}) {
  const [action, setAction] = useState<Action>();
  const [confirmed, setConfirmed] = useState(false);
  const [payoutReference, setPayoutReference] = useState("");
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState(() => newRequestKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const canSubmit = !saving && (action === "release"
    ? confirmed && (request.releaseMethod !== "PAYROLL" || Boolean(payoutReference.trim()))
    : action === "reject" ? Boolean(reason.trim()) : false);

  function edit() {
    setRequestKey(newRequestKey());
    setError("");
    setFields({});
  }

  function choose(next: Action) {
    setAction(next);
    setConfirmed(false);
    setPayoutReference("");
    setReason("");
    edit();
  }

  async function submit() {
    if (!action || !canSubmit) return;
    setSaving(true);
    setError("");
    setFields({});
    try {
      const body = action === "release"
        ? { action, requestKey, fingerprint: review.fingerprint, confirmed: true, payoutReference: payoutReference.trim() }
        : { action, requestKey, reason: reason.trim() };
      const result = await memberFetch<WithdrawalDecision>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onChanged(result);
    } catch (cause) {
      setFields(fieldErrorsFrom(cause));
      setError(cause instanceof Error ? cause.message : "Unable to save the withdrawal decision.");
      if (cause instanceof MemberApiError && cause.payload?.code === "STALE_WITHDRAWAL") {
        setAction(undefined);
        onStale();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Withdrawal review" description="The request, savings balance, and policy are checked again when you confirm.">
      <div className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {!action && (
          <div className="grid gap-2 sm:grid-cols-2">
            {(["release", "reject"] as const).map(value => {
              const Icon = value === "release" ? Banknote : XCircle;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => choose(value)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                    value === "reject"
                      ? "hover:border-rose-300 dark:hover:border-rose-900"
                      : "hover:border-emerald-300 dark:hover:border-emerald-900",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4" /> {value === "release" ? "Release" : "Reject"}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{actionDescriptions[value]}</span>
                </button>
              );
            })}
          </div>
        )}

        {action && (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-3 text-sm">
            <h3 className="font-semibold">{action === "release" ? "Release withdrawal" : "Reject withdrawal"}</h3>
            {action === "release" ? <>
              <Kv rows={[
                ["Payout", peso(request.amount)],
                ["Savings after release", peso(review.projectedSavings)],
              ]} />
              {request.releaseMethod === "PAYROLL" && (
                <label className="block space-y-1">
                  <span>Bank transfer reference</span>
                  <Input
                    value={payoutReference}
                    maxLength={120}
                    disabled={saving}
                    required
                    aria-invalid={Boolean(fields.payoutReference)}
                    onChange={event => { setPayoutReference(event.target.value); edit(); }}
                  />
                </label>
              )}
              {fields.payoutReference && <p className="text-xs text-destructive">{fields.payoutReference}</p>}
              <label className="flex items-start gap-2 rounded-lg border bg-background/70 p-2.5">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={saving}
                  onChange={event => { setConfirmed(event.target.checked); edit(); }}
                  className="mt-1"
                />
                {request.releaseMethod === "PAYROLL"
                  ? "I confirm the bank transfer to the member’s payroll account."
                  : "I confirm the cash was handed to the member."}
              </label>
            </> : <>
              <label className="block space-y-1">
                <span>Rejection reason</span>
                <Textarea
                  value={reason}
                  maxLength={500}
                  disabled={saving}
                  required
                  aria-invalid={Boolean(fields.reason)}
                  onChange={event => { setReason(event.target.value); edit(); }}
                />
              </label>
              {fields.reason && <p className="text-xs text-destructive">{fields.reason}</p>}
            </>}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={action === "reject" ? "destructive" : "default"}
                disabled={!canSubmit}
                onClick={() => void submit()}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {saving ? "Saving..." : action === "release" ? "Confirm release" : "Confirm rejection"}
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => { setAction(undefined); setError(""); }}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
