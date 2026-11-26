import "server-only";

/**
 * The one seam between the barangay system and the LGU property register.
 *
 * Everything that knows the LGU schema lives here and nowhere else, following the shape the
 * cooperative module already uses in this repo: a server only file, a declared allowlist of the
 * collections this module may read, one client with a timeout, and a typed error.
 *
 * When the LGU side moves to its own service, only this file changes: set LGU_FEED_MODE to http
 * and LGU_FEED_BASE_URL, and every screen and service above it keeps working unchanged.
 */

/** The only collections this module may read outside its own tables. */
type Allowed = "lgu_asset" | "lgu_asset_class" | "lgu_asset_condition";

export type LguFeedMode = "direct" | "http" | "off";

export function lguFeedMode(): LguFeedMode {
  const raw = (process.env.LGU_FEED_MODE ?? "direct").trim().toLowerCase();
  return raw === "off" || raw === "http" ? (raw as LguFeedMode) : "direct";
}

export class LguFeedError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function read<T>(collection: Allowed, query: string): Promise<T[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new LguFeedError(503, "The LGU data service is not configured.");

  const res = await fetch(base + "/items/" + collection + "?" + query, {
    headers: { Authorization: "Bearer " + token },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const body = (await res.json().catch(() => null)) as { data?: T[]; errors?: { message?: string }[] } | null;
  if (!res.ok) {
    throw new LguFeedError(res.status === 403 ? 403 : 503, body?.errors?.[0]?.message ?? "The LGU data service did not answer.");
  }
  return body?.data ?? [];
}

export interface LguAssetView {
  id: number;
  description: string;
  acquisitionDate: string | null;
  cost: number;
  className: string | null;
  conditionName: string | null;
  /** the fields we keep as a snapshot when the asset moves, so our record survives their edits */
  snapshot: Record<string, unknown>;
}

interface RawLguAsset {
  id: number;
  description?: string | null;
  acquisition_date?: string | null;
  cost?: string | number | null;
  class_id?: number | null;
  condition_id?: number | null;
  status?: string | null;
}

async function classNames(): Promise<Map<number, string>> {
  try {
    const rows = await read<{ id: number; name?: string; class_name?: string }>("lgu_asset_class", "fields=id,name,class_name&limit=-1");
    return new Map(rows.map((r) => [Number(r.id), String(r.name ?? r.class_name ?? "")]));
  } catch {
    return new Map();
  }
}

async function conditionNames(): Promise<Map<number, string>> {
  try {
    const rows = await read<{ id: number; name?: string; condition_name?: string }>("lgu_asset_condition", "fields=id,name,condition_name&limit=-1");
    return new Map(rows.map((r) => [Number(r.id), String(r.name ?? r.condition_name ?? "")]));
  } catch {
    return new Map();
  }
}

/** Section 4.9: the LGU assets that can still be sent to a barangay. */
export async function listAssignableLguAssets(search = ""): Promise<LguAssetView[]> {
  const mode = lguFeedMode();
  if (mode === "off") throw new LguFeedError(503, "The LGU console is switched off for this environment.");
  if (mode === "http") {
    const base = process.env.LGU_FEED_BASE_URL?.replace(/\/+$/, "");
    if (!base) throw new LguFeedError(503, "LGU_FEED_BASE_URL is not set.");
    const res = await fetch(base + "/assets?q=" + encodeURIComponent(search), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new LguFeedError(503, "The LGU service did not answer.");
    return (await res.json()) as LguAssetView[];
  }

  const filter: Record<string, unknown> = { _and: [{ status: { _eq: "active" } }] };
  if (search.trim()) (filter._and as Record<string, unknown>[]).push({ description: { _icontains: search.trim() } });

  const [rows, classes, conditions] = await Promise.all([
    read<RawLguAsset>(
      "lgu_asset",
      "filter=" + encodeURIComponent(JSON.stringify(filter)) +
        "&sort=description&limit=200&fields=id,description,acquisition_date,cost,class_id,condition_id,status"
    ),
    classNames(),
    conditionNames(),
  ]);

  return rows.map((r) => ({
    id: Number(r.id),
    description: String(r.description ?? ""),
    acquisitionDate: r.acquisition_date ?? null,
    cost: Number(r.cost ?? 0),
    className: r.class_id != null ? classes.get(Number(r.class_id)) ?? null : null,
    conditionName: r.condition_id != null ? conditions.get(Number(r.condition_id)) ?? null : null,
    snapshot: {
      id: r.id,
      description: r.description,
      acquisition_date: r.acquisition_date,
      cost: r.cost,
      class_id: r.class_id,
      condition_id: r.condition_id,
    },
  }));
}

/** One asset, for the record we keep when it moves. */
export async function readLguAsset(id: number): Promise<LguAssetView> {
  const list = await listAssignableLguAssets();
  const found = list.find((a) => a.id === id);
  if (!found) throw new LguFeedError(404, "That LGU asset is not available for assignment.");
  return found;
}

/**
 * Section 4.9 asks the LGU record to stop counting the asset once a barangay receives it.
 * That switch lives on their side. Until they expose it, this records the fact and returns
 * false, so every caller can say plainly that the handoff is pending rather than pretend.
 */
export async function markLguTransferred(_lguAssetId: number): Promise<boolean> {
  const mode = lguFeedMode();
  if (mode !== "http") return false;
  const base = process.env.LGU_FEED_BASE_URL?.replace(/\/+$/, "");
  if (!base) return false;
  try {
    const res = await fetch(base + "/assets/" + _lguAssetId + "/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
