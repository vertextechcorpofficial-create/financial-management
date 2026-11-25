import "server-only";

import { z } from "zod";
import { deductionMonths } from "../enrollment/rules";
import { GOVERNMENT_LOAN_PERIOD_COMMANDS, GOVERNMENT_LOAN_SETTINGS, readGovernmentLoansItems } from "./directus";
import { LoanRequestError, positiveId } from "./request-input";

export async function readOpenMonth() {
  const query = new URLSearchParams({ fields: "open_month", filter: JSON.stringify({ id: { _eq: 1 } }), limit: "1" });
  const { data } = z.object({ data: z.array(z.object({ open_month: z.string().nullable() })).max(1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_SETTINGS, query));
  const month = data[0]?.open_month ?? null;
  return deductionMonths(month).length ? month : null;
}

export async function nextPeriodCommand(month: string) {
  const query = new URLSearchParams({ fields: "sequence", filter: JSON.stringify({ month: { _eq: month } }), limit: "1", sort: "-sequence,id" });
  const { data: [current] } = z.object({ data: z.array(z.object({ sequence: positiveId })).max(1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_PERIOD_COMMANDS, query));
  // A caller can read the month before close commits and read the sequence after it commits.
  if (await readOpenMonth() !== month) throw new LoanRequestError(409, "The open month changed. Refresh and try again.");
  const sequence = (current?.sequence ?? 0) + 1;
  return { month, sequence, revision_key: month + ":" + sequence };
}
