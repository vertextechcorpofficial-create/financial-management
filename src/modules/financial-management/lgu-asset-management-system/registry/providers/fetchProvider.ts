import type {
  AssetRegistryQuery,
  AssetRegistryResponse,
  BulkAssetInput,
  BulkCreateResult,
  LguAsset,
  LguAssetInput,
} from "../../types";

const API = "/api/fm/lgu-asset-management-system/registry";

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

function queryString(query: AssetRegistryQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.classId) params.set("classId", String(query.classId));
  if (query.officeId) params.set("officeId", String(query.officeId));
  if (query.recordStatus) params.set("recordStatus", query.recordStatus);
  if (query.sort) params.set("sort", query.sort);
  if (query.dir) params.set("dir", query.dir);
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 10));
  return params.toString();
}

export async function fetchRegistry(query: AssetRegistryQuery): Promise<AssetRegistryResponse> {
  const res = await fetch(API + "?" + queryString(query), { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as AssetRegistryResponse;
}

export async function createAssetRequest(input: LguAssetInput): Promise<LguAsset> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as LguAsset;
}

export async function createBulkRequest(input: BulkAssetInput): Promise<BulkCreateResult> {
  const res = await fetch(API + "/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as BulkCreateResult;
}

export async function updateAssetRequest(
  id: number,
  patch: Partial<LguAssetInput>
): Promise<LguAsset> {
  const res = await fetch(API + "/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as LguAsset;
}

export async function retireAssetRequest(id: number): Promise<LguAsset> {
  const res = await fetch(API + "?id=" + id, { method: "DELETE" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as LguAsset;
}
