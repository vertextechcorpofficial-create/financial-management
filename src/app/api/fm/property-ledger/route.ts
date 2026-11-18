import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { portfolioSchema } from "@/modules/financial-management/property-ledger/types";
import { assertTransition } from "@/modules/financial-management/property-ledger/utils/locks";
import { authorize, assertWriteAccess, commit, describeChange, history, latest, LedgerError } from "@/modules/financial-management/property-ledger/services/server";
import { LEDGER_PAGES, type LedgerPage } from "@/modules/financial-management/property-ledger/navigation";

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
    const [state, entries] = await Promise.all([latest(), history()]);
    return NextResponse.json({ ...state, canManage: user.canManage, allowedPages: user.pages, history: entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    // Cookie-authenticated writes must come from this application's origin.
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new LedgerError("Invalid request origin", 403);
    const user = await authorize(requestedPage(request));
    if (Number(request.headers.get("content-length") ?? 0) > 2_000_000) throw new LedgerError("Portfolio is too large", 413);
    const text = await request.text();
    if (text.length > 2_000_000) throw new LedgerError("Portfolio is too large", 413);
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new LedgerError("Invalid JSON request", 400); }
    const input = z.object({ revision: z.number().int().nonnegative(), portfolio: portfolioSchema }).parse(json);
    const previous = await latest();
    if (input.revision !== previous.revision) throw new LedgerError("The ledger changed. Refresh before saving your changes.", 409);
    assertWriteAccess(previous.portfolio, input.portfolio, user);
    try { assertTransition(previous.portfolio, input.portfolio, user.canManage); }
    catch (error) { throw new LedgerError(error instanceof Error ? error.message : "Closed period", 422); }
    const summary = describeChange(previous.portfolio, input.portfolio);
    if (summary === "No changes") return NextResponse.json({ revision: previous.revision });
    const revision = await commit(input.revision, input.portfolio, user.actor, summary);
    return NextResponse.json({ revision }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
