"use client";

import { useState } from "react";
import { policySaveSchema, type PolicySave, type PolicyState } from "./policy-types";
import { policyFieldLabel } from "./policy-labels";

export const policiesApi = "/api/fm/cooperative/policies";

export class PolicyRequestError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

export async function policyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new PolicyRequestError(data?.message || "Policies are temporarily unavailable. Please try again.", data?.code);
  }
  return data;
}

export type PolicyContext = {
  state: PolicyState;
  refresh: () => Promise<PolicyState>;
};
type SaveInput = PolicySave extends infer C ? C extends PolicySave ? Omit<C, "expectedRevision"> : never : never;

export function usePolicyEditor(context: PolicyContext, current: (state: PolicyState) => object | null) {
  const [expectedRevision, setExpectedRevision] = useState(context.state.revision);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const [review, setReview] = useState<{ revision: number; details: object | null }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(change: SaveInput) {
    if (busy || stale) return false;
    setError("");
    setMessage("");
    const parsed = policySaveSchema.safeParse({ ...change, expectedRevision });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // Pass the field with its error so the user can find it in longer forms.
      const field = issue.path[1] ? String(issue.path[1]) : "";
      setError(field ? `${policyFieldLabel(field)}. ${issue.message}` : issue.message);
      return false;
    }
    setBusy(true);
    try {
      const result = await policyRequest<{ revision: number; saved: boolean }>(policiesApi, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      setExpectedRevision(result.revision);
      setMessage(result.saved ? "Changes saved." : "Your settings are up to date.");
      if (result.saved) await context.refresh().catch(() => undefined);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "The save could not be confirmed.");
      setStale(error instanceof PolicyRequestError && error.code === "STALE_POLICY");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function reviewLatest() {
    setBusy(true);
    try {
      const latest = await context.refresh();
      setReview({ revision: latest.revision, details: current(latest) });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load the latest policy.");
    } finally {
      setBusy(false);
    }
  }

  function keepDraft() {
    if (!review) return;
    setExpectedRevision(review.revision);
    setStale(false);
    setReview(undefined);
    setError("");
  }

  return { save, busy, error, stale, review, message, reviewLatest, keepDraft };
}
