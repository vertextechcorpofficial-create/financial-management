import assert from "node:assert/strict";
import { test } from "node:test";
import { authorityRoot, availableViews } from "./views";

test("standalone routes use the active workflow, not the legacy authority module", () => {
  assert.equal(authorityRoot, "/fm/treasury/expenses-v2/expense-approval-workflow");
});

test("employees have only My Requests", () => {
  assert.deepEqual(availableViews([]), ["my-requests"]);
});

test("department heads, GMs and CFOs have both submodules", () => {
  for (const role of ["DH", "GM", "CFO"]) {
    assert.deepEqual(availableViews([role]), ["my-requests", "my-approvals"]);
  }
});

test("CEOs have only My Approvals, even with additional assignments", () => {
  assert.deepEqual(availableViews(["CEO", "CFO"]), ["my-approvals"]);
});
