import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import { directusReason } from "@/modules/financial-management/management-analytics/analytics-variance/services/directus";

const LOG_PREFIX = "[management-analytics]";

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

export function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] = [...(result[key] ?? []), issue.message];
  }
  return result;
}

export function handleRouteError(error: unknown, context: string, fallback: string) {
  if (error instanceof z.ZodError) {
    return fail("Some fields need attention.", 400, { fieldErrors: fieldErrorsFromZod(error) });
  }
  const named = error instanceof Error ? error.name : "";
  if (named === "DirectusError") {
    const body = (error as { body?: unknown }).body;
    const reason = directusReason(String(body ?? ""));
    console.error(`${LOG_PREFIX} ${context}`, error);
    // A 400 that names a missing field is a schema drift, not a bad write; say which one it is.
    const missingField = /field "([^"]+)" in collection "([^"]+)"/.exec(reason);
    const message = missingField
      ? `The database has no column ${missingField[1]} on ${missingField[2]}.`
      : "The database rejected this request.";
    return fail(message, 500, { directusReason: reason });
  }
  // A refused write is not a failure of the request; the sentence explains what to do next.
  if (named === "ConflictError" || named === "NotFoundError") {
    const message = error instanceof Error && error.message ? error.message : fallback;
    return fail(message, named === "ConflictError" ? 409 : 404);
  }
  console.error(`${LOG_PREFIX} ${context}`, error);
  // A dropped connection to the database is the common case here, and "could not be read" told the
  // desk nothing. The reason the platform gave is shown, because there is nothing to leak: it is
  // either a network sentence or a validation sentence about our own tables.
  const reason = error instanceof Error && error.message ? error.message : "";
  const message = /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|timeout/i.test(reason)
    ? "The database did not answer. Try again in a moment."
    : fallback;
  return fail(message, 500, reason ? { reason } : undefined);
}

export function toId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new z.ZodError([{ code: "custom", message: "Not a record id.", path: ["id"] }]);
  return id;
}
