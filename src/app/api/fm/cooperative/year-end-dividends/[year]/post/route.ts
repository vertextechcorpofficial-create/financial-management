import { postDividendRun } from "@/modules/financial-management/cooperative/server/dividend-posting";
import { parseDividendYear } from "@/modules/financial-management/cooperative/server/dividend-drafts";
import { withDividends } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, context: { params: Promise<{ year: string }> }) {
  return withDividends(async actor => postDividendRun(
    parseDividendYear((await context.params).year), actor, await request.json().catch(() => null),
  ));
}
