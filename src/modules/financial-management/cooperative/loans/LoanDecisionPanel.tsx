"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  AlertTriangle, CheckCircle2, HandCoins, Loader2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Kv, Panel } from "../console/components/ui";
import { MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, peso } from "../members/format";
import type { LoanDecisionPreview, LoanDecisionResult } from "../server/loan-decisions";
import { AssessmentCheck } from "./components";
import { amountToCents } from "./loan-schedule";

type Action = LoanDecisionPreview["actions"][number];
const actions: Record<Action, string> = {
  APPROVE: "Approve", REJECT: "Reject", APPROVE_AND_RELEASE: "Approve and release", RELEASE: "Release",
};
const actionDescriptions: Record<Action, string> = {
  APPROVE: "Move the signed loan to For release.",
  REJECT: "Record a rejection reason and close the request.",
  APPROVE_AND_RELEASE: "Approve and post the payout in one step.",
  RELEASE: "Post the payout for this approved loan.",
};
const actionIcons: Record<Action, ComponentType<{ className?: string }>> = {
  APPROVE: CheckCircle2,
  REJECT: XCircle,
  APPROVE_AND_RELEASE: HandCoins,
  RELEASE: HandCoins,
};
const initialForm = {
  reason: "", payoutConfirmed: false, payoutReference: "", feeChannel: "" as "" | "CASH" | "BANK", feeConfirmed: false, feeReference: "",
};

export function LoanReleaseDetails({ release }: { release: LoanDecisionResult }) {
  return (
    <Panel title="Payout">
      <Kv rows={[
        ["Released", date(release.date)], ["Journal", release.journalNo ?? "—"],
        ...(release.payoutReference ? [["Bank transfer reference", release.payoutReference] as [string, string]] : []),
        ...(release.orNo ? [["Official receipt", release.orNo] as [string, string]] : []),
        ...(release.feeReference ? [["Fee transfer reference", release.feeReference] as [string, string]] : []),
      ]} />
    </Panel>
  );
}

export function LoanDecisionPanel({ endpoint, approveAndRelease, onChanged, initialPreview, initialPreviewLoading }: {
  endpoint: string;
  approveAndRelease?: boolean;
  onChanged: (result: LoanDecisionResult) => void;
  initialPreview?: LoanDecisionPreview;
  initialPreviewLoading?: boolean;
}) {
  const [preview, setPreview] = useState<LoanDecisionPreview | undefined>(initialPreview);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [action, setAction] = useState<Action | undefined>(approveAndRelease ? "APPROVE_AND_RELEASE" : undefined);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const key = useRef<string | null>(null);
  const pending = useRef(false);
  const retried = useRef(false);

  const loadPreview = useCallback((signal?: AbortSignal) => memberFetch<LoanDecisionPreview>(endpoint, { signal }), [endpoint]);

  useEffect(() => {
    if (attempt === 0 && initialPreview) {
      setPreview(initialPreview);
      return;
    }
    if (attempt === 0 && initialPreviewLoading) return;
    const controller = new AbortController();
    loadPreview(controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setPreview(result);
          if (!result.canRelease) setAction(current => current === "APPROVE_AND_RELEASE" || current === "RELEASE" ? undefined : current);
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the loan checks.");
      });
    return () => controller.abort();
  }, [loadPreview, attempt, initialPreview, initialPreviewLoading]);

  function refresh() {
    setPreview(undefined);
    setAction(undefined);
    setForm(initialForm);
    setNote("");
    key.current = null;
    retried.current = false;
    setAttempt(value => value + 1);
  }

  const release = action === "APPROVE_AND_RELEASE" || action === "RELEASE";
  const hasFee = !!preview && amountToCents(preview.fee) > 0n;
  const bankTransfer = !!preview && preview.releaseMethod !== "CASH";

  function canSubmitFor(target: LoanDecisionPreview | undefined, currentAction: Action | undefined, values: typeof initialForm) {
    if (!target || !currentAction) return false;
    const targetRelease = currentAction === "APPROVE_AND_RELEASE" || currentAction === "RELEASE";
    const targetFee = amountToCents(target.fee) > 0n;
    const targetBank = target.releaseMethod !== "CASH";
    if (currentAction === "APPROVE") return target.canApprove;
    if (currentAction === "REJECT") return Boolean(values.reason.trim());
    return target.canRelease && targetRelease && values.payoutConfirmed &&
      (!targetBank || Boolean(values.payoutReference.trim())) &&
      (!targetFee || (values.feeConfirmed && Boolean(values.feeChannel) &&
        (values.feeChannel !== "BANK" || Boolean(values.feeReference.trim()))));
  }

  const canSubmit = !saving && canSubmitFor(preview, action, form);

  function update<K extends keyof typeof initialForm>(field: K, value: typeof initialForm[K]) {
    key.current = null;
    retried.current = false;
    setForm(previous => ({ ...previous, [field]: value }));
  }

  function choose(next: Action) {
    setAction(next);
    setForm(initialForm);
    setError("");
    setNote("");
    key.current = null;
    retried.current = false;
  }

  async function postDecision(target: LoanDecisionPreview, currentAction: Action, values: typeof initialForm) {
    key.current ??= newRequestKey();
    return memberFetch<LoanDecisionResult>(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values, feeChannel: values.feeChannel || undefined, action: currentAction, requestKey: key.current,
        revision: target.revision, fingerprint: target.fingerprint,
      }),
    });
  }

  async function submit() {
    if (!action || !preview || !canSubmit || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setNote("");
    try {
      const result = await postDecision(preview, action, form);
      refresh();
      onChanged(result);
    } catch (cause) {
      const code = cause instanceof MemberApiError ? cause.payload?.code : undefined;
      if (code === "STALE_LOAN_REVIEW" && !retried.current) {
        retried.current = true;
        setNote("Details were refreshed. Confirming again...");
        try {
          const fresh = await loadPreview();
          setPreview(fresh);
          if (fresh.actions.includes(action) && canSubmitFor(fresh, action, form)) {
            const result = await postDecision(fresh, action, form);
            refresh();
            onChanged(result);
            return;
          }
          if (!fresh.actions.includes(action)) setAction(undefined);
          setError("The loan changed. Review the updated checks and confirm again.");
        } catch (retryCause) {
          setError(retryCause instanceof Error ? retryCause.message : "Could not confirm the loan action. Try again.");
        } finally {
          setNote("");
        }
        return;
      }
      setError(cause instanceof Error ? cause.message : "Could not confirm the loan action. Try again.");
      if (code === "LOAN_ACTION_UNAVAILABLE" || code === "LOAN_REVIEW_BLOCKED") {
        // Keep the chosen action and entered details; only the checks need to be refreshed.
        const fresh = await loadPreview().catch(() => null);
        if (fresh) {
          setPreview(fresh);
          if (!fresh.actions.includes(action)) setAction(undefined);
        }
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Panel title="Loan review" description="Checks are recalculated from the current loan state.">
      <div className="space-y-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {note && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {note}
          </p>
        )}
        {!preview && (error
          ? <Button size="sm" variant="outline" onClick={() => { setError(""); refresh(); }}>Reload review</Button>
          : <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking current loan details...
          </p>)}
        {preview && !preview.actions.length && <p className="text-sm text-muted-foreground">This loan already has a recorded decision.</p>}
        {preview?.actions.length ? <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {preview.checks.map(({ key, ...check }) => <AssessmentCheck key={key} {...check} />)}
          </ul>
          {preview.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>Document warning · {preview.warnings.join(", ")} missing.</p>
            </div>
          )}
          {preview.releaseIssue && (
            <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">{preview.releaseIssue}</p>
          )}
          {!action && (
            <div className="grid gap-2 sm:grid-cols-2">
              {preview.actions.map(value => {
                const Icon = actionIcons[value];
                const disabled = value === "APPROVE" ? !preview.canApprove : value !== "REJECT" && !preview.canRelease;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    onClick={() => choose(value)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50",
                      value === "REJECT"
                        ? "hover:border-rose-300 dark:hover:border-rose-900"
                        : "hover:border-emerald-300 dark:hover:border-emerald-900",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="size-4" /> {actions[value]}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{actionDescriptions[value]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {action && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-3 text-sm">
              <h3 className="font-semibold">{actions[action]}</h3>
              {action === "REJECT" && (
                <label className="block space-y-1">
                  <span>Rejection reason</span>
                  <Textarea value={form.reason} maxLength={500} disabled={saving} required onChange={event => update("reason", event.target.value)} />
                </label>
              )}
              {action === "APPROVE" && <p className="text-muted-foreground">Approve the signed loan and move it to For release.</p>}
              {release && <>
                <Kv rows={[
                  ["Payout", peso(preview.principal)], ["Release date", date(preview.date)], ["First due date", date(preview.firstDueDate)],
                  ...(hasFee ? [["Processing fee collected separately", peso(preview.fee)] as [string, string]] : []),
                ]} />
                {bankTransfer && (
                  <label className="block space-y-1">
                    <span>Bank transfer reference</span>
                    <Input value={form.payoutReference} maxLength={120} disabled={saving} required onChange={event => update("payoutReference", event.target.value)} />
                  </label>
                )}
                <label className="flex items-start gap-2 rounded-lg border bg-background/70 p-2.5">
                  <input type="checkbox" checked={form.payoutConfirmed} disabled={saving} onChange={event => update("payoutConfirmed", event.target.checked)} className="mt-1" />
                  {preview.releaseMethod === "VENDOR" ? "I confirm the bank payment to the vendor and release of the item."
                    : bankTransfer ? "I confirm the transfer to the member’s payroll bank account."
                      : "I confirm the cash was handed to the member."}
                </label>
                {hasFee && <>
                  <label className="block space-y-1">
                    <span>Processing fee collection method</span>
                    <NativeSelect className="w-full" value={form.feeChannel} disabled={saving}
                      onChange={event => update("feeChannel", event.target.value as typeof form.feeChannel)}>
                      <option value="">Select collection method</option>
                      {preview.feeChannels.map(channel => <option key={channel} value={channel}>{channel === "CASH" ? "Cash at the office" : "Bank transfer"}</option>)}
                    </NativeSelect>
                  </label>
                  {form.feeChannel === "BANK" && (
                    <label className="block space-y-1">
                      <span>Processing fee transfer reference</span>
                      <Input value={form.feeReference} maxLength={120} disabled={saving} required onChange={event => update("feeReference", event.target.value)} />
                    </label>
                  )}
                  <label className="flex items-start gap-2 rounded-lg border bg-background/70 p-2.5">
                    <input type="checkbox" checked={form.feeConfirmed} disabled={saving} onChange={event => update("feeConfirmed", event.target.checked)} className="mt-1" />
                    I confirm the {peso(preview.fee)} processing fee was collected.
                  </label>
                </>}
              </>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {saving ? "Saving..." : `Confirm ${action === "APPROVE" ? "approval" : action === "REJECT" ? "rejection" : "release"}`}
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => { setAction(undefined); setError(""); }}>Cancel</Button>
              </div>
            </div>
          )}
        </> : null}
      </div>
    </Panel>
  );
}
