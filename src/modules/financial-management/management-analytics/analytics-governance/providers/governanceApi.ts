import type { GovernancePayload } from "../types";

const BASE = "/api/fm/management-analytics/governance";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `The request failed (${response.status}).`;
  } catch {
    return `The request failed (${response.status}).`;
  }
}

export async function fetchGovernance(): Promise<GovernancePayload> {
  const response = await fetch(BASE, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { success: boolean; data: GovernancePayload };
  return body.data;
}

export async function createAssignment(input: { userId: number; roleId: number; companyId: number }): Promise<void> {
  const response = await fetch(`${BASE}/assignment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function deleteAssignment(id: number): Promise<void> {
  const response = await fetch(`${BASE}/assignment/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}

export async function savePolicy(key: string, value: string): Promise<void> {
  const response = await fetch(`${BASE}/policy`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function raiseChange(input: { summary: string; kpiId: number | null }): Promise<void> {
  const response = await fetch(`${BASE}/change`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function decideChange(id: number, status: "APPROVED" | "REJECTED", note: string): Promise<void> {
  const response = await fetch(`${BASE}/change/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note }),
  });
  if (!response.ok) throw new Error(await readError(response));
}
