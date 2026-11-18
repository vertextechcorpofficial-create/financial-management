import "server-only";
import { cookies } from "next/headers";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import { emptyPortfolio, portfolioSchema, type HistoryEntry, type Portfolio } from "../types";
import { LEDGER_PAGES, ledgerPath, type LedgerPage } from "../navigation";

export class LedgerError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
const COLLECTION = "property_ledger_revisions";
const PATH = "/fm/property-ledger";

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
  if (!canManage) {
    const response = await fetch(`${spring}/api/view-user-authorized-module/all?subsystem_slug=fm`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new LedgerError("Module access could not be verified", 503);
    const rows: { userId: number; subsystemSlug: string; basePath?: string; status?: string }[] = await response.json();
    allowedPaths = Array.isArray(rows) ? rows.filter(r => String(r.userId) === String(userId) && r.subsystemSlug === "fm" && r.status === "active").map(r => r.basePath ?? "") : [];
    if (!allowedPaths.includes(PATH) && !allowedPaths.includes(ledgerPath(page))) throw new LedgerError("You do not have access to this Property Ledger submodule", 403);
  }
  const pages = canManage || allowedPaths.includes(PATH) ? LEDGER_PAGES.map(p => p.slug) : LEDGER_PAGES.filter(p => allowedPaths.includes(ledgerPath(p.slug))).map(p => p.slug);
  return { actor: String(userId), canManage, pages };
}

export function assertWriteAccess(before: Portfolio, after: Portfolio, user: Awaited<ReturnType<typeof authorize>>) {
  if (user.canManage) return;
  for (const asset of [...before.assets, ...after.assets]) {
    const old = before.assets.find(a => a.id === asset.id), next = after.assets.find(a => a.id === asset.id);
    if (JSON.stringify(old) === JSON.stringify(next)) continue;
    const required = asset.kind === "land" ? "land-register" : "building-register";
    if (!user.pages.includes(required)) throw new LedgerError(`Editing ${asset.kind} requires access to its registration submodule`, 403);
  }
}

async function directus<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new LedgerError("Property Ledger storage is not configured", 503);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  } catch { throw new LedgerError("Property Ledger storage is unavailable. Retry or refresh to check whether your save completed.", 503); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { errors?: { extensions?: { code?: string } }[] };
    if (body.errors?.some(e => e.extensions?.code === "RECORD_NOT_UNIQUE")) throw new LedgerError("Another user saved first. Refresh before retrying; your unsaved form remains open.", 409);
    if (response.status === 403 || response.status === 404) throw new LedgerError("Property Ledger storage is not provisioned or is inaccessible. Ask an administrator to run the module setup.", 503);
    throw new LedgerError("Property Ledger storage request failed", 502);
  }
  return response.json() as Promise<T>;
}
type Revision = HistoryEntry & { payload: Portfolio };
export async function latest() {
  const { data } = await directus<{ data: Revision[] }>(`/items/${COLLECTION}?fields=id,payload,actor,created_at,summary&sort=-id&limit=1`);
  const row = data[0];
  return { revision: row?.id ?? 0, portfolio: row ? portfolioSchema.parse(row.payload) : emptyPortfolio() };
}
export async function history() {
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
  await directus(`/items/${COLLECTION}`, { method: "POST", body: JSON.stringify({ id: revision + 1, payload: portfolio, actor, summary, created_at: new Date().toISOString() }) });
  return revision + 1;
}
