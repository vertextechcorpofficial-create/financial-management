import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import { fieldErrorsFromZod } from "@/modules/financial-management/treasury/loan-management/loan-register/schemas";
import { directusReason } from "@/modules/financial-management/treasury/loan-management/loan-register/services/directus";

const LOG_PREFIX = "[loan-management]";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

export async function currentUserId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const payload = token ? decodeJwtPayload(token) : null;
  const id = Number(payload?.sub);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * One place that turns a thrown error into the route contract's statuses:
 * Zod 400 with fields, business rule 409, field rule 400, missing row 404, Directus 500.
 *
 * The modules each carry their own copy of `services/errors.ts`, so `instanceof` against one
 * copy misses errors raised by another. Errors are recognised by name and shape instead.
 */
export function handleRouteError(error: unknown, context: string, fallback: string) {
  if (error instanceof z.ZodError) {
    return fail("Some fields need attention.", 400, { fieldErrors: fieldErrorsFromZod(error) });
  }
  const named = error instanceof Error ? error.name : "";
  const fieldErrors = (error as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors;
  if (named === "LoanValidationError") {
    return fail((error as Error).message, 400, { fieldErrors: fieldErrors ?? {} });
  }
  if (named === "LoanConflictError") return fail((error as Error).message, 409);
  if (named === "LoanNotFoundError") return fail((error as Error).message, 404);
  if (named === "DirectusError") {
    const status = (error as { status?: number }).status ?? 0;
    const body = (error as { body?: string }).body ?? "";
    console.error(`${LOG_PREFIX} ${context}: directus ${status}`, body);
    const reason = directusReason(body);
    return fail(
      reason
        ? `The database rejected this write: ${reason}`
        : "The loan tables are not ready yet, so this was not saved. Ask an administrator to apply the Loan Management schema.",
      500,
    );
  }
  console.error(`${LOG_PREFIX} ${context}`, error);
  return fail(fallback, 500);
}

export async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function toId(raw: string | number | null | undefined): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}
