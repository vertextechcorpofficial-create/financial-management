import type { AssetSummaryData } from "../types";

const API = "/api/fm/asset-management/asset-summary";

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

export async function fetchAssetSummary(groupBy: string = "item_name"): Promise<AssetSummaryData> {
  const res = await fetch(`${API}?groupBy=${encodeURIComponent(groupBy)}`, {
    cache: "no-store",
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as AssetSummaryData;
}
