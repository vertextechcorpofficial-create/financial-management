import "server-only";
import { cookies } from "next/headers";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import { emptyPortfolio, portfolioSchema, type Asset, type HistoryEntry, type LedgerEvent, type Part, type Portfolio } from "../types";
import { LEDGER_PAGES, ledgerPath, type LedgerPage } from "../navigation";
import { assetSeries } from "../utils/engine";

export class LedgerError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
const COLLECTION = "property_ledger_revisions";
const PATH = "/fm/property-ledger";

type DirectusError = {
  message?: string;
  extensions?: { code?: string };
};

type DirectusErrorResponse = {
  errors?: DirectusError[];
};

type PortfolioRow = {
  revision?: number;
  currency: Portfolio["policies"]["currency"];
  fy_start: number;
  land_model: Portfolio["policies"]["landModel"];
  building_model: Portfolio["policies"]["buildingModel"];
  lock_through?: string | null;
  cap_threshold_centavos: number;
  projection_end_year: number;
  component_split: Portfolio["policies"]["componentSplit"];
};

type EntityRow = { id: string; name: string };

type AssetRow = {
  id: string;
  version?: number;
  kind: Asset["kind"];
  name: string;
  entity_id: string;
  land_id?: string | null;
  location?: string | null;
  tags?: string[] | null;
  acquired: string;
  cost_centavos: number;
  rate: number;
  growth: Asset["growth"];
  method: Asset["method"];
  notes?: string | null;
  details?: Record<string, string> | null;
  sale_date?: string | null;
  sale_price_centavos?: number | null;
  sale_note?: string | null;
};

type PartRow = {
  id: string;
  asset_id: string;
  name: string;
  cost_centavos: number;
  life_years: number;
  salvage_percent: number;
  start_month: string;
};

type EventRow = {
  id: string;
  asset_id: string;
  kind: LedgerEvent["kind"];
  event_month: string;
  amount_centavos: number;
  note?: string | null;
  vendor?: string | null;
  improvement_id?: string | null;
};

export async function authorize(page: LedgerPage = "dashboard") {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) throw new LedgerError("Sign in to access Property Ledger", 401);
  const spring = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");
  if (!spring) throw new LedgerError("Authentication service is not configured", 503);
  let verified: Response;
  try { verified = await fetch(`${spring}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) }); }
  catch { throw new LedgerError("Authentication service is unavailable", 503); }
  if (!verified.ok) throw new LedgerError("Session could not be verified", verified.status === 401 || verified.status === 403 ? 401 : 503);
  // Decode only after the issuing backend has accepted the token.
  const claims = decodeJwtPayload(token);
  const userId = claims?.id ?? claims?.user_id ?? claims?.sub;
  if (!userId) throw new LedgerError("Session has no user identity", 401);
  const canManage = claims?.role === "ADMIN";
  let allowedPaths: string[] = [];
  let permissionRows: { userId: number; subsystemSlug: string; basePath?: string; status?: string; permission?: string; access?: string; canEdit?: boolean; canLock?: boolean }[] = [];
  if (!canManage) {
    const response = await fetch(`${spring}/api/view-user-authorized-module/all?subsystem_slug=fm`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new LedgerError("Module access could not be verified", 503);
    const rows: typeof permissionRows = await response.json();
    permissionRows = Array.isArray(rows) ? rows : [];
    const activeRows = permissionRows.filter(r => String(r.userId) === String(userId) && r.subsystemSlug === "fm" && r.status === "active");
    allowedPaths = activeRows.map(r => r.basePath ?? "");
    if (!allowedPaths.includes(PATH) && !allowedPaths.includes(ledgerPath(page))) throw new LedgerError("You do not have access to this Property Ledger submodule", 403);
  }
  const pages = canManage || allowedPaths.includes(PATH) ? LEDGER_PAGES.map(p => p.slug) : LEDGER_PAGES.filter(p => allowedPaths.includes(ledgerPath(p.slug))).map(p => p.slug);
  const editPages = canManage || allowedPaths.includes(PATH) ? pages : pages.filter(slug => {
    const row = permissionRows.find(r => String(r.userId) === String(userId) && r.basePath === ledgerPath(slug));
    return !row || row.canEdit === true || row.permission === "edit" || row.access === "edit";
  });
  return { actor: String(userId), canManage, pages, editPages };
}

export function assertWriteAccess(before: Portfolio, after: Portfolio, user: Awaited<ReturnType<typeof authorize>>) {
  if (user.canManage) return;
  for (const asset of [...before.assets, ...after.assets]) {
    const old = before.assets.find(a => a.id === asset.id), next = after.assets.find(a => a.id === asset.id);
    if (JSON.stringify(old) === JSON.stringify(next)) continue;
    const required = asset.kind === "land" ? "land-register" : "building-register";
    if (!user.editPages.includes(required)) throw new LedgerError(`Editing ${asset.kind} requires edit access to its registration submodule`, 403);
  }
}

export async function directus<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new LedgerError("Property Ledger storage is not configured", 503);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  } catch { throw new LedgerError("Property Ledger storage is unavailable. Retry or refresh to check whether your save completed.", 503); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as DirectusErrorResponse;
    if (body.errors?.some(e => e.extensions?.code === "RECORD_NOT_UNIQUE")) throw new LedgerError("Another user saved first. Refresh before retrying; your unsaved form remains open.", 409);
    if (response.status === 403 || response.status === 404) throw new LedgerError("Property Ledger storage is not provisioned or is inaccessible. Ask an administrator to run the module setup.", 503);
    const message = body.errors?.[0]?.message;
    throw new LedgerError(message ? `Property Ledger storage request failed: ${message}` : `Property Ledger storage request failed (${response.status})`, 502);
  }
  return response.json() as Promise<T>;
}
type Revision = HistoryEntry & { payload: Portfolio };
let detectedRelational: boolean | undefined;
async function relational() {
  if (detectedRelational !== undefined) return detectedRelational;
  try {
    await directus<{ data: unknown }>("/items/property_ledger_portfolios/1?fields=id");
    detectedRelational = true;
  } catch (error) {
    if (error instanceof LedgerError && error.status === 503) detectedRelational = false;
    else throw error;
  }
  return detectedRelational;
}
const cents = (value: number) => Math.round(value * 100);
const pesos = (value: number | null | undefined) => (value ?? 0) / 100;
const asArray = <T>(value: { data?: T[] }) => value.data ?? [];
async function createItems(collection: string, rows: Record<string, unknown>[]) {
  for (const row of rows) await directus(`/items/${collection}`, { method: "POST", body: JSON.stringify(row) });
}
function normalizeCentavos(portfolio: Portfolio): Portfolio {
  return portfolioSchema.parse({
    ...portfolio,
    policies: { ...portfolio.policies, capThreshold: cents(portfolio.policies.capThreshold) / 100 },
    assets: portfolio.assets.map(asset => ({
      ...asset,
      cost: cents(asset.cost) / 100,
      parts: asset.parts.map(part => ({ ...part, cost: cents(part.cost) / 100 })),
      events: asset.events.map(event => ({ ...event, amount: cents(event.amount) / 100 })),
      sale: asset.sale ? { ...asset.sale, price: cents(asset.sale.price) / 100 } : null,
    })),
  });
}
function assertCalculated(portfolio: Portfolio) {
  const through = `${portfolio.policies.projectionEndYear}-12`;
  for (const asset of portfolio.assets) {
    for (const row of assetSeries(asset, portfolio.policies, through)) {
      for (const value of Object.values(row)) if (typeof value === "number" && !Number.isFinite(value)) throw new LedgerError("The calculation engine produced a non-finite value.", 422);
    }
  }
}

async function latestRelational() {
  const [portfolio, entities, assets, parts, events] = await Promise.all([
    directus<{ data: PortfolioRow }>("/items/property_ledger_portfolios/1?fields=*"),
    directus<{ data: EntityRow[] }>("/items/property_ledger_entities?filter[portfolio_id][_eq]=1&limit=1000"),
    directus<{ data: AssetRow[] }>("/items/property_ledger_assets?filter[portfolio_id][_eq]=1&limit=1000"),
    directus<{ data: PartRow[] }>("/items/property_ledger_parts?limit=10000"),
    directus<{ data: EventRow[] }>("/items/property_ledger_events?limit=10000"),
  ]);
  const policy = portfolio.data;
  if (!policy) return { revision: 0, portfolio: emptyPortfolio() };
  // The DDL seeds the policy row before the first migration. Until entities
  // are written, treat the relational store as empty so latest() can fall
  // back to the existing legacy revision without failing portfolioSchema.
  if (!Array.isArray(entities.data) || entities.data.length === 0) {
    return { revision: 0, portfolio: emptyPortfolio() };
  }
  const partRows = asArray(parts), eventRows = asArray(events);
  const resultAssets: Asset[] = asArray(assets).map(row => {
    const assetParts: Part[] = partRows.filter(p => p.asset_id === row.id).map(p => ({
      id: p.id, name: p.name, cost: pesos(p.cost_centavos), life: p.life_years, salvage: Number(p.salvage_percent), date: p.start_month,
    }));
    const assetEvents: LedgerEvent[] = eventRows.filter(e => e.asset_id === row.id).map(e => ({
      id: e.id, kind: e.kind, date: e.event_month, amount: pesos(e.amount_centavos), note: e.note ?? "", vendor: e.vendor ?? "", ...(e.improvement_id ? { improvementId: e.improvement_id } : {}),
    }));
    return {
      id: row.id, version: row.version ?? 1, kind: row.kind, name: row.name, entityId: row.entity_id, landId: row.land_id ?? "",
      location: row.location ?? "", tags: row.tags ?? [], acquired: row.acquired, cost: pesos(row.cost_centavos), rate: Number(row.rate),
      growth: row.growth, method: row.method, parts: assetParts, events: assetEvents, notes: row.notes ?? "", details: row.details ?? {},
      sale: row.sale_date ? { date: row.sale_date, price: pesos(row.sale_price_centavos), note: row.sale_note ?? "" } : null,
    };
  });
  return {
    revision: policy.revision ?? 0,
    portfolio: portfolioSchema.parse({
      entities: asArray(entities).map(e => ({ id: e.id, name: e.name })),
      assets: resultAssets,
      policies: {
        currency: policy.currency, fyStart: policy.fy_start, landModel: policy.land_model, buildingModel: policy.building_model,
        lockThrough: policy.lock_through ?? "", capThreshold: pesos(policy.cap_threshold_centavos),
        projectionEndYear: policy.projection_end_year, componentSplit: policy.component_split,
      },
    }),
  };
}
export async function latest() {
  if (await relational()) {
    const normalized = await latestRelational();
    if (normalized.revision === 0) {
      const legacy = await latestLegacy();
      if (legacy.revision > 0) return legacy;
    }
    return normalized;
  }
  return latestLegacy();
}
async function latestLegacy() {
  const { data } = await directus<{ data: Revision[] }>(`/items/${COLLECTION}?fields=id,payload,actor,created_at,summary&sort=-id&limit=1`);
  const row = data[0];
  return { revision: row?.id ?? 0, portfolio: row ? portfolioSchema.parse(row.payload) : emptyPortfolio() };
}
export async function history() {
  if (await relational()) {
    const { data } = await directus< { data: { id: number; actor: string; date_created: string; detail: string }[] } >("/items/property_ledger_audit?fields=id,actor,date_created,detail&sort=-id&limit=400");
    return data.map(row => ({ id: row.id, actor: row.actor, created_at: row.date_created, summary: row.detail }));
  }
  const { data } = await directus<{ data: HistoryEntry[] }>(`/items/${COLLECTION}?fields=id,actor,created_at,summary&sort=-id&limit=400`);
  // MySQL DATETIME is timezone-naive; this module always writes UTC timestamps.
  return data.map(row => ({
    ...row,
    created_at: /(?:Z|[+-]\d{2}:?\d{2})$/i.test(row.created_at)
      ? row.created_at
      : `${row.created_at.replace(" ", "T")}Z`,
  }));
}
export function describeChange(before: Portfolio, after: Portfolio) {
  const changes: string[] = [];
  for (const a of after.assets) {
    const old = before.assets.find(x => x.id === a.id);
    if (!old) changes.push(`Registered ${a.kind}: ${a.name}`);
    else if (JSON.stringify(old) !== JSON.stringify(a)) changes.push(`Updated ${a.kind}: ${a.name}`);
  }
  for (const a of before.assets) if (!after.assets.some(x => x.id === a.id)) changes.push(`Removed ${a.kind}: ${a.name}`);
  if (JSON.stringify(before.policies) !== JSON.stringify(after.policies)) changes.push("Changed accounting policies");
  if (JSON.stringify(before.entities) !== JSON.stringify(after.entities)) changes.push("Changed entities");
  return changes.join("; ").slice(0, 2000) || "No changes";
}
/** Append-only immutable snapshots: unique integer IDs provide compare-and-swap across concurrent writers. */
export async function commit(revision: number, portfolio: Portfolio, actor: string, summary: string) {
  const normalized = normalizeCentavos(portfolio);
  assertCalculated(normalized);
  if (await relational()) {
    const current = await latest();
    if (current.revision !== revision) throw new LedgerError("The ledger changed. Refresh before saving your changes.", 409);
    const now = new Date().toISOString();
    const previousById = new Map(current.portfolio.assets.map(a => [a.id, a]));
    const next = normalized;
    const versioned = { ...next, assets: next.assets.map(asset => {
      const old = previousById.get(asset.id);
      return { ...asset, version: old && JSON.stringify(old) !== JSON.stringify(asset) ? (old.version ?? 1) + 1 : old?.version ?? asset.version ?? 1 };
    }) };
    await directus("/items/property_ledger_portfolios/1", { method: "PATCH", body: JSON.stringify({
      revision: revision + 1, currency: next.policies.currency, fy_start: next.policies.fyStart, land_model: next.policies.landModel,
      building_model: next.policies.buildingModel, lock_through: next.policies.lockThrough || null, cap_threshold_centavos: cents(next.policies.capThreshold),
      projection_end_year: next.policies.projectionEndYear, component_split: next.policies.componentSplit,
    }) });
    await directus("/items/property_ledger_assets?filter[portfolio_id][_eq]=1", { method: "DELETE" });
    await directus("/items/property_ledger_entities?filter[portfolio_id][_eq]=1", { method: "DELETE" });
    if (versioned.entities.length) await createItems("property_ledger_entities", versioned.entities.map(e => ({ id: e.id, portfolio_id: 1, name: e.name })));
    const assetRows = [...versioned.assets.filter(a => a.kind === "land"), ...versioned.assets.filter(a => a.kind === "building")];
    if (assetRows.length) await createItems("property_ledger_assets", assetRows.map(a => ({
      id: a.id, portfolio_id: 1, entity_id: a.entityId, land_id: a.landId || null, kind: a.kind, name: a.name, location: a.location, tags: a.tags,
      acquired: a.acquired, cost_centavos: cents(a.cost), rate: a.rate, growth: a.growth, method: a.method, notes: a.notes, details: a.details,
      sale_date: a.sale?.date ?? null, sale_price_centavos: a.sale ? cents(a.sale.price) : null, sale_note: a.sale?.note ?? null, version: a.version,
    })));
    const parts = versioned.assets.flatMap(a => a.parts.map(p => ({ id: p.id, asset_id: a.id, name: p.name, cost_centavos: cents(p.cost), life_years: p.life, salvage_percent: p.salvage, start_month: p.date })));
    const events = versioned.assets.flatMap(a => a.events.map(e => ({ id: e.id, asset_id: a.id, kind: e.kind, event_month: e.date, amount_centavos: cents(e.amount), note: e.note, vendor: e.vendor, improvement_id: e.improvementId ?? null })));
    if (parts.length) await createItems("property_ledger_parts", parts);
    if (events.length) await createItems("property_ledger_events", events);
    const auditRows = [
      ...versioned.assets.map(asset => {
        const before = current.portfolio.assets.find(item => item.id === asset.id);
        return before && JSON.stringify(before) === JSON.stringify(asset) ? null : { portfolio_id: 1, actor, action: before ? "edit" : "register", asset_id: asset.id, item_name: asset.name, detail: summary, before_value: before ?? null, after_value: asset, date_created: now };
      }),
      ...current.portfolio.assets.filter(asset => !versioned.assets.some(item => item.id === asset.id)).map(asset => ({ portfolio_id: 1, actor, action: "delete", asset_id: asset.id, item_name: asset.name, detail: summary, before_value: asset, after_value: null, date_created: now })),
      ...(JSON.stringify(current.portfolio.policies) !== JSON.stringify(versioned.policies) ? [{ portfolio_id: 1, actor, action: "policy", item_name: "Accounting policies", detail: summary, before_value: current.portfolio.policies, after_value: versioned.policies, date_created: now }] : []),
    ].filter(Boolean);
    if (auditRows.length) await createItems("property_ledger_audit", auditRows as Record<string, unknown>[]);
    return revision + 1;
  }
  await directus(`/items/${COLLECTION}`, { method: "POST", body: JSON.stringify({ id: revision + 1, payload: normalized, actor, summary, created_at: new Date().toISOString() }) });
  return revision + 1;
}
