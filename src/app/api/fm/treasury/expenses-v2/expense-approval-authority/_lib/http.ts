import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/domain/authorityErrors";
import { assertMutationOrigin, requireAuthorityAccess, requirePermission, requireUiAccess, hasAnyUiAccess } from "./auth";
import { context, evaluate, mutate, publicEvent, references, readUiAccess, updateUiAccess } from "./service";
import { history } from "./repository";

async function jsonBody(request: NextRequest) {
  if (Number(request.headers.get("content-length")) > 200_000) throw new AuthorityError("BODY_TOO_LARGE", "Request exceeds 200 KB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthorityError("INVALID_JSON", "JSON body required.");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 200_000) { await reader.cancel(); throw new AuthorityError("BODY_TOO_LARGE", "Request exceeds 200 KB.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AuthorityError("INVALID_JSON", "Invalid JSON body."); }
}
export async function handleAuthority(request: NextRequest, resource: string) {
  try {
    const actor = await requireAuthorityAccess(request);
    let data: unknown;
    if (request.method === "GET") {
      if (resource === "access") data = await readUiAccess(actor);
      else if (resource === "context" || ["policies", "delegations", "exceptions"].includes(resource)) {
        if (resource === "context" && !hasAnyUiAccess(actor) && !actor.admin) throw new AuthorityError("FORBIDDEN", "No Expense Authority submodule access is assigned.", 403);
        if (resource === "policies") { requireUiAccess(actor, "authority-matrix"); requirePermission(actor, "expense_authority.policy.read"); }
        if (resource === "delegations") { requireUiAccess(actor, "delegations"); requirePermission(actor, "expense_authority.policy.read"); }
        if (resource === "exceptions") { requireUiAccess(actor, "exceptions"); requirePermission(actor, "expense_authority.exception.review"); }
        const state = await context(actor);
        data = resource === "context" ? state : { revision: state.revision, items: state.workspace[resource as "policies" | "delegations" | "exceptions"] };
      } else if (resource === "history") {
        requireUiAccess(actor, "audit-history");
        requirePermission(actor, "expense_authority.audit.read");
        const params = new URL(request.url).searchParams;
        const page = Number(params.get("page") || 1), search = params.get("search") || "";
        if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || search.length > 100) throw new AuthorityError("INVALID_QUERY", "Invalid history pagination or search.");
        const rows = await history(actor, page, search);
        data = { items: rows.map(publicEvent), page, hasMore: rows.length === 20 };
      } else if (resource === "references") data = await references(actor, new URL(request.url).searchParams);
      else throw new AuthorityError("NOT_FOUND", "Unknown authority endpoint.", 404);
    } else if (request.method === "POST") {
      assertMutationOrigin(request);
      if (resource === "evaluate") { requireUiAccess(actor, "evaluation"); data = await evaluate(actor, await jsonBody(request)); }
      else if (resource === "commands") data = await mutate(actor, await jsonBody(request));
      else if (resource === "access") data = await updateUiAccess(actor, await jsonBody(request));
      else throw new AuthorityError("METHOD_NOT_ALLOWED", "Use the commands endpoint for configuration changes.", 405);
    } else throw new AuthorityError("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
  } catch (error) {
    const known = error instanceof AuthorityError;
    const validation = error instanceof ZodError;
    return NextResponse.json({ error: known ? error.message : validation ? "Invalid request fields. Check the form and try again." : "Authority service is unavailable. No successful save is assumed.",
      code: known ? error.code : validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
      ...(validation ? { fields: error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) } : {}) },
    { status: known ? error.status : validation ? 400 : 503, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
  }
}
