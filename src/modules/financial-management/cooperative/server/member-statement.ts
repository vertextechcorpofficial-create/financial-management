import "server-only";

import { z } from "zod";
import { isCalendarDate, isSavingsOutflow } from "../members/format";
import type { MemberStatement, SavingsEntry, StatementPeriod } from "../members/types";
import { readDirectusItems } from "./directus";
import { MemberError } from "./member-errors";
import { amountToCents, readAgreementNumber, readSavingsEntries, readStatementMember, signedCentsToAmount, todayManila } from "./member-read";

type Movement = Pick<SavingsEntry, "kind" | "amount">;
type StatementMember = NonNullable<Awaited<ReturnType<typeof readStatementMember>>>;

export function statementPeriod(params: URLSearchParams): StatementPeriod {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (!isCalendarDate(from) || !isCalendarDate(to)) throw new MemberError(422, "Enter valid From and To dates.");
  if (from > to) throw new MemberError(422, "From must be on or before To.");
  return { from, to };
}

function movementsAmounts(rows: Movement[]) {
  let deposits = 0n;
  let withdrawals = 0n;
  for (const row of rows) {
    if (isSavingsOutflow(row.kind)) withdrawals += amountToCents(row.amount);
    else deposits += amountToCents(row.amount);
  }
  return { deposits, withdrawals };
}

function savingsTotals(before: Movement[], activity: Movement[]) {
  const prior = movementsAmounts(before);
  const { deposits, withdrawals } = movementsAmounts(activity);
  const opening = prior.deposits - prior.withdrawals;
  return {
    openingBalance: signedCentsToAmount(opening),
    closingBalance: signedCentsToAmount(opening + deposits - withdrawals),
    deposits: signedCentsToAmount(deposits),
    withdrawals: signedCentsToAmount(withdrawals),
  };
}

const aggregateRow = z.object({
  membership_id: z.coerce.number().int().positive(),
  kind: z.enum(["OPENING", "DEPOSIT", "WITHDRAWAL", "DIVIDEND", "OFFSET"]),
  sum: z.object({
    amount: z.union([z.string(), z.number().refine(value => Number.isSafeInteger(Math.round(value * 100)))])
      .transform(String).pipe(z.string().regex(/^\d+(?:\.\d{1,2})?$/)),
  }),
});
const aggregateResult = z.object({ data: aggregateRow.array() });
const aggregateBatch = 20;

async function groupedSavings(ids: number[], entryDate: Record<string, string>) {
  const query = new URLSearchParams({
    filter: JSON.stringify({ membership_id: { _in: ids }, entry_date: entryDate }),
    groupBy: "membership_id,kind", "aggregate[sum]": "amount", limit: String(ids.length * 5),
  });
  const { data } = aggregateResult.parse(await readDirectusItems("cooperative_savings_entries", query));
  const balances = new Map<number, Movement[]>();
  for (const row of data) {
    const list = balances.get(row.membership_id) ?? [];
    list.push({ kind: row.kind, amount: row.sum.amount });
    balances.set(row.membership_id, list);
  }
  return balances;
}

export async function readSavingsPeriodTotals(ids: number[], period: StatementPeriod) {
  const balances = new Map<number, ReturnType<typeof savingsTotals>>();
  for (let offset = 0; offset < ids.length; offset += aggregateBatch) {
    const batch = ids.slice(offset, offset + aggregateBatch);
    const [before, activity] = await Promise.all([
      groupedSavings(batch, { _lt: period.from }),
      groupedSavings(batch, { _gte: period.from, _lte: period.to }),
    ]);
    for (const id of batch) balances.set(id, savingsTotals(before.get(id) ?? [], activity.get(id) ?? []));
  }
  return balances;
}

export async function readSavingsStatement(userId: number, member: StatementMember, period: StatementPeriod): Promise<Omit<MemberStatement, "loans">> {
  const [agreementNo, before, activity] = await Promise.all([
    readAgreementNumber(member.id),
    groupedSavings([member.id], { _lt: period.from }),
    readSavingsEntries(member.id, period.to, period.from),
  ]);
  const totals = savingsTotals(before.get(member.id) ?? [], activity);
  let balance = amountToCents(totals.openingBalance);
  const entries = activity.map(({ id, entryDate, kind, reference, amount }) => {
    const outflow = isSavingsOutflow(kind);
    const cents = amountToCents(amount);
    balance += outflow ? -cents : cents;
    const value = signedCentsToAmount(cents);
    return { id, entryDate, kind, reference, deposit: outflow ? null : value, withdrawal: outflow ? value : null, runningBalance: signedCentsToAmount(balance) };
  });
  return {
    ...period, ...totals, entries, generatedOn: todayManila(),
    member: {
      name: member.employee_name, employeeNumber: String(userId), department: member.department_name,
      agreementNo, status: member.status,
    },
  };
}
