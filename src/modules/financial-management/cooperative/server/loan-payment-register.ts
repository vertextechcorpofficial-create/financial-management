import "server-only";

import { z } from "zod";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { readDirectusItems } from "./directus";
import { LoanError } from "./loans";

const loanLabel = z.object({ id: z.number(), loan_no: z.string(), member_name: z.string(), member_no: z.string().nullish() });
const entry = z.object({
  id: z.number(), member_id: z.number(), channel: z.enum(["OTC", "PAYROLL"]), status: z.enum(["POSTED", "REVERSED"]),
  receipt_date: z.iso.date(), reference_no: z.string().nullable(), official_receipt_no: z.string().nullable(),
  amount: z.union([z.string(), z.number()]), principal_amount: z.union([z.string(), z.number()]),
  interest_amount: z.union([z.string(), z.number()]), penalty_amount: z.union([z.string(), z.number()]),
  loan_id: loanLabel,
  journal_id: z.object({ id: z.number(), business_date: z.iso.date(), journal_no: z.string(),
    reverses_journal_id: z.object({ journal_no: z.string() }).nullable() }),
  reverses_payment_id: z.number().nullable(),
});
const fields = [
  "id", "member_id", "channel", "status", "receipt_date", "reference_no", "official_receipt_no", "amount", "principal_amount",
  "interest_amount", "penalty_amount", "loan_id.id", "loan_id.loan_no", "loan_id.member_name", "loan_id.member_no",
  "journal_id.id", "journal_id.business_date", "journal_id.journal_no", "journal_id.reverses_journal_id.journal_no", "reverses_payment_id",
].join(",");

function forLoan(search: string) {
  const includes = { _icontains: search };
  return [{ loan_no: includes }, { member_name: includes }, { member_no: includes }];
}

function parsePage(params: URLSearchParams) {
  const page = Number(params.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new LoanError(400, "Choose a valid page.");
  return page;
}

export async function listPayableLoans(params: URLSearchParams) {
  const page = parsePage(params);
  const size = 25;
  const search = params.get("search")?.trim().slice(0, 120);
  const query = new URLSearchParams({
    fields: "id,loan_no,member_name,member_no", sort: "loan_no,id", limit: String(size + 1), offset: String((page - 1) * size),
    filter: JSON.stringify({ status: { _eq: "ACTIVE" }, ...(search ? { _or: forLoan(search) } : {}) }),
  });
  const { data } = z.object({ data: z.array(loanLabel) }).parse(await readDirectusItems("cooperative_loans", query));
  return { rows: data.slice(0, size).map(loan => ({ id: loan.id, loanNo: loan.loan_no, memberName: loan.member_name })), hasMore: data.length > size };
}

export type PayableLoans = Awaited<ReturnType<typeof listPayableLoans>>;

const journalFilter = {
  source_type: { _eq: "LOAN" }, command_type: { _in: ["LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED"] },
};

function readPayments(filter: Record<string, unknown>, limit: number, offset = 0) {
  const query = new URLSearchParams({ fields, limit: String(limit), offset: String(offset),
    sort: "-journal_id.business_date,-posted_at,-id", filter: JSON.stringify(filter) });
  return readDirectusItems("cooperative_loan_payments", query).then(result => z.object({ data: z.array(entry) }).parse(result).data);
}

function paymentRow(row: z.output<typeof entry>) {
  const reversal = row.reverses_payment_id !== null;
  const signed = (value: string | number) => centsToAmount(amountToCents(String(value)) * (reversal ? -1n : 1n));
  return {
    id: row.id, loanId: row.loan_id.id, loanNo: row.loan_id.loan_no, memberName: row.loan_id.member_name,
    receiptDate: row.receipt_date, businessDate: row.journal_id.business_date, journalNo: row.journal_id.journal_no,
    originalJournal: row.journal_id.reverses_journal_id?.journal_no ?? null,
    orNo: row.official_receipt_no, reference: row.reference_no, channel: row.channel, reversal,
    reversed: row.status === "REVERSED", amount: signed(row.amount), principal: signed(row.principal_amount),
    interest: signed(row.interest_amount), penalty: signed(row.penalty_amount),
  };
}

export type LoanJournalRow = ReturnType<typeof paymentRow>;

async function paymentTotal(filter: Record<string, unknown>, reversal: boolean) {
  const query = new URLSearchParams({ "aggregate[sum]": "amount", "aggregate[count]": "*",
    filter: JSON.stringify({ _and: [filter, { reverses_payment_id: reversal ? { _nnull: true } : { _null: true } }] }) });
  const numeric = z.union([z.string(), z.number()]);
  const { data } = z.object({ data: z.array(z.object({ sum: z.object({ amount: numeric.nullable() }), count: numeric })).length(1) })
    .parse(await readDirectusItems("cooperative_loan_payments", query));
  return { total: amountToCents(String(data[0].sum.amount ?? 0)), count: Number(data[0].count) };
}

export async function listLoanPaymentJournal(params: URLSearchParams) {
  const page = parsePage(params);
  const size = 50;
  const month = params.get("month") || "";
  const channel = params.get("channel") || "";
  const type = params.get("type") || "";
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || channel && !["OTC", "PAYROLL"].includes(channel) ||
      type && !["payment", "reversal"].includes(type)) throw new LoanError(400, "Check the journal filters.");
  const search = params.get("search")?.trim().slice(0, 120);
  const includes = { _icontains: search };
  const end = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10) : "";
  const filter = {
    journal_id: { ...journalFilter, ...(month ? { business_date: { _gte: `${month}-01`, _lt: end } } : {}) },
    ...(channel ? { channel: { _eq: channel } } : {}),
    ...(type ? { reverses_payment_id: type === "reversal" ? { _nnull: true } : { _null: true } } : {}),
    ...(search ? { _or: [
      ...forLoan(search).map(item => ({ loan_id: item })), { reference_no: includes }, { official_receipt_no: includes },
      { journal_id: { journal_no: includes } },
    ] } : {}),
  };
  const [rows, received, reversed] = await Promise.all([
    readPayments(filter, size + 1, (page - 1) * size), paymentTotal(filter, false), paymentTotal(filter, true),
  ]);
  return {
    rows: rows.slice(0, size).map(paymentRow), hasMore: rows.length > size, count: received.count + reversed.count,
    received: centsToAmount(received.total), reversed: centsToAmount(reversed.total), net: centsToAmount(received.total - reversed.total),
  };
}

export type LoanPaymentJournal = Awaited<ReturnType<typeof listLoanPaymentJournal>>;

export async function getPaymentReceipt(loanId: number, paymentId: number) {
  if (!Number.isSafeInteger(loanId) || loanId <= 0 || !Number.isSafeInteger(paymentId) || paymentId <= 0) {
    throw new LoanError(400, "Choose a valid receipt.");
  }
  const [row] = await readPayments({ id: { _eq: paymentId }, loan_id: { _eq: loanId }, channel: { _eq: "OTC" },
    reverses_payment_id: { _null: true }, journal_id: journalFilter }, 1);
  if (!row?.official_receipt_no) throw new LoanError(404, "The official receipt is unavailable.");
  const query = new URLSearchParams({ fields: "membership_id,loan_payment_part,business_date", limit: "1",
    filter: JSON.stringify({ journal_id: { _eq: row.journal_id.id }, or_no: { _eq: row.official_receipt_no } }) });
  const { data } = z.object({ data: z.array(z.object({
    membership_id: z.number(), loan_payment_part: z.union([z.string(), z.number()]), business_date: z.iso.date(),
  })) }).parse(await readDirectusItems("cooperative_official_receipts", query));
  const receipt = data[0];
  if (!receipt || receipt.membership_id !== row.member_id || receipt.business_date !== row.journal_id.business_date ||
      amountToCents(String(receipt.loan_payment_part)) !== amountToCents(String(row.amount))) {
    throw new LoanError(503, "The receipt and posted payment do not reconcile.");
  }
  return paymentRow(row);
}
