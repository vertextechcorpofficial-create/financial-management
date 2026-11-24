import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { serializeMemberReport } from "../console/reports/report-export";
import { statementPeriods } from "../members/statement";
import { getAuditReport } from "./audit-report";
import { getTrialBalanceReport } from "./ledger-report";
import { todayManila } from "./member-read";
import { getMemberReport, reportPage } from "./member-reports";
import { getMonthEndReport } from "./month-end-report";
import { saveCloseEvidence } from "./reconciliation-evidence";

type Row = Record<string, unknown>;
type Fixtures = Record<string, Row[]>;
const period = { from: "2026-10-01", to: "2026-10-31" };

function matches(row: Row, filter: Row): boolean {
  return row != null && Object.entries(filter).every(([key, clause]) => {
    if (key === "_or") return (clause as Row[]).some(option => matches(row, option));
    const actual = row[key];
    return Object.entries(clause as Row).every(([operator, expected]) => {
      if (operator === "_eq") return actual === expected;
      if (operator === "_in") return (expected as unknown[]).includes(actual);
      if (operator === "_gte") return actual != null && String(actual) >= String(expected);
      if (operator === "_lte") return actual != null && String(actual) <= String(expected);
      if (operator === "_lt") return actual != null && String(actual) < String(expected);
      if (operator === "_nnull") return (actual != null) === expected;
      if (!operator.startsWith("_")) return matches(actual as Row, { [operator]: expected });
      throw new Error("Unexpected filter " + operator);
    });
  });
}

function mockDirectus(context: TestContext, records: Fixtures) {
  const location = process.env.NEXT_PUBLIC_API_BASE_URL;
  const credential = process.env.DIRECTUS_STATIC_TOKEN;
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://100.110.197.61:8056";
  process.env.DIRECTUS_STATIC_TOKEN = "isolated-ledger-report-fixture";
  context.after(() => {
    if (location === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = location;
    if (credential === undefined) delete process.env.DIRECTUS_STATIC_TOKEN;
    else process.env.DIRECTUS_STATIC_TOKEN = credential;
  });

  context.mock.method(globalThis, "fetch", async (target: string, body?: RequestInit) => {
    const { pathname, searchParams } = new URL(target);
    const table = pathname.replace("/items/", "");
    assert(records[table], "Unexpected collection " + table);
    if (body?.method === "POST") {
      assert.equal(table, "cooperative_reconciliation_evidence");
      const { audit_event_id, ...row } = JSON.parse(String(body.body));
      if (records[table].some(entry => entry.revision_key === row.revision_key)) return new Response(null, { status: 409 });
      const eventId = records.cooperative_audit_events.push({ ...audit_event_id, id: records.cooperative_audit_events.length + 1, journal_id: null });
      const id = records[table].push({ ...row, audit_event_id: eventId, id: records[table].length + 1 });
      return Response.json({ data: { id } });
    }
    assert.equal(body?.method ?? "GET", "GET");
    const limit = Number(searchParams.get("limit"));
    assert(limit >= 1 && limit <= 100, "Expected a bounded read");
    const filter = JSON.parse(searchParams.get("filter") ?? "{}") as Row;
    let rows = records[table].filter(row => {
      const value = table === "cooperative_gl_lines" && searchParams.has("groupBy")
        ? { ...row, journal_id: records.cooperative_journals.find(journal => journal.id === row.journal_id) } : row;
      return matches(value, filter);
    });
    if (searchParams.has("groupBy")) {
      const keys = searchParams.get("groupBy")!.split(",");
      const group = new Map<string, Row>();
      for (const row of rows) {
        const identity = JSON.stringify(keys.map(key => row[key]));
        const existing = group.get(identity) ?? { ...Object.fromEntries(keys.map(key => [key, row[key]])), debit: 0, credit: 0 };
        existing.debit = Number(existing.debit) + Math.round(Number(row.debit ?? 0) * 100);
        existing.credit = Number(existing.credit) + Math.round(Number(row.credit ?? 0) * 100);
        group.set(identity, existing);
      }
      rows = [...group.values()].map(row => ({
        ...row, sum: { debit: (Number(row.debit) / 100).toFixed(2), credit: (Number(row.credit) / 100).toFixed(2) },
      }));
    }
    const order = searchParams.get("sort")?.split(",") ?? [];
    rows.sort((a, b) => {
      for (const name of order) {
        const desc = name.startsWith("-");
        const key = desc ? name.slice(1) : name;
        const cmp = typeof a[key] === "number" ? Number(a[key]) - Number(b[key]) : String(a[key]).localeCompare(String(b[key]));
        if (cmp) return desc ? -cmp : cmp;
      }
      return 0;
    });
    const offset = Number(searchParams.get("offset"));
    return Response.json({ data: rows.slice(offset, offset + limit) });
  });
}

function ledgerFixtures() {
  const account = (id: number, code: string, name: string, classification = "ASSET", is_active = true, is_contra = false) =>
    ({ id, code, name, classification, is_active, is_contra });
  const tables: Fixtures = {
    cooperative_gl_accounts: [
      account(1, "1010", "Cash on hand"), account(2, "1020", "Cash in bank"), account(3, "1150", "Due from employer"),
      account(4, "2010", "Member savings", "LIABILITY"), account(5, "1190", "Loan loss allowance", "ASSET", false, true),
      account(6, "1015", "Alternate cash"), account(7, "1090", "Inactive unused", "ASSET", false),
    ],
    cooperative_account_mappings: [
      { id: 1, purpose: "CASH_ON_HAND", account_id: 1 },
      { id: 2, purpose: "CASH_IN_BANK", account_id: 2 },
      { id: 3, purpose: "DUE_FROM_EMPLOYER", account_id: 3 },
    ],
    cooperative_journals: [], cooperative_gl_lines: [], cooperative_reconciliation_evidence: [],
    cooperative_audit_events: [], cooperative_payroll_remittance_batches: [],
    cooperative_loans: [], cooperative_membership_agreements: [], cooperative_clearances: [], cooperative_withdrawal_requests: [],
    user: [],
  };
  const post = (id: number, day: string, debit: number, credit: number, value: string, batch = 0, reversal: number | null = null) => {
    const command = batch ? reversal ? "PAYROLL_REMITTANCE_REVERSED" : "PAYROLL_REMITTANCE" : "MANUAL";
    const source = batch ? "PAYROLL_REMITTANCE" : "FIXTURE";
    tables.cooperative_journals.push({
      id, business_date: day, journal_no: "JV-" + id, posted_at: day + "T09:00:00",
      command_type: command, source_type: source, source_id: String(batch || id), reverses_journal_id: reversal,
    });
    tables.cooperative_gl_lines.push(
      { id: id * 2, journal_id: id, account_id: debit, debit: value, credit: "0.00" },
      { id: id * 2 + 1, journal_id: id, account_id: credit, debit: "0.00", credit: value },
    );
  };
  const receipt = (id: number, bank_date: string, amount: string, posting: number, reverse: number | null = null) => ({
    id, bank_reference: "BANK-" + id, cutoff_date: "2026-09-15", bank_date, bank_amount: amount, posted_amount: amount,
    state: reverse ? "REVERSED" : "POSTED", clearing_journal_id: posting, reversal_journal_id: reverse, posted_at: "2026-11-01T09:00:00",
  });
  post(10, "2026-09-29", 1, 4, "10.00");
  post(11, "2026-09-29", 3, 4, "200.00");
  post(12, "2026-09-30", 2, 3, "40.00", 1);
  post(13, "2026-10-01", 3, 4, "150.25");
  post(14, "2026-10-31", 2, 3, "80.10", 2);
  post(15, "2026-10-31", 3, 2, "40.00", 1, 12);
  post(16, "2026-11-05", 3, 2, "80.10", 2, 14);
  post(17, "2026-11-01", 2, 3, "10.00", 3);
  post(18, "2026-10-05", 4, 5, "5.01");
  tables.cooperative_payroll_remittance_batches.push(
    receipt(1, "2026-09-30", "40.00", 12, 15),
    receipt(2, "2026-10-30", "80.10", 14, 16),
    receipt(3, "2026-10-31", "10.00", 17),
  );

  return tables;
}

test("trial balance carries exact openings, includes period boundaries and retains historical accounts", async context => {
  const tables = ledgerFixtures();
  mockDirectus(context, tables);
  const result = await getTrialBalanceReport(period);
  assert.deepEqual(result.rows.find(row => row.id === 3)?.cells.slice(4), ["160.00", "0.00", "190.25", "80.10", "270.15", "0.00"]);
  assert.deepEqual(result.rows.find(row => row.id === 5)?.cells.slice(3), ["Inactive", "0.00", "0.00", "0.00", "5.01", "0.00", "5.01"]);
  assert(!result.rows.some(row => row.id === 7));
  assert(result.metadata.slice(2).every(([, status]) => status === "Balanced"));
  tables.cooperative_gl_lines.find(line => line.journal_id === 18 && line.account_id === 5)!.credit = "5.00";
  assert.equal((await getTrialBalanceReport(period)).metadata.find(([label]) => label === "Period check")?.[1],
    "Out of balance · debits less credits 0.01");
});

test("month end compares recorded evidence and clears only independently verified remittances in the period", async context => {
  const tables = ledgerFixtures();
  const evidence = (id: number, purpose: string, account_id: number, verified_amount: string) => ({
    id, period_end: period.to, purpose, account_id, verified_amount, source_reference: "TEST-" + id,
    verified_by: 4, verifier_name: "QA officer", verified_at: "2026-11-01T07:00:00", correction_reason: null, revision: 1,
  });
  tables.cooperative_reconciliation_evidence.push(evidence(1, "CASH_ON_HAND", 1, "10.00"), evidence(2, "CASH_IN_BANK", 2, "80.00"));
  mockDirectus(context, tables);
  const result = await getMonthEndReport(period);
  const row = (id: string) => result.rows.find(row => row.id === id)?.cells.slice(2, 6);
  assert.deepEqual(row("CASH_ON_HAND"), ["10.00", "10.00", "0.00", "Matched"]);
  assert.deepEqual(row("CASH_IN_BANK"), ["80.10", "80.00", "0.10", "Difference"]);
  assert.deepEqual(row("DUE_FROM_EMPLOYER"), ["270.15", "270.15", "0.00", "Timing difference"]);
  const remittances = result.sections?.[0];
  assert.deepEqual(remittances?.rows.map(row => row.cells[5]), ["Matched", "Reversal matched", "Receipt posted after month end"]);
  assert.deepEqual(remittances?.rows.at(-1)?.cells.slice(6), [null, null, null, "10.00"]);
  assert.deepEqual(remittances?.totals.slice(6), ["40.10", "40.10", "0.00", null]);

  const stored = tables.cooperative_gl_lines.filter(line => line.journal_id === 14);
  stored[0].debit = stored[1].credit = "79.09";
  const mismatch = await getMonthEndReport(period);
  assert.deepEqual(mismatch.rows.find(row => row.id === "DUE_FROM_EMPLOYER")?.cells.slice(2, 6), ["271.16", "270.15", "1.01", "Difference"]);

  tables.cooperative_account_mappings[0].account_id = 6;
  tables.cooperative_reconciliation_evidence.pop();
  tables.cooperative_payroll_remittance_batches = tables.cooperative_payroll_remittance_batches.filter(row => row.id !== 2);
  const pending = await getMonthEndReport(period);
  assert.deepEqual(pending.rows.map(row => row.cells[5]), ["Mapping changed", "Evidence required", "Needs review"]);
  assert.deepEqual(pending.rows[0].cells.slice(3, 5), [null, null]);
  assert.deepEqual(pending.rows[2].cells.slice(3, 5), [null, null]);
});

test("verified evidence uses the mapped account, writes its event atomically and rejects stale corrections", async context => {
  const tables = ledgerFixtures();
  mockDirectus(context, tables);
  const actor = { actorId: 4, actorName: "QA officer", actorRole: "USER" };
  const payload = {
    periodEnd: statementPeriods(todayManila())["Last month"].to, purpose: "CASH_ON_HAND",
    accountId: 1, amount: "10.1", reference: "QA count sheet", expectedRevision: 0,
  };
  await assert.rejects(saveCloseEvidence(actor, { ...payload, amount: "-1.00" }), { status: 422 });
  await assert.rejects(saveCloseEvidence(actor, { ...payload, accountId: 2 }), { status: 409 });
  const saved = await saveCloseEvidence(actor, payload);
  assert.deepEqual(await saveCloseEvidence(actor, payload), saved);
  assert.equal(tables.cooperative_reconciliation_evidence.length, 1);
  assert.equal(tables.cooperative_reconciliation_evidence[0].verified_amount, "10.10");
  assert.equal(tables.cooperative_audit_events.length, 1);
  await assert.rejects(saveCloseEvidence(actor, { ...payload, expectedRevision: 1 }), { status: 422 });
  const corrections = await Promise.allSettled([
    saveCloseEvidence(actor, { ...payload, expectedRevision: 1, amount: "10.00", reason: "Use signed count" }),
    saveCloseEvidence(actor, { ...payload, expectedRevision: 1, amount: "11.00", reason: "Use amended count" }),
  ]);
  assert.equal(corrections.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(tables.cooperative_reconciliation_evidence.length, 2);
  assert.equal(tables.cooperative_audit_events.length, 2);
  const audit = tables.cooperative_audit_events[1];
  assert.equal(audit.action, "MONTH_END_EVIDENCE_CORRECTED");
  assert.equal((audit.before_state as Row).amount, "10.10");
  assert.equal(audit.actor_name, actor.actorName);
  assert.equal(Object.hasOwn(audit.after_state as Row, "sourceReference"), false);
  const today = todayManila();
  const report = await getAuditReport({ from: today, to: today }, { action: audit.action as string, q: "qa count sheet" });
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].cells[4], "QA count sheet");
  assert.equal((await saveCloseEvidence(actor, { ...payload, purpose: "CASH_IN_BANK", accountId: 2, amount: "-2.50" })).revision, 1);
});

test("audit uses Manila date boundaries, preserves recorded names and resolves references before paging", async context => {
  const tables = ledgerFixtures();
  tables.cooperative_loans.push({ id: 21, loan_no: "SL-2026-0001", agreement_no: "LA-2026-0001" });
  tables.user.push({ user_id: 9, user_fname: "Fallback", user_lname: "Officer" });
  const row = (id: number, occurred_at: string, extra: Row = {}) => ({
    id, occurred_at, actor_user_id: 9, actor_name: "Historical name", actor_role: "USER", action: "LOAN_REJECTED",
    entity_type: "LOAN", entity_id: "21", before_state: { status: "PENDING" },
    after_state: { status: "REJECTED", privateFile: "private-doc.txt", token: "not-for-the-report" },
    reason: "Missing signed agreement", journal_id: null, ...extra,
  });
  tables.cooperative_audit_events.push(
    row(1, "2026-09-30T15:59:59"),
    ...Array.from({ length: 52 }, (_, index) => row(index + 2, "2026-09-30T16:00:00")),
    row(54, "2026-10-01T15:59:59", { actor_name: null, actor_user_id: 0, actor_role: "SYSTEM", action: "LOAN_DUE_ACCRUAL", reason: null }),
    row(55, "2026-10-01T15:00:00", { actor_name: null, journal_id: 14 }),
    row(56, "2026-10-01T16:00:00"),
  );
  mockDirectus(context, tables);
  const day = { from: "2026-10-01", to: "2026-10-01" };
  const audit = await getAuditReport(day, { action: "", q: "" });
  assert.equal(audit.rows.length, 54);
  assert.equal(audit.rows[0].cells[1], "System");
  assert.equal(audit.rows[1].cells[1], "Fallback Officer");
  assert.equal(audit.rows[2].cells[1], "Historical name");
  assert.deepEqual(audit.rows[2].changes, [{ field: "Status", before: "Pending", after: "Rejected" }]);
  const params = { report: "audit", ...day, actorId: "9", action: "LOAN_REJECTED", q: "la-2026-0001" };
  const report = await getMemberReport(new URLSearchParams(params));
  const paged = reportPage(await getMemberReport(new URLSearchParams({ ...params, page: "2" })));
  assert.equal(report.rows.length, 53);
  assert.deepEqual([paged.count, paged.page, paged.rows.length, paged.fingerprint], [53, 2, 3, report.fingerprint]);
  const csv = serializeMemberReport(report, "csv");
  assert.match(csv, /Missing signed agreement/);
  assert.doesNotMatch(csv, /private-doc\.txt|not-for-the-report/);
  assert.deepEqual((await getAuditReport(day, { action: "", q: "jv-14" })).rows.map(row => row.id), [55]);
  assert.deepEqual((await getAuditReport(day, { action: "LOAN_DUE_ACCRUAL", actorId: 0, q: "" })).rows.map(row => row.id), [54]);
});

