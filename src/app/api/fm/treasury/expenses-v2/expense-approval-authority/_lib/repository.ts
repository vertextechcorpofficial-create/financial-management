import { createHash } from "node:crypto";
import type { AuthorityActor, AuthorityRevision, AuthorityWorkspace, AuditEvent } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/types";
import { emptyWorkspace } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/workspace";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { COLLECTION, directus, readRows } from "./directus";

export const requestHash = (body: unknown) => createHash("sha256").update(JSON.stringify(body)).digest("hex");
export async function loadWorkspace(): Promise<{ revision: number; workspace: AuthorityWorkspace }> {
  const rows = await readRows<AuthorityRevision>(COLLECTION, "id,revision,workspace", {}, 1, { sort: "-revision" });
  const row = rows[0];
  if (!row) return { revision: 0, workspace: emptyWorkspace() };
  const workspace = typeof row.workspace === "string" ? JSON.parse(row.workspace) : row.workspace;
  if (workspace?.schemaVersion !== 1 || !Array.isArray(workspace.policies) || !Array.isArray(workspace.delegations) || !Array.isArray(workspace.exceptions)) {
    throw new AuthorityError("INVALID_STORAGE", "Unsupported authority workspace schema; no writes are allowed.", 503);
  }
  return { revision: Number(row.revision), workspace };
}
export async function priorRequest(requestId: string, hash: string, actor: AuthorityActor): Promise<AuthorityRevision | null> {
  const rows = await readRows<AuthorityRevision>(COLLECTION, "*", { request_id: { _eq: requestId } }, 1);
  const prior = rows[0];
  if (!prior) return null;
  if (prior.request_hash !== hash || Number(prior.actor_id) !== actor.id) throw new AuthorityError("IDEMPOTENCY_CONFLICT", "Request ID was already used for a different operation.", 409);
  return prior;
}
/** Single INSERT stores state and its audit event atomically. PK(revision) is a cross-process CAS. */
export async function appendRevision(expected: number, workspace: AuthorityWorkspace, event: AuditEvent,
  actor: AuthorityActor, requestId: string, hash: string): Promise<AuthorityRevision> {
  const row: AuthorityRevision = { id: `authority-${expected + 1}`, revision: expected + 1,
    request_id: requestId, request_hash: hash, actor_id: actor.id, actor_name: actor.name,
    company_id: event.companyId, created_at: new Date().toISOString(), workspace, event };
  if (Buffer.byteLength(JSON.stringify(row)) > 4_000_000) throw new AuthorityError("WORKSPACE_CAPACITY", "Workspace exceeds the 4 MB safety limit. An approved archival migration is required.", 409);
  const result = await directus<{ data: AuthorityRevision }>(`items/${COLLECTION}`, { method: "POST", body: JSON.stringify(row) });
  if (result.data?.id !== row.id) throw new AuthorityError("WRITE_UNCONFIRMED", "Save could not be confirmed. Retry with the same request ID.", 503);
  return row;
}
export async function history(actor: AuthorityActor, page: number, search = "") {
  const globalRead = actor.grants.some(g => g.permission === "expense_authority.audit.read" && g.companyId === null);
  const companyIds = [...new Set(actor.grants.filter(g => g.permission === "expense_authority.audit.read" && g.companyId !== null).map(g => g.companyId))];
  const filter: Record<string, unknown> = globalRead ? {} : { company_id: { _in: companyIds.length ? companyIds : [-1] } };
  if (search) filter.actor_name = { _icontains: search };
  return readRows<Omit<AuthorityRevision, "workspace" | "request_hash">>(COLLECTION,
    "id,revision,request_id,actor_id,actor_name,company_id,created_at,event", filter, 20, { sort: "-revision", offset: String((page - 1) * 20) });
}
