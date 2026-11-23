import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthorityAccess, assertMutationOrigin } from "../expense-approval-authority/_lib/auth";
import { directus, readRows } from "../expense-approval-authority/_lib/directus";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { DEMO_ACTORS, DEMO_MARKER, demoFixtures, demoTier, demoTransition, type DemoRequest } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/demoEngine";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const collection = "fm_synthetic_approval_demo";
interface Row { id: string; owner_id: number; case_id: string; revision: number; request_key: string; payload_hash: string; action: string; reason: string; real_actor_id: number; demo_actor: string; created_at: string; snapshot: DemoRequest }
const fields = "id,owner_id,case_id,revision,request_key,payload_hash,action,reason,real_actor_id,demo_actor,created_at,snapshot";
function errorResponse(error: unknown) {
  return NextResponse.json({ error: error instanceof AuthorityError ? error.message : error instanceof z.ZodError ? "Invalid demo request." : "Synthetic demo unavailable; no success is assumed." }, { status: error instanceof AuthorityError ? error.status : error instanceof z.ZodError ? 400 : 503, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthorityAccess(request);
    const fixtures = demoFixtures();
    // Each real signed-in tester owns a separate synthetic scenario. No ERP users are impersonated.
    const items = await Promise.all(fixtures.map(async fixture => {
      const history = await readRows<Row>(collection, fields, { owner_id: { _eq: actor.id }, case_id: { _eq: fixture.id } }, 100, { sort: "-revision" });
      if (history.length === 100) throw new AuthorityError("DEMO_CAPACITY", "Demo history limit reached; use a new isolated test dataset.", 409);
      const current = history[0];
      const snapshot = current?.snapshot || fixture;
      return { snapshot, revision: current?.revision || 0, tier: demoTier(snapshot), history: [...history].reverse() };
    }));
    return NextResponse.json({ data: { marker: DEMO_MARKER, actors: DEMO_ACTORS, items, persistedCollection: collection } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
const schema = z.object({ caseId: z.enum(["office", "fuel", "capex"]), revision: z.number().int().min(0).max(99), requestKey: z.string().uuid(), action: z.enum(["APPROVE", "REJECT", "RETURN", "RESUBMIT"]), actor: z.enum(DEMO_ACTORS), reason: z.string().trim().min(5).max(1000), correction: z.object({ amount: z.string().max(30), evidence: z.boolean(), funds: z.boolean() }).strict().optional() }).strict();
export async function POST(request: NextRequest) {
  try {
    assertMutationOrigin(request);
    const actor = await requireAuthorityAccess(request);
    const body = await request.text();
    if (body.length > 5000) throw new AuthorityError("TOO_LARGE", "Demo request exceeds 5 KB.", 413);
    let parsed: unknown; try { parsed = JSON.parse(body); } catch { throw new AuthorityError("INVALID_JSON", "Invalid JSON."); }
    const input = schema.parse(parsed);
    const requestKey = `${actor.id}:${input.requestKey}`;
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous = (await readRows<Row>(collection, fields, { owner_id: { _eq: actor.id }, request_key: { _eq: requestKey } }, 1))[0];
    if (previous) {
      if (previous.payload_hash !== hash) throw new AuthorityError("IDEMPOTENCY_CONFLICT", "The request key was already used for different content.", 409);
      return NextResponse.json({ data: { revision: previous.revision, replayed: true, syntheticOnly: true } });
    }
    const current = (await readRows<Row>(collection, fields, { owner_id: { _eq: actor.id }, case_id: { _eq: input.caseId } }, 1, { sort: "-revision" }))[0];
    if ((current?.revision || 0) !== input.revision) throw new AuthorityError("REVISION_CONFLICT", "Another demo action changed this request. Refresh and review.", 409);
    const initial = demoFixtures().find(f => f.id === input.caseId)!;
    let snapshot: DemoRequest;
    try { snapshot = demoTransition(current?.snapshot || initial, input.action, input.actor, input.correction); }
    catch (error) { throw new AuthorityError("DEMO_CHECK_FAILED", (error as Error).message, 422); }
    const revision = input.revision + 1;
    const row: Row = { id: `${actor.id}:${input.caseId}:${revision}`, owner_id: actor.id, case_id: input.caseId, revision, request_key: requestKey, payload_hash: hash, action: input.action, reason: input.reason, real_actor_id: actor.id, demo_actor: input.actor, created_at: new Date().toISOString(), snapshot };
    const saved = await directus<{ data: Row }>(`items/${collection}`, { method: "POST", body: JSON.stringify(row) });
    if (saved.data?.id !== row.id) throw new AuthorityError("UNCONFIRMED", "Demo write not confirmed. Retry with the same key.", 503);
    return NextResponse.json({ data: { revision, syntheticOnly: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
