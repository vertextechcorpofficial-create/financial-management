import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { serializeMemberReport } from "../console/reports/report-export";
import { statementText } from "../members/statement";
import { transactionEntries, type TransactionComponent } from "../transactions/entries";
import { getLoanDetail } from "./loans";
import { getMemberReport, getReportMemberChoices, reportPage } from "./member-reports";
import { todayManila } from "./member-read";
import { getMemberStatement } from "./member-service";

type Fixture = Record<string, unknown>;
type Filter = Record<string, Fixture | Filter[]>;

function matches(row: Fixture, filter: Filter): boolean {
  return Boolean(row) && Object.entries(filter).every(([field, condition]) => {
    if (Array.isArray(condition)) return condition.some(option => matches(row, option));
    const value = row[field];
    return Object.entries(condition).every(([operator, expected]) => {
      const key = value && typeof value === "object" ? (value as Fixture).id : value;
      if (operator === "_eq") return key === expected;
      if (operator === "_in") return (expected as unknown[]).some(item => String(item) === String(key));
      if (operator === "_lt") return value != null && String(value) < String(expected);
      if (operator === "_gte") return value != null && String(value) >= String(expected);
      if (operator === "_lte") return value != null && String(value) <= String(expected);
      if (operator === "_null") return (value === null) === expected;
      if (operator === "_nnull") return (value != null) === expected;
      if (operator === "_icontains") return String(value ?? "").toLowerCase().includes(String(expected).toLowerCase());
      if (!operator.startsWith("_")) return matches(value as Fixture, { [operator]: expected } as Filter);
      throw new Error("Unexpected filter " + operator);
    });
  });
}

function mockReads(context: TestContext, records: Record<string, Fixture[]>, dummy = false) {
  const endpoint = process.env.NEXT_PUBLIC_API_BASE_URL;
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  process.env.NEXT_PUBLIC_API_BASE_URL = dummy ? "http://100.110.197.61:8056" : "http://127.0.0.1:1";
  process.env.DIRECTUS_STATIC_TOKEN = "isolated-member-report-fixture";
  context.after(() => {
    if (endpoint === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = endpoint;
    if (token === undefined) delete process.env.DIRECTUS_STATIC_TOKEN;
    else process.env.DIRECTUS_STATIC_TOKEN = token;
  });
  const unavailable = new Map<string, number>();
  context.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    assert.equal(init?.method ?? "GET", "GET");
    const url = new URL(input);
    const table = url.pathname.replace("/items/", "");
    if (unavailable.has(table)) return new Response(null, { status: unavailable.get(table) });
    const source = records[table];
    assert(source, "Unexpected Directus request for " + table);
    const params = url.searchParams;
    const filter = JSON.parse(params.get("filter") ?? "{}") as Filter;
    const rows = source.filter(row => matches(row, filter));
    const limit = Number(params.get("limit"));
    assert(limit > 0 && limit <= 100, "Expected a bounded read from " + table);
    if (params.get("groupBy")) {
      assert.equal(table, "cooperative_savings_entries");
      assert.equal(params.get("groupBy"), "membership_id,kind");
      const groups = new Map<string, { membership_id: number; kind: string; cents: number }>();
      for (const row of rows) {
        const key = String(row.membership_id) + "/" + String(row.kind);
        const group = groups.get(key) ?? { membership_id: Number(row.membership_id), kind: String(row.kind), cents: 0 };
        group.cents += Math.round(Number(row.amount) * 100);
        groups.set(key, group);
      }
      return Response.json({ data: [...groups.values()].map(({ membership_id, kind, cents }) =>
        ({ membership_id, kind, sum: { amount: (cents / 100).toFixed(2) } })) });
    }
    const sort = params.get("sort")?.split(",") ?? [];
    rows.sort((a, b) => {
      for (const field of sort) {
        const descending = field.startsWith("-");
        const by = descending ? field.slice(1) : field;
        const difference = typeof a[by] === "number" ? Number(a[by]) - Number(b[by]) : String(a[by]).localeCompare(String(b[by]));
        if (difference) return descending ? -difference : difference;
      }
      return 0;
    });
    const offset = Number(params.get("offset") ?? 0);
    return Response.json({ data: rows.slice(offset, offset + limit) });
  });
  return unavailable;
}

test("Cooperative member reports share savings dates and produce one full result per filter", async context => {
  const membership = (id: number, status: string, joined_at = "2026-01-01"): Fixture => ({
    id, user_id: id, employee_name: "Employee " + id, department_name: "Finance", status, joined_at,
    savings_per_cutoff: "10.00", savings_balance: id === 1 ? "116.05" : "50.00",
  });
  const savings = (id: number, member: number, entry_date: string, kind: string, amount: string, reference: string): Fixture => ({
    id, membership_id: member, entry_date, kind, amount, reference, balance_after: "0.00", journal_id: id, posted_at: entry_date + "T02:00:00",
  });
  const records: Record<string, Fixture[]> = {
    user: Array.from({ length: 54 }, (_, index) => ({
      user_id: index + 1, user_fname: "Employee", user_lname: String(index + 1), user_department: 1,
      is_employee: true, is_deleted: false, is_blocked: false, separation_date: null,
    })),
    department: [{ department_id: 1, department_name: "Finance", is_delete: false }],
    cooperative_memberships: [membership(1, "ACTIVE"), membership(2, "SEPARATED"), membership(3, "ACTIVE", "2026-12-01")],
    cooperative_loans: [],
    cooperative_clearances: [],
    cooperative_membership_agreements: [{ id: 1, membership_id: 1, agreement_no: "MA-2026-0001" }],
    cooperative_document_types: [{ id: 1, name: "Identification", is_active: true }, { id: 2, name: "Signed agreement", is_active: true }],
    cooperative_policy_document_requirements: [1, 2].map(id => ({ id, document_type_id: id, is_active: true, scope: "MEMBERSHIP" })),
    cooperative_documents: [
      { id: "a", owner_type: "MEMBER", owner_id: 1, document_type_id: 1, removed_at: null },
      { id: "b", owner_type: "MEMBER", owner_id: 1, document_type_id: 1, removed_at: null },
      { id: "c", owner_type: "MEMBER", owner_id: 1, document_type_id: 2, removed_at: "2026-11-01T01:00:00" },
      { id: "d", owner_type: "CLEARANCE", owner_id: 1, document_type_id: 2, removed_at: null },
    ],
    cooperative_savings_entries: [
      savings(1, 1, "2026-10-31", "OPENING", "100.00", "Opening"),
      savings(2, 1, "2026-11-01", "DEPOSIT", "25.10", '=TEST(),"José"'),
      savings(3, 1, "2026-11-30", "OFFSET", "10.05", "Reversal"),
      savings(4, 1, "2026-12-01", "DEPOSIT", "1.00", "Later"),
      savings(5, 2, "2026-10-31", "OPENING", "50.00", "Inactive account"),
      savings(6, 1, "2026-11-01", "DEPOSIT", "2.00", "Same day"),
      savings(7, 1, "2026-11-01", "OFFSET", "2.00", "Same-day reversal"),
    ],
  };

  mockReads(context, records);

  const range = { from: "2026-11-01", to: "2026-11-30" };
  const query = (report: string, extra: Record<string, string> = {}) => new URLSearchParams({ report, ...range, ...extra });
  const statement = await getMemberReport(query("soa", { member: "1" }));
  assert.deepEqual(statement.rows.map(row => row.cells.at(-1)), ["125.10", "127.10", "125.10", "115.05"]);
  assert.deepEqual(statement.totals.slice(-3), ["27.10", "12.05", "115.05"]);
  assert.equal(statement.opening?.at(-1), "100.00");
  const savingsReport = await getMemberReport(query("savings", { department: "Finance" }));
  assert.equal(savingsReport.rows.length, 2);
  assert.deepEqual(savingsReport.rows[0].cells.slice(-4), ["100.00", "27.10", "12.05", "115.05"]);
  assert.deepEqual(savingsReport.rows[1].cells.slice(-4), ["50.00", "0.00", "0.00", "50.00"]);
  assert.deepEqual(savingsReport.totals.slice(-4), ["150.00", "27.10", "12.05", "165.05"]);
  const quiet = await getMemberReport(query("soa", { member: "2" }));
  assert.equal(quiet.rows.length, 0);
  assert.equal(quiet.totals.at(-1), "50.00");
  const emptyHistory = await getMemberStatement(2, new URLSearchParams(range));
  assert.equal(emptyHistory.loans.state, "ready");
  assert.match(statementText(emptyHistory), /No loans in this period\./);
  assert.equal((await getReportMemberChoices(new URLSearchParams({ q: "2" }))).members[0].id, 2);
  assert.equal((await getReportMemberChoices(new URLSearchParams({ q: "finance" }))).members.length, 3);
  await assert.rejects(getMemberReport(query("soa", { member: "1", from: "2026-11-31" })), { status: 422 });

  const roster = await getMemberReport(query("roster", { department: "Finance" }));
  assert.equal(roster.rows.length, 54);
  const first = reportPage(roster);
  const second = reportPage(await getMemberReport(query("roster", { department: "Finance", page: "2" })));
  assert.equal(first.rows.length, 50);
  assert.equal(second.rows.length, 4);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.totals, second.totals);
  for (const format of ["csv", "tsv"] as const) {
    const text = serializeMemberReport(roster, format);
    assert.equal(text.split(/\r?\n/).length, 56);
    assert.match(serializeMemberReport(statement, format), /'=TEST\(\)/);
  }
  assert.equal((await getMemberReport(query("roster", { q: "MA-2026-0001" }))).rows[0].id, 1);
  assert.equal((await getMemberReport(query("roster", { status: "NON_MEMBER" }))).rows.length, 51);

  const docs = await getMemberReport(query("docs", { q: "MA-2026-0001" }));
  assert.deepEqual(docs.rows[0].cells.slice(-2), ["1 of 2", "Signed agreement"]);
  records.cooperative_documents[0].removed_at = "2026-11-02T01:00:00";
  assert.equal((await getMemberReport(query("docs", { q: "MA-2026-0001" }))).fingerprint, docs.fingerprint);
  records.cooperative_documents[1].removed_at = "2026-11-02T01:00:00";
  const missing = await getMemberReport(query("docs", { q: "MA-2026-0001" }));
  assert.deepEqual(missing.rows[0].cells.slice(-2), ["0 of 2", "Identification, Signed agreement"]);
  assert.notEqual(missing.fingerprint, docs.fingerprint);
});

function postingFixtures() {
  const today = todayManila();
  const date = (daysAgo: number) => new Date(Date.parse(today + "T00:00:00Z") - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const member = (id: number, status: string) => ({
    id, user_id: id + 100, employee_name: "Member " + id, department_name: "Finance",
    joined_at: date(150), status, savings_per_cutoff: "10.00", savings_balance: "0.00",
  });
  const active = member(1, "ACTIVE");
  const separated = member(2, "SEPARATED");
  const loan = (id: number, person: ReturnType<typeof member>, status: string, product: number, principal: string, total: string) => ({
    id, member_id: person.id, member_no: String(person.user_id), member_name: person.employee_name, department_name: person.department_name,
    loan_no: "LN-" + id, agreement_no: "LA-" + id, status, product_id: product,
    product_name: product === 8 ? "Cash loan" : "Goods installment", product_kind: product === 8 ? "CASH" : "GOODS",
    months: 4, frequency: "CUTOFF", mode: "PAYROLL", principal, total_payable: total,
    released_on: ["ACTIVE", "DEFAULTED"].includes(status) ? date(120) : null, applied_on: date(125),
    terms_snapshot: { documents: [{ documentTypeId: 3, name: "Signed goods agreement", enforcement: "BLOCK" },
      { documentTypeId: 4, name: "Proof of purchase", enforcement: "WARN" }] },
  });
  const defaulted = loan(21, separated, "DEFAULTED", 8, "800.00", "880.00");
  const goods = loan(22, active, "ACTIVE", 9, "200.00", "220.00");
  const pending = loan(23, active, "PENDING", 8, "300.00", "355.00");
  const approved = loan(24, active, "APPROVED", 9, "300.00", "355.00");
  const journal = (id: number, loanId: number, business_date: string, command_type: string, reversal: number | null = null) => (
    { id, journal_no: "JV-" + id, business_date, posted_at: business_date + "T01:00:00",
      command_type, source_type: "LOAN", source_id: String(loanId), reverses_journal_id: reversal }
  );
  const installment = (id: number, loanId: number, no: number, days: number) => ({
    id, loan_id: loanId, installment_no: no, due_date: date(days),
    principal: "100.00", interest: "10.00", total: "110.00", status: "UNPAID",
    paid_total: "0.00", paid_principal: "0.00", paid_interest: "0.00",
    penalty_assessed: "0.00", penalty_paid: "0.00", penalty_assessed_on: null as string | null,
  });
  const tables: Record<string, Fixture[]> = {
    user: [active, separated].map(person => ({
      user_id: person.user_id, user_fname: "Member", user_lname: String(person.id), user_department: 1,
      is_employee: true, is_deleted: false, is_blocked: false, separation_date: person.status === "SEPARATED" ? date(12) : null,
    })),
    department: [{ department_id: 1, department_name: "Finance", is_delete: false }],
    cooperative_memberships: [active, separated],
    cooperative_membership_agreements: [],
    cooperative_loans: [defaulted, goods, pending, approved],
    cooperative_loan_products: [{ id: 8, name: "Cash loan" }, { id: 9, name: "Goods installment" }],
    cooperative_loan_installments: [
      ...[91, 90, 61, 60, 31, 30, 1, 0].map((days, index) => installment(211 + index, 21, 1 + index, days)),
      { ...installment(221, 22, 1, 35), principal: "200.00", interest: "20.00", total: "220.00",
        status: "PAID", paid_principal: "200.00", paid_interest: "20.00", paid_total: "220.00",
        penalty_assessed: "5.00", penalty_paid: "2.00", penalty_assessed_on: date(32) },
    ],
    cooperative_loan_payments: [],
    cooperative_loan_payment_allocations: [],
    cooperative_journals: [journal(301, 21, date(120), "LOAN_RELEASE"), journal(302, 22, date(120), "LOAN_RELEASE")],
    cooperative_audit_events: [],
    cooperative_command_receipts: [],
    cooperative_savings_entries: [],
    cooperative_transaction_entries: [],
    cooperative_document_types: [
      { id: 3, name: "Signed goods agreement", is_active: true }, { id: 4, name: "Proof of purchase", is_active: true },
      { id: 5, name: "Separation letter", is_active: true }, { id: 6, name: "HR clearance form", is_active: true },
    ],
    cooperative_policy_document_requirements: [{ id: 1, document_type_id: 5, enforcement: "BLOCK", is_active: true, scope: "CLEARANCE" }],
    cooperative_clearances: [
      { id: 22, status: "DRAFT", clearance_no: "CL-22", membership_id: active },
      { id: 25, status: "COMPLETED", clearance_no: "CL-25", membership_id: separated },
    ],
    cooperative_documents: [
      { id: "goods-a", owner_type: "LOAN", owner_id: 22, document_type_id: 3, removed_at: null },
      { id: "goods-b", owner_type: "LOAN", owner_id: 22, document_type_id: 3, removed_at: null },
      { id: "goods-c", owner_type: "LOAN", owner_id: 22, document_type_id: 4, removed_at: date(1) },
      { id: "other-a", owner_type: "CLEARANCE", owner_id: 22, document_type_id: 4, removed_at: null },
    ],
  };
  Object.assign(tables.cooperative_loan_installments[0], {
    status: "PARTIAL", paid_total: "22.00", paid_principal: "20.00", paid_interest: "2.00",
    penalty_assessed: "5.00", penalty_paid: "1.00", penalty_assessed_on: date(87),
    settlement_waiver: { amount: "1.25", date: date(12), reference: "CL-25", reversedOn: null },
  });

  function postPayment(input: {
    id: number; loan: typeof defaulted; daysAgo: number; parts: [string, string, string]; total: string;
    reversed?: boolean; reverses?: number; offset?: boolean; installment?: number;
  }) {
    const { id, loan, daysAgo, parts: [principal, interest, penalty], total, reverses, reversed, offset } = input;
    const command = offset ? (reverses ? "CLEARANCE_SETTLEMENT_REVERSED" : "CLEARANCE_SETTLEMENT") : reverses ? "LOAN_PAYMENT_REVERSED" : "LOAN_PAYMENT";
    const entry = journal(400 + id, loan.id, date(daysAgo), command, reverses ? 400 + reverses : null);
    tables.cooperative_journals.push(offset ? { ...entry, source_type: "CLEARANCE", source_id: "25" } : entry);
    tables.cooperative_loan_payments.push({
      id, loan_id: loan.id, member_id: loan.member_id, journal_id: 400 + id, reverses_payment_id: reverses ?? null,
      status: reversed ? "REVERSED" : "POSTED", principal_amount: principal, interest_amount: interest, penalty_amount: penalty, amount: total,
      reference_no: offset ? "CL-25" : "PAY-" + id, channel: offset ? "PAYROLL" : "OTC",
    });
    if (!reverses) tables.cooperative_loan_payment_allocations.push({
      id, payment_id: id, installment_id: loan.id * 10 + (input.installment ?? 1), principal, interest, penalty, total,
    });
  }
  postPayment({ id: 1, loan: defaulted, daysAgo: 12, parts: ["20.00", "2.00", "1.00"], total: "23.00", offset: true });
  postPayment({ id: 2, loan: defaulted, daysAgo: 6, parts: ["7.00", "1.20", "0.00"], total: "8.20", offset: true, reversed: true });
  postPayment({ id: 3, loan: defaulted, daysAgo: 5, parts: ["20.02", "7.21", "3.00"], total: "30.23", reversed: true, installment: 2 });
  postPayment({ id: 4, loan: defaulted, daysAgo: 2, parts: ["7.00", "1.20", "0.00"], total: "8.20", offset: true, reverses: 2 });
  postPayment({ id: 5, loan: defaulted, daysAgo: 1, parts: ["20.02", "7.21", "3.00"], total: "30.23", reverses: 3 });
  postPayment({ id: 6, loan: goods, daysAgo: 15, parts: ["200.00", "20.00", "2.00"], total: "222.00" });

  function index(id: number, kind: TransactionComponent["kind"], value: string, daysAgo: number, details: Partial<TransactionComponent> = {}, original?: number) {
    const businessDate = date(daysAgo);
    const journalId = details.paymentId ? 400 + details.paymentId : id;
    const [row] = transactionEntries({ id: journalId, date: businessDate, postedAt: businessDate + "T01:00:00" }, [
      { kind, amount: value, memberId: active.id, channel: "OTC", ...details },
    ]);
    return { ...row, id, membership_id: details.memberId === separated.id ? separated : active,
      journal_id: { id: journalId, journal_no: "JV-" + journalId, business_date: businessDate, command_type: kind,
        reverses_journal_id: original ? { id: original, journal_no: "JV-" + original } : null } };
  }
  tables.cooperative_transaction_entries.push(
    ...Array.from({ length: 52 }, (_, i) => index(1000 + i, "SAVINGS_DEPOSIT", "0.01", 5)),
    index(1052, "LOAN_PAYMENT", "30.23", 5, { memberId: 2, loanId: 21, paymentId: 3, receivedOn: date(14), sourceReference: "LN-21" }),
    index(1053, "LOAN_PAYMENT_REVERSED", "30.23", 1, { memberId: 2, loanId: 21, paymentId: 5, sourceReference: "LN-21" }, 403),
    index(1054, "SAVINGS_DEPOSIT", "12.34", 5, { channel: "PAYROLL" }),
    index(1055, "SAVINGS_DEPOSIT_REVERSED", "12.34", 1, { channel: "PAYROLL" }, 1054),
    index(1056, "MEMBERSHIP_FEE", "50.00", 5),
    index(1057, "PROCESSING_FEE", "7.25", 5, { loanId: 21, memberId: 2, sourceReference: "LN-21" }),
    index(1058, "WITHDRAWAL", "100.00", 5),
    index(1059, "SAVINGS_OFFSET", "25.00", 5, { channel: "SYSTEM" }),
    index(1060, "LOAN_RELEASE", "800.00", 5, { loanId: 21, memberId: 2 }),
  );
  return { tables, date };
}

function report(name: string, filters: Record<string, string> = {}) {
  return getMemberReport(new URLSearchParams({ report: name, ...filters }));
}

test("portfolio and aging use posted schedules, including defaulted receivables and penalty-only balances", async context => {
  const { tables, date } = postingFixtures();
  mockReads(context, tables);
  const portfolio = await report("portfolio");
  assert.equal(portfolio.rows.length, 4);
  assert.deepEqual(portfolio.rows.find(row => row.id === 23)?.cells.slice(7), ["For approval", null, null, null, null]);
  assert.deepEqual(portfolio.rows.find(row => row.id === 21)?.cells.slice(7), ["Defaulted", "800.00", "856.75", "746.75", "4.00"]);
  assert.deepEqual(portfolio.totals.slice(-4), ["1000.00", "856.75", "746.75", "7.00"]);
  const released = await report("portfolio", { from: date(120), to: date(120), product: "9" });
  assert.deepEqual(released.rows.map(row => row.id), [22]);
  assert.equal((await report("portfolio", { from: date(119) })).rows.length, 0);
  assert.deepEqual((await report("portfolio", { status: "PAST_DUE" })).rows.map(row => row.id), [22]);

  const aging = await report("aging", { department: "Finance" });
  assert.deepEqual(aging.rows.map(row => row.id), [21, 22]);
  assert.deepEqual(aging.rows[0].cells.slice(4), ["Defaulted", date(91), 91, "220.00", "220.00", "220.00", "86.75", "4.00", "750.75"]);
  assert.deepEqual(aging.rows[1].cells.slice(-6), ["0.00", "0.00", "0.00", "0.00", "3.00", "3.00"]);
  assert.equal(aging.totals.at(-1), "753.75");
  assert.deepEqual((await report("aging", { q: "LN-21", product: "8" })).rows.map(row => row.id), [21]);

  const statement = await report("soa", { member: "102", from: date(4), to: date(1) });
  assert.deepEqual(statement.sections?.[0].totals.slice(2), ["821.32", "0.00", "-27.23", "-3.00", "-8.20", "0.00", "856.75"]);
  assert.deepEqual(statement.sections?.[1].rows.map(row => [row.cells[2], row.cells[6], row.cells[7]]), [
    ["Offset reversal", "JV-402", "-8.20"], ["Payment reversal", "JV-403", "-30.23"],
  ]);
  assert.match(serializeMemberReport(statement, "csv"), /Payment reversal,Over the counter,PAY-5,JV-405,JV-403,-30\.23/);
  const clearance = await report("soa", { member: "102", from: date(12), to: date(12) });
  assert.deepEqual(clearance.sections?.[0].totals.slice(-3), ["22.00", "1.25", "856.75"]);
  const roster = await report("roster", { status: "SEPARATED" });
  assert.deepEqual(roster.rows.map(row => [row.id, row.cells.at(-1)]), [[102, "856.75"]]);
  assert.equal(roster.totals.at(-1), "856.75");
  assert.equal((await getLoanDetail(21, 2))?.loan.balance, "856.75");
  assert.equal(await getLoanDetail(21, 1), null);
  const memberStatement = await getMemberStatement(102, new URLSearchParams({ from: date(6), to: date(2) }));
  const offsetRows = statementText(memberStatement).split("\n").map(row => row.split("\t"))
    .filter(cells => cells[2] === "Clearance offset" || cells[2] === "Offset reversal");
  assert.deepEqual(offsetRows, [
    [date(6), "LN-21", "Clearance offset", "Exit clearance", "CL-25", "JV-402", "", "8.20"],
    [date(2), "LN-21", "Offset reversal", "Exit clearance", "CL-25", "JV-404", "JV-402", "-8.20"],
  ]);
});

test("collections nets linked postings on their own dates and keeps the full filtered export", async context => {
  const { tables, date } = postingFixtures();
  mockReads(context, tables, true);
  const range = { from: date(5), to: date(1) };
  const full = await report("collections", range);
  assert.equal(full.rows.length, 58);
  assert.deepEqual(full.totals.slice(-5), ["0.00", "0.00", "0.52", "57.25", "57.77"]);
  const second = reportPage(await report("collections", { ...range, page: "2" }));
  assert.equal(second.rows.length, 8);
  assert.equal(second.fingerprint, full.fingerprint);
  assert.deepEqual(second.totals, full.totals);
  assert.equal(serializeMemberReport(full, "tsv").split("\n").length, 60);
  const reversal = await report("collections", { from: date(1), to: date(1) });
  assert.deepEqual(reversal.rows.map(row => row.cells[7]), ["JV-403", "JV-1054"]);
  assert.deepEqual(reversal.totals.slice(-5), ["-27.23", "-3.00", "-12.34", "0.00", "-42.57"]);
  const original = await report("collections", { from: date(5), to: date(5), q: "LN-21", product: "8" });
  assert.deepEqual(original.rows.map(row => row.id), [1052, 1057]);
  assert.deepEqual(original.totals.slice(-5), ["27.23", "3.00", "0.00", "7.25", "37.48"]);
  assert.equal((await report("collections", { from: date(14), to: date(14), q: "LN-21" })).rows.length, 0);
  assert.deepEqual((await report("collections", { ...range, channel: "PAYROLL" })).rows.map(row => row.id), [1054, 1055]);
  const reversalFixture = tables.cooperative_transaction_entries.find(row => row.id === 1053)!;
  reversalFixture.amount = "30.24";
  const mismatched = await report("collections", range);
  assert.equal(mismatched.blocked, true);
  assert.equal(mismatched.notices?.[0]?.state, "unavailable");
});

test("compliance follows signed loan requirements and current draft clearance policy", async context => {
  const { tables } = postingFixtures();
  const unavailable = mockReads(context, tables, true);
  const docs = await report("docs");
  const goods = docs.rows.find(row => row.id === "loan:22");
  assert.deepEqual(goods?.cells.slice(-2), ["1 of 2", "Proof of purchase"]);
  assert.deepEqual(docs.rows.find(row => row.id === "clearance:22")?.cells.slice(-2), ["0 of 1", "Separation letter"]);
  assert.deepEqual((await report("docs", { recordType: "clearance", q: "CL-22" })).rows.map(row => row.id), ["clearance:22"]);
  assert(!docs.rows.some(row => row.id === "clearance:25" || row.id === "loan:21"));
  tables.cooperative_policy_document_requirements.push({
    id: 2, document_type_id: 6, enforcement: "WARN", is_active: true, scope: "CLEARANCE",
  });
  const changed = await report("docs");
  assert.deepEqual(changed.rows.find(row => row.id === "loan:22"), goods);
  assert.deepEqual(changed.rows.find(row => row.id === "clearance:22")?.cells.slice(-2), ["0 of 2", "HR clearance form, Separation letter"]);
  unavailable.set("cooperative_clearances", 404);
  const partial = await report("docs");
  assert.equal(partial.blocked, false);
  assert.match(serializeMemberReport(partial, "csv"), /Exit clearance,Awaiting source data/);
  const blocked = await report("docs", { recordType: "clearance" });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.notices?.[0].state, "pending_rollout");
});

test("pages all three statement sections independently and exports every section in full", async context => {
  const { tables, date } = postingFixtures();
  for (let index = 0; index < 52; index++) {
    const id = 2000 + index;
    tables.cooperative_loans.push({ ...tables.cooperative_loans[1], id, loan_no: "LN-" + id });
    tables.cooperative_loan_installments.push({
      ...tables.cooperative_loan_installments[8], id, loan_id: id, status: "UNPAID",
      paid_principal: "0.00", paid_interest: "0.00", paid_total: "0.00", penalty_paid: "0.00",
    });
    tables.cooperative_journals.push({ ...tables.cooperative_journals[1], id, source_id: String(id), journal_no: "JV-" + id });
    tables.cooperative_savings_entries.push({
      id, membership_id: 1, entry_date: date(30), kind: "DEPOSIT", amount: "0.01", balance_after: "0.00",
      reference: "DEPOSIT-" + id, journal_id: id, posted_at: date(30) + "T12:00:00",
    });
  }
  mockReads(context, tables, true);
  const filters = { member: "101", from: date(121), to: date(0) };
  const full = await report("soa", filters);
  const page = reportPage(await report("soa", { ...filters, page: "2", activityPage: "2" }));
  assert.deepEqual([page.page, page.rows.length], [2, 2]);
  assert.deepEqual(page.sections?.map(section => [section.key, section.page, section.count, section.rows.length]), [
    ["loans", 1, 53, 50], ["activity", 2, 54, 4],
  ]);
  const loans = reportPage(await report("soa", { ...filters, loanPage: "2" }));
  assert.deepEqual(loans.sections?.map(section => [section.page, section.rows.length]), [[2, 3], [1, 50]]);
  assert.equal(page.fingerprint, full.fingerprint);
  assert.equal(loans.fingerprint, full.fingerprint);
  const body = serializeMemberReport(full, "tsv");
  assert.match(body, /DEPOSIT-2051/);
  assert.match(body, /LN-2051\tGoods installment/);
  assert.match(body, /Release\t\tJV-2051/);
});

test("missing or inconsistent loan postings keep independently verified savings available", async context => {
  const { tables, date } = postingFixtures();
  const unavailable = mockReads(context, tables);
  assert.equal((await report("collections")).blocked, true);
  tables.cooperative_savings_entries.push({
    id: 1, membership_id: 2, entry_date: date(20), kind: "DEPOSIT", amount: "50.00", balance_after: "50.00",
    reference: "DEPOSIT-1", journal_id: 1001, posted_at: date(20) + "T01:00:00",
  });
  const period = { from: date(31), to: date(0) };
  const journals = tables.cooperative_journals;
  tables.cooperative_journals = journals.filter(row => row.id !== 301);
  assert.equal((await report("portfolio")).notices?.[0].state, "unavailable");
  const statement = await getMemberStatement(102, new URLSearchParams(period));
  assert.equal(statement.loans.state, "unavailable");
  assert.equal(statement.closingBalance, "50.00");
  const copy = statementText(statement);
  assert.match(copy, /DEPOSIT-1\t50\.00/);
  assert.match(copy, /Posted loan records could not be verified/);
  await assert.rejects(getLoanDetail(21), { status: 503 });
  tables.cooperative_journals = journals;

  const allocation = tables.cooperative_loan_payment_allocations.find(row => row.payment_id === 2)!;
  allocation.total = "8.21";
  const statementReport = await report("soa", { ...period, member: "102" });
  assert.equal(statementReport.totals.at(-1), "50.00");
  assert.equal(statementReport.notices?.[0].state, "unavailable");
  const roster = await report("roster");
  assert(roster.rows.every(row => row.cells.at(-1) === null));
  assert.equal(roster.totals.at(-1), null);
  allocation.total = "8.20";

  const reversal = journals.find(row => row.id === 404)!;
  reversal.reverses_journal_id = 403;
  assert.equal((await getMemberStatement(102, new URLSearchParams(period))).loans.state, "unavailable");
  reversal.reverses_journal_id = 402;

  unavailable.set("cooperative_loan_installments", 403);
  assert.equal((await report("portfolio")).notices?.[0].state, "unavailable");
});


