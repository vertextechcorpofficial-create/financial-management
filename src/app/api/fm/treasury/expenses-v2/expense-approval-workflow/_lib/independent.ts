import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireAuthorityAccess } from "../../expense-approval-authority/_lib/auth";
import { readRows } from "../../expense-approval-authority/_lib/directus";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import type { IndependentExpenseEvent } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/independentTypes";

export const REQUEST_COLLECTION = "fm_isolated_expense_events";
export const REQUEST_FIELDS = "id,case_id,revision,company_id,requester_id,actor_id,actor_name,request_key,payload_hash,created_at,snapshot,action,reason";
export const responseHeaders = { "Cache-Control": "no-store", Vary: "Cookie" };
const ROOT = "/fm/treasury/expenses-v2/expense-approval-workflow";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function normalizedOrigin(value: string | null) {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}

/** Accept the public origin when Next is behind a reverse proxy. */
export function assertWorkflowMutationOrigin(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const expectedOrigins = new Set([requestUrl.origin]);
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(request.headers.get("host"));
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto")) || requestUrl.protocol.slice(0, -1);
  if (host) {
    expectedOrigins.add(normalizedOrigin(`${protocol}://${host}`) || "");
    const forwardedPort = firstHeaderValue(request.headers.get("x-forwarded-port"));
    if (forwardedHost && forwardedPort && !forwardedHost.includes(":")) expectedOrigins.add(normalizedOrigin(`${protocol}://${forwardedHost}:${forwardedPort}`) || "");
  }

  const origin = normalizedOrigin(request.headers.get("origin"));
  if (!origin || !expectedOrigins.has(origin) || request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site") {
    throw new AuthorityError("INVALID_ORIGIN", "A same-origin browser request is required.", 403);
  }
}

export async function requireWorkflowAccess(request: NextRequest) {
  const actor = await requireAuthorityAccess(request);
  if (!actor.admin) {
    const rows = await readRows<{ module_id: { base_path?: string } | null }>("user_access_modules", "module_id.base_path", { user_id: { _eq: actor.id } }, 501);
    if (rows.length > 500 || !rows.some(row => { const path = row.module_id?.base_path?.trim().replace(/\/+$/, ""); return path === ROOT || path?.startsWith(`${ROOT}/`); })) throw new AuthorityError("FORBIDDEN", "Expense Approval Workflow module access is required.", 403);
  }
  return actor;
}

export async function requestEvents(filter: Record<string, unknown>) {
  const rows = await readRows<IndependentExpenseEvent>(REQUEST_COLLECTION, REQUEST_FIELDS, filter, 501, { sort: "-created_at,-revision" });
  if (rows.length > 500) throw new AuthorityError("CAPACITY", "Request history requires a paginated latest-state index before more records can be displayed.", 503);
  return rows.filter(row => row.snapshot?.kind === "INDEPENDENT_EXPENSE");
}
export function latestRequests(events: IndependentExpenseEvent[]) {
  const latest = new Map<string, IndependentExpenseEvent>();
  for (const event of events) if (!latest.has(event.case_id) || latest.get(event.case_id)!.revision < event.revision) latest.set(event.case_id, event);
  return [...latest.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function attachmentProof(actorId: number, fileId: string) {
  const secret = process.env.FM_WORKFLOW_ATTACHMENT_SECRET || process.env.DIRECTUS_STATIC_TOKEN;
  if (!secret) throw new AuthorityError("STORAGE_UNAVAILABLE", "Attachment signing is not configured.", 503);
  return createHmac("sha256", secret).update(`expense-workflow:${actorId}:${fileId}`).digest("hex");
}
export function verifyAttachmentProof(actorId: number, fileId: string, proof: string) {
  const expected = attachmentProof(actorId, fileId);
  if (!/^[0-9a-f]{64}$/.test(proof) || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(proof, "hex"))) throw new AuthorityError("INVALID_ATTACHMENT", "Upload supporting files through this workflow before attaching them.", 422);
}
