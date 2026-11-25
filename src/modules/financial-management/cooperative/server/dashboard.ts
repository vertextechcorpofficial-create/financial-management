import "server-only";

import { z } from "zod";
import { buildDashboardSummary, dashboardBusinessDate, dashboardMonths } from "../console/dashboard/dashboard-summary";
import type { DashboardSources, ReadSource } from "../console/dashboard/dashboard-summary";
import type { DashboardTransaction, DashboardWorkItem } from "../console/dashboard/dashboard-types";
import { nextCutoffDate } from "../loans/loan-schedule";
import { isSavingsOutflow } from "../members/format";
import { channelLabels, transactionLabels, transactionTypes } from "../transactions/entries";
import type { CooperativeWorkspaceKey } from "../workspaces";
import { readDirectusItems } from "./directus";
import { readReportLoans } from "./loans";
import { amountToCents, loadMemberDataset, memberRegisterStatus, signedCentsToAmount } from "./member-read";
import { transactionIndexEnabled } from "./transaction-index";
import { indexedTransaction, indexedTransactionFields } from "./transaction-journal";

const id = z.number().int().positive();
const amount = z.union([z.number(), z.string()]).transform(value => String(value));
const savingsKind = z.enum(["OPENING", "DEPOSIT", "WITHDRAWAL", "DIVIDEND", "OFFSET"]);
const direction = z.enum(["IN", "OUT", "NON_CASH"]);

const savingsRow = z.object({ entry_date: z.iso.date(), kind: savingsKind, amount });
const movementRow = z.object({ business_date: z.iso.date(), kind: z.enum(transactionTypes), direction, amount });
const workLoan = z.object({
  id, loan_no: z.string(), member_name: z.string(), principal: amount, status: z.string(),
  applied_on: z.iso.date().nullable(), approved_on: z.iso.date().nullable(),
});
const workWithdrawal = z.object({
  id, request_no: z.string(), amount, status: z.string(), requested_on: z.iso.date(),
  membership_id: z.object({ employee_name: z.string() }),
});
const workClearance = z.object({
  id, clearance_no: z.string(), status: z.string(), separation_date: z.iso.date(),
  membership_id: z.object({ employee_name: z.string() }),
});

const nonNegative = (value: bigint) => value > 0n ? value : 0n;
const failure = (message: string) => ({ state: "failed" as const, message });
const rowsOf = <T extends z.ZodType>(schema: T) => z.object({ data: z.array(schema) });

async function readMembers(): Promise<ReadSource<{ status: "ACTIVE" | "SEPARATED" | "NON_MEMBER" }>> {
  try {
    const dataset = await loadMemberDataset();
    const rows = dataset.employees.map(employee => {
      const current = dataset.currentByUser.get(employee.userId);
      const status = memberRegisterStatus(current?.status, employee.active);
      return { status: status === "MEMBER" ? "ACTIVE" as const : status };
    });
    return { state: "available", rows };
  } catch {
    return failure("Could not load membership records.");
  }
}

async function readSavings(asOf: string): Promise<ReadSource<{ date: string; amount: string }>> {
  try {
    const query = new URLSearchParams({
      fields: "entry_date,kind,amount",
      filter: JSON.stringify({ entry_date: { _lte: asOf } }),
      sort: "entry_date,id", limit: "-1",
    });
    const { data } = rowsOf(savingsRow).parse(await readDirectusItems("cooperative_savings_entries", query));
    return {
      state: "available",
      rows: data.map(row => ({
        date: row.entry_date,
        amount: signedCentsToAmount((isSavingsOutflow(row.kind) ? -1n : 1n) * amountToCents(row.amount)),
      })),
    };
  } catch {
    return failure("Could not load the posted savings ledger.");
  }
}

async function readPortfolio(asOf: string): Promise<ReadSource<{
  productCode: string; productName: string;
  installments: readonly { dueDate: string; unpaid: string; penaltyDue: string }[];
}>> {
  const source = await readReportLoans({ status: { _in: ["ACTIVE", "DEFAULTED"] } }, asOf);
  if (source.state !== "ready") return failure(source.message);
  const rows = source.data.flatMap(view => {
    if (!view.position) return [];
    return [{
      productCode: view.loan.productCode || view.loan.productName,
      productName: view.loan.productName.split(" / ")[0],
      installments: view.position.installments.map(item => ({
        dueDate: item.dueDate,
        unpaid: signedCentsToAmount(nonNegative(amountToCents(item.total) - amountToCents(item.paidTotal))),
        penaltyDue: signedCentsToAmount(nonNegative(amountToCents(item.penaltyAssessed) - amountToCents(item.penaltyPaid))),
      })),
    }];
  });
  return { state: "available", rows };
}

async function readMoneyIn(asOf: string): Promise<ReadSource<{ date: string; amount: string; kind: "deposit" | "loan-payment" }>> {
  if (!transactionIndexEnabled()) return { state: "pending", message: "Waiting for the transaction index." };
  try {
    const start = dashboardMonths(asOf)[0].start;
    const query = new URLSearchParams({
      fields: "business_date,kind,direction,amount",
      filter: JSON.stringify({
        business_date: { _gte: start, _lte: asOf },
        kind: { _in: ["SAVINGS_DEPOSIT", "SAVINGS_DEPOSIT_REVERSED", "LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED"] },
      }),
      limit: "-1",
    });
    const { data } = rowsOf(movementRow).parse(await readDirectusItems("cooperative_transaction_entries", query));
    const rows = data.flatMap(row => {
      const kind = row.kind.startsWith("SAVINGS_DEPOSIT") ? "deposit" as const
        : row.kind.startsWith("LOAN_PAYMENT") ? "loan-payment" as const : null;
      if (!kind) return [];
      return [{
        date: row.business_date,
        amount: signedCentsToAmount((row.direction === "OUT" ? -1n : 1n) * amountToCents(row.amount)),
        kind,
      }];
    });
    return { state: "available", rows };
  } catch {
    return failure("Could not load posted deposits and loan payments.");
  }
}

async function readWork(asOf: string): Promise<ReadSource<DashboardWorkItem>> {
  try {
    const loanQuery = new URLSearchParams({
      fields: "id,loan_no,member_name,principal,status,applied_on,approved_on",
      filter: JSON.stringify({ status: { _in: ["PENDING", "APPROVED"] } }), limit: "-1",
    });
    const withdrawalQuery = new URLSearchParams({
      fields: "id,request_no,amount,status,requested_on,membership_id.employee_name",
      filter: JSON.stringify({ status: { _eq: "PENDING" } }), limit: "-1",
    });
    const clearanceQuery = new URLSearchParams({
      fields: "id,clearance_no,status,separation_date,membership_id.employee_name",
      filter: JSON.stringify({ status: { _eq: "DRAFT" } }), limit: "-1",
    });
    const [loans, withdrawals, clearances] = await Promise.all([
      readDirectusItems("cooperative_loans", loanQuery).then(value => rowsOf(workLoan).parse(value).data),
      readDirectusItems("cooperative_withdrawal_requests", withdrawalQuery).then(value => rowsOf(workWithdrawal).parse(value).data),
      readDirectusItems("cooperative_clearances", clearanceQuery).then(value => rowsOf(workClearance).parse(value).data),
    ]);
    const rows: DashboardWorkItem[] = [
      ...loans.filter(loan => loan.status === "PENDING").map(loan => ({
        id: `loan-${loan.id}`, date: loan.applied_on ?? asOf, kind: "loan" as const,
        member: loan.member_name, reference: loan.loan_no, amount: loan.principal,
        href: "/fm/cooperative/approvals",
      })),
      ...loans.filter(loan => loan.status === "APPROVED").map(loan => ({
        id: `release-${loan.id}`, date: loan.approved_on ?? loan.applied_on ?? asOf, kind: "release" as const,
        member: loan.member_name, reference: loan.loan_no, amount: loan.principal,
        href: "/fm/cooperative/loans",
      })),
      ...withdrawals.map(request => ({
        id: `withdrawal-${request.id}`, date: request.requested_on, kind: "withdrawal" as const,
        member: request.membership_id.employee_name, reference: request.request_no, amount: request.amount,
        href: "/fm/cooperative/approvals",
      })),
      ...clearances.map(clearance => ({
        id: `clearance-${clearance.id}`, date: clearance.separation_date, kind: "clearance" as const,
        member: clearance.membership_id.employee_name, reference: clearance.clearance_no, amount: null,
        href: "/fm/cooperative/exit-clearance",
      })),
    ];
    return { state: "available", rows };
  } catch {
    return failure("Could not load approvals, releases, and clearances.");
  }
}

async function readRecentTransactions(asOf: string): Promise<ReadSource<DashboardTransaction>> {
  if (!transactionIndexEnabled()) return { state: "pending", message: "Waiting for the member transaction journal." };
  try {
    const query = new URLSearchParams({
      fields: indexedTransactionFields,
      filter: JSON.stringify({ business_date: { _lte: asOf } }),
      sort: "-business_date,-posted_at,-id", limit: "6",
    });
    const { data } = rowsOf(indexedTransaction).parse(await readDirectusItems("cooperative_transaction_entries", query));
    return {
      state: "available",
      rows: data.map(row => ({
        id: `transaction-${row.id}`,
        date: row.business_date,
        member: row.membership_id.employee_name,
        type: transactionLabels[row.kind],
        channel: channelLabels[row.channel],
        reference: row.or_no ?? row.source_reference ?? row.reference ?? row.journal_id.journal_no,
        amount: signedCentsToAmount((row.direction === "OUT" ? -1n : 1n) * amountToCents(String(row.amount))),
      })),
    };
  } catch {
    return failure("Could not load recent transactions.");
  }
}

export async function getDashboard(grants: readonly CooperativeWorkspaceKey[]) {
  const asOf = dashboardBusinessDate();
  const [members, savings, portfolio, moneyIn, work, transactions] = await Promise.all([
    readMembers(), readSavings(asOf), readPortfolio(asOf), readMoneyIn(asOf), readWork(asOf), readRecentTransactions(asOf),
  ]);
  const sources: DashboardSources = {
    members, savings, activeLoans: portfolio, moneyIn, work, transactions,
    links: {
      approvals: "/fm/cooperative/approvals",
      aging: "/fm/cooperative/reports",
      journal: "/fm/cooperative/transactions",
    },
  };
  return buildDashboardSummary(asOf, sources, grants, nextCutoffDate(asOf));
}
