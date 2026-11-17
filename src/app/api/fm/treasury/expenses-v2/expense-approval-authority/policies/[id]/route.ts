import { NextResponse, type NextRequest } from "next/server";
import { requireAuthorityAccess } from "../../_lib/auth";
import { context } from "../../_lib/service";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/domain/authorityErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuthorityAccess(request), { id } = await params;
    const state = await context(actor), policy = state.workspace.policies.find(p => p.id === id);
    if (!policy) throw new AuthorityError("NOT_FOUND", "Policy not found in your authorized scope.", 404);
    return NextResponse.json({ data: policy }, { headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthorityError ? error.message : "Policy service unavailable." },
      { status: error instanceof AuthorityError ? error.status : 503, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
  }
}
