import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertMutationOrigin } from "../../expense-approval-authority/_lib/auth";
import { directus, readRows } from "../../expense-approval-authority/_lib/directus";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { normalizeMoney } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/validatePolicyRules";
import { PROPOSED_RULES } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/policy-seed";
import { specialRuleProblems } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/filingSpecialRules";
import type { IndependentExpenseEvent, IndependentExpenseSnapshot } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/independentTypes";
import { latestRequests, requestEvents, requireWorkflowAccess, REQUEST_COLLECTION, REQUEST_FIELDS, responseHeaders, verifyAttachmentProof } from "../_lib/independent";
import { dummyConfiguration, requireDummyConfig } from "../_lib/dummy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const formSchema = z.object({
  expenseDate: z.string().max(10), amount: z.string().trim().max(20), category: z.string().max(80),
  purpose: z.string().trim().max(2000), payee: z.string().trim().max(200),
  requestedCompany: z.string().trim().max(200), department: z.string().trim().max(200),
  specialDetails: z.record(z.string().max(80), z.string().trim().max(2000)).refine(value => Object.keys(value).length <= 30, "Too many special-rule fields").optional(),
  executionMode: z.literal("DUMMY").optional(),
  attachments: z.array(z.object({ id: z.string().uuid(), name: z.string().max(255), type: z.string().max(100), size: z.number().int().positive().max(10 * 1024 * 1024), proof: z.string().length(64) }).strict()).max(10),
}).strict();
const commandSchema = z.object({ action: z.enum(["SAVE_DRAFT", "SUBMIT"]), requestKey: z.string().uuid(), requestId: z.string().uuid().optional(), expectedRevision: z.number().int().positive().optional(), form: formSchema }).strict();
async function organization(actor: Awaited<ReturnType<typeof requireWorkflowAccess>>, requireComplete = true) {
  if (requireComplete && (!actor.companyId || !actor.departmentId)) throw new AuthorityError("INVALID_ORGANIZATION", "Your account must have an assigned company and department before filing an expense.", 422);
  const companyRows = actor.companyId ? await readRows<{ company_name: string }>("company", "company_name", { company_id: { _eq: actor.companyId } }, 1) : [];
  const fallbackCompanyRows = companyRows.length || !actor.companyId ? companyRows : await readRows<{ company_name: string }>("company_list", "company_name", { company_id: { _eq: actor.companyId } }, 1);
  const departmentRows = actor.departmentId ? await readRows<{ department_name: string; is_delete: unknown }>("department", "department_name,is_delete", { department_id: { _eq: actor.departmentId } }, 1) : [];
  const department = departmentRows[0];
  if (requireComplete && (!department || department.is_delete === 1 || department.is_delete === true)) throw new AuthorityError("INVALID_ORGANIZATION", "Your account department is unavailable or inactive.", 422);
  return {
    companyId: actor.companyId,
    companyName: fallbackCompanyRows[0]?.company_name || (actor.companyId ? `Company #${actor.companyId}` : "Company not assigned"),
    departmentId: actor.departmentId,
    departmentName: department?.department_name || (actor.departmentId ? `Department #${actor.departmentId}` : "Department not assigned"),
  };
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof AuthorityError ? error.message : error instanceof z.ZodError || error instanceof SyntaxError ? "Invalid expense fields. Review your entries and retry." : "Request could not be confirmed. Retry using the same saved intent." }, { status: error instanceof AuthorityError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503, headers: responseHeaders });
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireWorkflowAccess(request);
    const id = request.nextUrl.searchParams.get("requestId");
    if (id && !z.string().uuid().safeParse(id).success) throw new AuthorityError("INVALID_ID", "Invalid request reference.", 400);
    const events = await requestEvents({ requester_id: { _eq: actor.id }, ...(id ? { case_id: { _eq: id } } : {}) });
    const config = await dummyConfiguration();
    let dummyEnabled = false;
    try { requireDummyConfig(config); dummyEnabled = true; } catch { /* Intake stays available without Dummy activation. */ }
    const org = await organization(actor, false);
    return NextResponse.json({ data: { actor: { id: actor.id, name: actor.name }, organization: org, items: latestRequests(events), history: id ? [...events].sort((a, b) => a.revision - b.revision) : [], categories: PROPOSED_RULES.map(rule => ({ code: rule.code, name: rule.name })), approvalEnabled: false, dummyEnabled } }, { headers: responseHeaders });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    assertMutationOrigin(request);
    const actor = await requireWorkflowAccess(request);
    const org = await organization(actor);
    const text = await request.text();
    if (Buffer.byteLength(text) > 50_000) throw new AuthorityError("TOO_LARGE", "Expense request exceeds 50 KB.", 413);
    const input = commandSchema.parse(JSON.parse(text));
    const key = `independent:${actor.id}:${input.requestKey}`;
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const prior = (await readRows<IndependentExpenseEvent>(REQUEST_COLLECTION, REQUEST_FIELDS, { request_key: { _eq: key }, requester_id: { _eq: actor.id } }, 1))[0];
    if (prior) {
      if (prior.payload_hash !== hash) throw new AuthorityError("IDEMPOTENCY_CONFLICT", "This intent key was used for different expense details.", 409);
      return NextResponse.json({ data: { request: prior, replayed: true } }, { headers: responseHeaders });
    }
    const history = input.requestId ? await requestEvents({ case_id: { _eq: input.requestId }, requester_id: { _eq: actor.id } }) : [];
    const current = latestRequests(history)[0];
    if (input.requestId && (!current || current.revision !== input.expectedRevision)) throw new AuthorityError("REVISION_CONFLICT", "Request changed or is outside your scope. Refresh and review before retrying.", 409);
    if (!input.requestId && input.expectedRevision) throw new AuthorityError("INVALID_INTENT", "New requests cannot specify an existing revision.", 400);
    if (current && !["DRAFT", "NEEDS_CORRECTION"].includes(current.snapshot.status)) throw new AuthorityError("STATE_CONFLICT", "Only your drafts or returned requests can be edited.", 409);
    const form = input.form;
    if (current?.snapshot.executionMode === "DUMMY" && form.executionMode !== "DUMMY") throw new AuthorityError("MODE_CONFLICT", "A Dummy request cannot be converted to an ordinary request.", 409);
    if (form.executionMode === "DUMMY") requireDummyConfig(await dummyConfiguration());
    if (form.expenseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(form.expenseDate) || !Number.isFinite(Date.parse(`${form.expenseDate}T00:00:00Z`)) || new Date(`${form.expenseDate}T00:00:00Z`).toISOString().slice(0, 10) !== form.expenseDate)) throw new AuthorityError("INVALID_DATE", "Enter a valid expense date.", 422);
    if (form.category && !PROPOSED_RULES.some(rule => rule.code === form.category)) throw new AuthorityError("INVALID_CATEGORY", "Choose a workflow expense category.", 422);
    const amount = form.amount ? normalizeMoney(form.amount) : "";
    for (const file of form.attachments) verifyAttachmentProof(actor.id, file.id, file.proof);
    if (new Set(form.attachments.map(file => file.id)).size !== form.attachments.length) throw new AuthorityError("DUPLICATE_ATTACHMENT", "A document may only be attached once.", 422);
    if (input.action === "SUBMIT" && (!amount || !form.expenseDate || !form.category || form.purpose.length < 10 || !form.payee || !form.attachments.length)) throw new AuthorityError("INCOMPLETE_EXPENSE", "Submission requires date, amount, category, payee, a meaningful business purpose and at least one supporting document.", 422);
    const problems = specialRuleProblems(form.category, form.specialDetails || {}, form.attachments.map(file => file.id), input.action === "SUBMIT");
    if (problems.length) throw new AuthorityError("SPECIAL_RULES", problems.join(" "), 422);
    const caseId = current?.case_id || randomUUID();
    const revision = (current?.revision || 0) + 1;
    const trustedForm = { ...form, requestedCompany: org.companyName, department: org.departmentName };
    const snapshot: IndependentExpenseSnapshot = {
      ...trustedForm, amount, kind: "INDEPENDENT_EXPENSE", reference: current?.snapshot.reference || `EAW-${caseId.toUpperCase()}`,
      requesterName: current?.snapshot.requesterName || actor.name,
      status: input.action === "SUBMIT" ? "AWAITING_DECISION" : "DRAFT", companyOwnership: "UNVERIFIED",
       fingerprint: createHash("sha256").update(JSON.stringify({ ...trustedForm, amount })).digest("hex"),
    };
    const event: IndependentExpenseEvent = {
      id: `independent:${caseId}:${revision}`, case_id: caseId, revision,
      // This is requester context only. Zero means unspecified, never default legal ownership.
      company_id: actor.companyId || 0, requester_id: actor.id, actor_id: actor.id, actor_name: actor.name,
      request_key: key, payload_hash: hash, created_at: new Date().toISOString(), snapshot,
      action: input.action, reason: input.action === "SUBMIT" ? "Submitted directly to the assigned approver for review and decision." : "Requester saved an independent expense draft.",
    };
    const saved = await directus<{ data: IndependentExpenseEvent }>(`items/${REQUEST_COLLECTION}`, { method: "POST", body: JSON.stringify(event) });
    if (saved.data?.id !== event.id) throw new AuthorityError("WRITE_UNCONFIRMED", "Save not confirmed. Retry the same intent key.", 503);
    return NextResponse.json({ data: { request: saved.data, replayed: false } }, { status: 201, headers: responseHeaders });
  } catch (error) { return failure(error); }
}
