import { centsAmount, transactionCents } from "@/modules/financial-management/treasury/bank-reconciliation/utils/transactionDisplay";
import { daysBetween } from "../format";
import type { CooperativeWorkspaceKey } from "../../workspaces";
import type {
  DashboardLinks, DashboardMonth, DashboardSection, DashboardSummary, DashboardTransaction, DashboardUnavailable, DashboardWorkItem,
} from "./dashboard-types";

type ReadSource<Row> = { state: "available"; rows: readonly Row[] } | DashboardUnavailable;
// Readers normalize posted amounts to centavos before aggregating them.
type DatedAmount = { date: string; amount: string };

type DashboardSources = {
  members?: ReadSource<{ status: "ACTIVE" | "APPLIED" | "NON_MEMBER" | "SEPARATED" | "REJECTED" }>;
  savings?: ReadSource<DatedAmount>;
  // Loans supplies the active portfolio and authorized balances as of the business date.
  activeLoans?: ReadSource<{
    productCode: string;
    productName: string;
    installments: readonly { dueDate: string; unpaid: string; penaltyDue: string }[];
  }>;
  // Readers supply posted receipts and their signed reversals.
  moneyIn?: ReadSource<DatedAmount & { kind: "deposit" | "loan-payment" }>;
  work?: ReadSource<DashboardWorkItem>;
  transactions: ReadSource<DashboardTransaction>;
  // Only pass destinations whose live workspace supports the requested view.
  links?: DashboardLinks;
};

const businessDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
});
const shortMonth = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
const longMonth = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" });

export function dashboardBusinessDate(now = new Date()) {
  const { year, month, day } = Object.fromEntries(businessDate.formatToParts(now).map(part => [part.type, part.value]));
  return `${year}-${month}-${day}`;
}

function dashboardMonths(asOf: string): DashboardMonth[] {
  const [year, month] = asOf.split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const offset = month - 6 + index;
    const first = new Date(Date.UTC(year, offset, 1));
    const start = first.toISOString().slice(0, 10);
    const end = index === 5 ? asOf : new Date(Date.UTC(year, offset + 1, 0)).toISOString().slice(0, 10);
    return { key: start.slice(0, 7), start, end, label: shortMonth.format(first), name: longMonth.format(first) };
  });
}

function summarize<Row, Result>(
  source: ReadSource<Row> | undefined,
  message: string,
  calculate: (rows: readonly Row[]) => Result,
  include: (row: Row) => boolean = () => true,
): DashboardSection<Result> {
  if (!source) return { state: "pending", message };
  if (source.state !== "available") return source;
  const rows = source.rows.filter(include);
  return { state: rows.length ? "ready" : "empty", data: calculate(rows) };
}

const totalAmount = (rows: readonly DatedAmount[]) => rows.reduce((sum, row) => sum + transactionCents(row.amount), 0n);
const newestFirst = (a: { date: string; id: string }, b: { date: string; id: string }) =>
  b.date.localeCompare(a.date) || b.id.localeCompare(a.id, "en", { numeric: true });

export function buildDashboardSummary(
  asOf: string, sources: DashboardSources, grants: readonly CooperativeWorkspaceKey[],
): DashboardSummary {
  const months = dashboardMonths(asOf);
  const allowed = new Set(grants);
  const throughToday = (row: { date: string }) => row.date <= asOf;
  const members = summarize(sources.members, "Waiting for membership records.", rows => ({
    active: rows.filter(row => row.status === "ACTIVE").length,
    applying: rows.filter(row => row.status === "APPLIED").length,
    notJoined: rows.filter(row => row.status === "NON_MEMBER").length,
  }));
  const savings = summarize(sources.savings, "Waiting for the posted savings ledger.", rows => {
    const balances = months.map(month => totalAmount(rows.filter(row => row.date <= month.end)));
    return { total: centsAmount(balances[5]), lastMonthChange: centsAmount(balances[4] - balances[3]), balances: balances.map(centsAmount) };
  }, throughToday);
  const portfolio = summarize(sources.activeLoans, "Waiting for loan and installment records.", rows => {
    const products = new Map<string, { label: string; loans: number; amount: bigint }>();
    const aging = [
      { label: "1–30 days", through: 30, amount: 0n },
      { label: "31–60 days", through: 60, amount: 0n },
      { label: "61–90 days", through: 90, amount: 0n },
      { label: "Over 90 days", through: Infinity, amount: 0n },
    ];
    let receivables = 0n;
    let pastDue = 0n;
    let penalties = 0n;
    for (const loan of rows) {
      const product = products.get(loan.productCode) ?? { label: loan.productName, loans: 0, amount: 0n };
      product.loans++;
      for (const installment of loan.installments) {
        const unpaid = transactionCents(installment.unpaid);
        receivables += unpaid;
        product.amount += unpaid;
        penalties += transactionCents(installment.penaltyDue);
        const daysLate = daysBetween(installment.dueDate, asOf);
        if (daysLate > 0 && unpaid > 0n) {
          pastDue += unpaid;
          const bucket = aging.find(bucket => daysLate <= bucket.through);
          if (bucket) bucket.amount += unpaid;
        }
      }
      products.set(loan.productCode, product);
    }
    const ratio = receivables > 0n ? (pastDue * 1000n + receivables / 2n) / receivables : 0n;
    return {
      activeLoans: rows.length, receivables: centsAmount(receivables), pastDue: centsAmount(pastDue),
      penalties: centsAmount(penalties), pastDuePercent: `${ratio / 10n}.${ratio % 10n}`,
      products: [...products.values()].map(product => ({ ...product, amount: centsAmount(product.amount) })),
      aging: aging.map(({ label, amount }) => ({ label, amount: centsAmount(amount) })),
    };
  });
  const moneyIn = summarize(sources.moneyIn, "Waiting for posted deposits and loan payments.", rows => {
    const sumByMonth = (kind: "deposit" | "loan-payment") => months.map(month => centsAmount(totalAmount(
      rows.filter(row => row.kind === kind && month.start <= row.date && row.date <= month.end),
    )));
    return { deposits: sumByMonth("deposit"), loanPayments: sumByMonth("loan-payment") };
  }, row => row.date >= months[0].start && throughToday(row));
  const work = summarize(sources.work, "Waiting for approval, loan release, and clearance records.", rows => {
    const approvals = rows.filter(row => row.kind !== "release" && row.kind !== "clearance").sort(newestFirst);
    const releases = rows.filter(row => row.kind === "release").sort(newestFirst);
    const waiting = [...approvals.slice(0, 4), ...releases].map(row => ({
      ...row,
      href: allowed.has(row.kind === "release" ? "loans" : "approvals") ? row.href : undefined,
    }));
    return {
      approvals: approvals.length, releases: releases.length, clearances: rows.filter(row => row.kind === "clearance").length, waiting,
    };
  }, throughToday);
  const recentTransactions = summarize(sources.transactions, "Waiting for the member transaction journal.", rows =>
    [...rows].sort(newestFirst).slice(0, 6), throughToday);
  return {
    asOf, months, members, savings, portfolio, moneyIn, work, recentTransactions,
    links: {
      approvals: allowed.has("approvals") ? sources.links?.approvals : undefined,
      aging: allowed.has("reports") ? sources.links?.aging : undefined,
      journal: allowed.has("transactions") ? sources.links?.journal : undefined,
    },
  };
}
