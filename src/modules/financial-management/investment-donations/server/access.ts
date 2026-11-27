import "server-only";
import { z } from "zod";
import { proxySpring, refreshedAccessToken } from "@/app/api/fm/financial-statements/adjusting-journal-entries/_spring";
import { cookies } from "next/headers";
import { remoteLedgerRoles } from "./remote-client";
import { ledgerConnectionBase } from "./connection-url.mjs";
import { INVESTMENT_DONATIONS_PARENT, INVESTMENT_DONATIONS_WORKSPACES } from "../workspaces";

const Id = z.coerce.number().int().positive();
const Registry = z.object({
  id: Id, slug: z.string(), base_path: z.string(), parent_module_id: Id.nullable(),
});

async function rows<T extends z.ZodType>(collection: string, fields: string, filter: object, schema: T) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new Error("Ledger access service is not configured.");
  const query = new URLSearchParams({ fields, filter: JSON.stringify(filter), limit: "-1" });
  const response = await fetch(`${ledgerConnectionBase(base)}/items/${collection}?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Ledger access service is unavailable.");
  return z.object({ data: z.array(schema) }).parse(await response.json()).data;
}

export async function ledgerAccess() {
  const session = await proxySpring("/auth/me", undefined, undefined, 10000);
  if ([401, 403, 404].includes(session.status)) return null;
  if (!session.ok) throw new Error("Sign-in service is unavailable.");
  const { id } = z.object({ id: Id }).parse(await session.json());
  const userToken = refreshedAccessToken(session) ?? (await cookies()).get("vos_access_token")?.value;
  const profiles = await rows("user", "user_id,role,is_blocked,is_deleted", { user_id: { _eq: id } },
    z.object({ user_id: Id, role: z.string().nullable(), is_blocked: z.unknown(), is_deleted: z.unknown() }));
  const active = (flag: unknown) => flag === false || flag === 0 || flag === "0" || flag === null ||
    z.object({ type: z.literal("Buffer"), data: z.tuple([z.literal(0)]) }).safeParse(flag).success;
  const profile = profiles[0];
  if (profiles.length !== 1 || !active(profile.is_blocked) || !active(profile.is_deleted)) return null;
  const admin = profile.role === "ADMIN";
  const definitions = [INVESTMENT_DONATIONS_PARENT, ...INVESTMENT_DONATIONS_WORKSPACES];
  const registry = await rows("modules", "id,slug,base_path,parent_module_id", {
    slug: { _in: definitions.map(row => row.slug) }, status: { _eq: "active" },
    subsystem_id: { slug: { _eq: "fm" }, status: { _eq: "active" } },
  }, Registry);
  const find = (slug: string, path: string, parent: number | null) => {
    const matches = registry.filter(row => row.slug === slug);
    return matches.length === 1 && matches[0].base_path === path && matches[0].parent_module_id === parent ? matches[0] : undefined;
  };
  const parent = find(INVESTMENT_DONATIONS_PARENT.slug, INVESTMENT_DONATIONS_PARENT.path, null);
  if (!parent) return null;
  const grants = admin ? null : new Set((await rows("user_access_modules", "module_id", {
    user_id: { _eq: id }, module_id: { _in: registry.map(row => row.id) },
  }, z.object({ module_id: Id }))).map(row => row.module_id));
  const isChild = (row: Registry) => row.parent_module_id === parent.id || row.base_path.startsWith(`${parent.base_path}/`);
  const parentGranted = !grants || grants.has(parent.id) || registry.some(row => isChild(row) && grants.has(row.id));
  const workspaces = INVESTMENT_DONATIONS_WORKSPACES.filter(workspace => {
    const row = find(workspace.slug, workspace.path, parent.id);
    return row && (parentGranted || grants.has(row.id));
  }).map(row => row.key);
  const remoteRoles = !process.env.CGL_MYSQL_URL ? (userToken ? await remoteLedgerRoles(userToken, id) : {}) : undefined;
  // An unavailable legacy custom endpoint must not convert an authenticated
  // Directus admin into a view-only user. Empty remote roles mean “no remote
  // policy was supplied”; permissions.ts then applies the local admin/legacy
  // fallback. A non-empty map is authoritative for deployments that provide it.
  const roles = remoteRoles && Object.keys(remoteRoles).length > 0 ?
    Object.fromEntries(workspaces.map(key => [key, remoteRoles[key] ?? "view"])) : undefined;
  return { id, admin, workspaces, roles, rolesAuthoritative: roles !== undefined, userToken };
}
