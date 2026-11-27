import "server-only";

import { cookies } from "next/headers";
import { forget, memo } from "../../shared/cache";

/**
 * The LGU asset management system's own administration. Section 2 of the guide gives the System
 * Admin the lists a module runs on, so this screen owns the LGU reference data and nothing else:
 * asset classes, conditions and offices. No barangay data is touched here.
 *
 * This module keeps its own copy of the session check on purpose. The repo forbids imports between
 * modules, so the twenty lines below are duplicated rather than shared.
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

type Row = Record<string, unknown>;

function url(path: string): string {
  if (!BASE) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  return BASE.replace(/\/+$/, "") + path;
}

function headers(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: "Bearer " + (TOKEN ?? "") };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(url(path), { headers: headers(), cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? "Request failed with " + res.status);
  return (body?.data ?? null) as T;
}

async function send<T>(path: string, method: "POST" | "PATCH", payload: unknown): Promise<T> {
  const res = await fetch(url(path), { method, headers: headers(), body: JSON.stringify(payload) });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? "Request failed with " + res.status);
  return (body?.data ?? null) as T;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface LguAdminAccess {
  email: string | null;
  /** every role held, because one person may hold several */
  roles: string[];
  /** municipal or system admin: the only two that may open this module at all */
  canOpenModule: boolean;
  /** system admin only: the only one that may manage the LGU lists */
  systemAdmin: boolean;
}

/** System Admin only: the role row is matched by the login email, the numeric column is legacy. */
export async function resolveLguAdminAccess(): Promise<LguAdminAccess> {
  const store = await cookies();
  const token = store.get("vos_access_token")?.value ?? null;
  const payload = token ? decodeJwt(token) : null;
  const rawEmail = typeof payload?.email === "string" ? payload.email.trim() : null;
  const email = rawEmail && rawEmail.includes("@") ? rawEmail : null;
  if (!email) return { email: null, roles: [], canOpenModule: false, systemAdmin: false };
  // this read sits in front of every request in the module, so it is remembered for a minute
  const rows = await memo<Row[]>("lgu:roles:" + email.toLowerCase(), 60_000, () =>
    get<Row[]>(
      "/items/brgy_user_role?filter=" +
        encodeURIComponent(JSON.stringify({ _and: [{ user_email: { _icontains: email } }, { status: { _eq: "active" } }] })) +
        "&fields=user_email,role&limit=10"
    ).catch(() => [])
  );
  const wanted = email.toLowerCase();
  const mine = (rows ?? []).filter((row) => text(row.user_email).trim().toLowerCase() === wanted);
  const roles = mine.map((row) => text(row.role));
  return {
    email,
    roles,
    canOpenModule: roles.includes("municipal") || roles.includes("system_admin"),
    systemAdmin: roles.includes("system_admin"),
  };
}

export type LguKind = "class" | "condition" | "office";

/** The only two roles that belong to this module, so this screen assigns only these two. */
export const LGU_ROLES = [
  { value: "municipal", label: "Municipal (the municipal office)" },
  { value: "system_admin", label: "System Admin (Vertex)" },
] as const;

export interface LguAccount {
  email: string;
  name: string;
  blocked: boolean;
}

export interface LguRoleRow {
  id: number;
  email: string;
  role: string;
  status: string;
}

export interface LguAccountsPayload {
  accounts: LguAccount[];
  roles: LguRoleRow[];
}

function flag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (value && typeof value === "object" && "data" in (value as Record<string, unknown>)) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return Number(data[0] ?? 0) === 1;
  }
  return false;
}

/** Every platform login, plus the role rows this module may hold. */
export async function listAccountsAndRoles(): Promise<LguAccountsPayload> {
  const [users, roles] = await Promise.all([
    get<Row[]>("/items/user?limit=-1&fields=user_email,user_fname,user_lname,is_deleted,is_blocked"),
    get<Row[]>("/items/brgy_user_role?filter=" + encodeURIComponent(JSON.stringify({ status: { _eq: "active" } })) + "&fields=id,user_email,role,status&limit=-1"),
  ]);
  const accounts = (users ?? [])
    .filter((row) => !flag(row.is_deleted))
    .map((row) => {
      const email = text(row.user_email).trim();
      const name = [text(row.user_fname), text(row.user_lname)].filter(Boolean).join(" ").trim();
      return { email, name: name || email, blocked: flag(row.is_blocked) };
    })
    .filter((row) => row.email.includes("@"))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    accounts,
    roles: (roles ?? []).map((row) => ({
      id: Number(row.id),
      email: text(row.user_email).trim(),
      role: text(row.role),
      status: text(row.status),
    })),
  };
}

/** Table 5: the System Admin gives the two LGU roles. Nothing else is assignable from here. */
export async function saveLguRole(input: { id?: number | null; email: string; role: string }): Promise<{ id: number }> {
  const email = (input.email ?? "").trim();
  if (!email.includes("@")) throw new Error("A login email is required.");
  const role = (input.role ?? "").trim();
  if (!LGU_ROLES.some((entry) => entry.value === role)) {
    throw new Error("This screen assigns only the municipal and system admin roles.");
  }
  const body: Row = { user_email: email, role, status: "active" };
  forget("lgu:roles:");
  const saved = input.id
    ? await send<Row>("/items/brgy_user_role/" + input.id, "PATCH", body)
    : await send<Row>("/items/brgy_user_role", "POST", body);
  return { id: Number(saved?.id ?? 0) };
}

export async function deactivateLguRole(id: number): Promise<{ id: number }> {
  if (!id) throw new Error("A role row is required.");
  await send<Row>("/items/brgy_user_role/" + id, "PATCH", { status: "inactive" });
  return { id };
}

export interface LguReferenceRow {
  id: number;
  values: Record<string, string>;
}

export interface LguReferenceData {
  classes: LguReferenceRow[];
  conditions: LguReferenceRow[];
  offices: LguReferenceRow[];
}

export async function listLguReference(): Promise<LguReferenceData> {
  const [classes, conditions, offices] = await Promise.all([
    get<Row[]>("/items/lgu_asset_class?sort=sort,code&limit=-1&fields=id,code,name,property_prefix,default_life_months,depreciable,sort,status"),
    get<Row[]>("/items/lgu_condition?sort=sort&limit=-1&fields=id,name,is_serviceable,sort,status"),
    get<Row[]>("/items/lgu_office?sort=sort,code&limit=-1&fields=id,code,name,sort,status"),
  ]);
  return {
    classes: (classes ?? []).map((row) => ({
      id: Number(row.id),
      values: {
        code: text(row.code),
        name: text(row.name),
        property_prefix: text(row.property_prefix),
        default_life_months: row.default_life_months == null ? "" : String(row.default_life_months),
        depreciable: Number(row.depreciable ?? 0) === 1 ? "1" : "0",
      },
    })),
    conditions: (conditions ?? []).map((row) => ({
      id: Number(row.id),
      values: {
        name: text(row.name),
        is_serviceable: Number(row.is_serviceable ?? 0) === 1 ? "1" : "0",
      },
    })),
    offices: (offices ?? []).map((row) => ({
      id: Number(row.id),
      values: { code: text(row.code), name: text(row.name) },
    })),
  };
}

/** One editor for the three LGU lists. A row is updated when an id arrives, inserted otherwise. */
export async function saveLguReference(input: {
  kind: string;
  id?: number | null;
  values: Record<string, string>;
}): Promise<{ kind: LguKind; id: number; name: string }> {
  // the reference lists are cached for five minutes, so a change must drop them now
  forget("lgu:lookups");
  const kinds: LguKind[] = ["class", "condition", "office"];
  const kind = input.kind as LguKind;
  if (!kinds.includes(kind)) throw new Error("Unknown list: " + (input.kind || "(none)") + ".");

  const name = (input.values.name ?? "").trim();
  if (!name) throw new Error("A name is required.");

  const numberOrNull = (raw: string | undefined, label: string): number | null => {
    const value = (raw ?? "").trim();
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(label + " must be zero or more.");
    return parsed;
  };

  const body: Row = { name };
  if (input.values.status) body.status = input.values.status;

  if (kind === "class") {
    body.code = (input.values.code ?? "").trim().toUpperCase();
    if (!body.code) throw new Error("A class code is required, for example LAND.");
    body.property_prefix = (input.values.property_prefix ?? "").trim().toUpperCase() || null;
    body.default_life_months = numberOrNull(input.values.default_life_months, "Default life months");
    body.depreciable = input.values.depreciable === "1";
  }
  if (kind === "condition") {
    body.is_serviceable = input.values.is_serviceable === "1";
  }
  if (kind === "office") {
    body.code = (input.values.code ?? "").trim().toUpperCase();
    if (!body.code) throw new Error("An office code is required, for example MAYOR.");
  }

  const collection = kind === "class" ? "lgu_asset_class" : kind === "condition" ? "lgu_condition" : "lgu_office";
  const saved = input.id
    ? await send<Row>("/items/" + collection + "/" + input.id, "PATCH", body)
    : await send<Row>("/items/" + collection, "POST", body);
  return { kind, id: Number(saved?.id ?? input.id ?? 0), name };
}
