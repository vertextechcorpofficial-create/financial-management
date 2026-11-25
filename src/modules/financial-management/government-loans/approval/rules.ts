import type { ApprovalCheckResult } from "./types";

export const REQUEST_SLA_DAYS = 3;
const dayMs = 86_400_000;
const manilaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
});

function manilaMidnight(value: Date) {
  return Date.parse(manilaDate.format(value) + "T00:00:00+08:00");
}

export function requestWaitingDays(filedAt: string, now: Date) {
  return Math.max(0, (manilaMidnight(now) - manilaMidnight(new Date(filedAt))) / dayMs);
}

export function overdueRequestCutoff(now: Date) {
  return new Date(manilaMidnight(now) - REQUEST_SLA_DAYS * dayMs).toISOString();
}

export function allApprovalChecksPass(checks: readonly ApprovalCheckResult[] | undefined) {
  return checks?.length === 4 && checks.every(check => check.result === "pass");
}
