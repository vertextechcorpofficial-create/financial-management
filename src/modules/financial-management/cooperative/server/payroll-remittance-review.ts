import "server-only";

import { z } from "zod";
import { cooperativeAuditTime } from "./audit";
import { CooperativeDirectusError } from "./directus";
import { readPostedCooperativeItems, type PostedPayrollItem } from "../loans/loan-assessment";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { loanDigest, loanPostingAccounts, readLoanJournalLines, requirePostingAccount, type GlLine, type LoanActor } from "./loan-commands";
import { reviewPayrollLoanPayment } from "./loan-payments";
import { LoanError, readLoansForRemittance, type MemberLoanView } from "./loans";
import { readPayrollRunDeductions, readPostedPayrollRun, signedCentsToAmount, todayManila } from "./member-read";
import { remittanceAmount, type RemittanceFileRow } from "./payroll-remittance-file";
import { claimedBankReceipt, claimedRemittanceDeductions, readRemittanceBatch, readRemittanceLines, requireRemittanceRollout, remittanceDecimal, remittanceLinks, remittanceRows, writeRemittanceBatch,
  type StoredRemittanceLine,
  type RemittanceRowState } from "./payroll-remittance-store";
import { payrollCutoffKey, payrollSourceKey, readPayrollMasters, readPayrollRecordLinks, savePayrollRecordLink, verifiedPayrollLink,
  type PayrollRecordLink, type PayrollMaster } from "./payroll-record-links";
import { getPolicies } from "./policies";
import { withdrawalId as id } from "./withdrawal-store";

const savingCode = "COOP_SAVINGS";
export const loanDeductionCode = "COOP_LOAN";
const canonical = (value: string) => value.normalize("NFKC").trim().toUpperCase();
const savingsEntry = z.object({ entry_date: z.iso.date(), balance_after: remittanceDecimal });
const memberShape = z.object({
  id, user_id: id, status: z.enum(["ACTIVE", "SEPARATED"]), employee_name: z.string(),
  joined_at: z.iso.date(), savings_balance: remittanceDecimal, savings_revision: z.number().int().nonnegative(),
  savings_per_cutoff: remittanceDecimal,
  savings_entries: savingsEntry.array().max(1),
});
type Member = z.output<typeof memberShape>;

export const remittanceInput = z.object({
  payrollRunId: id, bankDate: z.iso.date(), bankReference: z.string().trim().min(1).max(80),
  bankAmount: z.string().trim().max(80).transform(remittanceAmount).pipe(z.string()),
});
export type RemittanceInput = z.output<typeof remittanceInput>;

type ReviewRow = {
  file: RemittanceFileRow & Partial<StoredRemittanceLine>;
  amount: string | null;
  state: RemittanceRowState;
  message: string | null;
  member?: Member;
  loanId?: number;
  loanNo?: string;
  key?: string;
  expected?: string;
  periodKey?: string;
  payrollSource?: { table: PostedPayrollItem["table"]; id: number; itemKey: string; employeeId: number; link: PayrollRecordLink };
  linkRequired?: boolean;
};

async function readMembers(userIds: number[]) {
  const members = new Map<number, Member[]>();
  for (let start = 0; start < userIds.length; start += 50) {
    const results = await remittanceRows("cooperative_memberships", memberShape,
      "id,user_id,status,employee_name,joined_at,savings_balance,savings_revision,savings_per_cutoff,savings_entries.entry_date,savings_entries.balance_after",
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
function verifyPayrollLoanTerms(view: MemberLoanView, source: Extract<PayrollMaster, { kind: "loan" }>["data"],
  cutoff: string, journal: GlLine[] | undefined) {
  const { loan, ledger } = view;
  const gross = amountToCents(source.loan_amount);
  const net = amountToCents(source.net_amount_released);
  const interest = amountToCents(source.interest_amount);
  if (!ledger || !loan.agreementSigned || loan.mode !== "PAYROLL" || ledger.release.date > cutoff ||
    loan.months !== source.months_to_pay || amountToCents(loan.principal) !== gross || amountToCents(loan.totalPayable) !== gross ||
    net <= 0n || gross - net !== interest || (interest > 0n && loan.method !== "UPFRONT") ||
    amountToCents(loan.upfrontInterest) !== interest || amountToCents(loan.netProceeds) !== net) {
    throw new LoanError(422, "The signed FM loan terms differ from Payroll. Ask Finance to reconcile the agreement and payout.");
  }
  const monthly = amountToCents(source.monthly_payment);
  const expected = loan.frequency === "CUTOFF" ? (monthly + 1n) / 2n : monthly;
  const scheduled = amountToCents(ledger.installments[0]?.total);
  if (expected <= 0n || scheduled !== expected || source.start_date > cutoff) {
    throw new LoanError(422, "The signed installment schedule does not match Payroll.");
  }
  if (!journal || amountToCents(journal.find(line => line.line_no === 1)?.debit) !== gross ||
    amountToCents(journal.find(line => line.line_no === 2)?.credit) !== net ||
    interest > 0n && amountToCents(journal.find(line => line.line_no === 3)?.credit) !== interest) {
    throw new LoanError(422, "The FM release journal does not match the Payroll payout. Ask Finance to reconcile it.");
  }
}

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
  const items = new Map([...payroll].map(([userId, row]) => [userId, readPostedCooperativeItems(row)]));
  const payrollMatchesByRow = new Map(files.map(file => {
    const code = canonical(file.deduction_code);
    const payrollTable = code === savingCode ? "coop_savings_membership" : code === loanDeductionCode ? "employee_loan" : null;
    const matches = payrollTable && !file.input_error
      ? (items.get(employeeId(file.employee_number) ?? 0) ?? []).filter(item =>
        item.table === payrollTable && canonical(item.key) === canonical(file.reference))
      : [];
    return [file.row_number, matches] as const;
  }));
  const externalItems = [...payrollMatchesByRow.values()].flat();
  const [masters, links] = await Promise.all([readPayrollMasters(externalItems), readPayrollRecordLinks(externalItems)]);
  const loanIds = [...new Set(files.flatMap(file => {
    if (canonical(file.deduction_code) !== loanDeductionCode) return [];
    return (items.get(employeeId(file.employee_number) ?? 0) ?? []).filter(item =>
      item.table === "cooperative_loans" && (!singleLoanId || item.id === singleLoanId)).map(item => item.id);
  }).concat(externalItems.flatMap(item => {
    if (item.table !== "employee_loan") return [];
    const link = links.get(payrollSourceKey(item));
    return link ? [link.target_id] : [];
  })))];
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
    if (file.state === "RECONCILED") return fail(row, "RECONCILED", file.message ?? "Linked to an existing FM payment.");
    const userId = employeeId(file.employee_number);
    const code = canonical(file.deduction_code);
    if (file.input_error || !userId || !amount || !file.reference || ![savingCode, loanDeductionCode].includes(code)) {
      return fail(row, "INVALID", file.input_error ?? "Enter a VOS user ID, supported deduction code, positive amount and text reference.");
    }
    const memberships = members.get(userId) ?? [];
    if (!memberships.length) return fail(row, "UNMATCHED", "No Cooperative membership matches this VOS user ID.");
    const deductions = items.get(userId);
    if (!deductions) return fail(row, "UNMATCHED", "The posted deduction totals or source details could not be verified.");
    const source = code === savingCode ? "cooperative_memberships" : "cooperative_loans";
    const reference = canonical(file.reference);
    const candidates = deductions.filter(item => item.table === source && (code === savingCode
      ? memberships.some(member => member.id === item.id)
      : memberships.some(member => member.id === loansById.get(item.id)?.member_id) &&
        (!singleLoanId || singleLoanId === item.id)));
    const exact = candidates.filter(item => canonical(item.key) === reference ||
      (code === loanDeductionCode && canonical(loansById.get(item.id)!.loan_no) === reference));
    const payrollMatches = payrollMatchesByRow.get(file.row_number) ?? [];
    let selected = exact;
    if (payrollMatches.length) {
      const [item] = payrollMatches;
      if (exact.length || payrollMatches.length !== 1) return fail(row, "AMBIGUOUS", "Use an unambiguous Payroll deduction reference.");
      const key = payrollSourceKey(item);
      const master = masters.get(key);
      const owner = master?.data.user_id;
      if (owner !== userId) return fail(row, "INVALID", owner === undefined
        ? "The Payroll source record could not be verified."
        : "The Payroll source belongs to a different employee. Ask Payroll to correct the deduction.");
      const link = verifiedPayrollLink(links.get(key), master, userId);
      if (!link) {
        row.linkRequired = !links.has(key) && !singleLoanId;
        return fail(row, "UNMATCHED", row.linkRequired ? "Confirm the FM record linked to this Payroll deduction."
          : "The verified Payroll source link is unavailable or its terms changed.");
      }
      const targetMemberId = code === savingCode ? link.target_id : loansById.get(link.target_id)?.member_id;
      if (!memberships.some(member => member.id === targetMemberId) ||
        singleLoanId && link.target_id !== singleLoanId) {
        return fail(row, "INVALID", "The mapped FM record does not belong to this member or loan.");
      }
      if (deductions.some(deduction => deduction.table === source && deduction.id === link.target_id)) {
        return fail(row, "AMBIGUOUS", "Both Payroll and FM deductions reference this FM record.");
      }
      selected = [{ ...item, table: source, id: link.target_id }];
      row.periodKey = payrollCutoffKey(run.cutoff_end, userId, item);
      row.payrollSource = { table: item.table, id: item.id, itemKey: item.key, employeeId: userId, link };
    } else if (!exact.length && code === savingCode && !deductions.some(item => item.table === "coop_savings_membership")) {
      selected = candidates;
    }
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
  const periodCounts = new Map<string, number>();
  for (const row of rows) if (row.key) counts.set(row.key, (counts.get(row.key) ?? 0) + 1);
  for (const row of rows) if (row.periodKey) periodCounts.set(row.periodKey, (periodCounts.get(row.periodKey) ?? 0) + 1);
  const [claimed, claimedPeriods] = await Promise.all([
    claimedRemittanceDeductions([...counts.keys()]), claimedRemittanceDeductions([...periodCounts.keys()], "payroll_period_key"),
  ]);
  for (const row of rows) {
    if (!row.key) continue;
    if ((counts.get(row.key) ?? 0) > 1 || claimed.has(row.key)) {
      fail(row, "DUPLICATE", claimed.has(row.key) ? "This payroll deduction has already been posted." : "The same payroll deduction appears more than once in this file.");
    } else if (row.periodKey && ((periodCounts.get(row.periodKey) ?? 0) > 1 || claimedPeriods.has(row.periodKey))) {
      fail(row, "DUPLICATE", "This Payroll record was already claimed for this cutoff. Reconcile any corrected run with Payroll before posting again.");
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
  const [linked, releaseJournals] = await Promise.all([
    remittanceLinks("payment_id", [...potentialOverlap]),
    readLoanJournalLines([...loanGroups].flatMap(([loanId, group]) =>
      group.some(row => row.payrollSource) ? views.get(loanId)?.ledger?.release.journalId ?? [] : [])),
  ]);
  for (const [loanId, group] of loanGroups) {
    try {
      const view = views.get(loanId);
      if (!view || view.loan.memberId !== group[0].member?.id) throw new LoanError(422, "The loan is unavailable for this member.");
      const amount = centsToAmount(rowTotal(group));
      const payrollSource = group.find(row => row.payrollSource)?.payrollSource;
      const master = payrollSource && masters.get(payrollSourceKey(payrollSource));
      if (master?.kind === "loan") verifyPayrollLoanTerms(view, master.data, run.cutoff_end,
        releaseJournals.get(view.ledger?.release.journalId ?? 0));
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
    rows.map(row => [row.file.row_number, row.amount, row.key, row.expected, row.state, row.member?.id, row.loanId, row.periodKey, row.payrollSource]),
    savings.map(item => [item.member.id, item.member.savings_revision, item.member.savings_balance]),
    loanPayments.map(item => item.review.preview.fingerprint)]);
  return { rows, savings, loanPayments, eligibleAmount, date, cutoff: run.cutoff_end, bankKey, bankTaken, difference,
    fingerprint, due, bank, liability, canPost: eligible.length > 0 && !bankTaken && difference === "0.00" };
}

const linkInput = z.object({ row: id, loanNo: z.string().trim().max(24).default(""), evidence: z.string().trim().min(1).max(250), paymentId: id.optional() });

export async function confirmRemittanceLink(batchId: number, body: unknown, actor: LoanActor) {
  requireRemittanceRollout();
  const input = linkInput.safeParse(body);
  if (!input.success) throw new LoanError(422, "Enter the row and the signed agreement or reconciliation evidence reference.");
  const [batch, rows] = await Promise.all([readRemittanceBatch(batchId), readRemittanceLines(batchId)]);
  const file = rows.find(row => row.row_number === input.data.row);
  if (file?.state === "RECONCILED" && file.payment_id === input.data.paymentId) return;
  if (batch.state !== "REVIEW" || !file || file.input_error || file.state === "RECONCILED") throw new LoanError(409, "Choose an unposted remittance row.");
  const userId = employeeId(file.employee_number);
  const code = canonical(file.deduction_code);
  const table = code === savingCode ? "coop_savings_membership" : code === loanDeductionCode ? "employee_loan" : null;
  const run = await readPostedPayrollRun(batch.payroll_run_id);
  if (!run || run.cutoff_end !== batch.cutoff_date || !userId || !table) throw new LoanError(422, "The Payroll source is unavailable.");
  const result = (await readPayrollRunDeductions(run, [userId])).get(userId);
  const postedItems = result ? readPostedCooperativeItems(result) ?? [] : [];
  const [item, duplicate] = postedItems.filter(item =>
    item.table === table && canonical(item.key) === canonical(file.reference) && centsToAmount(item.cents) === remittanceAmount(file.amount_input));
  if (!item || duplicate) throw new LoanError(422, "Use the exact Payroll deduction reference and amount.");
  const master = (await readPayrollMasters([item])).get(payrollSourceKey(item));
  if (master?.data.user_id !== userId) throw new LoanError(422, "The Payroll source does not belong to this employee.");
  const [member, second] = ((await readMembers([userId])).get(userId) ?? []).filter(member =>
    (member.status === "ACTIVE" || Boolean(input.data.paymentId)) && member.joined_at <= run.cutoff_end);
  if (!member || second) throw new LoanError(422, "Verify one FM membership for this employee and cutoff.");
  let target = member.id;
  let historical: { paymentId: number; journalId: number; journalNo: string; loanNo: string } | undefined;
  if (master.data.start_date > run.cutoff_end) throw new LoanError(422, "The Payroll contribution or loan is not effective for this cutoff.");
  if (master.kind === "savings") {
    if (input.data.paymentId) throw new LoanError(422, "Choose a Payroll loan deduction for payment reconciliation.");
    if (amountToCents(member.savings_per_cutoff) * 2n !== amountToCents(master.data.monthly_amount)) {
      throw new LoanError(422, "The FM savings agreement does not match Payroll's monthly savings amount.");
    }
  } else {
    const [loan, other] = await remittanceRows("cooperative_loans", z.object({ id }), "id",
      { member_id: { _eq: member.id }, loan_no: { _eq: input.data.loanNo } }, 2);
    if (!loan || other) throw new LoanError(422, "Enter the exact FM loan number for this member.");
    if (postedItems.some(item => item.table === "cooperative_loans" && item.id === loan.id)) {
      throw new LoanError(422, "Both Payroll and FM deductions reference this loan. Ask Payroll to verify the source.");
    }
    const view = (await readLoansForRemittance([loan.id], todayManila())).get(loan.id);
    if (!view || (!input.data.paymentId && view.loan.status !== "ACTIVE")) {
      throw new LoanError(422, "Choose an active FM loan, or provide the existing posted payment ID for historical reconciliation.");
    }
    const releaseId = view.ledger?.release.journalId;
    const journals = await readLoanJournalLines(releaseId ? [releaseId] : []);
    verifyPayrollLoanTerms(view, master.data, run.cutoff_end, journals.get(releaseId ?? 0));
    if (input.data.paymentId) {
      const paymentId = input.data.paymentId;
      const payment = view.paymentRows?.find(row => Number(row.id) === paymentId);
      const movements = view.ledger!.movements;
      const movement = movements.find(row => row.id === paymentId && row.kind === "PAYMENT");
      if (!payment || !movement || movements.some(row => row.reversesId === paymentId) ||
        payment.channel !== "PAYROLL" || payment.receipt_date !== batch.bank_date ||
        canonical(String(payment.reference_no ?? "")) !== canonical(batch.bank_reference) ||
        amountToCents(String(payment.amount)) !== item.cents) {
        throw new LoanError(422, "The existing payment must match the loan, bank receipt date and reference, and Payroll amount.");
      }
      if ((await remittanceLinks("payment_id", [paymentId])).has(paymentId)) {
        throw new LoanError(409, "This payment already has Payroll evidence.");
      }
      historical = { paymentId, journalId: movement.journalId, journalNo: movement.journalNo, loanNo: view.loan.loanNo };
    }
    target = loan.id;
  }
  await savePayrollRecordLink(item, master, target, run.payroll_run_id, actor.actorId, input.data.evidence);
  if (!historical) return;

  const deductionKey = loanDigest([run.payroll_run_id, userId, item.key]);
  const periodKey = payrollCutoffKey(run.cutoff_end, userId, item);
  const reconciliation = { ...historical, loanId: target, payrollLoanId: item.id, runId: run.payroll_run_id, cutoff: run.cutoff_end,
    itemKey: item.key, deductionKey, periodKey, evidence: input.data.evidence };
  try {
    await writeRemittanceBatch({ lines: { update: [{
      id: file.id, state: "RECONCILED", message: "Verified against an existing FM payment.",
      member_name: member.employee_name, membership_id: member.id, loan_no: historical.loanNo, loan_id: target,
      journal_no: historical.journalNo, payment_id: historical.paymentId,
      deduction_key: deductionKey, payroll_period_key: periodKey, payroll_source: reconciliation,
      posting_command_id: {
        command_type: "PAYROLL_PAYMENT_RECONCILED", idempotency_key: String(historical.paymentId),
        request_hash: loanDigest(reconciliation), actor_user_id: actor.actorId, created_at: cooperativeAuditTime(),
        remittance_batch_id: batchId, result: reconciliation,
      },
    }] } }, batchId);
  } catch (cause) {
    const saved = (await readRemittanceLines(batchId)).find(row => row.id === file.id);
    if (saved?.state === "RECONCILED" && saved.payment_id === historical.paymentId && saved.deduction_key === deductionKey) return;
    if (cause instanceof CooperativeDirectusError && /duplicate|unique/i.test(cause.detail ?? "")) {
      throw new LoanError(409, "This payment or Payroll deduction already has a reconciliation claim.");
    }
    throw cause;
  }
}

export function remittanceRowValues(row: ReviewRow) {
  return {
    state: row.state, message: row.message,
    ...(row.state === "RECONCILED" ? { member_name: row.file.member_name, membership_id: row.file.membership_id,
      loan_id: row.file.loan_id, loan_no: row.file.loan_no } : { member_name: row.member?.employee_name ?? null,
    membership_id: row.member?.id ?? null, loan_id: row.loanId ?? null, loan_no: row.loanNo ?? null }),
  };
}

export type RemittanceReview = Awaited<ReturnType<typeof reviewPayrollRemittance>>;
