import { z } from "zod";

import { loadContext, listChanges, listLoanOptions } from "@/modules/financial-management/treasury/loan-management/loan-changes/services/changes.service";
import { changesQuerySchema } from "@/modules/financial-management/treasury/loan-management/loan-changes/schemas";
import { ok, toId } from "../_lib/http";
import { handleChangesError } from "./respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/fm/treasury/loan-management/loan-changes
 *
 * `?loanId=8` answers the record dialog's context (loan, live schedule, accounts, lock, payoff
 * quote); without it the route answers the list the table renders.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const loanId = toId(url.searchParams.get("loanId"));
    if (loanId) {
      return ok(await loadContext(loanId));
    }

    const query = changesQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const [list, loans] = await Promise.all([listChanges(query), listLoanOptions()]);
    return ok({ ...list, options: { loans } });
  } catch (error) {
    return handleChangesError(error, "GET changes", "The changes could not be read.");
  }
}

// Keep Zod's type exported so a future PATCH route reuses the same query contract.
export type ChangesListQuery = z.infer<typeof changesQuerySchema>;
