import type {
  PhysicalCountOverviewData,
  CountSession,
  CountItemResult,
  StartCountSessionPayload,
} from "../types";

const API = "/api/fm/asset-management/physical-count";

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
  const msg =
    errors?.[0]?.message || d?.message || d?.error || "Request failed";
  return String(msg);
}

export async function fetchPhysicalCountOverview(): Promise<PhysicalCountOverviewData> {
  const res = await fetch(API, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as PhysicalCountOverviewData;
}

export async function fetchCountSessionDetail(id: number | string): Promise<{
  session: CountSession;
  items: CountItemResult[];
  expectedAssets: CountItemResult[];
  recentReads: {
    epc: string;
    matched_tag?: string;
    item_name?: string;
    is_unknown?: boolean;
  }[];
}> {
  const res = await fetch(`${API}/${id}`, { cache: "no-store" });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}

export async function createCountSession(
  payload: StartCountSessionPayload
): Promise<CountSession> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return (data as { session: CountSession }).session;
}

export async function recordReadApi(
  sessionId: number | string,
  payload: {
    epc?: string;
    epcs?: string[];
    source: "RFID" | "Manual";
    untagged_description?: string;
    serial?: string;
    asset_id?: number;
    clearAll?: boolean;
    removeAssetId?: number;
  }
) {
  const res = await fetch(`${API}/${sessionId}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data as {
    success: boolean;
    recordedCount?: number;
    matches?: { epc: string; matched: boolean; tag?: string; itemName?: string }[];
  };
}

export async function resolveItemApi(
  sessionId: number | string,
  itemId: string | number,
  payload: {
    assetId?: number | null;
    resolution?: string;
    note?: string;
    transferToDeptId?: number;
    condition?: string;
    epc?: string;
    ignoreUnknown?: boolean;
  }
) {
  const res = await fetch(`${API}/${sessionId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, ...payload }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}

export async function completeCountApi(
  sessionId: number | string,
  items?: CountItemResult[]
) {
  const res = await fetch(`${API}/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(errMsg(data));
  return data;
}
