import "server-only";

import { z } from "zod";
import { buildDashboardSummary, dashboardBusinessDate } from "../console/dashboard/dashboard-summary";
import type { DashboardTransaction, DashboardWorkItem } from "../console/dashboard/dashboard-types";
import { channelLabels, transactionChannels, transactionLabels, transactionTypes } from "../transactions/entries";
import type { CooperativeWorkspaceKey } from "../workspaces";
import { isSavingsOutflow } from "../members/format";
import { readDirectusItems, readDirectusPages } from "./directus";
import { amountToCents, centsToAmount, readVosEmployeeDirectory } from "./member-read";
import { readReportLoans } from "./loans";
import { readWithdrawalRequests } from "./withdrawal-store";

const decimal = z.union([z.string(), z.number()]).transform(value => String(value));
const amount = (value: string | number) => centsToAmount(amountToCents(String(value)));
const nonNegative = (value: bigint) => value > 0n ? value : 0n;
const links = {
  approvals: "/fm/cooperative/approvals",
  aging: "/fm/cooperative/reports",
  journal: "/fm/cooperative/transactions",
};

async function readMembers() {
  try {
    const [employees, payload] = await Promise.all([
      readVosEmployeeDirectory(),
      readDirectusItems("cooperative_memberships", new URLSearchParams({ fields: "user_id,status", limit: "-1" })),
    ]);
    const { data } = z.object({
      data: z.array(z.object({ user_id: z.number(), status: z.enum(["ACTIVE", "SEPARATED", "APPLIED", "REJECTED"]) })),
    }).parse(payload);
    const byUser = new Set(data.map(row => row.user_id));
    return {
      state: "available" as const,
      rows: [
        ...data.map(row => ({ status: row.status })),
        ...employees.filter(employee => employee.active && !byUser.has(employee.userId))
          .map(() => ({ status: "NON_MEMBER" as const })),
      ],
    };
  } catch {
    return { state: "failed" as const, message: "Could not load membership records." };
  }
}

async function readSavings(asOf: string) {
  try {
    const entries = await readDirectusPages("cooperative_savings_entries", z.object({
      entry_date: z.iso.date(),
      kind: z.enum(["OPENING", "DEPOSIT", "WITHDRAWAL", "DIVIDEND", "OFFSET"]),
      amount: decimal,
    }), {
      fields: "entry_date,kind,amount",
      filter: JSON.stringify({ entry_date: { _lte: asOf } }),
      sort: "entry_date,id",
    });
    return {
      state: "available" as const,
      rows: entries.map(entry => ({
        date: entry.entry_date,
        amount: (isSavingsOutflow(entry.kind) ? "-" : "") + amount(entry.amount),
      })),
    };
  } catch {
    return { state: "failed" as const, message: "Could not load the posted savings ledger." };
  }
}

async function readPortfolio(asOf: string) {
  try {
    const source = await readReportLoans({ status: { _in: ["ACTIVE", "DEFAULTED"] } }, asOf);
    if (source.state !== "ready") return { state: "failed" as const, message: source.message };
    return {
      state: "available" as const,
      rows: source.data.map(view => ({
        productCode: view.loan.productCode,
        productName: view.loan.productName,
        installments: view.installments.map(installment => ({
          dueDate: installment.dueDate,
          unpaid: centsToAmount(nonNegative(amountToCents(installment.total) - amountToCents(installment.paidTotal))),
          penaltyDue: centsToAmount(nonNegative(amountToCents(installment.penaltyAssessed) - amountToCents(installment.penaltyPaid))),
        })),
      })),
    };
  } catch {
    return { state: "failed" as const, message: "Could not load loan and installment records." };
  }
}

function moneyWindow(asOf: string) {
  const [year, month] = asOf.split("-").map(Number);
  return new Date(Date.UTC(year, month - 6, 1)).toISOString().slice(0, 10);
}

async function readMoneyIn(asOf: string) {
  try {
    const entries = await readDirectusPages("cooperative_transaction_entries", z.object({
      business_date: z.iso.date(), kind: z.enum(transactionTypes), amount: decimal,
    }), {
      fields: "business_date,kind,amount",
      filter: JSON.stringify({
        business_date: { _gte: moneyWindow(asOf), _lte: asOf },
        kind: { _in: ["SAVINGS_DEPOSIT", "SAVINGS_DEPOSIT_REVERSED", "LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED"] },
      }),
      sort: "business_date,id",
    });
    type MoneyInRow = { date: string; amount: string; kind: "deposit" | "loan-payment" };
    const rows = entries.flatMap<MoneyInRow>(entry => {
      if (entry.kind === "SAVINGS_DEPOSIT") {
        return [{ date: entry.business_date, amount: amount(entry.amount), kind: "deposit" as const }];
      }
      if (entry.kind === "SAVINGS_DEPOSIT_REVERSED") {
        return [{ date: entry.business_date, amount: "-" + amount(entry.amount), kind: "deposit" as const }];
      }
      if (entry.kind === "LOAN_PAYMENT") {
        return [{ date: entry.business_date, amount: amount(entry.amount), kind: "loan-payment" as const }];
      }
      if (entry.kind === "LOAN_PAYMENT_REVERSED") {
        return [{ date: entry.business_date, amount: "-" + amount(entry.amount), kind: "loan-payment" as const }];
      }
      return [];
    });
    return { state: "available" as const, rows };
  } catch {
    return { state: "failed" as const, message: "Could not load posted deposits and loan payments." };
  }
}

async function readWork(asOf: string) {
  try {
    const [loans, withdrawals, clearances] = await Promise.all([
      readDirectusPages("cooperative_loans", z.object({
        id: z.number(), loan_no: z.string(), member_name: z.string(),
        applied_on: z.iso.date().nullable(), approved_on: z.iso.date().nullable(),
        principal: decimal, status: z.enum(["PENDING", "APPROVED"]),
      }), {
        fields: "id,loan_no,member_name,applied_on,approved_on,principal,status",
        filter: JSON.stringify({ status: { _in: ["PENDING", "APPROVED"] } }),
        sort: "applied_on,id",
      }),
      readWithdrawalRequests({ status: { _eq: "PENDING" } }, -1),
      readDirectusPages("cooperative_clearances", z.object({
        id: z.number(), clearance_no: z.string(),
        membership_id: z.object({ employee_name: z.string() }),
        separation_date: z.iso.date(), final_pay_available: decimal.nullable(), status: z.literal("DRAFT"),
      }), {
        fields: "id,clearance_no,membership_id.employee_name,separation_date,final_pay_available,status",
        filter: JSON.stringify({ status: { _eq: "DRAFT" } }),
        sort: "separation_date,id",
      }),
    ]);
    const rows: DashboardWorkItem[] = [
      ...loans.map(loan => ({
        id: `loan-${loan.id}`,
        date: loan.applied_on ?? loan.approved_on ?? asOf,
        kind: loan.status === "APPROVED" ? "release" as const : "loan" as const,
        member: loan.member_name,
        reference: loan.loan_no,
        amount: amount(loan.principal),
        href: loan.status === "APPROVED" ? "/fm/cooperative/loans" : "/fm/cooperative/approvals",
      })),
      ...withdrawals.map(request => ({
        id: `withdrawal-${request.id}`,
        date: request.filedOn,
        kind: "withdrawal" as const,
        member: request.memberName,
        reference: request.reference,
        amount: amount(request.amount),
        href: "/fm/cooperative/approvals",
      })),
      ...clearances.map(clearance => ({
        id: `clearance-${clearance.id}`,
        date: clearance.separation_date,
        kind: "clearance" as const,
        member: clearance.membership_id.employee_name,
        reference: clearance.clearance_no,
        amount: clearance.final_pay_available === null ? null : amount(clearance.final_pay_available),
        href: "/fm/cooperative/exit-clearance",
      })),
    ];
    return { state: "available" as const, rows };
  } catch {
    return { state: "failed" as const, message: "Could not load approval, release, and clearance records." };
  }
}

async function readRecentTransactions(asOf: string) {
  try {
    const { data } = z.object({
      data: z.array(z.object({
        id: z.number(), business_date: z.iso.date(), kind: z.enum(transactionTypes),
        channel: z.enum(transactionChannels), direction: z.enum(["IN", "OUT", "NON_CASH"]), amount: decimal,
        reference: z.string().nullable(), source_reference: z.string().nullable(), or_no: z.string().nullable(),
        membership_id: z.object({ employee_name: z.string() }),
        journal_id: z.object({ journal_no: z.string() }),
      })).max(6),
    }).parse(await readDirectusItems("cooperative_transaction_entries", new URLSearchParams({
      fields: "id,business_date,kind,channel,direction,amount,reference,source_reference,or_no,membership_id.employee_name,journal_id.journal_no",
      filter: JSON.stringify({ business_date: { _lte: asOf } }),
      sort: "-business_date,-posted_at,-id",
      limit: "6",
    })));
    const rows: DashboardTransaction[] = data.map(entry => ({
      id: String(entry.id),
      date: entry.business_date,
      member: entry.membership_id.employee_name,
      type: transactionLabels[entry.kind],
      channel: channelLabels[entry.channel],
      reference: entry.or_no ?? entry.source_reference ?? entry.reference ?? entry.journal_id.journal_no,
      amount: (entry.direction === "OUT" ? "-" : "") + amount(entry.amount),
    }));
    return { state: "available" as const, rows };
  } catch {
    return { state: "failed" as const, message: "Could not load the member transaction journal." };
  }
}

export async function getDashboard(grants: readonly CooperativeWorkspaceKey[]) {
  const asOf = dashboardBusinessDate();
  const [members, savings, activeLoans, moneyIn, work, transactions] = await Promise.all([
    readMembers(), readSavings(asOf), readPortfolio(asOf), readMoneyIn(asOf), readWork(asOf), readRecentTransactions(asOf),
  ]);
  return buildDashboardSummary(asOf, { members, savings, activeLoans, moneyIn, work, transactions, links }, grants);
}
