import "server-only";

import { z } from "zod";
import type { DividendBasis } from "../console/dividends/types";
import { isSavingsOutflow } from "../members/format";
import { readDirectusByIds, readDirectusPages } from "./directus";
import { postedDecimal } from "./ledger-report";
import { MemberError } from "./member-errors";
import { signedCentsToAmount, todayManila } from "./member-read";

const id = z.number().int().positive();
const member = z.object({
  id, user_id: id, employee_name: z.string(), department_name: z.string().nullable(), joined_at: z.iso.date(),
});
const savings = z.object({
  membership_id: id, kind: z.enum(["OPENING", "DEPOSIT", "WITHDRAWAL", "DIVIDEND", "OFFSET"]),
  sum: z.object({ amount: postedDecimal }),
});
const dailySavings = savings.extend({ entry_date: z.iso.date() });
const payment = z.object({
  id, member_id: id, loan_id: z.object({ id, member_id: id, product_kind: z.literal("CASH") }),
  status: z.enum(["POSTED", "REVERSED"]), amount: postedDecimal,
  principal_amount: postedDecimal, interest_amount: postedDecimal, penalty_amount: postedDecimal,
  reverses_payment_id: id.nullable(),
  journal_id: z.object({
    id, source_type: z.literal("LOAN"), source_id: z.string(), posted_at: z.string().min(1),
    command_type: z.enum(["LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED"]),
    business_date: z.iso.date(), reverses_journal_id: id.nullable(),
  }),
});
type Payment = z.output<typeof payment>;

const paymentFields = [
  "id", "member_id", "loan_id.id", "loan_id.member_id", "loan_id.product_kind",
  "status", "amount", "principal_amount", "interest_amount", "penalty_amount", "reverses_payment_id",
  ...Object.keys(payment.shape.journal_id.shape).map(field => "journal_id." + field),
].join(",");

const dayNumber = (value: string) => Date.parse(value + "T00:00:00Z") / 86_400_000;
const signedSavings = (row: z.output<typeof savings>) => row.sum.amount * (isSavingsOutflow(row.kind) ? -1n : 1n);

function sumDailyClosingBalances(from: string, through: string, opening: bigint, movement: Map<string, bigint>) {
  let lastDay = dayNumber(from);
  let balance = opening;
  let sum = 0n;
  for (const [date, change] of [...movement].sort(([left], [right]) => left.localeCompare(right))) {
    const day = dayNumber(date);
    sum += balance * BigInt(day - lastDay);
    balance += change;
    lastDay = day;
  }
  return sum + balance * BigInt(dayNumber(through) + 1 - lastDay);
}

function roundAverage(centavoDays: bigint, days: number) {
  const magnitude = centavoDays < 0n ? -centavoDays : centavoDays;
  const denominator = BigInt(days);
  const rounded = (2n * magnitude + denominator) / (2n * denominator);
  return signedCentsToAmount(centavoDays < 0n ? -rounded : rounded);
}

async function readSavings(ids: number[], from: string, through: string) {
  const opening = new Map<number, bigint>();
  const movements = new Map<number, Map<string, bigint>>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const filter = {
      membership_id: { _in: ids.slice(offset, offset + 50) },
      journal_id: { posted_at: { _nnull: true } },
    };
    const [prior, daily] = await Promise.all([
      readDirectusPages("cooperative_savings_entries", savings, {
        sort: "membership_id,kind", groupBy: "membership_id,kind", "aggregate[sum]": "amount",
        filter: JSON.stringify({ ...filter, entry_date: { _lt: from } }),
      }),
      readDirectusPages("cooperative_savings_entries", dailySavings, {
        sort: "membership_id,entry_date,kind", groupBy: "membership_id,entry_date,kind", "aggregate[sum]": "amount",
        filter: JSON.stringify({ ...filter, entry_date: { _gte: from, _lte: through } }),
      }),
    ]);
    for (const row of prior) opening.set(row.membership_id, (opening.get(row.membership_id) ?? 0n) + signedSavings(row));
    for (const row of daily) {
      const days = movements.get(row.membership_id) ?? new Map<string, bigint>();
      days.set(row.entry_date, (days.get(row.entry_date) ?? 0n) + signedSavings(row));
      movements.set(row.membership_id, days);
    }
  }
  return { opening, movements };
}

function verifiedPayment(row: Payment) {
  const reverse = row.reverses_payment_id !== null;
  return row.loan_id.member_id === row.member_id && row.journal_id.source_id === String(row.loan_id.id) &&
    row.journal_id.command_type === (reverse ? "LOAN_PAYMENT_REVERSED" : "LOAN_PAYMENT") &&
    (row.journal_id.reverses_journal_id !== null) === reverse && row.amount > 0n &&
    row.amount === row.principal_amount + row.interest_amount + row.penalty_amount;
}

const unreconciledInterest = () =>
  new MemberError(503, "Posted cash-loan payments could not be verified. Refresh the calculation basis.", "DIVIDEND_INTEREST_UNAVAILABLE");

async function readLoanInterest(ids: number[], from: string, through: string) {
  const inPeriod = await readDirectusByIds("cooperative_loan_payments", payment, paymentFields, "member_id", ids, {
    loan_id: { product_kind: { _eq: "CASH" } },
    journal_id: {
      posted_at: { _nnull: true }, source_type: { _eq: "LOAN" },
      command_type: { _in: ["LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED"] },
      business_date: { _gte: from, _lte: through },
    },
  });
  const byId = new Map(inPeriod.map(row => [row.id, row]));
  const originalIds = inPeriod.flatMap(row => row.reverses_payment_id && !byId.has(row.reverses_payment_id) ? [row.reverses_payment_id] : []);
  const earlier = await readDirectusByIds("cooperative_loan_payments", payment, paymentFields, "id", originalIds);
  for (const row of earlier) byId.set(row.id, row);
  const reversed = new Set<number>();
  const totals = new Map<number, bigint>();
  for (const row of inPeriod) {
    if (!verifiedPayment(row)) throw unreconciledInterest();
    let interest = row.interest_amount;
    if (row.reverses_payment_id !== null) {
      const original = byId.get(row.reverses_payment_id);
      if (!original || !verifiedPayment(original) || original.reverses_payment_id !== null ||
        row.status !== "POSTED" || original.status !== "REVERSED" || reversed.has(original.id) ||
        row.journal_id.reverses_journal_id !== original.journal_id.id || row.member_id !== original.member_id ||
        row.loan_id.id !== original.loan_id.id || original.journal_id.business_date > row.journal_id.business_date ||
        row.principal_amount !== original.principal_amount || interest !== original.interest_amount ||
        row.penalty_amount !== original.penalty_amount) throw unreconciledInterest();
      reversed.add(original.id);
      interest = -interest;
    }
    totals.set(row.member_id, (totals.get(row.member_id) ?? 0n) + interest);
  }
  return totals;
}

export async function getDividendBasis(year: number, today = todayManila()): Promise<DividendBasis> {
  const from = `${year}-01-01`;
  const provisional = year === Number(today.slice(0, 4));
  const through = provisional ? today : `${year}-12-31`;
  const days = dayNumber(through) - dayNumber(from) + 1;
  const members = await readDirectusPages("cooperative_memberships", member, {
    fields: Object.keys(member.shape).join(","), sort: "employee_name,user_id,id",
    filter: JSON.stringify({ status: { _eq: "ACTIVE" }, joined_at: { _lte: through } }),
  });
  const ids = members.map(row => row.id);
  const [savings, interest] = await Promise.all([readSavings(ids, from, through), readLoanInterest(ids, from, through)]);
  return {
    from, through, days, provisional,
    rows: members.map(row => {
      const movement = savings.movements.get(row.id) ?? new Map<string, bigint>();
      for (const date of movement.keys()) {
        if (date < row.joined_at) throw new MemberError(503, "A savings posting predates enrollment. Review the member's posted savings.");
      }
      const start = row.joined_at > from ? row.joined_at : from;
      const opening = row.joined_at < from ? savings.opening.get(row.id) ?? 0n : 0n;
      const sum = sumDailyClosingBalances(start, through, opening, movement);
      const netInterest = interest.get(row.id) ?? 0n;
      return {
        membershipId: row.id, employeeId: row.user_id, name: row.employee_name, department: row.department_name,
        averageSavings: roundAverage(sum, days), savingsCentavoDays: String(sum),
        netCashLoanInterest: signedCentsToAmount(netInterest), patronageEligible: netInterest > 0n,
      };
    }),
  };
}
