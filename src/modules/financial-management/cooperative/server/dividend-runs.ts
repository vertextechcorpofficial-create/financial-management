import "server-only";

import { z } from "zod";
import { dividendPostedRunSchema } from "../console/dividends/types";
import { readDirectusItems, usesCooperativeQaDatabase } from "./directus";
import { MemberError } from "./member-errors";

export async function getDividendRun(year: number) {
  if (!usesCooperativeQaDatabase()) return null;
  const { data } = z.object({ data: z.object({ snapshot: dividendPostedRunSchema }).array().max(1) }).parse(
    await readDirectusItems("cooperative_dividend_runs", new URLSearchParams({
      fields: "snapshot", limit: "1", filter: JSON.stringify({ calendar_year: { _eq: year } }),
    })),
  );
  return data[0]?.snapshot ?? null;
}

export async function requireUnpostedDividendYear(year: number) {
  const run = await getDividendRun(year);
  if (run) throw new MemberError(409, "Dividends for this year are already posted.", "DIVIDEND_YEAR_POSTED", undefined, { run });
}
