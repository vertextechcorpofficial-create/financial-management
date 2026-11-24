import type { PeriodCloseData } from "../types";

const API = "/api/fm/asset-management/period-closing";

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

export async function fetchPeriodCloseData(): Promise<PeriodCloseData> {
  const res = await fetch(API, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as PeriodCloseData;
}

export async function closePeriod(targetYm: string, yearEndConfirmed?: boolean): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetYm, yearEndConfirmed }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}

export async function reopenPeriod(reason: string, targetYm?: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, targetYm }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}
