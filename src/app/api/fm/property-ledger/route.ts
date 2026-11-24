import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { portfolioSchema } from "@/modules/financial-management/property-ledger/types";
import { assertTransition } from "@/modules/financial-management/property-ledger/utils/locks";
import { authorize, assertWriteAccess, commit, describeChange, latest, workspace, LedgerError } from "@/modules/financial-management/property-ledger/services/server";
import { LEDGER_PAGES, type LedgerPage } from "@/modules/financial-management/property-ledger/navigation";
import { assertRegistrations } from "@/modules/financial-management/property-ledger/utils/registration";
import { mergeCompanyChanges } from "@/modules/financial-management/property-ledger/utils/companies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  const status = error instanceof LedgerError ? error.status : error instanceof z.ZodError ? 422 : 500;
  const message = error instanceof z.ZodError ? error.issues.map(i => i.message).slice(0, 5).join("; ") : error instanceof LedgerError ? error.message : "Property Ledger request failed";
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function requestedPage(request: NextRequest): LedgerPage {
  const page = request.nextUrl.searchParams.get("page") ?? "dashboard";
  if (!LEDGER_PAGES.some(p => p.slug === page)) throw new LedgerError("Unknown Property Ledger submodule", 400);
  return page as LedgerPage;
}
export async function GET(request: NextRequest) {
  try {
    const user = await authorize(requestedPage(request));
    const state = await latest();
    const { visible } = await workspace(state.portfolio, user);
    return NextResponse.json({ ...state, history: [], portfolio: visible, canManage: user.canManage, allowedPages: user.pages, editPages: user.editPages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    // Cookie-authenticated writes must come from this application's origin.
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new LedgerError("Invalid request origin", 403);
    const page = requestedPage(request);
    if (!["land-register", "building-register", "accounting-policies"].includes(page)) throw new LedgerError("This Property Ledger view is read-only. Use a registration submodule to save changes.", 403);
    const user = await authorize(page);
    if (Number(request.headers.get("content-length") ?? 0) > 2_000_000) throw new LedgerError("Portfolio is too large", 413);
    const text = await request.text();
    if (text.length > 2_000_000) throw new LedgerError("Portfolio is too large", 413);
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new LedgerError("Invalid JSON request", 400); }
    const input = z.object({ revision: z.number().int().nonnegative(), portfolio: portfolioSchema }).parse(json);
    const previous = await latest();
    if (input.revision !== previous.revision) throw new LedgerError("The ledger changed. Refresh before saving your changes.", 409);
    const { full, visible } = await workspace(previous.portfolio, user);
    assertWriteAccess(visible, input.portfolio, user);
    assertRegistrations(visible, input.portfolio);
    let next;
    try {
      next = portfolioSchema.parse(mergeCompanyChanges(full, visible, input.portfolio));
      assertTransition(full, next, user.canManage);
    }
    catch (error) { throw new LedgerError(error instanceof Error ? error.message : "Closed period", 422); }
    const summary = describeChange(full, next);
    if (summary === "No changes") return NextResponse.json({ revision: previous.revision });
    const revision = await commit(input.revision, next, user.actor, summary);
    return NextResponse.json({ revision }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
