import type {
  CountLineRow,
  CountReport,
  CountSessionDetail,
  CountSessionInput,
  CountSessionsResponse,
} from "../../types";

const API = "/api/fm/lgu-asset-management-system/physical-count";

async function safeJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function errMsg(data: unknown): string {
  if (!data) return "Request failed";
  if (typeof data === "string") return data;
  const d = data as Record<string, unknown>;
  const errors = d?.errors as Array<Record<string, unknown>> | undefined;
  return String(errors?.[0]?.message || d?.message || "Request failed");
}

export async function fetchCountSessions(): Promise<CountSessionsResponse> {
  const res = await fetch(API, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as CountSessionsResponse;
}

export async function createCountSessionRequest(input: CountSessionInput): Promise<CountSessionDetail> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as CountSessionDetail;
}

export async function fetchCountSessionRequest(id: number): Promise<CountSessionDetail> {
  const res = await fetch(API + "/" + id, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as CountSessionDetail;
}

export async function resolveLineRequest(
  id: number,
  body: { lineId: number; resolution: "missing" | "moved"; toOfficeId?: number | null; toOfficer?: string | null; locationSeen?: string | null; remarks?: string | null }
): Promise<CountSessionDetail> {
  const res = await fetch(API + "/" + id + "/resolution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as CountSessionDetail;
}

export async function sessionActionRequest(
  id: number,
  body: { action: "lock" | "reopen" | "submit"; reason?: string; submittedTo?: string }
): Promise<CountSessionDetail> {
  const res = await fetch(API + "/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as CountSessionDetail;
}

export async function fetchReportRequest(id: number, form: "rpcppe" | "rpcsp"): Promise<CountReport> {
  const res = await fetch(API + "/" + id + "/report?form=" + form, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as CountReport;
}

export async function markCountLineRequest(
  id: number,
  line: { lineId: number; found: boolean; conditionId?: number | null; locationSeen?: string | null; remarks?: string | null }
): Promise<CountSessionDetail> {
  const res = await fetch(API + "/" + id + "/lines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(line),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as CountSessionDetail;
}

export type { CountLineRow };
