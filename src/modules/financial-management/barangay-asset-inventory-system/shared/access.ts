import { cookies } from "next/headers";
import { enc, get } from "./api";
import type { BrgyRole } from "../types";

/**
 * Section 2 and Table 5 of the guide: a user's role and barangay decide what they may do,
 * and a barangay user may only touch their own barangay.
 *
 * Roles come from brgy_user_role, keyed by the user id in the session cookie. When the
 * environment runs with authentication disabled (local development), every permission is
 * granted and the fact is reported so it can never be mistaken for enforcement.
 */

export type BrgyPermission =
  | "view"
  | "register"
  | "assign"
  | "condition"
  | "disposeRequest"
  | "disposeApprove"
  | "count"
  | "reports"
  | "users";

const MATRIX: Record<BrgyRole, BrgyPermission[]> = {
  barangay_admin: ["view", "register", "assign", "condition", "disposeRequest", "disposeApprove", "count", "reports"],
  property_custodian: ["view", "register", "assign", "condition", "disposeRequest", "count", "reports"],
  encoder: ["view", "register", "reports"],
  viewer: ["view", "reports"],
  municipal: ["view", "assign", "reports"],
  system_admin: ["view", "register", "assign", "condition", "disposeRequest", "disposeApprove", "count", "reports", "users"],
};

export interface Access {
  userId: string | null;
  role: BrgyRole;
  barangayId: number | null;
  authDisabled: boolean;
  /** true when no role has ever been assigned, so the module is still being set up */
  unconfigured?: boolean;
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

export async function resolveAccess(): Promise<Access> {
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";
  const store = await cookies();
  const token = store.get("vos_access_token")?.value ?? null;
  const payload = token ? decodeJwt(token) : null;
  const rawId = payload?.id ?? payload?.user_id ?? payload?.sub ?? null;
  const userId = rawId == null ? null : String(rawId);

  if (userId) {
    const rows = await get<{ role: string; barangay_id: number | null }[]>(
      "/items/brgy_user_role?filter=" + enc({ _and: [{ user_id: { _eq: Number(userId) } }, { status: { _eq: "active" } }] }) + "&fields=role,barangay_id&limit=1"
    ).catch(() => []);
    const row = rows?.[0];
    if (row) {
      const role = (row.role as BrgyRole) ?? "viewer";
      return { userId, role: MATRIX[role] ? role : "viewer", barangayId: row.barangay_id == null ? null : Number(row.barangay_id), authDisabled };
    }
  }

  if (authDisabled) {
    return { userId, role: "system_admin", barangayId: null, authDisabled: true };
  }

  // Section 2: the System Admin sets each user's role and barangay. Until the first assignment
  // exists, the module reports itself unconfigured and stays open, so setup is possible at all.
  const configured = await get<{ id: number }[]>("/items/brgy_user_role?fields=id&limit=1").catch(() => []);
  if (!configured || configured.length === 0) {
    return { userId, role: "system_admin", barangayId: null, authDisabled, unconfigured: true };
  }

  return { userId, role: "viewer", barangayId: null, authDisabled };
}

export function can(access: Access, permission: BrgyPermission): boolean {
  return MATRIX[access.role].includes(permission);
}

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/** Every route checks this before it touches data. */
export function requirePermission(access: Access, permission: BrgyPermission, what: string): void {
  if (can(access, permission)) return;
  throw new AccessError("Your role (" + access.role + ") cannot " + what + ".", 403);
}

/**
 * Section 5, barangay boundary. A barangay role is pinned to its own barangay.
 * Municipal and system roles may read any barangay, but municipal may not edit a barangay's records.
 */
export function requireBarangayScope(access: Access, requested: number, permission: BrgyPermission): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new AccessError("A barangay is required.", 400);
  }
  const readsAnyBarangay = access.role === "municipal" || access.role === "system_admin";
  if (readsAnyBarangay && permission === "view") return requested;
  if (access.barangayId == null) {
    throw new AccessError("No barangay is assigned to your account. Ask the System Admin to set your role and barangay.", 403);
  }
  if (access.barangayId !== requested) {
    throw new AccessError("You do not have access to this barangay's assets.", 403);
  }
  return requested;
}
