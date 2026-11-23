import "server-only";

import { z } from "zod";
import type { ReportColumn, ReportResult, ReportRow } from "../console/reports/types";
import type { StatementPeriod } from "../members/types";
import { channelLabels, transactionLabels, type TransactionChannel } from "../transactions/entries";
import { readDirectusByIds, readDirectusPages } from "./directus";
import { signedCentsToAmount } from "./member-read";
import { blockedReport, reportDepartments, reportProducts, reportTotals, type LoanReportFilters } from "./report-data";
import { transactionIndexEnabled } from "./transaction-index";
import { indexedTransaction, indexedTransactionFields, transactionCents, transactionSearch } from "./transaction-journal";

const kinds = [
  "SAVINGS_DEPOSIT", "SAVINGS_DEPOSIT_REVERSED", "MEMBERSHIP_FEE", "PROCESSING_FEE", "LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED",
] as const;
const id = z.number().int().positive();
const amount = z.union([z.string(), z.number()]).transform(transactionCents);
const entry = indexedTransaction.extend({
  kind: z.enum(kinds),
  membership_id: indexedTransaction.shape.membership_id.extend({ id, department_name: z.string().nullable() }),
  journal_id: indexedTransaction.shape.journal_id.extend({ business_date: z.iso.date() }),
});
const entryFields = indexedTransactionFields + ",membership_id.id,membership_id.department_name,journal_id.business_date";
const payment = z.object({
  id, loan_id: id, member_id: id, journal_id: id, reverses_payment_id: id.nullable(),
  status: z.enum(["POSTED", "REVERSED"]), amount, principal_amount: amount, interest_amount: amount, penalty_amount: amount,
});
const columns: ReportColumn[] = [
  { label: "Date", kind: "date" }, { label: "Member" }, { label: "Department" }, { label: "Type" }, { label: "Channel" },
  { label: "Reference" }, { label: "Journal" }, { label: "Reverses journal" },
  ...["Loan payment", "Penalties paid", "Savings", "Fees", "Total"].map(label => ({ label, kind: "money" as const })),
];

type Entry = z.output<typeof entry>;
type Payment = z.output<typeof payment>;

function isPayment(row: Entry) {
  return row.kind === "LOAN_PAYMENT" || row.kind === "LOAN_PAYMENT_REVERSED";
}

function entryAmount(row: Entry) {
  const value = transactionCents(row.amount);
  if (value <= 0n || row.business_date !== row.journal_id.business_date) {
    throw new Error("Posting amount or business date could not be verified.");
  }
  return value;
}

function paymentParts(row: Entry, payments: Map<number, Payment>, original?: Entry): {
  principal: bigint; interest: bigint; penalty: bigint;
} {
  const source = row.payment_id ? payments.get(row.payment_id) : undefined;
  if (!source || source.amount !== entryAmount(row) || source.loan_id !== row.loan_id ||
    source.member_id !== row.membership_id.id || source.journal_id !== row.journal_id.id ||
    source.reverses_payment_id !== (original?.payment_id ?? null) ||
    source.principal_amount + source.interest_amount + source.penalty_amount !== source.amount) {
    throw new Error("Payment does not reconcile to the posted transaction.");
  }
  if (original) {
    const originalParts = paymentParts(original, payments);
    if (originalParts.principal !== source.principal_amount || originalParts.interest !== source.interest_amount ||
      originalParts.penalty !== source.penalty_amount || source.status !== "POSTED" ||
      payments.get(original.payment_id!)?.status !== "REVERSED") {
      throw new Error("Payment reversal does not reconcile to the original payment.");
    }
  }
  return { principal: source.principal_amount, interest: source.interest_amount, penalty: source.penalty_amount };
}

function collectionRow(row: Entry, payments: Map<number, Payment>, originals: Map<number, Entry[]>): ReportRow {
  const value = entryAmount(row);
  const reversing = row.kind === "LOAN_PAYMENT_REVERSED" || row.kind === "SAVINGS_DEPOSIT_REVERSED";
  const originalJournal = row.journal_id.reverses_journal_id;
  if (row.direction !== (reversing ? "OUT" : "IN") || reversing !== Boolean(originalJournal)) {
    throw new Error("Posting direction or reversal link is invalid.");
  }
  let original: Entry | undefined;
  if (originalJournal) {
    const expectedKind = row.kind === "LOAN_PAYMENT_REVERSED" ? "LOAN_PAYMENT" : "SAVINGS_DEPOSIT";
    const matches = (originals.get(originalJournal.id) ?? []).filter(item => item.kind === expectedKind &&
      item.membership_id.id === row.membership_id.id && item.loan_id === row.loan_id && item.channel === row.channel);
    original = matches[0];
    if (matches.length !== 1 || original.direction !== "IN" || original.journal_id.reverses_journal_id ||
      original.business_date > row.business_date || entryAmount(original) !== value) {
      throw new Error("Reversal does not reconcile to an original posting.");
    }
  }
  const parts = isPayment(row) ? paymentParts(row, payments, original) : null;
  const penalty = parts?.penalty ?? 0n;
  const loan = parts ? parts.principal + parts.interest : 0n;
  const savings = row.kind === "SAVINGS_DEPOSIT" || row.kind === "SAVINGS_DEPOSIT_REVERSED" ? value : 0n;
  const fee = row.kind === "MEMBERSHIP_FEE" || row.kind === "PROCESSING_FEE" ? value : 0n;
  const sign = reversing ? -1n : 1n;
  return { id: row.id, cells: [
    row.business_date, row.membership_id.employee_name, row.membership_id.department_name,
    transactionLabels[row.kind], channelLabels[row.channel],
    row.or_no ?? row.reference ?? row.source_reference ?? row.journal_id.journal_no,
    row.journal_id.journal_no, originalJournal?.journal_no ?? null,
    ...[loan, penalty, savings, fee, value].map(total => signedCentsToAmount(total * sign)),
  ] };
}

export async function getCollectionsReport(
  filters: LoanReportFilters & { channel: TransactionChannel | "" }, period: StatementPeriod,
): Promise<ReportResult> {
  if (!transactionIndexEnabled()) return blockedReport(columns, {
    label: "Collections", state: "pending_rollout", message: "Collections will be available when the complete Transactions journal is enabled.",
  });
  try {
    let entries = await readDirectusPages("cooperative_transaction_entries", entry, {
      fields: entryFields, sort: "business_date,posted_at,id",
      filter: JSON.stringify({
        kind: { _in: kinds }, business_date: { _gte: period.from, _lte: period.to },
        ...transactionSearch(filters.q),
        ...(filters.channel ? { channel: { _eq: filters.channel } } : {}),
        ...(filters.department ? { membership_id: { department_name: { _eq: filters.department } } } : {}),
        ...(filters.product ? { loan_id: { _nnull: true } } : {}),
      }),
    });
    if (filters.product) {
      const loanIds = entries.flatMap(row => row.loan_id === null ? [] : [row.loan_id]);
      const loans = await readDirectusByIds("cooperative_loans", z.object({ id }), "id", "id", loanIds, { product_id: { _eq: filters.product } });
      const matching = new Set(loans.map(loan => loan.id));
      entries = entries.filter(row => row.loan_id !== null && matching.has(row.loan_id));
    }
    const originalIds = entries.flatMap(row => row.journal_id.reverses_journal_id ? [row.journal_id.reverses_journal_id.id] : []);
    const [originals, products, departments] = await Promise.all([
      readDirectusByIds("cooperative_transaction_entries", entry, entryFields, "journal_id", originalIds, {
        kind: { _in: ["LOAN_PAYMENT", "SAVINGS_DEPOSIT"] },
      }),
      reportProducts(),
      reportDepartments("cooperative_memberships"),
    ]);
    const paymentIds = [...entries, ...originals].flatMap(row => isPayment(row) && row.payment_id !== null ? [row.payment_id] : []);
    const payments = await readDirectusByIds("cooperative_loan_payments", payment, Object.keys(payment.shape).join(","), "id", paymentIds);
    const byPayment = new Map(payments.map(row => [row.id, row]));
    const byJournal = new Map<number, Entry[]>();
    for (const row of originals) {
      const group = byJournal.get(row.journal_id.id) ?? [];
      group.push(row);
      byJournal.set(row.journal_id.id, group);
    }
    const rows = entries.map(row => collectionRow(row, byPayment, byJournal));
    return { columns, departments, products, rows, metadata: [], totals: reportTotals(columns, rows) };
  } catch {
    return blockedReport(columns, {
      label: "Collections", state: "unavailable", message: "Posted collections could not be reconciled with Transactions.",
    });
  }
}
