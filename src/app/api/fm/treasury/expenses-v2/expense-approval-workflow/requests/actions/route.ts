import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertMutationOrigin } from "../../../expense-approval-authority/_lib/auth";
import { latestRequests, requestEvents, requireWorkflowAccess, responseHeaders } from "../../_lib/independent";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";

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

    // No decision is safe until this ledger has verified workflow assignment,
    // effective delegation, company ownership, and current expense revision.
    throw new AuthorityError("AUTHORITY_UNVERIFIED", "Decision unavailable: verified assignment, delegation and company scope are not configured.", 403);
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
