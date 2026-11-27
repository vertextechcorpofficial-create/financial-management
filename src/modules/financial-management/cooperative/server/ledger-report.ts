import "server-only";

import { z } from "zod";
import type { ReportColumn, ReportResult } from "../console/reports/types";
import type { StatementPeriod } from "../members/types";
import { readDirectusPages } from "./directus";
import { MemberError } from "./member-errors";
import { amountToCents, signedCentsToAmount } from "./member-read";
import { reportTotals } from "./report-data";

const id = z.coerce.number().int().positive();
const flag = z.union([z.boolean(), z.literal(0), z.literal(1), z.literal("0"), z.literal("1")])
  .transform(value => value === true || value === 1 || value === "1");
export const postedDecimal = z.union([z.string(), z.number().refine(value => Number.isSafeInteger(Math.round(value * 100)))])
  .transform(String).pipe(z.string().regex(/^\d+(?:\.\d{1,2})?$/)).transform(amountToCents);
const chartAccount = z.object({ id, code: z.string(), name: z.string(), classification: z.string(), is_active: flag, is_contra: flag });
const group = z.object({ account_id: id, sum: z.object({ debit: postedDecimal, credit: postedDecimal }) });

function readPostedTotals(filter: { _lt?: string; _gte?: string; _lte?: string }) {
  return readDirectusPages("cooperative_gl_lines", group, {
    sort: "account_id", groupBy: "account_id", "aggregate[sum]": "debit,credit",
    filter: JSON.stringify({ journal_id: { business_date: filter, posted_at: { _nnull: true } } }),
  });
}

export async function readCooperativeChart() {
  return readDirectusPages("cooperative_gl_accounts", chartAccount, { fields: Object.keys(chartAccount.shape).join(","), sort: "code,id" });
}

type ChartAccount = z.output<typeof chartAccount>;
const closingPurposes = ["CASH_ON_HAND", "CASH_IN_BANK", "DUE_FROM_EMPLOYER"] as const;

export async function readCloseAccountMappings(accounts?: ChartAccount[]) {
  const mapping = z.object({ purpose: z.enum(closingPurposes), account_id: id });
  const [chart, mappings] = await Promise.all([
    accounts ?? readCooperativeChart(),
    readDirectusPages("cooperative_account_mappings", mapping, {
      fields: "purpose,account_id", filter: JSON.stringify({ purpose: { _in: closingPurposes } }),
    }),
  ]);
  const byId = new Map(chart.map(account => [account.id, account]));
  const result = new Map<typeof closingPurposes[number], ChartAccount>();
  for (const entry of mappings) {
    const account = byId.get(entry.account_id);
    if (account?.is_active && account.classification === "ASSET" && !account.is_contra &&
      mappings.filter(other => other.account_id === entry.account_id || other.purpose === entry.purpose).length === 1) {
      result.set(entry.purpose, account);
    }
  }
  return result;
}

export async function readTrialBalance(period: StatementPeriod) {
  const [chart, opening, activity] = await Promise.all([
    readCooperativeChart(),
    readPostedTotals({ _lt: period.from }),
    readPostedTotals({ _gte: period.from, _lte: period.to }),
  ]);
  const accounts = new Set(chart.map(account => account.id));
  if ([...opening, ...activity].some(row => !accounts.has(row.account_id))) {
    throw new MemberError(503, "A posted GL line has an unavailable account.");
  }
  const before = new Map(opening.map(row => [row.account_id, row.sum]));
  const during = new Map(activity.map(row => [row.account_id, row.sum]));
  const balances = new Map(chart.map(account => {
    const start = before.get(account.id);
    const current = during.get(account.id);
    const opening = (start?.debit ?? 0n) - (start?.credit ?? 0n);
    const debit = current?.debit ?? 0n;
    const credit = current?.credit ?? 0n;
    return [account.id, { opening, debit, credit, closing: opening + debit - credit, hasHistory: Boolean(start || current) }];
  }));
  return { chart, balances };
}

const columns: ReportColumn[] = [
  { label: "Account code" }, { label: "Account" }, { label: "Classification" }, { label: "Status" },
  ...["Opening debit", "Opening credit", "Period debits", "Period credits", "Closing debit", "Closing credit"]
    .map(label => ({ label, kind: "money" as const })),
];

const debitSide = (amount: bigint) => amount > 0n ? amount : 0n;
const creditSide = (amount: bigint) => amount < 0n ? -amount : 0n;

export async function getTrialBalanceReport(period: StatementPeriod): Promise<ReportResult> {
  const { chart, balances } = await readTrialBalance(period);
  const rows = chart.flatMap(account => {
    const { opening, debit, credit, closing, hasHistory } = balances.get(account.id)!;
    if (!account.is_active && !hasHistory) return [];
    return { id: account.id, cells: [
      account.code, account.name, account.classification, account.is_active ? "Active" : "Inactive",
      ...[debitSide(opening), creditSide(opening), debit, credit, debitSide(closing), creditSide(closing)].map(signedCentsToAmount),
    ] };
  });
  const totals = reportTotals(columns, rows);
  const check = (index: number) => {
    const difference = amountToCents(String(totals[index])) - amountToCents(String(totals[index + 1]));
    return difference === 0n ? "Balanced" : "Out of balance · debits less credits " + signedCentsToAmount(difference);
  };
  return {
    columns, rows, totals, departments: [],
    metadata: [
      ["From", period.from], ["To", period.to], ["Opening check", check(4)], ["Period check", check(6)], ["Closing check", check(8)],
    ],
  };
}
