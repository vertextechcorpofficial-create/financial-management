import assert from "node:assert/strict";
import { test } from "node:test";
import { transactionEntries, type TransactionComponent } from "../transactions/entries";
import { getTransactionJournal } from "./transaction-journal";

test("filters and totals the entire posted journal before taking a 50-row page", async context => {
  const target = process.env.NEXT_PUBLIC_API_BASE_URL;
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://100.110.197.61:8056";
  process.env.DIRECTUS_STATIC_TOKEN = "isolated-journal-fixture";
  context.after(() => {
    if (target === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = target;
    if (token === undefined) delete process.env.DIRECTUS_STATIC_TOKEN;
    else process.env.DIRECTUS_STATIC_TOKEN = token;
  });

  function entry(id: number, kind: TransactionComponent["kind"], amount: string, extra: Partial<TransactionComponent> = {}) {
    const date = id === 1 ? "2026-10-31" : "2026-11-01";
    const [indexed] = transactionEntries({ id, date, postedAt: date + "T01:00:00" },
      [{ kind, amount, memberId: id, channel: "OTC", ...extra }]);
    return {
      ...indexed, id,
      membership_id: { user_id: id, employee_name: id === 1 ? "Prior month member" : "November member" },
      journal_id: { id, journal_no: `JV-2026-${id}`, command_type: kind,
        reverses_journal_id: kind === "LOAN_PAYMENT_REVERSED" ? { id: 57, journal_no: "JV-2026-57" }
          : kind === "SAVINGS_DEPOSIT_REVERSED" ? { id: 62, journal_no: "JV-2026-62" } : null },
    };
  }
  const fixtures = [
    ...Array.from({ length: 53 }, (_, index) => entry(index + 1, "SAVINGS_DEPOSIT", "1.01",
      index === 0 ? { reference: "Old deposit reference", orNo: "OR-2026-0001" } : {})),
    entry(54, "MEMBERSHIP_FEE", "300.00", { channel: "PAYROLL" }),
    entry(55, "LOAN_RELEASE", "250.00", { loanId: 91, channel: "BANK", sourceReference: "SL-2026-0012" }),
    entry(56, "PROCESSING_FEE", "12.34", { loanId: 91 }),
    entry(57, "LOAN_PAYMENT", "23.50", { loanId: 91, paymentId: 95, orNo: "OR-2026-0012" }),
    entry(58, "LOAN_PAYMENT_REVERSED", "23.50", { loanId: 91, paymentId: 96 }),
    entry(59, "WITHDRAWAL", "30.40", { sourceReference: "WD-2026-0001" }),
    entry(60, "SETTLEMENT_PAYOUT", "8.00", { channel: "BANK" }),
    entry(61, "SAVINGS_OFFSET", "7.00", { channel: "SYSTEM" }),
    entry(62, "SAVINGS_DEPOSIT", "20.00", { channel: "PAYROLL", reference: "Bank remittance reference" }),
    entry(63, "SAVINGS_DEPOSIT_REVERSED", "20.00", { channel: "PAYROLL", reference: "Bank remittance reference" }),
  ];
  function matches(value: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([field, condition]) => {
      if (field === "_or") return (condition as Record<string, unknown>[]).some(nested => matches(value, nested));
      if (!value) return false;
      const actual = value[field];
      return Object.entries(condition as Record<string, unknown>).every(([operator, expected]) => {
        if (operator === "_eq") return actual === expected;
        if (operator === "_gte") return String(actual) >= String(expected);
        if (operator === "_lte") return String(actual) <= String(expected);
        if (operator === "_icontains") return String(actual ?? "").toLowerCase().includes(String(expected).toLowerCase());
        return matches(actual as Record<string, unknown>, { [operator]: expected });
      });
    });
  }
  context.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    assert.equal(init?.method ?? "GET", "GET");
    if (url.pathname === "/items/cooperative_loan_payments") {
      return Response.json({ data: [{ id: 95, status: "REVERSED", loan_id: 91, journal_id: 57 }] });
    }
    if (url.pathname === "/items/cooperative_payroll_remittance_lines") {
      assert.deepEqual(JSON.parse(url.searchParams.get("filter") ?? "{}"), { journal_id: { _in: [62] } });
      return Response.json({ data: [{ journal_id: 62, batch_id: 91 }] });
    }
    assert.equal(url.pathname, "/items/cooperative_transaction_entries");
    const rows = fixtures.filter(row => matches(row, JSON.parse(url.searchParams.get("filter") ?? "{}")));
    if (url.searchParams.has("aggregate[count]")) {
      const groups = ["IN", "OUT", "NON_CASH"].flatMap(direction => {
        const group = rows.filter(row => row.direction === direction);
        return group.length ? [{ direction, count: group.length,
          sum: { amount: (group.reduce((total, row) => total + Number(row.amount), 0)).toFixed(2) } }] : [];
      });
      return Response.json({ data: groups });
    }
    assert.equal(url.searchParams.get("limit"), "50");
    assert.equal(url.searchParams.get("sort"), "-business_date,-posted_at,-id");
    const offset = Number(url.searchParams.get("offset"));
    return Response.json({ data: rows.toReversed().slice(offset, offset + 50) });
  });

  const first = await getTransactionJournal(new URLSearchParams());
  const second = await getTransactionJournal(new URLSearchParams({ page: "2" }));
  assert.equal(first.rows.length, 50);
  assert.equal(second.rows.length, 13);
  assert.equal(first.count, 63);
  assert.deepEqual([first.moneyIn, first.moneyOut, first.net], ["409.37", "331.90", "77.47"]);
  assert.equal(second.net, first.net);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 63);
  assert.equal(first.rows.find(row => row.id === 57)?.reversed, true);
  assert.equal(first.rows.find(row => row.id === 58)?.originalJournal, "JV-2026-57");
  assert.equal(first.rows.find(row => row.id === 62)?.remittanceBatchId, 91);
  assert.equal(first.rows.find(row => row.id === 63)?.remittanceBatchId, 91);
  assert.equal((await getTransactionJournal(new URLSearchParams({ search: "old deposit reference", page: "2" }))).rows[0].id, 1);
  assert.equal((await getTransactionJournal(new URLSearchParams({ search: "OR-2026-0001" }))).rows[0].id, 1);
  const filtered = await getTransactionJournal(new URLSearchParams({ month: "2026-11", channel: "PAYROLL", type: "MEMBERSHIP_FEE" }));
  assert.deepEqual([filtered.count, filtered.moneyIn, filtered.moneyOut], [1, "300.00", "0.00"]);
  assert.equal((await getTransactionJournal(new URLSearchParams({ month: "2026-10" }))).count, 1);
});
