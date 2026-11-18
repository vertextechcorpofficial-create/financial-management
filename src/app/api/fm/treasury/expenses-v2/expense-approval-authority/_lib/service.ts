import { randomUUID } from "node:crypto";
import type { AuthorityActor, AuthorityContext, AuthorityRevision, AuthorityWorkspace, EvaluationResult, ReferenceOption } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/types";
import { applyCommand, type WorkspaceCommand } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/domain/workspace";
import { evaluateAuthority, type EvaluationInput } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/domain/evaluateAuthority";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/domain/authorityErrors";
import { assertCompany, hasPermission, requirePermission } from "./auth";
import { enabled, readRows } from "./directus";
import { appendRevision, loadWorkspace, priorRequest, requestHash } from "./repository";
import { mutationSchema, evaluationSchema } from "./validation";

export function scopedWorkspace(workspace: AuthorityWorkspace, actor: AuthorityActor): AuthorityWorkspace {
  if (actor.admin && actor.grants.some(g => g.permission === "expense_authority.policy.read" && g.companyId === null)) return workspace;
  return { schemaVersion: 1,
    policies: workspace.policies.filter(p => hasPermission(actor, "expense_authority.policy.read", p.companyId)),
    delegations: workspace.delegations.filter(d => hasPermission(actor, "expense_authority.policy.read", d.companyId) || hasPermission(actor, "expense_authority.delegation.manage", d.companyId)),
    exceptions: workspace.exceptions.filter(e => hasPermission(actor, "expense_authority.exception.read", e.companyId) || hasPermission(actor, "expense_authority.exception.review", e.companyId)),
  };
}
export async function context(actor: AuthorityActor): Promise<AuthorityContext> {
  const latest = await loadWorkspace();
  return { actor, revision: latest.revision, workspace: scopedWorkspace(latest.workspace, actor), storage: "READY",
    capabilities: { managePolicies: ["expense_authority.policy.create", "expense_authority.policy.edit_draft", "expense_authority.policy.submit"].some(p => actor.grants.some(g => g.permission === p)),
      manageDelegations: hasPermission(actor, "expense_authority.delegation.manage"), reviewExceptions: hasPermission(actor, "expense_authority.exception.review"),
      evaluate: hasPermission(actor, "expense_authority.evaluation.run"), saveEvaluations: hasPermission(actor, "expense_authority.evaluation.save"),
      readAudit: hasPermission(actor, "expense_authority.audit.read"), publishPolicy: hasPermission(actor, "expense_authority.policy.publish"), revokePolicy: hasPermission(actor, "expense_authority.policy.revoke") },
    integration: { enforcementIntegrated: false, budgetVerified: false, evidenceStructured: false } };
}
async function requireReference(collection: string, field: string, id: number, filter: Record<string, unknown> = {}) {
  const rows = await readRows<Record<string, unknown>>(collection, field, { ...filter, [field]: { _eq: id } }, 1);
  if (!rows.length) throw new AuthorityError("INVALID_REFERENCE", `Invalid ${collection} reference.`);
}
async function validateScope(divisionId: number | null, departmentId: number | null) {
  if (divisionId) await requireReference("division", "division_id", divisionId);
  if (departmentId) {
    await requireReference("department", "department_id", departmentId);
    if (!divisionId) throw new AuthorityError("INVALID_SCOPE", "Select a division for the department.");
    const links = await readRows("department_per_division", "id", { division_id: { _eq: divisionId }, department_id: { _eq: departmentId } }, 1);
    if (!links.length) {
      const direct = await readRows("department", "department_id", { department_id: { _eq: departmentId }, parent_division: { _eq: divisionId } }, 1);
      if (!direct.length) throw new AuthorityError("INVALID_SCOPE", "Department does not belong to the selected division.");
    }
  }
}
async function validateReferences(command: WorkspaceCommand) {
  if (command.action === "CREATE_POLICY" || command.action === "CREATE_DELEGATION") await requireReference("company", "company_id", command.companyId);
  if (command.action === "UPDATE_POLICY") {
    const ids = [...new Set(command.rules.flatMap(r => r.coaIds))];
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const rows = await readRows<{ coa_id: number }>("chart_of_accounts", "coa_id", { coa_id: { _in: batch } }, 100);
      if (rows.length !== batch.length) throw new AuthorityError("INVALID_REFERENCE", "One or more mapped chart-of-account IDs do not exist.");
    }
  }
  if (command.action === "CREATE_DELEGATION") {
    await validateScope(command.divisionId, command.departmentId);
    const users = await readRows<{ user_fname: string; user_lname: string; is_deleted: unknown; isDeleted: unknown; is_blocked: unknown }>("user",
      "user_fname,user_lname,is_deleted,isDeleted,is_blocked", { user_id: { _eq: command.userId }, company_id: { _eq: command.companyId } }, 1);
    const user = users[0];
    if (!user || enabled(user.is_deleted) || enabled(user.isDeleted) || enabled(user.is_blocked)) throw new AuthorityError("INVALID_REFERENCE", "Assignee must be an active, unblocked ERP user in the selected company.");
    return [user.user_fname, user.user_lname].filter(Boolean).join(" ") || `User #${command.userId}`;
  }
  return "";
}
export async function mutate(actor: AuthorityActor, body: unknown) {
  const input = mutationSchema.parse(body);
  const hash = requestHash(input);
  const latest = await loadWorkspace();
  const command = input.command;
  const permission = command.action === "CREATE_POLICY" ? "expense_authority.policy.create"
    : command.action === "UPDATE_POLICY" ? "expense_authority.policy.edit_draft"
    : command.action === "SUBMIT_POLICY" ? "expense_authority.policy.submit"
    : command.action === "PUBLISH_POLICY" ? "expense_authority.policy.publish"
    : command.action === "REVOKE_POLICY" ? "expense_authority.policy.revoke"
    : command.action === "RESOLVE_EXCEPTION" ? "expense_authority.exception.review" : "expense_authority.delegation.manage";
  const companyId = "companyId" in command ? command.companyId
    : command.action === "UPDATE_POLICY" || command.action === "SUBMIT_POLICY" || command.action === "PUBLISH_POLICY" || command.action === "REVOKE_POLICY"
      ? latest.workspace.policies.find(p => p.id === command.id)?.companyId
      : command.action === "REVOKE_DELEGATION" ? latest.workspace.delegations.find(d => d.id === command.id)?.companyId
      : command.action === "RESOLVE_EXCEPTION" ? latest.workspace.exceptions.find(e => e.id === command.id)?.companyId : undefined;
  if (companyId === undefined) throw new AuthorityError("NOT_FOUND", "Target record was not found in the authorized workspace.", 404);
  requirePermission(actor, permission, companyId);
  assertCompany(actor, companyId);
  const replay = await priorRequest(input.requestId, hash, actor);
  if (replay) return { revision: replay.revision, event: replay.event, replayed: true };
  if (latest.revision !== input.expectedRevision) throw new AuthorityError("REVISION_CONFLICT", "Configuration changed. Refresh and review before saving.", 409);
  const name = await validateReferences(input.command);
  const next = applyCommand(latest.workspace, input.command, actor, new Date().toISOString(), randomUUID(), name);
  const row = await appendRevision(latest.revision, next.workspace, next.event, actor, input.requestId, hash);
  return { revision: row.revision, event: row.event, replayed: false };
}

interface ExpenseRecord {
  id: number; amount: number | string; expense_date: string; division_id: number | null; department_id: number | null; coa_id: number | null;
  created_by: { user_id: number; company_id: number | null } | null;
  payee: { id: number; user_id: number | null } | null; receipt_url: string | null; remarks: string | null; updated_at: string | null;
}
export async function evaluate(actor: AuthorityActor, body: unknown) {
  const input = evaluationSchema.parse(body);
  const hash = requestHash(input);
  if (input.save) {
    const replay = await priorRequest(input.requestId, hash, actor);
    if (replay) {
      assertCompany(actor, Number(replay.company_id));
      return { result: replay.event.after as EvaluationResult, revision: replay.revision, evaluationId: replay.id, saved: true, replayed: true };
    }
  }
  const latest = await loadWorkspace();
  const policy = latest.workspace.policies.find(p => p.id === input.policyId);
  if (!policy) throw new AuthorityError("NOT_FOUND", "Policy not found.", 404);
  requirePermission(actor, "expense_authority.policy.read", policy.companyId);
  assertCompany(actor, policy.companyId);
  let categoryCode = input.categoryCode || "", amount = input.amount || "";
  let divisionId = input.divisionId ?? null, departmentId = input.departmentId ?? null, coaId = input.coaId ?? null;
  let requesterId: number | null = null, beneficiaryUserId: number | null = null;
  let businessPurpose: string | null = null, receiptPresent: boolean | null = null;
  let possibleSplit: boolean | null = null;
  let sourceUpdatedAt: string | null = null;
  if (input.expenseId !== null) {
    // Never use caller overrides to evaluate an existing financial record.
    if (input.amount !== undefined || input.categoryCode !== undefined || input.divisionId !== undefined || input.departmentId !== undefined || input.coaId !== undefined) {
      throw new AuthorityError("EXPENSE_OVERRIDE", "Existing-expense evaluation accepts only expense ID and policy ID; financial fields are read server-side.");
    }
    const filter: Record<string, unknown> = { id: { _eq: input.expenseId }, is_deleted: { _eq: false } };
    if (!actor.admin) filter.created_by = { user_id: { _eq: actor.id }, company_id: { _eq: actor.companyId } };
    const rows = await readRows<ExpenseRecord>("expense", "id,amount,expense_date,division_id,department_id,coa_id,created_by.user_id,created_by.company_id,payee.id,payee.user_id,receipt_url,remarks,updated_at", filter, 1);
    const expense = rows[0];
    if (!expense) throw new AuthorityError("NOT_FOUND", "Expense not found in your authorized scope.", 404);
    if (Number(expense.created_by?.company_id) !== policy.companyId) throw new AuthorityError("SCOPE_MISMATCH", "Requester company does not match policy scope; this expense cannot be evaluated under that company policy.", 403);
    amount = String(expense.amount); divisionId = expense.division_id; departmentId = expense.department_id; coaId = expense.coa_id;
    const mapped = policy.rules.filter(r => coaId !== null && r.coaIds.includes(coaId));
    if (mapped.length !== 1) throw new AuthorityError("UNKNOWN_MAPPING", "Map this expense's COA to exactly one category before evaluating it.", 422);
    categoryCode = mapped[0].code; requesterId = expense.created_by?.user_id || null; beneficiaryUserId = expense.payee?.user_id || null;
    businessPurpose = expense.remarks || ""; receiptPresent = !!expense.receipt_url?.trim();
    sourceUpdatedAt = expense.updated_at || null;
    // Narrow same-date/payee/COA hints; incomplete grouping never clears anti-splitting controls.
    if (expense.payee?.id && expense.expense_date && requesterId) {
      const related = await readRows<{ id: number }>("expense", "id", {
        id: { _neq: input.expenseId }, is_deleted: { _eq: false }, payee: { _eq: expense.payee.id },
        expense_date: { _eq: expense.expense_date }, coa_id: { _eq: coaId }, created_by: { _eq: requesterId },
      }, 1);
      possibleSplit = related.length > 0;
    }
  } else {
    if (!categoryCode || !amount) throw new AuthorityError("INVALID_SIMULATION", "Select a category and enter an amount.");
    await validateScope(divisionId, departmentId);
    if (coaId) await requireReference("chart_of_accounts", "coa_id", coaId);
  }
  const engineInput: EvaluationInput = { policy, categoryCode, amount, companyId: policy.companyId, divisionId, departmentId, coaId,
    expenseId: input.expenseId, requesterId, beneficiaryUserId, decisionMakerId: input.expenseId === null ? null : actor.id,
    businessPurpose, receiptPresent, delegations: latest.workspace.delegations, now: new Date().toISOString(),
    budget: { verified: false, available: null }, structuredEvidenceVerified: false, possibleSplit, sourceUpdatedAt };
  const result = evaluateAuthority(engineInput);
  if (input.expenseId !== null) {
    result.checks.push({ code: "EXPENSE_COMPANY", status: "UNKNOWN", severity: "REVIEW", message: "V2 has no expense company field; scope uses the current requester's company and requires Finance confirmation." });
    result.reviewReasons.push("Expense company ownership requires Finance confirmation.");
    if (result.decision !== "BLOCKED") result.decision = "NEEDS_REVIEW";
  }
  if (!input.save) return { result, revision: latest.revision, saved: false };
  if (input.expectedRevision !== latest.revision) throw new AuthorityError("REVISION_CONFLICT", "Configuration changed. Refresh and evaluate again.", 409);
  const evaluationId = `authority-${latest.revision + 1}`;
  if (result.decision !== "ELIGIBLE") {
    if (latest.workspace.exceptions.length >= 5000) throw new AuthorityError("WORKSPACE_CAPACITY", "Exception storage capacity reached.", 409);
    latest.workspace.exceptions.push({ id: randomUUID(), companyId: policy.companyId, evaluationId, expenseId: input.expenseId, policyId: policy.id,
      summary: `${result.mode === "SIMULATION" ? "Simulation" : `Expense #${input.expenseId}`}: ${result.decision.replaceAll("_", " ")}`,
      codes: result.checks.filter(c => c.status !== "PASS").map(c => c.code), status: "OPEN", resolution: null, updatedBy: actor.id, updatedAt: result.evaluatedAt });
  }
  const row = await appendRevision(latest.revision, latest.workspace, { action: "SAVE_EVALUATION", entityId: evaluationId,
    companyId: policy.companyId, reason: "Policy evaluation snapshot; no approval, budget reservation or disbursement performed.", before: null, after: result }, actor, input.requestId, hash);
  return { result, revision: row.revision, evaluationId: row.id, saved: true };
}

export async function references(actor: AuthorityActor, params: URLSearchParams) {
  const kind = params.get("kind") || "companies";
  const page = Number(params.get("page") || "1"), search = (params.get("search") || "").trim();
  const companyId = Number(params.get("companyId") || actor.companyId || "0");
  if (["divisions", "departments", "coas"].includes(kind) && !actor.grants.some(g => ["expense_authority.evaluation.run", "expense_authority.policy.edit_draft"].includes(g.permission))) {
    throw new AuthorityError("FORBIDDEN", "A policy-edit or evaluation permission is required for reference data.", 403);
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || search.length > 100) throw new AuthorityError("INVALID_QUERY", "Invalid reference search or page.");
  const extra = { offset: String((page - 1) * 50) };
  let items: ReferenceOption[];
  if (kind === "companies") {
    const scopedIds = [...new Set(actor.grants.map(g => g.companyId).filter((id): id is number => id !== null))];
    const globalCompanyAccess = actor.grants.some(g => g.companyId === null && ["expense_authority.policy.create", "expense_authority.delegation.manage"].includes(g.permission));
    const filter: Record<string, unknown> = globalCompanyAccess ? {} : { company_id: { _in: scopedIds.length ? scopedIds : [-1] } };
    if (search) filter.company_name = { _icontains: search };
    const rows = await readRows<{ company_id: number; company_name: string }>("company", "company_id,company_name", filter, 50, { ...extra, sort: "company_name" });
    items = rows.filter(r => globalCompanyAccess || hasPermission(actor, "expense_authority.policy.create", r.company_id) || hasPermission(actor, "expense_authority.delegation.manage", r.company_id)).map(r => ({ id: r.company_id, name: r.company_name }));
  } else if (kind === "users") {
    requirePermission(actor, "expense_authority.delegation.manage", companyId); assertCompany(actor, companyId);
    if (!companyId) throw new AuthorityError("INVALID_SCOPE", "Select a company first.");
    const filter: Record<string, unknown> = { company_id: { _eq: companyId }, is_deleted: { _eq: false }, is_blocked: { _eq: false } };
    if (search) filter._or = [{ user_fname: { _icontains: search } }, { user_lname: { _icontains: search } }];
    const rows = await readRows<{ user_id: number; user_fname: string; user_lname: string }>("user", "user_id,user_fname,user_lname", filter, 50, { ...extra, sort: "user_fname,user_id" });
    items = rows.map(r => ({ id: r.user_id, name: [r.user_fname, r.user_lname].filter(Boolean).join(" "), companyId }));
  } else if (kind === "expenses") {
    requirePermission(actor, "expense_authority.evaluation.run", companyId);
    if (!companyId) throw new AuthorityError("INVALID_SCOPE", "Select a company first.");
    assertCompany(actor, companyId);
    const filter: Record<string, unknown> = { is_deleted: { _eq: false }, created_by: { company_id: { _eq: companyId }, ...(!actor.admin ? { user_id: { _eq: actor.id } } : {}) } };
    if (search) filter.doc_no = { _icontains: search };
    const rows = await readRows<{ id: number; doc_no: string }>("expense", "id,doc_no", filter, 50, { ...extra, sort: "-id" });
    items = rows.map(r => ({ id: r.id, name: r.doc_no || `Expense #${r.id}` }));
  } else if (kind === "divisions") {
    const rows = await readRows<{ division_id: number; division_name: string }>("division", "division_id,division_name", search ? { division_name: { _icontains: search } } : {}, 50, { ...extra, sort: "division_name" });
    items = rows.map(r => ({ id: r.division_id, name: r.division_name }));
  } else if (kind === "departments") {
    const rows = await readRows<{ department_id: number; department_name: string; parent_division: number }>("department", "department_id,department_name,parent_division", search ? { department_name: { _icontains: search } } : {}, 50, { ...extra, sort: "department_name" });
    items = rows.map(r => ({ id: r.department_id, name: r.department_name, divisionId: r.parent_division }));
  } else if (kind === "coas") {
    const rows = await readRows<{ coa_id: number; gl_code: string; account_title: string }>("chart_of_accounts", "coa_id,gl_code,account_title", search ? { account_title: { _icontains: search } } : {}, 50, { ...extra, sort: "gl_code,coa_id" });
    items = rows.map(r => ({ id: r.coa_id, name: `${r.gl_code || r.coa_id} · ${r.account_title}` }));
  } else throw new AuthorityError("INVALID_RESOURCE", "Unknown reference resource.", 404);
  return { items, page, hasMore: items.length === 50 };
}
export function publicEvent(row: Omit<AuthorityRevision, "workspace" | "request_hash">) {
  return { id: row.id, revision: row.revision, actor_id: row.actor_id, actor_name: row.actor_name, company_id: row.company_id, created_at: row.created_at, event: row.event };
}
