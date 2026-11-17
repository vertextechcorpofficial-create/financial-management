import { z } from "zod";

import { DirectusError, directusReason } from "@/modules/financial-management/treasury/loan-management/loan-changes/services/directus";
import {
  LoanConflictError,
  LoanNotFoundError,
  LoanValidationError,
} from "@/modules/financial-management/treasury/loan-management/loan-changes/services/errors";
import { fail, handleRouteError } from "../_lib/http";

/**
 * Turns a thrown error into the route contract's statuses.
 *
 * The shared `handleRouteError` matches errors with `instanceof` against the loan-register module's
 * classes. This module carries its own copy of `errors.ts` (the house kernel is copied, never
 * imported across modules), so those instances would fall through to a bare 500. The known errors
 * are therefore mapped here, and only the unknown ones go to the shared handler.
 */
export function handleChangesError(error: unknown, context: string, fallback: string) {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const field = issue.path.length > 0 ? String(issue.path[0]) : "form";
      fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
    return fail("Some fields need attention.", 400, { fieldErrors });
  }
  if (error instanceof LoanValidationError) {
    return fail(error.message, 400, { fieldErrors: error.fieldErrors });
  }
  if (error instanceof LoanConflictError) return fail(error.message, 409);
  if (error instanceof LoanNotFoundError) return fail(error.message, 404);
  if (error instanceof DirectusError) {
    const reason = directusReason(error.body);
    return fail(
      reason
        ? `The database rejected this write: ${reason}`
        : "The loan tables are not ready yet, so this was not saved. Ask an administrator to apply the Loan Management schema.",
      500,
    );
  }
  return handleRouteError(error, context, fallback);
}
