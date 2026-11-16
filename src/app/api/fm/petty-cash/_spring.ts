import { NextResponse } from "next/server";
import { proxySpring } from "@/app/api/fm/financial-statements/adjusting-journal-entries/_spring";

const SAFE_CODES = new Set(["INVALID_REQUEST", "VALIDATION_FAILED", "UNAUTHENTICATED", "ACCESS_DENIED", "NOT_FOUND", "CONFLICT", "FOUNDATION_UNAVAILABLE"]);
const messages: Record<number, string> = {
  400: "The Petty Cash request is invalid.", 401: "Your session expired. Please sign in again.",
  403: "You do not have access to this Petty Cash workspace.", 404: "Petty Cash resource not found.",
  409: "This record changed. Reload before trying again.", 429: "Too many requests. Please wait and retry.",
  413: "File size exceeds the 5 MB limit.", 415: "Choose a JPG, PNG, or PDF file.",
};

export async function readPettyCash(path: string, init?: RequestInit, tokenOverride?: string) {
  const upstream = await proxySpring(`/api/petty-cash/${path}`, { ...init, cache: "no-store", signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) }, tokenOverride);
  let body: unknown;
  try { body = await upstream.json(); } catch { body = null; }
  let status = upstream.status;
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const requestId = typeof payload.requestId === "string" && /^[\w-]{1,80}$/.test(payload.requestId)
    ? payload.requestId : crypto.randomUUID();
  const trusted = typeof payload.code === "string" && SAFE_CODES.has(payload.code);
  const detail = typeof payload.detail === "string" ? payload.detail.slice(0, 500) : "";
  const timedOut = /abort|timeout|timed out|signal/i.test(detail);
  if (upstream.ok && !body) status = 503;
  if (upstream.status >= 500) console.warn(`[petty-cash] upstream ${upstream.status} for ${path} (request ${requestId})${detail ? `: ${detail}` : ""}`);
  if (status >= 500) status = 503;
  const failed = status >= 400;
  const fieldErrors = trusted && payload.fieldErrors && typeof payload.fieldErrors === "object"
    ? Object.fromEntries(Object.entries(payload.fieldErrors).filter(([key, value]) => /^[\w.]{1,100}$/.test(key) && typeof value === "string" && value.length <= 500)) : undefined;
  const preview = path.includes("vouchers/preview");
  const upstreamFailure = upstream.status >= 500 || (upstream.ok && !body);
  const failureCode = upstreamFailure
    ? trusted ? "FOUNDATION_UNAVAILABLE" : timedOut ? "UPSTREAM_TIMEOUT" : upstream.status === 502 || upstream.status === 504 ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_ERROR"
    : status === 429 ? "RATE_LIMITED" : status >= 500 ? "FOUNDATION_UNAVAILABLE" : trusted ? payload.code : "REQUEST_FAILED";
  const failureMessage = upstreamFailure
    ? trusted && typeof payload.message === "string" && payload.message.length <= 500
      ? payload.message
      : timedOut
        ? preview ? "The voucher calculation timed out. Retry; if it persists, report this reference." : "The Petty Cash service timed out. Retry; if it persists, report this reference."
        : upstream.status === 502 || upstream.status === 504
          ? preview ? "The voucher calculation service could not be reached. Check the ERP connection and retry." : "The Petty Cash service could not be reached. Check the ERP connection and retry."
          : preview ? "The voucher calculation failed unexpectedly. Retry or report this reference." : "The Petty Cash service failed unexpectedly. Retry or report this reference."
    : trusted && typeof payload.message === "string" && payload.message.length <= 500
      ? payload.message
      : messages[status] || "Petty Cash is temporarily unavailable. Please retry.";
  const response = NextResponse.json(failed ? {
    code: failureCode,
    message: failureMessage,
    requestId, ...(fieldErrors ? { fieldErrors } : {}),
  } : body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  for (const cookie of upstream.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
  const retryAfter = upstream.headers.get("Retry-After");
  if (retryAfter) response.headers.set("Retry-After", retryAfter);
  return response;
}
