import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { latestRequests, requestEvents, requireWorkflowAccess, responseHeaders as headers } from "../expense-approval-workflow/_lib/independent";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { PROPOSED_RULES } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/policy-seed";
import type { OperationsExpense } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/operationsTypes";
import type { IndependentExpenseEvent } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/independentTypes";
import { dummyConfiguration, requireDummyConfig, type ConfigEvent } from "../expense-approval-workflow/_lib/dummy";
import type { AuthorityActor } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/types";
import { dummyTier } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/dummyWorkflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function projection(event: IndependentExpenseEvent, actor: AuthorityActor, config: ConfigEvent | null): OperationsExpense {
  const s = event.snapshot;
  const category = PROPOSED_RULES.find(rule => rule.code === s.category)?.name || s.category || "Not classified";
  let dummyEnabled = false;
  try { requireDummyConfig(config); dummyEnabled = true; } catch { /* Fail closed for decisions. */ }
  const tier = s.category && s.amount ? dummyTier(s.category, s.amount) : undefined;
  const own = actor.id === event.requester_id;
  const assignedApproverId = config?.snapshot.companyId === event.company_id && tier ? config.snapshot.officers[tier] : null;
  const assigned = !!dummyEnabled && !own && assignedApproverId === actor.id;
  return {
    source: "INDEPENDENT", id: event.case_id, doc_no: s.reference, status: s.status, amount: s.amount || "0", expense_date: s.expenseDate,
    division_id: null, department_id: null, coa_id: null, remarks: s.purpose,
    receipt_url: s.attachments.length ? JSON.stringify(s.attachments.map(file => file.id)) : null,
    created_by: { user_id: event.requester_id, user_fname: s.requesterName || event.actor_name, company_id: event.company_id || null },
    departmentName: s.department || "Not specified", divisionName: "Not specified", coaName: category, categoryName: category,
    revision: event.revision, independentSnapshot: s,
     requiredAuthority: tier, assignedApproverId,
    dummyActions: {
      finance: false,
       decide: assigned,
       blocker: !dummyEnabled ? "Dummy testing is not enabled." : own ? "Requesters cannot decide their own requests." : assigned ? "" : "Only the assigned approver may review and decide a pending request.",
    },
  };
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireWorkflowAccess(request);
    const section = request.nextUrl.searchParams.get("section") || "approvals";
    if (section !== "approvals") throw new AuthorityError("NOT_FOUND", "This workspace has been removed. Use My Approvals.", 404);
    const requestedId = request.nextUrl.searchParams.get("expenseId");
    if (requestedId && !z.string().uuid().safeParse(requestedId).success) throw new AuthorityError("INVALID_ID", "Invalid independent request reference.", 400);
    // Only this module's independent request ledger is queried. Legacy expense,
    // expense_logs and disbursement tables are not read or written here.
    const config = await dummyConfiguration();
    let dummyEnabled = false;
    try { requireDummyConfig(config); dummyEnabled = true; } catch { /* Read-only intake remains available. */ }
    if (requestedId) {
      const events = await requestEvents({ case_id: { _eq: requestedId } });
      const current = latestRequests(events)[0];
      const requesterOwns = current?.requester_id === actor.id;
      const actorRecordedDecision = current && (current.actor_id === actor.id || current.snapshot.dummyLastOfficerId === actor.id) && ["APPROVE", "REJECT", "RETURN"].includes(current.action);
      const currentTier = current?.snapshot.category && current.snapshot.amount ? dummyTier(current.snapshot.category, current.snapshot.amount) : null;
      const assigned = !!current && !!config && current.company_id === config.snapshot.companyId && currentTier !== null && config.snapshot.officers[currentTier] === actor.id && !requesterOwns;
      if (!current || (!requesterOwns && !actorRecordedDecision && !assigned)) throw new AuthorityError("NOT_FOUND", "Request not found in your scope.", 404);
      const documentIndex = request.nextUrl.searchParams.get("documentIndex");
      if (documentIndex !== null) {
        const index = Number(documentIndex);
        if (!Number.isSafeInteger(index) || index < 0 || !current.snapshot.attachments[index]) throw new AuthorityError("NOT_FOUND", "Document not found.", 404);
        return NextResponse.redirect(new URL(`/api/fm/treasury/expenses-v2/expense-approval-workflow/requests/files?requestId=${requestedId}&index=${index}`, request.url));
      }
      const logs = events.filter(event => event.case_id === current.case_id).sort((a, b) => b.revision - a.revision).map(event => ({ id: event.id, action: event.action, remarks: event.reason, created_at: event.created_at, created_by: { user_fname: event.actor_name } }));
      return NextResponse.json({ data: { expense: projection(current, actor, config), logs, historyTruncated: false, decisionsEnabled: false } }, { headers });
    }
    const expensePage = Number(request.nextUrl.searchParams.get("expensePage") || 1);
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    if (![expensePage, page].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 10000)) throw new AuthorityError("INVALID_PAGE", "Invalid page.", 400);
    const submittedScopeEvents = await requestEvents({ requester_id: { _eq: actor.id } });
    const employeeRequests = latestRequests(submittedScopeEvents).map(event => projection(event, actor, config));
    const assignedScopeEvents = await requestEvents({ company_id: { _eq: actor.companyId } });
    const assignedExpenses = latestRequests(assignedScopeEvents)
      .filter(event => event.requester_id !== actor.id && ["AWAITING_DECISION", "ESCALATED", "NEEDS_FINANCE_REVIEW"].includes(event.snapshot.status))
      .filter(event => {
        if (!config || event.company_id !== config.snapshot.companyId || event.snapshot.executionMode !== "DUMMY") return false;
        const tier = dummyTier(event.snapshot.category, event.snapshot.amount);
        return config.snapshot.officers[tier] === actor.id;
      })
      .map(event => projection(event, actor, config));
    let decidedExpenses: OperationsExpense[] = [];
    let decisionHistoryAvailable = true;
    try {
      const actorEvents = await requestEvents({ actor_id: { _eq: actor.id } });
      decidedExpenses = latestRequests(actorEvents)
        .filter(event => event.requester_id !== actor.id && (event.actor_id === actor.id || event.snapshot.dummyLastOfficerId === actor.id) && ["APPROVED", "REJECTED", "NEEDS_CORRECTION"].includes(event.snapshot.status) && ["APPROVE", "REJECT", "RETURN"].includes(event.action))
        .map(event => projection(event, actor, config));
    } catch {
      // An unavailable decision-history filter must not take down the separate
      // requester view or cause a broader, unscoped ledger read.
      decisionHistoryAvailable = false;
    }
    const blockers = [
      "Filing and request tracking are independent of Expense Creation V2 and the legacy approval queue.",
      "Pending requests are routed to the configured Dummy officer for their calculated authority tier and company.",
      "Approval remains limited to the configured officer, the requester cannot self-approve, and company scope is verified.",
      ...(!decisionHistoryAvailable ? ["Decision history could not be loaded from the current ledger scope."] : []),
    ];
    const companyId = actor.companyId && Number.isSafeInteger(actor.companyId) && actor.companyId > 0 ? actor.companyId : null;
    return NextResponse.json({ data: {
      actor: { id: actor.id, name: actor.name, companyId, authorities: config && config.snapshot.companyId === companyId ? Object.entries(config.snapshot.officers).filter(([, id]) => id === actor.id).map(([tier]) => tier) : [] },
      capabilities: { finance: false, audit: false, settings: false, editPolicies: false, manageOfficers: false }, grantStoreAvailable: false, moduleAccess: true, section, page, audit: [], hasMore: false,
      revision: config?.revision || 0, expensePage, expenseHasMore: false, moduleExpenses: [], assignedExpenses, decidedExpenses, dummyEnabled,
      employeeRequests, decisionHistoryAvailable,
      policies: [], assignments: [],
      items: [], counts: null, decisionsEnabled: false, readiness: "INDEPENDENT_INTAKE_READY",
      blockers,
    } }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthorityError ? error.message : "Workflow unavailable. No financial action was performed." }, { status: error instanceof AuthorityError ? error.status : 503, headers });
  }
}
export async function POST() {
  return NextResponse.json({ error: "Workflow administration has been removed. Decisions use the request actions endpoint." }, { status: 410, headers });
}
