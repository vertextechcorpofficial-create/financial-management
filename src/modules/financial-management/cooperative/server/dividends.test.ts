import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { z } from "zod";
import { dividendInputs } from "../console/dividends/types";
import type { ClearanceRow } from "./clearance-store";
import { commitSettlement } from "./clearance-writes";
import { getDividendBasis } from "./dividend-basis";
import { getDividendDraft, parseDividendYear, saveDividendDraft } from "./dividend-drafts";
import { postDividendRun } from "./dividend-posting";
import { reviewDividendPosting } from "./dividend-review";
import { amountToCents, signedCentsToAmount, todayManila } from "./member-read";

type Row = Record<string, unknown>;
type Filter = Record<string, Record<string, unknown>>;
const actor = { actorId: 4, actorName: "QA officer", actorRole: "USER" };
const inputs = { netSurplus: "48000.01", reservePercent: "10.005", educationPercent: "10", savingsSharePercent: "70" };
const expected = { ...inputs, reservePercent: "10.0050", educationPercent: "10.0000", savingsSharePercent: "70.0000" };

function matches(row: Row | null, filter: Filter): boolean {
  if (!row) return false;
  return Object.entries(filter).every(([field, clause]) => Object.entries(clause).every(([operator, expected]) => {
    const value = row[field];
    switch (operator) {
      case "_eq": return value === expected;
      case "_in": return (expected as unknown[]).includes(value);
      case "_nnull": return (value != null) === expected;
      case "_lt": return value != null && String(value) < String(expected);
      case "_lte": return value != null && String(value) <= String(expected);
      case "_gte": return value != null && String(value) >= String(expected);
      default: return matches(value as Row | null, { [operator]: expected as Row });
    }
  }));
}

function mockDirectus(context: TestContext, tables: Record<string, Row[]>, posting = false) {
  const variables = ["NEXT_PUBLIC_API_BASE_URL", "DIRECTUS_STATIC_TOKEN"] as const;
  const previous = variables.map(key => process.env[key]);
  process.env.NEXT_PUBLIC_API_BASE_URL = posting ? "http://100.110.197.61:8056" : "http://127.0.0.1:1";
  process.env.DIRECTUS_STATIC_TOKEN = "isolated-dividend-fixture";
  context.after(() => variables.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  }));
  const control = { fail: false, loseResponse: false, annualWrites: [] as Row[], beforeAnnualWrite: undefined as (() => Promise<void>) | undefined };
  context.mock.method(globalThis, "fetch", async (input: string, options?: RequestInit) => {
    const url = new URL(input);
    const [table] = url.pathname.replace("/items/", "").split("/");
    const records = tables[table];
    assert(records, "Unexpected Directus request for " + table);
    if (options?.method === "PATCH") {
      assert.equal(table, "cooperative_clearances");
      const update = JSON.parse(String(options.body));
      tables.cooperative_audit_events.push(update.last_event_id);
      tables.cooperative_command_receipts.push(update.last_command_id);
      const membership = update.last_command_id.membership_id;
      Object.assign(tables.cooperative_memberships.find(row => row.id === membership.id)!, membership);
      return Response.json({ data: { id: 1 } });
    }
    if (options?.method === "POST") {
      const payload = JSON.parse(String(options.body)) as Row;
      const event = payload.audit_event_id as Row;
      if (table === "cooperative_dividend_runs") {
        await control.beforeAnnualWrite?.();
        if (tables.cooperative_audit_events.some(row => row.dividend_source_revision === event.dividend_source_revision)) {
          return Response.json({ errors: [{ message: "The dividend source revision must be unique." }] }, { status: 400 });
        }
        control.annualWrites.push(payload);
        const id = records.length + 1;
        const commands = (payload.posting_commands as { create: Row[] }).create;
        tables.cooperative_command_receipts.push(...commands);
        tables.cooperative_audit_events.push(event);
        records.push({ ...payload, id });
        return Response.json({ data: { id } });
      }
      assert.equal(table, "cooperative_dividend_drafts");
      assert.equal(event.action, "DIVIDEND_DRAFT_SAVED");
      if (records.some(row => row.revision_key === payload.revision_key)) return new Response(null, { status: 400 });
      if (control.fail) return new Response(null, { status: 503 });
      const id = records.length + 1;
      tables.cooperative_audit_events.push(event);
      records.push({ ...payload, id });
      if (control.loseResponse) throw new Error("Lost response");
      return Response.json({ data: { id } });
    }
    assert.equal(options?.method ?? "GET", "GET");
    const query = url.searchParams;
    const limit = Number(query.get("limit"));
    assert(limit > 0 && limit <= 100);
    const offset = Number(query.get("offset") ?? 0);
    let rows = records.filter(row => matches(row, JSON.parse(query.get("filter") ?? "{}")));
    const grouping = query.get("groupBy");
    if (grouping) {
      assert.equal(table, "cooperative_savings_entries");
      const keys = grouping.split(",");
      const groups = new Map<string, { fields: Row; amount: bigint }>();
      for (const row of rows) {
        const fields = Object.fromEntries(keys.map(key => [key, row[key]]));
        const hash = JSON.stringify(fields);
        const group = groups.get(hash) ?? { fields, amount: 0n };
        group.amount += amountToCents(String(row.amount));
        groups.set(hash, group);
      }
      rows = [...groups.values()].map(({ fields, amount }) => ({ ...fields, sum: { amount: signedCentsToAmount(amount) } }));
    }
    const sort = query.get("sort")?.split(",") ?? [];
    rows.sort((left, right) => {
      for (const field of sort) {
        const key = field.replace(/^-/, "");
        const compare = typeof left[key] === "number" ? Number(left[key]) - Number(right[key]) :
          String(left[key]).localeCompare(String(right[key]));
        if (compare) return field.startsWith("-") ? -compare : compare;
      }
      return 0;
    });
    return Response.json({ data: rows.slice(offset, offset + limit) });
  });
  return control;
}

function fixture() {
  const membership = (id: number, joined_at: string, status = "ACTIVE") => ({
    id, user_id: id + 100, employee_name: "Member " + id, department_name: "Finance", joined_at, status,
  });
  const savings = (membership_id: number, entry_date: string, kind: string, amount: string, posted_at: string | null = "2025-01-01T00:00:00") => ({
    membership_id, entry_date, kind, amount, journal_id: { posted_at },
  });
  return {
    cooperative_dividend_drafts: [] as Row[],
    cooperative_dividend_runs: [] as Row[],
    cooperative_command_receipts: [] as Row[],
    cooperative_number_series: [] as Row[],
    cooperative_clearances: [] as Row[],
    cooperative_gl_accounts: [] as Row[],
    cooperative_account_mappings: [] as Row[],
    cooperative_audit_events: [] as Row[],
    cooperative_memberships: [membership(1, "2023-12-20"), membership(2, "2024-12-31"), membership(3, "2023-08-01", "SEPARATED"),
      membership(4, "2025-01-01"), membership(5, "2023-01-01")],
    cooperative_savings_entries: [
      savings(1, "2023-12-20", "OPENING", "120.00"), savings(1, "2023-12-31", "WITHDRAWAL", "20.00"),
      savings(1, "2024-07-01", "DEPOSIT", "100.13"), savings(1, "2024-07-01", "DEPOSIT", "10.00"),
      savings(1, "2024-07-01", "OFFSET", "10.13"), savings(1, "2024-12-31", "DIVIDEND", "0.01"),
      savings(1, "2024-01-01", "DEPOSIT", "9000.00", null), savings(1, "2025-01-01", "DEPOSIT", "100.00"),
      savings(2, "2024-12-31", "OPENING", "366.00"), savings(3, "2024-01-01", "DEPOSIT", "500.00"),
      savings(4, "2025-01-02", "OPENING", "0.01"),
    ],
    cooperative_loan_payments: [] as Row[],
  };
}

function payment(id: number, business_date: string, interest: string, options: {
  memberId?: number; reverses?: number; reversed?: boolean; goods?: boolean; postedAt?: string | null; channel?: string;
} = {}) {
  const memberId = options.memberId ?? 1;
  const loanId = 50 + memberId + (options.goods ? 100 : 0);
  return {
    id, member_id: memberId, loan_id: { id: loanId, member_id: memberId, product_kind: options.goods ? "GOODS" : "CASH" },
    status: options.reversed ? "REVERSED" : "POSTED",
    channel: options.channel ?? "OTC", receipt_date: "2023-12-31", reverses_payment_id: options.reverses ?? null,
    amount: signedCentsToAmount(701n + amountToCents(interest)), principal_amount: "7.00", interest_amount: interest, penalty_amount: "0.01",
    journal_id: {
      id: 1000 + id, source_type: "LOAN", source_id: String(loanId), business_date,
      command_type: options.reverses ? "LOAN_PAYMENT_REVERSED" : "LOAN_PAYMENT",
      posted_at: options.postedAt === undefined ? business_date + "T02:00:00" : options.postedAt,
      reverses_journal_id: options.reverses ? 1000 + options.reverses : null,
    },
  };
}

test("validates Manila years and preserves reviewed values at their declared scale", () => {
  const before = todayManila(new Date("2024-12-31T15:59:59Z"));
  const after = todayManila(new Date("2024-12-31T16:00:00Z"));
  assert.throws(() => parseDividendYear("2025", before), { status: 422 });
  assert.equal(parseDividendYear("2025", after), 2025);
  assert.equal(parseDividendYear("2024", after), 2024);
  assert.throws(() => parseDividendYear("20", after), { status: 422 });
  assert.deepEqual(dividendInputs.parse(inputs), expected);
  assert(dividendInputs.safeParse({ netSurplus: "0", reservePercent: "50", educationPercent: "50", savingsSharePercent: "100" }).success);
  for (const invalid of [{ netSurplus: "" }, { netSurplus: "-1" }, { netSurplus: "1.001" }, { netSurplus: "10000000000" },
    { reservePercent: "50.0001" }, { educationPercent: "40.11111" }, { savingsSharePercent: "100.0001" }, { reservePercent: "abc" }]) {
    assert.equal(dividendInputs.safeParse({ ...inputs, ...invalid }).success, false);
  }
});

test("saves and reopens year-specific reviewed revisions, including exact retries", async context => {
  const records = fixture();
  mockDirectus(context, records);
  assert.equal(await getDividendDraft(2024), null);
  await assert.rejects(saveDividendDraft(2024, actor, { ...inputs, reservePercent: "51", expectedRevision: 0 }), { status: 422 });
  const saved = await saveDividendDraft(2024, actor, { ...inputs, expectedRevision: 0 });
  assert.deepEqual(saved.values, expected);
  assert.deepEqual(await getDividendDraft(2024), saved);
  assert.equal(await getDividendDraft(2025), null);
  assert.deepEqual(await saveDividendDraft(2024, actor, { ...expected, expectedRevision: 0 }), saved);
  const update = await saveDividendDraft(2024, actor, { ...inputs, netSurplus: "50500", expectedRevision: 1 });
  assert.equal(update.revision, 2);
  assert.equal((await getDividendDraft(2024))?.values.netSurplus, "50500.00");
  assert.equal(records.cooperative_dividend_drafts[0].net_surplus, "48000.01");
  assert.equal(records.cooperative_audit_events.length, 2);
  assert.deepEqual(records.cooperative_audit_events[1].before_state, { netSurplus: "48000.01", revision: 1 });
});

test("keeps one concurrent revision and recovers after a lost response", async context => {
  const records = fixture();
  const control = mockDirectus(context, records);
  const start = { ...inputs, expectedRevision: 0 };
  control.fail = true;
  await assert.rejects(saveDividendDraft(2024, actor, start), { status: 503 });
  assert.equal(records.cooperative_audit_events.length, 0);
  control.fail = false;
  control.loseResponse = true;
  const initial = await saveDividendDraft(2024, actor, start);
  assert.equal(initial.revision, 1);
  control.loseResponse = false;
  const results = await Promise.allSettled([
    saveDividendDraft(2024, actor, { ...inputs, netSurplus: "50000", expectedRevision: 1 }),
    saveDividendDraft(2024, { ...actor, actorId: 5 }, { ...inputs, netSurplus: "60000", expectedRevision: 1 }),
  ]);
  assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
  const rejected = results.find(value => value.status === "rejected");
  assert.equal(rejected?.reason.status, 409);
  assert.equal(records.cooperative_dividend_drafts.length, 2);
  assert.equal(records.cooperative_audit_events.length, 2);
});

test("uses opening savings, daily closing balances and the complete Manila year denominator", async context => {
  const records = fixture();
  mockDirectus(context, records);
  const year = await getDividendBasis(2024, "2026-01-02");
  assert.deepEqual([year.from, year.through, year.days, year.provisional], ["2024-01-01", "2024-12-31", 366, false]);
  assert.deepEqual(year.rows.map(row => [row.membershipId, row.averageSavings, row.savingsCentavoDays]),
    [[1, "150.27", "5500001"], [2, "1.00", "36600"], [5, "0.00", "0"]]);
  const complete = await getDividendBasis(2025, "2026-01-02");
  assert.equal(complete.days, 365);
  assert.equal(complete.rows[0].averageSavings, "300.01");
  const current = await getDividendBasis(2025, "2025-01-02");
  assert.deepEqual([current.through, current.days, current.provisional], ["2025-01-02", 2, true]);
  assert.equal(current.rows.find(row => row.membershipId === 4)?.averageSavings, "0.01");
});

test("nets posted interest splits by journal date across both payment channels and years", async context => {
  const records = fixture();
  records.cooperative_loan_payments.push(
    payment(1, "2023-12-31", "2.00", { reversed: true }),
    payment(2, "2024-01-01", "2.00", { reverses: 1 }),
    payment(3, "2024-02-01", "3.25", { channel: "PAYROLL" }),
    payment(4, "2024-12-31", "1.00", { reversed: true }),
    payment(5, "2025-01-01", "1.00", { reverses: 4 }),
    payment(6, "2024-12-01", "10.00", { reversed: true }),
    payment(7, "2024-12-02", "10.00", { reverses: 6 }),
    payment(8, "2024-12-03", "100.00", { goods: true }),
    payment(9, "2024-12-03", "100.00", { postedAt: null }),
    payment(10, "2023-12-31", "1.50", { memberId: 5, reversed: true }),
    payment(11, "2024-01-01", "1.50", { memberId: 5, reverses: 10 }),
  );
  mockDirectus(context, records);
  const year = await getDividendBasis(2024, "2026-01-02");
  assert.deepEqual(year.rows.map(row => [row.membershipId, row.netCashLoanInterest, row.patronageEligible]),
    [[1, "2.25", true], [2, "0.00", false], [5, "-1.50", false]]);
  assert.equal((await getDividendBasis(2025, "2026-01-02")).rows[0].netCashLoanInterest, "-1.00");
});

test("reports unverifiable reversal sources as unavailable", async context => {
  const records = fixture();
  records.cooperative_loan_payments.push(payment(2, "2024-01-01", "2.00", { reverses: 1 }));
  mockDirectus(context, records);
  await assert.rejects(getDividendBasis(2024, "2026-01-02"), { status: 503, code: "DIVIDEND_INTEREST_UNAVAILABLE" });
});

test("a completed year can post statutory allocations with both member pools retained", async context => {
  const records = fixture();
  records.cooperative_memberships.length = 0;
  const purposes = ["UNDIVIDED_NET_SURPLUS", "RESERVE_FUND", "EDUCATION_AND_TRAINING_FUND"];
  records.cooperative_gl_accounts.push(...purposes.map((name, index) => ({
    id: index + 1, code: String(3010 + index), name, classification: "EQUITY", is_active: true, is_contra: false,
  })));
  records.cooperative_account_mappings.push(...purposes.map((purpose, index) =>
    ({ id: index + 1, purpose, account_id: index + 1 })));
  const control = mockDirectus(context, records, true);
  const clock = () => new Date("2025-01-01T01:00:00Z");
  await saveDividendDraft(2024, actor, { ...inputs, expectedRevision: 0 });
  await assert.rejects(reviewDividendPosting(2024, new Date("2024-12-31T15:59:59Z")), { code: "DIVIDEND_YEAR_OPEN" });
  const { preview } = await reviewDividendPosting(2024, clock());
  assert.equal(preview.postingDate, "2025-01-01");
  assert.equal(preview.allocation.undividedSurplus, preview.allocation.distributable);
  assert.deepEqual(preview.journalPreview.map(row => row.kind), ["STATUTORY"]);
  assert.deepEqual(preview.recipients, []);
  const payload = { requestKey: "361a900a-7216-4cdf-a54a-5957c3244396", fingerprint: preview.fingerprint, draftRevision: 1 };
  const result = await postDividendRun(2024, actor, payload, clock);
  assert.deepEqual(result.run.journals.map(row => row.number), ["JV-2025-0001"]);
  assert.equal(result.run.reference, "DIV-2024");
  assert.deepEqual(await postDividendRun(2024, actor, payload, clock), { run: result.run, duplicate: true });
  assert.equal(control.annualWrites.length, 1);
  assert.equal((control.annualWrites[0].audit_event_id as Row).dividend_source_revision, 2);
  await assert.rejects(saveDividendDraft(2024, actor, { ...inputs, expectedRevision: 1 }), { code: "DIVIDEND_YEAR_POSTED" });
});

test("annual posting requires a reviewed draft with journalable amounts", async context => {
  const rows = fixture();
  rows.cooperative_memberships.length = 0;
  const control = mockDirectus(context, rows, true);
  const clock = () => new Date("2025-01-02T01:00:00Z");
  await assert.rejects(reviewDividendPosting(2024, clock()), { code: "DIVIDEND_DRAFT_REQUIRED" });
  await saveDividendDraft(2024, actor, { ...inputs, netSurplus: "0.00", expectedRevision: 0 });
  const { preview } = await reviewDividendPosting(2024, clock());
  await assert.rejects(postDividendRun(2024, actor, {
    requestKey: "361a900a-7216-4cdf-a54a-5957c3244396", fingerprint: preview.fingerprint, draftRevision: 1,
  }, clock), { code: "DIVIDEND_NO_AMOUNTS" });
  await saveDividendDraft(2024, actor, { ...inputs, expectedRevision: 1 });
  await assert.rejects(reviewDividendPosting(2024, clock()), { code: "LOAN_ACCOUNT_REQUIRED" });
  assert.equal(control.annualWrites.length, 0);
});

test("a simultaneous zero-balance clearance changes the reviewed roster before the dividend can commit", async context => {
  const records = fixture();
  records.cooperative_memberships.splice(0, 4);
  records.cooperative_savings_entries.length = 0;
  const purposes = ["UNDIVIDED_NET_SURPLUS", "RESERVE_FUND", "EDUCATION_AND_TRAINING_FUND"];
  records.cooperative_gl_accounts.push(...purposes.map((name, index) => ({
    id: index + 1, code: String(3010 + index), name, classification: "EQUITY", is_active: true, is_contra: false,
  })));
  records.cooperative_account_mappings.push(...purposes.map((purpose, index) =>
    ({ id: index + 1, purpose, account_id: index + 1 })));
  const control = mockDirectus(context, records, true);
  const clock = () => new Date("2025-01-02T01:00:00Z");
  await saveDividendDraft(2024, actor, { ...inputs, expectedRevision: 0 });
  const { preview } = await reviewDividendPosting(2024, clock());
  assert.equal(preview.basis.rows.length, 1);
  control.beforeAnnualWrite = async () => {
    control.beforeAnnualWrite = undefined;
    const now = new Date();
    const row = {
      id: 1, clearance_no: "CL-2025-0001", revision: 1, membership_id: { id: 5, savings_revision: 0 },
    } as ClearanceRow;
    await commitSettlement({
      type: "CLEARANCE_SETTLED", key: "isolated-clearance", hash: "fixture", result: z.object({
        id: z.number(), reference: z.string(), status: z.literal("COMPLETED"), revision: z.number(), journals: z.string().array(),
      }),
    }, actor, async () => ({
      row, date: todayManila(now), now, records: [], journals: [],
      membership: { status: "SEPARATED", savings_balance: "0.00" },
      clearance: { status: "COMPLETED" }, audit: { action: "CLEARANCE_SETTLED" },
    }));
  };
  await assert.rejects(postDividendRun(2024, actor, {
    requestKey: "361a900a-7216-4cdf-a54a-5957c3244396", fingerprint: preview.fingerprint, draftRevision: 1,
  }, clock), { code: "DIVIDEND_PREVIEW_CHANGED" });
  assert.equal(records.cooperative_memberships[0].status, "SEPARATED");
  assert.equal(records.cooperative_audit_events.at(-1)?.dividend_source_revision, 2);
  assert.equal(control.annualWrites.length, 0);
});
