import { getDividendDraft, parseDividendYear, saveDividendDraft } from "@/modules/financial-management/cooperative/server/dividend-drafts";
import { getDividendRun } from "@/modules/financial-management/cooperative/server/dividend-runs";
import { usesCooperativeQaDatabase } from "@/modules/financial-management/cooperative/server/directus";
import { withDividends } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ year: string }> };

export function GET(_request: Request, context: Context) {
  return withDividends(async () => {
    const year = parseDividendYear((await context.params).year);
    const posted = await getDividendRun(year);
    return { posted, draft: posted?.draft ?? await getDividendDraft(year), postingAvailable: usesCooperativeQaDatabase() };
  });
}

export function PUT(request: Request, context: Context) {
  return withDividends(async actor => {
    const year = parseDividendYear((await context.params).year);
    return { draft: await saveDividendDraft(year, actor, await request.json().catch(() => null)),
      posted: null, postingAvailable: usesCooperativeQaDatabase() };
  });
}
