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
  // editing and cancelling are their own rights, so a registrar cannot rewrite history
  | "editRecord"
  | "cancelRecord"
  | "assign"
  | "condition"
  | "disposeRequest"
  | "disposeApprove"
  | "count"
  | "reports"
  | "users";

const MATRIX: Record<BrgyRole, BrgyPermission[]> = {
  barangay_admin: [
    "view", "register", "editRecord", "cancelRecord", "assign", "condition", "disposeRequest", "disposeApprove", "count", "reports",
  ],
  property_custodian: ["view", "register", "editRecord", "cancelRecord", "assign", "condition", "disposeRequest", "count", "reports"],
  // the encoder records what exists. Correcting or cancelling a record is the custodian's job
  encoder: ["view", "register", "reports"],
  viewer: ["view", "reports"],
  // Table 5 gives municipal "assign to a barangay only": that path is the LGU console, which uses
  // requireLguStaff, not the barangay custody action. Section 5 forbids editing a barangay's records.
  municipal: ["view", "reports"],
  system_admin: [
    "view", "register", "editRecord", "cancelRecord", "assign", "condition", "disposeRequest", "disposeApprove", "count", "reports", "users",
  ],
};

export interface Access {
  userId: string | null;
  /** the login email from the session token, the key a role row is matched on */
  email: string | null;
  /** the highest ranked role held, for the badge and for messages */
  role: BrgyRole;
  /** every role held, because rule 18 lets one person hold several */
  roles: BrgyRole[];
  barangayId: number | null;
  authDisabled: boolean;
  /** true when no role has ever been assigned, so the module is still being set up */
  unconfigured?: boolean;
}

/** Rule 18: one person may hold several roles, so the highest ranked one names them. */
const ROLE_RANK: BrgyRole[] = ["system_admin", "municipal", "barangay_admin", "property_custodian", "encoder", "viewer"];

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
  // platform user ids are UUIDs, so a role row is matched by email; the numeric column is only a fallback
  const rawEmail = typeof payload?.email === "string" ? payload.email.trim() : null;
  const email = rawEmail && rawEmail.includes("@") ? rawEmail : null;
  const numericId = Number(userId ?? "");
  const hasNumericId = Number.isFinite(numericId) && numericId > 0;

  if (email || hasNumericId) {
    const or: Record<string, unknown>[] = [];
    if (email) or.push({ user_email: { _icontains: email } });
    if (hasNumericId) or.push({ user_id: { _eq: numericId } });
    const rows = await get<{ user_email: string | null; role: string; barangay_id: number | null }[]>(
      "/items/brgy_user_role?filter=" + enc({ _and: [{ _or: or }, { status: { _eq: "active" } }] }) +
        "&fields=user_email,role,barangay_id&limit=20"
    ).catch(() => []);
    const wanted = (email ?? "").toLowerCase();
    const matched = (rows ?? []).filter((r) => (wanted ? (r.user_email ?? "").trim().toLowerCase() === wanted : true));
    const held = matched.map((r) => r.role as BrgyRole).filter((r) => Boolean(MATRIX[r]));
    // rule 18: every role held counts, and its permissions are added together
    const roles = ROLE_RANK.filter((r) => held.includes(r));
    if (roles.length) {
      const pinned =
        matched.find((r) => r.role === roles[0] && r.barangay_id != null) ??
        matched.find((r) => r.barangay_id != null) ??
        null;
      return {
        userId,
        email,
        role: roles[0],
        roles,
        barangayId: pinned?.barangay_id == null ? null : Number(pinned.barangay_id),
        authDisabled,
      };
    }
  }

  if (authDisabled) {
    return { userId, email, role: "system_admin", roles: ["system_admin"], barangayId: null, authDisabled: true };
  }

  // Section 2: the System Admin sets each user's role and barangay. Until the first assignment
  // exists, the module reports itself unconfigured and stays open, so setup is possible at all.
  const configured = await get<{ id: number }[]>("/items/brgy_user_role?fields=id&limit=1").catch(() => []);
  if (!configured || configured.length === 0) {
    return { userId, email, role: "system_admin", roles: ["system_admin"], barangayId: null, authDisabled, unconfigured: true };
  }

  return { userId, email, role: "viewer", roles: ["viewer"], barangayId: null, authDisabled };
}

export function can(access: Access, permission: BrgyPermission): boolean {
  return access.roles.some((role) => MATRIX[role].includes(permission));
}

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/** Section 4.9: only LGU staff may send an asset to a barangay, or move it between barangays. */
export function requireLguStaff(access: Access, what: string): void {
  if (access.roles.includes("municipal") || access.roles.includes("system_admin")) return;
  throw new AccessError("Only LGU staff can " + what + ".", 403);
}

/** Every route checks this before it touches data. */
export function requirePermission(access: Access, permission: BrgyPermission, what: string): void {
  if (can(access, permission)) return;
  throw new AccessError("Your role (" + access.roles.join(", ") + ") cannot " + what + ".", 403);
}

/**
 * Section 5, barangay boundary. A barangay role is pinned to its own barangay.
 * Municipal and system roles may read any barangay, but municipal may not edit a barangay's records.
 */
export function requireBarangayScope(access: Access, requested: number, permission: BrgyPermission): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new AccessError("A barangay is required.", 400);
  }
  const isSystemAdmin = access.roles.includes("system_admin");
  const isMunicipal = access.roles.includes("municipal");
  // System Admin is Vertex, not barangay staff: it works in any barangay, read or write, which is
  // what section 2 and rule 92 mean by "system setup". Without this, a system admin with no pinned
  // barangay was refused on every action that is not a plain read.
  if (isSystemAdmin) return requested;
  if (isMunicipal) {
    if (permission !== "view") {
      throw new AccessError("Municipal staff can view every barangay but cannot change a barangay's own records.", 403);
    }
    return requested;
  }
  if (access.barangayId == null) {
    throw new AccessError("No barangay is assigned to your account. Ask the System Admin to set your role and barangay.", 403);
  }
  if (access.barangayId !== requested) {
    throw new AccessError("You do not have access to this barangay's assets.", 403);
  }
  return requested;
}
