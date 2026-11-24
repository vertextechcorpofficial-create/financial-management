import assert from "node:assert/strict";
import test from "node:test";
import { allApprovalChecksPass, overdueRequestCutoff, requestWaitingDays } from "./rules.ts";

test("the three-day SLA follows Manila midnight across month boundaries", () => {
  const filedAt = "2026-11-27T15:55:00.000Z";
  const withinSla = new Date("2026-11-30T15:59:59.999Z");
  const overdue = new Date("2026-11-30T16:00:00.000Z");
  assert.equal(requestWaitingDays(filedAt, withinSla), 3);
  assert.equal(requestWaitingDays(filedAt, overdue), 4);
  assert.ok(filedAt >= overdueRequestCutoff(withinSla));
  assert.ok(filedAt < overdueRequestCutoff(overdue));
  assert.equal(requestWaitingDays("2026-11-27T16:00:00.000Z", overdue), 3);
  assert.equal(overdueRequestCutoff(overdue), "2026-11-27T16:00:00.000Z");
});

test("waiting time starts at zero on the Manila filing date", () => {
  assert.equal(requestWaitingDays("2026-12-31T16:01:00Z", new Date("2027-01-01T06:15:00Z")), 0);
});

test("bulk approval requires all four checks to pass", () => {
  const passing = Array.from({ length: 4 }, () => ({ result: "pass" }));
  assert.equal(allApprovalChecksPass(passing), true);
  assert.equal(allApprovalChecksPass([...passing.slice(0, 3), { result: "review" }]), false);
  assert.equal(allApprovalChecksPass(passing.slice(0, 3)), false);
  assert.equal(allApprovalChecksPass(undefined), false);
});
