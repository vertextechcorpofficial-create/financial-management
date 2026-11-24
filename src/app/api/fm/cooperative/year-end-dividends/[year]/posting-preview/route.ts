import { parseDividendYear } from "@/modules/financial-management/cooperative/server/dividend-drafts";
import { reviewDividendPosting } from "@/modules/financial-management/cooperative/server/dividend-review";
import { withDividends } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, context: { params: Promise<{ year: string }> }) {
  return withDividends(async () => (await reviewDividendPosting(parseDividendYear((await context.params).year))).preview);
}
