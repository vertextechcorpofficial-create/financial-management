import { NextResponse, type NextRequest } from "next/server";
import { requireAuthorityAccess } from "../../expense-approval-authority/_lib/auth";
import { readRows } from "../../expense-approval-authority/_lib/directus";
import { loadWorkspace } from "../../expense-approval-authority/_lib/repository";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { evaluateAuthority } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/evaluateAuthority";
import type { EvaluationResult } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Expense {
  id: number; doc_no: string; amount: string | number; status: string; expense_date: string;
  division_id: number | null; department_id: number | null; coa_id: number | null;
  created_by: { user_id: number; company_id: number } | null;
  payee: { user_id: number | null } | null; receipt_url: string | null; remarks: string | null; updated_at: string | null;
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  try {
    const actor = await requireAuthorityAccess(request);
    const { resource } = await params;
    if (!["context", "inbox", "finance-review", "history", "settings"].includes(resource)) throw new AuthorityError("NOT_FOUND", "Unknown workflow endpoint.", 404);
    const base = { mode: "SHADOW", decisionsEnabled: false, blocker: "Exclusive workflow ownership, transactional decisions and budget verification are not integrated." };
    if (resource === "context") return NextResponse.json({ data: { ...base, actor: { id: actor.id, name: actor.name, companyId: actor.companyId } } }, { headers: { "Cache-Control": "no-store" } });
    if (!actor.companyId || !Number.isSafeInteger(actor.companyId) || actor.companyId <= 0) throw new AuthorityError("SCOPE_REQUIRED", "A verified company assignment is required to read financial requests.", 403);
    if (resource === "history") return NextResponse.json({ data: { ...base, items: [], explanation: "No Option B decisions can exist through this prototype. Legacy history remains in Expense Approval V2." } }, { headers: { "Cache-Control": "no-store" } });
    // Live Dummy schema inspection confirmed expense has no immutable company/owner
    // field. A requester's current company cannot authorize operational expense reads.
    // Keep these queues empty until an authoritative ownership adapter is deployed.
    if (resource === "inbox" || resource === "finance-review") {
      return NextResponse.json({ data: { ...base, ownershipStatus: "OWNERSHIP_UNRESOLVED", items: [], hasMore: false,
        explanation: "Expense company ownership has not been independently established. No unverified expenses are exposed. An authoritative ownership and reconciliation backend is required." } }, { headers: { "Cache-Control": "no-store" } });
    }
    const { workspace } = await loadWorkspace();
    const now = new Date().toISOString();
    const policies = workspace.policies.filter(p => p.companyId === actor.companyId && p.status === "PUBLISHED" && p.effectiveFrom && p.effectiveFrom <= now && (!p.effectiveTo || now < p.effectiveTo));
    const assignments = workspace.delegations.filter(d => d.companyId === actor.companyId && d.userId === actor.id && d.status === "ACTIVE" && d.startsAt <= now && (!d.endsAt || now < d.endsAt));
    if (resource === "settings") return NextResponse.json({ data: { ...base, policies, assignments } }, { headers: { "Cache-Control": "no-store" } });
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AuthorityError("INVALID_QUERY", "Invalid page.");
    const reviewer = actor.grants.some(g => g.permission === "expense_authority.exception.review" && (g.companyId === null || g.companyId === actor.companyId));
    if (resource === "finance-review" && !reviewer) throw new AuthorityError("FORBIDDEN", "Finance review authorization is required.", 403);
    const filter: Record<string, unknown> = { is_deleted: { _eq: false }, status: { _eq: "Pending Approval" }, created_by: { company_id: { _eq: actor.companyId } } };
    // ERP admin alone is not a financial read/approval assignment.
    if (!reviewer) {
      if (!assignments.length) return NextResponse.json({ data: { ...base, items: [], page, hasMore: false, explanation: "No active officer assignment. No other employees' expenses are exposed." } }, { headers: { "Cache-Control": "no-store" } });
      filter._or = assignments.map(d => ({ ...(d.divisionId ? { division_id: { _eq: d.divisionId } } : {}), ...(d.departmentId ? { department_id: { _eq: d.departmentId } } : {}) }));
    }
    const rows = await readRows<Expense>("expense", "id,doc_no,amount,status,expense_date,division_id,department_id,coa_id,created_by.user_id,created_by.company_id,payee.user_id,receipt_url,remarks,updated_at", filter, 25, { sort: "-id", offset: String((page - 1) * 25) });
    const items = rows.flatMap<{ expense: Expense; result: EvaluationResult | null; issue: string }>(expense => {
      if (Number(expense.created_by?.company_id) !== actor.companyId) return [];
      const policy = policies.length === 1 ? policies[0] : null;
      const mapping = policy?.rules.filter(r => expense.coa_id !== null && r.coaIds.includes(expense.coa_id)) || [];
      if (!policy || mapping.length !== 1) return reviewer ? [{ expense, result: null, issue: !policy ? "Exactly one effective published policy is required." : "COA must map to exactly one category." }] : [];
      const result = evaluateAuthority({ policy, categoryCode: mapping[0].code, amount: String(expense.amount), companyId: actor.companyId!, divisionId: expense.division_id, departmentId: expense.department_id, coaId: expense.coa_id, expenseId: expense.id, requesterId: expense.created_by?.user_id || null, beneficiaryUserId: expense.payee?.user_id || null, decisionMakerId: actor.id, businessPurpose: expense.remarks, receiptPresent: !!expense.receipt_url, delegations: workspace.delegations, now, budget: { verified: false, available: null }, structuredEvidenceVerified: false, possibleSplit: null, sourceUpdatedAt: expense.updated_at });
      if (!reviewer && !result.candidateApproverIds.includes(actor.id)) return [];
      return [{ expense, result, issue: base.blocker }];
    });
    return NextResponse.json({ data: { ...base, items, page, hasMore: rows.length === 25, explanation: "Pages scan source records; assignment filtering can yield an empty page with more records available. Requester-company linkage is provisional, not verified expense ownership." } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof AuthorityError;
    return NextResponse.json({ error: known ? error.message : "Workflow data unavailable. No decision was saved." }, { status: known ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
export async function POST() {
  return NextResponse.json({ error: "Option B decisions are disabled: exclusive ownership and atomic backend integration have not been verified.", code: "WORKFLOW_INTEGRATION_REQUIRED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
