import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerHooks } from "node:module";
import { accounts, balance, fiscalDates, journalCsv, validateLines } from "./ledger.ts";

const hook = registerHooks({
  resolve(specifier, context, next) {
    return next(["./ledger", "../ledger", "../cash-commands"].includes(specifier) &&
      /\/(?:cash-commands|deployment|journal)\.ts$/.test(context.parentURL ?? "") ? `${specifier}.ts` : specifier, context);
  },
});
const { buildCashEntry } = await import("./cash-commands.ts");
const { planDeployment } = await import("./deployment.ts");
hook.deregister();

test("deployment prioritizes underweight classes and preserves every centavo", () => {
  const classes = [{ value: 1000, target: 50 }, { value: 0, target: 50 }];
  assert.deepEqual(planDeployment(50, 50, 3, classes), [{ amount: 50, split: [0, 50] }]);
  const plan = planDeployment(100.01, 50, 3, classes);
  assert.deepEqual(plan.map(row => row.amount), [33.34, 33.34, 33.33]);
  assert.ok(plan.every(row => row.split[0] === 0 && row.split[1] === row.amount));
  assert.deepEqual(planDeployment(0, 50, 3, classes), []);
});
const fixture = JSON.parse(readFileSync(new URL("./fixtures/malaya.json", import.meta.url), "utf8"));

const { INVESTMENT_DONATIONS_WORKSPACES: workspaces } = await import("./workspaces.ts");

const entries = fixture.txns;

test("Malaya fixture has 83 uniquely numbered, individually balanced entries", () => {
  assert.equal(entries.length, 83);
  assert.equal(new Set(entries.map(entry => entry.no)).size, entries.length);
  assert.equal(Object.keys(accounts).length, 35);
  for (const entry of entries) validateLines(entry.lines);
  assert.equal(balance(entries), 0);
});

test("rejects empty, unbalanced, negative and fractional-centavo lines", () => {
  const debit = { acct: "1000", dr: 100, cr: 0, tag: "" };
  const credit = { acct: "3900", dr: 0, cr: 100, tag: "" };
  assert.doesNotThrow(() => validateLines([debit, credit]));
  assert.throws(() => validateLines([]), /non-zero/);
  assert.throws(() => validateLines([debit, { ...credit, cr: 99.99 }]), /balance/);
  assert.throws(() => validateLines([{ ...debit, dr: -100 }, credit]), /valid account/);
  assert.throws(() => validateLines([{ ...debit, dr: 100.001 }, credit]), /whole centavos/);
});

test("A3: sample dividend collection clears its receivable without rebooking income", () => {
  const accrued = entries.find(entry => entry.type === "accrue" && entry.data.kind === "Dividend");
  const tag = String(accrued.data.recId);
  assert.equal(balance(entries, "1200", tag, accrued.date), Number(accrued.data.gross));
  assert.equal(balance(entries, "1200", tag), 0);
  const receipt = entries.find(entry => entry.type === "receive" && entry.lines.some(line => line.tag === tag));
  assert.equal(balance([receipt], "4000"), 0);
});

test("P2/P4 fixture: year-end accounts close but pre-close activity is reportable", () => {
  const through = "2025-12-31";
  const activity = entries.filter(entry => entry.type !== "closing");
  const closing = entries.find(entry => entry.type === "closing" && entry.date === through);
  assert.ok(closing);
  assert.equal(balance(entries, "4000", undefined, through), 0);
  assert.equal(balance(activity, "4000", undefined, through), -30000);
  assert.ok(closing.lines.some(line => line.acct === "3800"));
});

test("closed sample months retain reconciled cash snapshots", () => {
  for (const [month, period] of Object.entries(fixture.periods)) {
    if (!period.closedAt) continue;
    const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
    for (const account of ["1000", "1010", "1020"]) {
      assert.equal(balance(entries, account, undefined, end), fixture.recons[month].snap[account], `${month} ${account}`);
    }
  }
});

test("fiscal-year filter handles non-calendar and leap years", () => {
  assert.deepEqual(fiscalDates("2024-02-10", 3), { from: "2023-03-01", to: "2024-02-29" });
  assert.deepEqual(fiscalDates("2026-11-20", 1), { from: "2026-01-01", to: "2026-12-31" });
});

test("journal CSV escapes spreadsheet formulas and quotes", () => {
  const csv = journalCsv([{ ...entries[0], memo: '=SUM("x")' }]);
  assert.match(csv, /"'=SUM\(""x""\)"/);
  assert.equal(csv.split("\r\n").length, entries[0].lines.length + 1);
});

test("all eleven submodules have distinct nested paths and registry slugs", () => {
  assert.equal(workspaces.length, 11);
  assert.equal(new Set(workspaces.map(w => w.path)).size, 11);
  assert.equal(new Set(workspaces.map(w => w.slug)).size, 11);
  for (const workspace of workspaces) {
    assert.equal(workspace.path, `/fm/investment-donations/investment-donations-${workspace.key}`);
    const path = new URL(`../../../app/(financial-management)${workspace.path}/page.tsx`, import.meta.url);
    assert.ok(readFileSync(path, "utf8").includes(`workspace="${workspace.key}"`));
  }
});


test("sandbox transfer affects both accounts without changing total cash", () => {
  const command = { type: "transfer", date: "2026-11-20", account: "1000", target: "1010", amount: 100, memo: "" };
  const entry = buildCashEntry(entries, [], command, "test-transfer", 20);
  assert.equal(balance([entry], "1000"), -100);
  assert.equal(balance([entry], "1010"), 100);
  assert.equal(balance([...entries, entry]), 0);
  assert.throws(() => buildCashEntry(entries, ["2026-11"], command, "test", 20), /month is closed/);
  assert.throws(() => buildCashEntry(entries, [], { ...command, amount: 100_000_000 }, "test", 20), /cash account balance/);
});

test("T3 sandbox: bank interest posts gross income and 20% withholding", () => {
  const entry = buildCashEntry(entries, [], {
    type: "interest", date: "2026-11-20", amount: 10000, account: "1000", memo: "",
  }, "test-interest", 20);
  assert.equal(balance([entry], "1000"), 8000);
  assert.equal(balance([entry], "5300"), 2000);
  assert.equal(balance([entry], "4010"), -10000);
});
