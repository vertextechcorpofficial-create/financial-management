import { NextRequest } from "next/server";

import { scheduleQuerySchema } from "@/modules/financial-management/treasury/loan-management/loan-schedules/schemas";
import { loadSchedule } from "@/modules/financial-management/treasury/loan-management/loan-schedules/services/schedule.service";

import { fail, handleRouteError, ok } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The schedule screen's single read: the loan picker, one page of the chosen loan's periods,
 * the column totals, the tie against the loan's principal, the aging buckets and the PAS 1 split.
 * With no `loanId` it answers the portfolio view instead, so both tabs share one route.
 */
export async function GET(request: NextRequest) {
  try {
    const parsed = scheduleQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      return fail("Some filters need attention.", 400, {
        fieldErrors: parsed.error.issues.reduce<Record<string, string[]>>((acc, issue) => {
          const key = issue.path.join(".") || "filter";
          acc[key] = [...(acc[key] ?? []), issue.message];
          return acc;
        }, {}),
      });
    }

    const payload = await loadSchedule({
      loanId: parsed.data.loanId ?? null,
      version: parsed.data.version ?? null,
      asOf: parsed.data.asOf ?? "",
      status: parsed.data.status ?? null,
      dueFrom: parsed.data.dueFrom ?? null,
      dueTo: parsed.data.dueTo ?? null,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
    });
    return ok(payload);
  } catch (error) {
    return handleRouteError(error, "GET schedules", "The schedule could not be read.");
  }
}
