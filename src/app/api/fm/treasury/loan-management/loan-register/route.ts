import { NextRequest } from "next/server";

import { loanBodySchema, loanFilterSchema } from "@/modules/financial-management/treasury/loan-management/loan-register/schemas";
import {
  createLoan,
  loadRegister,
  loadSummary,
} from "@/modules/financial-management/treasury/loan-management/loan-register/services/register.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const parsed = loanFilterSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      return fail("Some filters need attention.", 400, {
        fieldErrors: parsed.error.issues.reduce<Record<string, string[]>>((acc, issue) => {
          const key = issue.path.join(".") || "filter";
          acc[key] = [...(acc[key] ?? []), issue.message];
          return acc;
        }, {}),
      });
    }

    const [{ rows, total }, summary] = await Promise.all([loadRegister(parsed.data), loadSummary()]);
    return ok({ rows, total, summary });
  } catch (error) {
    return handleRouteError(error, "GET register", "The loan register could not be read.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (body === undefined) return fail("Send the loan as JSON.", 400);

    const parsed = loanBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST register", "The loan could not be saved.");

    const actorId = await currentUserId();
    const loan = await createLoan(parsed.data, actorId);
    return ok(loan, 201);
  } catch (error) {
    return handleRouteError(error, "POST register", "The loan could not be saved.");
  }
}
