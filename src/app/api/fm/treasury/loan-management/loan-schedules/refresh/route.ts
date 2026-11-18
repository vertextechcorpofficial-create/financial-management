import { NextRequest } from "next/server";

import { refreshBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-schedules/schemas";
import { refreshStatuses } from "@/modules/financial-management/treasury/loan-management/loan-schedules/services/schedule.service";
import { phtToday } from "@/modules/financial-management/treasury/loan-management/loan-schedules/pht";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Marks installments DUE and OVERDUE as their dates pass.
 *
 * No journal entry and no `loan_event` row is written: the event table has no kind for "a due
 * date went by", and this is a status view rather than a transaction. The change log captures
 * who ran it through `updated_by` on each row.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) ?? {};
    const parsed = refreshBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST refresh statuses", "The statuses could not be refreshed.");

    const actorId = await currentUserId();
    const result = await refreshStatuses(parsed.data.asOf ?? phtToday(), {
      dryRun: parsed.data.dryRun ?? false,
      loanId: parsed.data.loanId ?? null,
      actorId,
    });
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "POST refresh statuses", "The statuses could not be refreshed.");
  }
}

export async function GET() {
  return fail("Send the refresh as a POST.", 405);
}
