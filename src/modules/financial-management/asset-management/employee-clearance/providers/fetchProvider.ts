import type { ClearanceActionCode, EmployeeClearanceData } from "../types";

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

export async function startClearance(payload: {
  employeeId: number;
  lastDay: string;
  reason: string;
}): Promise<{ success: boolean; clearance_request_id?: number | null }> {
  const res = await fetch(`${API}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as { success: boolean; clearance_request_id?: number | null };
}

export async function processClearanceAction(payload: {
  employeeId: number;
  clearanceRequestId?: number | null;
  assetId: number;
  action: ClearanceActionCode;
  conditionId?: number | null;
  conditionName?: string;
  toDepartmentId?: number | null;
  toUserId?: number | null;
  toLocation?: string;
  amountCharged?: number;
  reason?: string;
}): Promise<{
  success: boolean;
  transfer_id?: number | null;
  event_id?: number | null;
  clearance_line_id?: number | null;
}> {
  const res = await fetch(`${API}/process-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as {
    success: boolean;
    transfer_id?: number | null;
    event_id?: number | null;
    clearance_line_id?: number | null;
  };
}

export async function issueClearance(payload: {
  employeeId: number;
  clearanceRequestId?: number | null;
}): Promise<{ success: boolean }> {
  const res = await fetch(`${API}/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as { success: boolean };
}
