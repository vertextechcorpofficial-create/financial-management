import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertMutationOrigin } from "../../../expense-approval-authority/_lib/auth";
import { latestRequests, requestEvents, requireWorkflowAccess, responseHeaders, REQUEST_COLLECTION } from "../../_lib/independent";
import { directus } from "../../../expense-approval-authority/_lib/directus";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { dummyConfiguration, requireDummyConfig } from "../../_lib/dummy";
import { dummyTier, dummyTransition } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/dummyWorkflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  requestId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  requestKey: z.string().uuid(),
  action: z.enum(["APPROVE", "REJECT", "RETURN"]),
  reason: z.string().trim().min(5).max(2000),
  review: z.object({
    department: z.string().trim().min(1).max(200),
    evidence: z.string().max(2000).optional().default(""),
    quotations: z.enum(["NOT_REQUIRED", "THREE_CHECKED", "EXCEPTION_CHECKED"]),
    documentsChecked: z.boolean(),
    companyChecked: z.boolean(),
    categoryChecked: z.boolean(),
    specialRulesChecked: z.boolean(),
  }).strict().optional(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    assertMutationOrigin(request);
    const actor = await requireWorkflowAccess(request);
    const text = await request.text();
    if (Buffer.byteLength(text) > 15_000) throw new AuthorityError("TOO_LARGE", "Action exceeds 15 KB.", 413);
    const input = schema.parse(JSON.parse(text));
    const current = latestRequests(await requestEvents({ case_id: { _eq: input.requestId } }))[0];
    if (!current) throw new AuthorityError("NOT_FOUND", "Request not found.", 404);
    if (current.requester_id === actor.id) throw new AuthorityError("SELF_APPROVAL", "Requesters cannot approve, reject or return their own requests.", 403);
    if (current.revision !== input.expectedRevision) throw new AuthorityError("REVISION_CONFLICT", "Request changed. Refresh and review the current revision.", 409);

    const config = requireDummyConfig(await dummyConfiguration());
    if (!actor.companyId || current.company_id !== actor.companyId || current.company_id !== config.snapshot.companyId) {
      throw new AuthorityError("FORBIDDEN_SCOPE", "This request is outside the approver's company scope.", 403);
    }
    if (current.snapshot.executionMode !== "DUMMY") throw new AuthorityError("CONTROL_UNVERIFIED", "Only explicitly configured Dummy requests can be decided in this workflow.", 422);
    const tier = dummyTier(current.snapshot.category, current.snapshot.amount);
    if (config.snapshot.officers[tier] !== actor.id) throw new AuthorityError("FORBIDDEN", `Only the assigned ${tier} approver may decide this request.`, 403);
    const hash = createHash("sha256").update(text).digest("hex");
    const requestKey = `independent:${actor.id}:${input.requestKey}`;
    const prior = latestRequests(await requestEvents({ request_key: { _eq: requestKey }, actor_id: { _eq: actor.id } }))[0];
    if (prior) {
      if (prior.payload_hash !== hash) throw new AuthorityError("IDEMPOTENCY_CONFLICT", "This request key was used for different action details.", 409);
      return NextResponse.json({ data: { request: prior, replayed: true } }, { headers: responseHeaders });
    }
    const now = new Date().toISOString();
    const snapshot = dummyTransition(current, actor.id, input, config.snapshot, config.revision, now);
    const event = {
      id: `independent:${current.case_id}:${current.revision + 1}`,
      case_id: current.case_id,
      revision: current.revision + 1,
      company_id: current.company_id,
      requester_id: current.requester_id,
      actor_id: actor.id,
      actor_name: actor.name,
      request_key: requestKey,
      payload_hash: hash,
      created_at: now,
      snapshot,
      action: input.action,
      reason: input.reason,
    };
    const saved = await directus<{ data: typeof event }>(`items/${REQUEST_COLLECTION}`, { method: "POST", body: JSON.stringify(event) });
    if (saved.data?.id !== event.id) throw new AuthorityError("WRITE_UNCONFIRMED", "Decision was not confirmed. Retry using the same action.", 503);
    return NextResponse.json({ data: { request: saved.data, replayed: false } }, { status: 201, headers: responseHeaders });
  } catch (error) {
    const validationMessage = error instanceof z.ZodError
      ? error.issues.map(issue => `${issue.path.join(".") || "Action"}: ${issue.message}`).join(" ")
      : "Invalid action fields.";
    return NextResponse.json({
      error: error instanceof AuthorityError
        ? error.message
        : error instanceof z.ZodError
          ? validationMessage
          : error instanceof SyntaxError
            ? "Invalid action fields."
            : "Action could not be confirmed; retry the same intent key.",
    }, {
      status: error instanceof AuthorityError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503,
      headers: responseHeaders,
    });
  }
}
