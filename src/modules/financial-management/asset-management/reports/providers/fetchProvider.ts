import type { AssetReportsPayload } from "../types";

const API = "/api/fm/asset-management/reports";

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

export async function fetchAssetReports(year?: string): Promise<AssetReportsPayload> {
  const qs = year ? `?year=${encodeURIComponent(year)}` : "";
  const res = await fetch(`${API}${qs}`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as AssetReportsPayload;
}
