import "server-only";

import { z } from "zod";
import { postedCooperativeItems } from "../loans/loan-assessment";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { loanDigest, loanPostingAccounts, requirePostingAccount } from "./loan-commands";
import { reviewPayrollLoanPayment } from "./loan-payments";
import { LoanError, readLoansForRemittance } from "./loans";
import { readPayrollRunDeductions, readPostedPayrollRun, signedCentsToAmount, todayManila } from "./member-read";
import { remittanceAmount, type RemittanceFileRow } from "./payroll-remittance-file";
import { claimedBankReceipt, claimedRemittanceDeductions, remittanceDecimal, remittanceLinks, remittanceRows,
  type RemittanceRowState } from "./payroll-remittance-store";
import { getPolicies } from "./policies";
import { withdrawalId as id } from "./withdrawal-store";

const savingCode = "COOP_SAVINGS";
export const loanDeductionCode = "COOP_LOAN";
const canonical = (value: string) => value.normalize("NFKC").trim().toUpperCase();
const savingsEntry = z.object({ entry_date: z.iso.date(), balance_after: remittanceDecimal });
const memberShape = z.object({
  id, user_id: id, status: z.enum(["ACTIVE", "SEPARATED"]), employee_name: z.string(),
  joined_at: z.iso.date(), savings_balance: remittanceDecimal, savings_revision: z.number().int().nonnegative(),
  savings_entries: savingsEntry.array().max(1),
});
type Member = z.output<typeof memberShape>;

export const remittanceInput = z.object({
  payrollRunId: id, bankDate: z.iso.date(), bankReference: z.string().trim().min(1).max(80),
  bankAmount: z.string().trim().max(80).transform(remittanceAmount).pipe(z.string()),
});
export type RemittanceInput = z.output<typeof remittanceInput>;

type ReviewRow = {
  file: RemittanceFileRow & { id?: number };
  amount: string | null;
  state: RemittanceRowState;
  message: string | null;
  member?: Member;
  loanId?: number;
  loanNo?: string;
  key?: string;
  expected?: string;
};

async function readMembers(userIds: number[]) {
  const members = new Map<number, Member[]>();
  for (let start = 0; start < userIds.length; start += 50) {
    const results = await remittanceRows("cooperative_memberships", memberShape,
      "id,user_id,status,employee_name,joined_at,savings_balance,savings_revision,savings_entries.entry_date,savings_entries.balance_after",
      { user_id: { _in: userIds.slice(start, start + 50) } }, -1,
      { "deep[savings_entries][_sort]": "-entry_date,-id", "deep[savings_entries][_limit]": "1" });
    for (const row of results) {
      const matches = members.get(row.user_id) ?? [];
      matches.push(row);
      members.set(row.user_id, matches);
    }
  }
  return members;
}

function fail(row: ReviewRow, state: RemittanceRowState, message: string) {
  row.state = state;
  row.message = message;
  return row;
}

function employeeId(raw: string) {
  return /^\d{1,10}$/.test(raw) && id.safeParse(Number(raw)).success ? Number(raw) : null;
}

function groupedRows(rows: ReviewRow[], key: (row: ReviewRow) => number | undefined) {
  const groups = new Map<number, ReviewRow[]>();
  for (const row of rows) {
    if (row.state !== "READY") continue;
    const groupId = key(row);
    if (!groupId) continue;
    const group = groups.get(groupId) ?? [];
    group.push(row);
    groups.set(groupId, group);
  }
  return groups;
}

const rowTotal = (rows: ReviewRow[]) => rows.reduce((total, row) => total + amountToCents(row.amount!), 0n);

export async function reviewPayrollRemittance(input: RemittanceInput, files: ReviewRow["file"][], singleLoanId?: number) {
  const date = todayManila();
  const run = await readPostedPayrollRun(input.payrollRunId);
  if (!run) throw new LoanError(422, "Choose a posted VOS payroll run.", "REMITTANCE_RUN");
  if (input.bankDate < run.cutoff_end || input.bankDate > date) {
    throw new LoanError(422, "Choose a bank receipt date from the payroll cutoff through today.", "REMITTANCE_DATE");
  }
  const bankKey = loanDigest(canonical(input.bankReference));
  const employeeIds = [...new Set(files.flatMap(row => employeeId(row.employee_number) ?? []))];
  const [payroll, members, policy, bankClaimed, oldBankPayments] = await Promise.all([
    readPayrollRunDeductions(run, employeeIds), readMembers(employeeIds), getPolicies(), claimedBankReceipt(bankKey),
    remittanceRows("cooperative_loan_payments", z.object({ id }), "id",
      { reference_no: { _eq: input.bankReference }, channel: { _eq: "PAYROLL" }, status: { _eq: "POSTED" },
        reverses_payment_id: { _null: true } }, 1),
  ]);
  const items = new Map([...payroll].map(([userId, row]) => [userId, postedCooperativeItems(row)]));
  const loanIds = [...new Set(files.flatMap(file => {
    if (canonical(file.deduction_code) !== loanDeductionCode) return [];
    return (items.get(employeeId(file.employee_number) ?? 0) ?? []).filter(item =>
      item.table === "cooperative_loans" && (!singleLoanId || item.id === singleLoanId)).map(item => item.id);
  }))];
  const loanLabel = z.object({ id, loan_no: z.string(), member_id: id });
  const loansById = new Map<number, z.output<typeof loanLabel>>();
  for (let start = 0; start < loanIds.length; start += 50) {
    const match = loanIds.slice(start, start + 50);
    const rows = await remittanceRows("cooperative_loans", loanLabel, "id,loan_no,member_id", { id: { _in: match } }, match.length);
    for (const row of rows) loansById.set(row.id, row);
  }
  const rows = files.map(file => {
    const amount = remittanceAmount(file.amount_input);
    const row: ReviewRow = { file, amount, state: "READY", message: null };
    const userId = employeeId(file.employee_number);
    const code = canonical(file.deduction_code);
    if (file.input_error || !userId || !amount || !file.reference || ![savingCode, loanDeductionCode].includes(code)) {
      return fail(row, "INVALID", file.input_error ?? "Enter a VOS user ID, supported deduction code, positive amount and text reference.");
    }
    const memberships = members.get(userId) ?? [];
    if (!memberships.length) return fail(row, "UNMATCHED", "No Cooperative membership matches this VOS user ID.");
    const deductions = items.get(userId);
    if (!deductions) return fail(row, "UNMATCHED", "No verified deduction details in this posted payroll run.");
    const source = code === savingCode ? "cooperative_memberships" : "cooperative_loans";
    const reference = canonical(file.reference);
    const candidates = deductions.filter(item => item.table === source && (code === savingCode
      ? memberships.some(member => member.id === item.id)
      : memberships.some(member => member.id === loansById.get(item.id)?.member_id) &&
        (!singleLoanId || singleLoanId === item.id)));
    const exact = candidates.filter(item => canonical(item.key) === reference ||
      (code === loanDeductionCode && canonical(loansById.get(item.id)!.loan_no) === reference));
    const selected = exact.length || code === loanDeductionCode ? exact : candidates;
    if (!selected.length) return fail(row, "UNMATCHED", "No verified deduction matches this member and reference.");
    if (selected.length !== 1) return fail(row, "AMBIGUOUS", "Use the exact payroll deduction reference for this row.");
    const [deduction] = selected;
    const loan = code === loanDeductionCode ? loansById.get(deduction.id) : undefined;
    row.member = memberships.find(member => member.id === (loan?.member_id ?? deduction.id));
    row.loanId = loan?.id;
    row.loanNo = loan?.loan_no;
    row.key = loanDigest([run.payroll_run_id, userId, deduction.key]);
    row.expected = centsToAmount(deduction.cents);
    return row;
  });
  const counts = new Map<string, number>();
  for (const row of rows) if (row.key) counts.set(row.key, (counts.get(row.key) ?? 0) + 1);
  const claimed = await claimedRemittanceDeductions([...counts.keys()]);
  for (const row of rows) {
    if (!row.key) continue;
    if ((counts.get(row.key) ?? 0) > 1 || claimed.has(row.key)) {
      fail(row, "DUPLICATE", claimed.has(row.key) ? "This payroll deduction has already been posted." : "The same payroll deduction appears more than once in this file.");
    } else if (row.amount !== row.expected) {
      fail(row, amountToCents(row.amount!) < amountToCents(row.expected!) ? "SHORT" : "INVALID",
        `The posted payroll deduction is PHP ${row.expected}. Verify the amount with Payroll.`);
    }
  }
  const savings = [];
  for (const group of groupedRows(rows.filter(row => !row.loanId), row => row.member?.id).values()) {
    const member = group[0].member!;
    const latest = member.savings_entries[0];
    const total = rowTotal(group);
    const balanceAfter = amountToCents(member.savings_balance) + total;
    if (member.status !== "ACTIVE" || member.joined_at > run.cutoff_end || (latest?.balance_after ?? "0.00") !== member.savings_balance ||
      (latest && latest.entry_date > date) || balanceAfter > 999_999_999_999n) {
      for (const row of group) fail(row, "INVALID", "The membership or its posted savings balance needs review.");
    } else savings.push({ member, rows: group, amount: centsToAmount(total), balanceAfter: centsToAmount(balanceAfter) });
  }
  const loanGroups = groupedRows(rows, row => row.loanId);
  const views = await readLoansForRemittance([...loanGroups.keys()], date);
  const loanPayments = [];
  const potentialOverlap = new Set([...views.values()].flatMap(view => (view.paymentRows ?? []).flatMap(payment =>
    payment.status === "POSTED" && payment.channel === "PAYROLL" && payment.reverses_payment_id == null &&
      payment.receipt_date === input.bankDate && id.safeParse(payment.id).success ? [Number(payment.id)] : [])));
  const linked = await remittanceLinks("payment_id", [...potentialOverlap]);
  for (const [loanId, group] of loanGroups) {
    try {
      const view = views.get(loanId);
      if (!view || view.loan.memberId !== group[0].member?.id) throw new LoanError(422, "The loan is unavailable for this member.");
      const amount = centsToAmount(rowTotal(group));
      if (view.paymentRows?.some(row => potentialOverlap.has(Number(row.id)) && !linked.has(Number(row.id)) &&
        amountToCents(String(row.amount)) === amountToCents(amount))) {
        for (const row of group) fail(row, "AMBIGUOUS", "An earlier payroll payment may cover this deduction. Reconcile it before posting.");
        continue;
      }
      const review = await reviewPayrollLoanPayment(view, policy, amount, input.bankDate, input.bankReference);
      if (review.preview.needsDueUpdate) throw new LoanError(409, "The loan has due-date entries awaiting posting. Refresh the review after they are posted.");
      loanPayments.push({ review, rows: group });
    } catch (cause) {
      if (!(cause instanceof LoanError) || cause.status >= 500) throw cause;
      for (const row of group) fail(row, cause.code === "LOAN_REMITTANCE_DUPLICATE" ? "DUPLICATE" : "INVALID", cause.message);
    }
  }
  const eligible = rows.filter(row => row.state === "READY");
  const eligibleAmount = centsToAmount(rowTotal(eligible));
  const bankTaken = bankClaimed || oldBankPayments.length > 0;
  const difference = signedCentsToAmount(amountToCents(input.bankAmount) - amountToCents(eligibleAmount));
  const accounts = loanPostingAccounts(policy);
  const due = eligible.length ? requirePostingAccount(accounts, "DUE_FROM_EMPLOYER") : null;
  const bank = eligible.length ? requirePostingAccount(accounts, "CASH_IN_BANK") : null;
  const liability = savings.length ? requirePostingAccount(accounts, "MEMBER_SAVINGS") : null;
  if (due && (due.id === bank?.id || due.id === liability?.id)) {
    throw new LoanError(422, "Use distinct payroll clearing, bank and savings accounts in Policies.");
  }
  const fingerprint = loanDigest([input, run.cutoff_end, date, policy.revision, bankTaken, due?.id, bank?.id, liability?.id,
    rows.map(row => [row.file.row_number, row.amount, row.key, row.expected, row.state, row.member?.id, row.loanId]),
    savings.map(item => [item.member.id, item.member.savings_revision, item.member.savings_balance]),
    loanPayments.map(item => item.review.preview.fingerprint)]);
  return { rows, savings, loanPayments, eligibleAmount, date, cutoff: run.cutoff_end, bankKey, bankTaken, difference,
    fingerprint, due, bank, liability, canPost: eligible.length > 0 && !bankTaken && difference === "0.00" };
}

export function remittanceRowValues(row: ReviewRow) {
  return {
    state: row.state, message: row.message, member_name: row.member?.employee_name ?? null,
    membership_id: row.member?.id ?? null, loan_id: row.loanId ?? null, loan_no: row.loanNo ?? null,
  };
}

export type RemittanceReview = Awaited<ReturnType<typeof reviewPayrollRemittance>>;
