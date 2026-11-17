import type { NextRequest } from "next/server";
import type { AuthorityActor, AuthorityPermission } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/types";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/domain/authorityErrors";
import { enabled, readRows } from "./directus";

export const AUTHORITY_PATH = "/fm/treasury/expenses-v2/expense-approval-authority";
export const GRANT_COLLECTION = "fm_expense_authority_permission_grants";
export async function requireAuthorityAccess(request: NextRequest): Promise<AuthorityActor> {
  const token = request.cookies.get("vos_access_token")?.value;
  if (!token) throw new AuthorityError("UNAUTHENTICATED", "Please sign in to use Expense Approval Authority.", 401);
  const spring = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");
  if (!spring) throw new AuthorityError("AUTH_UNAVAILABLE", "Session verification is unavailable.", 503);
  let response: Response;
  try {
    response = await fetch(`${spring}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch { throw new AuthorityError("AUTH_UNAVAILABLE", "Session verification is unavailable; access is denied until verified.", 503); }
  if ([401, 403, 404].includes(response.status)) throw new AuthorityError("UNAUTHENTICATED", "Your session is no longer valid. Sign in again.", 401);
  if (!response.ok) throw new AuthorityError("AUTH_UNAVAILABLE", "Session verification is unavailable.", 503);
  const session = await response.json();
  // /auth/me returns the trusted ERP identity; no decoded JWT claims are used.
  const id = Number(session.id);
  if (!Number.isSafeInteger(id) || id <= 0 || enabled(session.isDeleted)) throw new AuthorityError("UNAUTHENTICATED", "Invalid verified ERP identity.", 401);
  const users = await readRows<{ user_id: number; user_fname: string; user_lname: string; user_email: string;
    company_id: number | null; role: string; isAdmin: boolean; is_deleted: boolean; isDeleted: boolean; is_blocked: boolean }>(
    "user", "user_id,user_fname,user_lname,user_email,company_id,role,isAdmin,is_deleted,isDeleted,is_blocked", { user_id: { _eq: id } }, 1);
  const user = users[0];
  if (!user || enabled(user.is_deleted) || enabled(user.isDeleted) || enabled(user.is_blocked)) throw new AuthorityError("UNAUTHENTICATED", "An active ERP account is required.", 401);
  const admin = user.role === "ADMIN" || enabled(user.isAdmin);
  {
    const moduleGrants = await readRows<{ module_id: { base_path?: string; status?: string } | null }>("user_access_modules", "module_id.base_path,module_id.status", {
      user_id: { _eq: id }, module_id: { base_path: { _eq: AUTHORITY_PATH }, status: { _eq: "active" } },
    }, 1);
    if (!moduleGrants.length) {
      throw new AuthorityError("FORBIDDEN", "An explicit Expense Approval Authority module grant is required.", 403);
    }
  }
  const grantRows = await readRows<{ permission_key: string; company_id: number | null; status: string; starts_at: string | null; expires_at: string | null }>(
    GRANT_COLLECTION, "permission_key,company_id,status,starts_at,expires_at", { user_id: { _eq: id }, status: { _eq: "active" } }, 500);
  const known = new Set<AuthorityPermission>([
    "expense_authority.policy.read", "expense_authority.policy.create", "expense_authority.policy.edit_draft", "expense_authority.policy.submit",
    "expense_authority.policy.ratify", "expense_authority.policy.publish", "expense_authority.policy.revoke", "expense_authority.delegation.manage",
    "expense_authority.evaluation.run", "expense_authority.evaluation.save", "expense_authority.exception.review", "expense_authority.audit.read",
    "expense_authority.ui.overview", "expense_authority.ui.authority-matrix", "expense_authority.ui.delegations",
    "expense_authority.ui.evaluation", "expense_authority.ui.exceptions", "expense_authority.ui.audit-history",
  ]);
  const now = Date.now();
  const grants = grantRows.flatMap(row => {
    if (!known.has(row.permission_key as AuthorityPermission) || row.status !== "active") return [];
    const start = row.starts_at ? Date.parse(row.starts_at) : Number.NEGATIVE_INFINITY;
    const end = row.expires_at ? Date.parse(row.expires_at) : Number.POSITIVE_INFINITY;
    const companyId = row.company_id === null ? null : Number(row.company_id);
    if (!Number.isFinite(start) && start !== Number.NEGATIVE_INFINITY || !Number.isFinite(end) && end !== Number.POSITIVE_INFINITY || start > now || end <= now || (companyId !== null && (!Number.isSafeInteger(companyId) || companyId <= 0))) return [];
    return [{ permission: row.permission_key as AuthorityPermission, companyId }];
  });
  return { id, admin, companyId: user.company_id ? Number(user.company_id) : null, grants,
    name: [user.user_fname, user.user_lname].filter(Boolean).join(" ") || `User #${id}`, email: user.user_email || "" };
}
export function assertCompany(actor: AuthorityActor, companyId: number) {
  if (!actor.grants.some(grant => grant.companyId === companyId || grant.companyId === null)) throw new AuthorityError("FORBIDDEN_SCOPE", "No explicit permission is granted for this company.", 403);
}
export function hasPermission(actor: AuthorityActor, permission: AuthorityPermission, companyId?: number) {
  return actor.grants.some(grant => grant.permission === permission && (companyId === undefined || grant.companyId === null || grant.companyId === companyId));
}
export function requireUiAccess(actor: AuthorityActor, page: "overview" | "authority-matrix" | "delegations" | "evaluation" | "exceptions" | "audit-history") {
  requirePermission(actor, `expense_authority.ui.${page}` as AuthorityPermission);
}
export function hasAnyUiAccess(actor: AuthorityActor) {
  return actor.grants.some(grant => grant.permission.startsWith("expense_authority.ui."));
}
export function requirePermission(actor: AuthorityActor, permission: AuthorityPermission, companyId?: number) {
  if (!hasPermission(actor, permission, companyId)) throw new AuthorityError("FORBIDDEN", `Missing required permission: ${permission}.`, 403);
}
export function assertMutationOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AuthorityError("INVALID_ORIGIN", "A same-origin browser request is required.", 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AuthorityError("INVALID_CONTENT_TYPE", "JSON is required.", 415);
}
