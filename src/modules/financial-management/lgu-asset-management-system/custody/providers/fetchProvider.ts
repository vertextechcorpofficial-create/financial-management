import type {
  AssetHistory,
  CustodyResponse,
  CustodyReturnInput,
  CustodyTransferInput,
} from "../../types";

const API = "/api/fm/lgu-asset-management-system/custody";

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
  return String(errors?.[0]?.message || d?.message || d?.error || "Request failed");
}

export async function fetchCustody(params: {
  q?: string;
  officeId?: number | null;
  onlyWithOfficer?: boolean;
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<CustodyResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.officeId) search.set("officeId", String(params.officeId));
  if (params.onlyWithOfficer) search.set("onlyWithOfficer", "1");
  if (params.page) search.set("page", String(params.page));
  if (params.sort) search.set("sort", params.sort);
  if (params.dir) search.set("dir", params.dir);
  const res = await fetch(API + "?" + search.toString(), { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as CustodyResponse;
}

export async function fetchAssetHistory(assetId: number): Promise<AssetHistory> {
  const res = await fetch(API + "/history?assetId=" + assetId, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as AssetHistory;
}

export async function issueAssetRequest(input: CustodyTransferInput): Promise<AssetHistory> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "issue", ...input }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as AssetHistory;
}

export async function transferAssetRequest(input: CustodyTransferInput): Promise<AssetHistory> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "transfer", ...input }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as AssetHistory;
}

export async function returnAssetRequest(input: CustodyReturnInput): Promise<AssetHistory> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "return", ...input }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as AssetHistory;
}
