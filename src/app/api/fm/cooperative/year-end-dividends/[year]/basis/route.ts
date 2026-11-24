import { getDividendBasis } from "@/modules/financial-management/cooperative/server/dividend-basis";
import { parseDividendYear } from "@/modules/financial-management/cooperative/server/dividend-drafts";
import { withDividends } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, context: { params: Promise<{ year: string }> }) {
  return withDividends(async () => getDividendBasis(parseDividendYear((await context.params).year)));
}
