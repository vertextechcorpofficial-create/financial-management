import type { EmployeeClearanceData } from "../types";

const API = "/api/fm/asset-management/employee-clearance";

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

export async function fetchEmployeeClearances(): Promise<EmployeeClearanceData> {
  const res = await fetch(API, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as EmployeeClearanceData;
}

export async function startClearance(employeeId: number, lastDay?: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId, lastDay }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}

export async function processClearanceAction(payload: {
  employeeId: number;
  assetId: number;
  action: "RETURNED_TO_STOCK" | "REASSIGNED" | "LOST";
  conditionId?: number;
  toDepartmentId?: number;
  toUserId?: number;
  toLocation?: string;
  reason?: string;
}): Promise<{ success: boolean }> {
  const res = await fetch(`${API}/process-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}
