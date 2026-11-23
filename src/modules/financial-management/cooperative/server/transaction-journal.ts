import "server-only";

import { z } from "zod";
import { transactionChannels, transactionDirections, transactionTypes } from "../transactions/entries";
import { readDirectusItems } from "./directus";
import { listLoanPaymentJournal } from "./loan-payment-register";
import { LoanError } from "./loans";
import { signedCentsToAmount } from "./member-read";
import { transactionIndexEnabled } from "./transaction-index";
import { remittanceLinks } from "./payroll-remittance-store";

const id = z.number().int().positive();
const kind = z.enum(transactionTypes);
const channel = z.enum(transactionChannels);
const direction = z.enum(transactionDirections);
const row = z.object({
  id, kind, channel, direction,
  business_date: z.iso.date(), receipt_date: z.iso.date().nullable(),
  reference: z.string().nullable(), source_reference: z.string().nullable(), or_no: z.string().nullable(),
  amount: z.union([z.number(), z.string()]), loan_id: id.nullable(), payment_id: id.nullable(),
  membership_id: z.object({ user_id: id, employee_name: z.string() }),
  journal_id: z.object({ id, journal_no: z.string(), command_type: z.string(),
    reverses_journal_id: z.object({ id, journal_no: z.string() }).nullable() }),
});
const fields = [
  "id,kind,channel,direction,business_date,receipt_date,reference,source_reference,or_no,amount,loan_id,payment_id",
  "membership_id.user_id,membership_id.employee_name",
  "journal_id.id,journal_id.journal_no,journal_id.command_type,journal_id.reverses_journal_id.id,journal_id.reverses_journal_id.journal_no",
].join(",");
const total = z.object({
  direction, count: z.coerce.number().int().nonnegative(),
  sum: z.object({ amount: z.union([z.string(), z.number()]).nullable() }),
});
const pageSize = 50;

function cents(value: string | number | null) {
  if (typeof value === "number" && !Number.isSafeInteger(Math.round(value * 100))) {
    throw new LoanError(503, "The journal total could not be read at centavo precision.");
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? 0));
  if (!match) throw new LoanError(503, "A journal amount could not be verified.");
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function filters(params: URLSearchParams) {
  const type = params.get("type") || "";
  const selectedChannel = params.get("channel") || "";
  const month = params.get("month") || "";
  const page = Number(params.get("page") || "1");
  if (type && !kind.safeParse(type).success || selectedChannel && !channel.safeParse(selectedChannel).success ||
    month && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    throw new LoanError(400, "Check the journal filters.");
  }
  const search = params.get("search")?.trim().slice(0, 120) ?? "";
  const contains = { _icontains: search };
  const common = {
    ...(type ? { kind: { _eq: type } } : {}),
    ...(selectedChannel ? { channel: { _eq: selectedChannel } } : {}),
    ...(month ? { business_date: { _gte: `${month}-01`,
      _lte: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10) } } : {}),
    ...(search ? { _or: [
      { membership_id: { employee_name: contains } },
      ...(/^[1-9]\d{0,9}$/.test(search) ? [{ membership_id: { user_id: { _eq: Number(search) } } }] : []),
      { reference: contains }, { source_reference: contains }, { or_no: contains }, { journal_id: { journal_no: contains } },
      { journal_id: { reverses_journal_id: { journal_no: contains } } },
    ] } : {}),
  };
  return { page, filter: JSON.stringify(common), type, selectedChannel };
}

async function legacyJournal(params: URLSearchParams, query: ReturnType<typeof filters>) {
  const { type, selectedChannel, page } = query;
  if (type && type !== "LOAN_PAYMENT" && type !== "LOAN_PAYMENT_REVERSED" || selectedChannel === "BANK" || selectedChannel === "SYSTEM") {
    return { rows: [], count: 0, moneyIn: "0.00", moneyOut: "0.00", net: "0.00", hasMore: false, page: 1, indexed: false };
  }
  const legacy = new URLSearchParams(params);
  legacy.set("type", type === "LOAN_PAYMENT" ? "payment" : type === "LOAN_PAYMENT_REVERSED" ? "reversal" : "");
  const result = await listLoanPaymentJournal(legacy);
  const rows = result.rows.map(item => ({
    ...item, kind: item.reversal ? "LOAN_PAYMENT_REVERSED" as const : "LOAN_PAYMENT" as const,
    paymentId: item.id, sourceReference: item.loanNo, employeeNo: null, depositJournalId: null, remittanceBatchId: null,
  }));
  return { rows, count: result.count, moneyIn: result.received, moneyOut: result.reversed, net: result.net,
    hasMore: result.hasMore, page, indexed: false };
}

async function paymentStates(rows: z.output<typeof row>[]) {
  const originals = rows.filter(entry => entry.kind === "LOAN_PAYMENT" && entry.payment_id !== null);
  if (!originals.length) return new Map<number, { status: string; loan_id: number; journal_id: number }>();
  const query = new URLSearchParams({
    fields: "id,status,loan_id,journal_id", limit: String(originals.length),
    filter: JSON.stringify({ id: { _in: originals.map(entry => entry.payment_id) } }),
  });
  const payment = z.object({ id, status: z.enum(["POSTED", "REVERSED"]), loan_id: id, journal_id: id });
  const { data } = z.object({ data: payment.array() }).parse(await readDirectusItems("cooperative_loan_payments", query));
  return new Map(data.map(item => [item.id, item]));
}

export async function getTransactionJournal(params: URLSearchParams) {
  const query = filters(params);
  if (!transactionIndexEnabled()) return legacyJournal(params, query);
  const aggregate = new URLSearchParams({ filter: query.filter, groupBy: "direction", "aggregate[sum]": "amount", "aggregate[count]": "*" });
  const { data: groups } = z.object({ data: total.array().max(3) }).parse(await readDirectusItems("cooperative_transaction_entries", aggregate));
  const count = groups.reduce((sum, group) => sum + group.count, 0);
  const incoming = cents(groups.find(group => group.direction === "IN")?.sum.amount ?? null);
  const outgoing = cents(groups.find(group => group.direction === "OUT")?.sum.amount ?? null);
  const page = Math.min(query.page, Math.max(1, Math.ceil(count / pageSize)));
  const request = new URLSearchParams({
    fields, filter: query.filter, sort: "-business_date,-posted_at,-id", limit: String(pageSize), offset: String((page - 1) * pageSize),
  });
  const data = count
    ? z.object({ data: row.array().max(pageSize) }).parse(await readDirectusItems("cooperative_transaction_entries", request)).data : [];
  const originalId = (entry: z.output<typeof row>) => entry.journal_id.reverses_journal_id?.id ?? entry.journal_id.id;
  const remittanceIds = new Set(data.filter(entry => entry.channel === "PAYROLL" &&
    ["SAVINGS_DEPOSIT", "SAVINGS_DEPOSIT_REVERSED", "LOAN_PAYMENT", "LOAN_PAYMENT_REVERSED"].includes(entry.kind)).map(originalId));
  const [payments, remittances] = await Promise.all([
    paymentStates(data), remittanceLinks("journal_id", [...remittanceIds]),
  ]);
  const rows = data.map(entry => {
    const original = entry.kind === "LOAN_PAYMENT" && entry.payment_id ? payments.get(entry.payment_id) : undefined;
    const paymentId = entry.kind === "LOAN_PAYMENT" && original?.journal_id === entry.journal_id.id && original.loan_id === entry.loan_id
      ? entry.payment_id : null;
    return {
      id: entry.id, kind: entry.kind, channel: entry.channel, memberName: entry.membership_id.employee_name, employeeNo: String(entry.membership_id.user_id),
      businessDate: entry.business_date, receiptDate: entry.receipt_date, sourceReference: entry.source_reference, reference: entry.reference,
      amount: signedCentsToAmount(cents(entry.amount) * (entry.direction === "OUT" ? -1n : 1n)),
      orNo: entry.or_no, journalNo: entry.journal_id.journal_no, originalJournal: entry.journal_id.reverses_journal_id?.journal_no ?? null,
      loanId: entry.loan_id, paymentId, reversed: paymentId !== null && original?.status === "REVERSED",
      remittanceBatchId: remittances.get(originalId(entry)) ?? null,
      depositJournalId: entry.kind === "SAVINGS_DEPOSIT" && entry.journal_id.command_type === "SAVINGS_DEPOSIT" && entry.or_no
        ? entry.journal_id.id : null,
    };
  });
  return { rows, count, moneyIn: signedCentsToAmount(incoming), moneyOut: signedCentsToAmount(outgoing),
    net: signedCentsToAmount(incoming - outgoing), hasMore: page * pageSize < count, page, indexed: true };
}

export type TransactionJournal = Awaited<ReturnType<typeof getTransactionJournal>>;
