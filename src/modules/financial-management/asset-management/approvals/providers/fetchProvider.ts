import type { ApprovalsData } from "../types";

const API = "/api/fm/asset-management/approvals";

async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function errMsg(data: unknown): string {
  if (!data) return "Request failed";
  if (typeof data === "string") return data;
  const d = data as Record<string, unknown>;
  const errors = d?.errors as Array<Record<string, unknown>> | undefined;
  const msg = errors?.[0]?.message || d?.message || d?.error || "Request failed";
  return String(msg);
}

export async function fetchApprovals(): Promise<ApprovalsData> {
  const res = await fetch(API, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as ApprovalsData;
}

export async function approveEvent(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`${API}/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}

export async function rejectEvent(id: number, reason: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API}/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}
