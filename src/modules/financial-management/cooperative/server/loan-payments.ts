import "server-only";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { projectLoanLedger, repaymentBusinessDate, type LoanLedger } from "../loans/loan-activity";
import { allocatePayment, amountToCents, centsToAmount, loanTotals } from "../loans/loan-schedule";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import {
  findLoanCommand, loanDigest, loanPostingAccounts, loanPostingEnabled, prepareLoanJournal,
  readLoanJournalLines, readLoanJournalResults, requirePostingAccount, staleLoanReview, writeLoanCommand,
  type LoanActor, type LoanPostingPair,
} from "./loan-commands";
import { catchUpLoanDueDates, loanDueWork } from "./loan-due-dates";
import { LoanError, readLoanForChange } from "./loans";
import { todayManila } from "./member-read";
import { nestedTransactionEntries } from "./transaction-index";
import { getPolicies } from "./policies";
import type { PolicyState } from "../policies/policy-types";

const positiveId = z.number().int().positive();
const paymentInput = z.object({
  channel: z.enum(["OTC", "PAYROLL"]),
  amount: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a valid amount in centavos.")
    .refine(value => /[1-9]/.test(value), "Enter an amount greater than zero.")
    .transform(value => centsToAmount(amountToCents(value))),
  receiptDate: z.iso.date(),
  reference: z.string().trim().max(120).default(""),
  confirmed: z.boolean().default(false),
});
const confirmation = z.object({
  requestKey: z.uuid(),
  revision: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
const reversalInput = z.object({
  paymentId: positiveId,
  reason: z.string().trim().min(1, "Enter the reason for this reversal.").max(500),
});
const savedAccrualAccounts = z.record(z.string(), positiveId);

type View = Awaited<ReturnType<typeof readLoanForChange>>;
type PaymentInput = z.output<typeof paymentInput>;
type Installment = LoanLedger["installments"][number];

function parseInput<T extends z.ZodType>(schema: T, payload: unknown) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new LoanError(422, "Check the payment details.", "LOAN_PAYMENT_INPUT",
    Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
  return parsed.data;
}

function requirePaymentRollout() {
  if (!loanPostingEnabled()) throw new LoanError(409, "Loan payments are pending rollout in this environment.", "PENDING_ROLLOUT");
}

function activeLedger(view: View) {
  if (view.loan.status !== "ACTIVE" || !view.ledger) {
    throw new LoanError(409, "Choose a released loan with an outstanding balance.", "LOAN_PAYMENT_UNAVAILABLE");
  }
  return view.ledger;
}

function paymentPosition(view: View, ledger: LoanLedger, date: string) {
  const position = projectLoanLedger(ledger, date);
  const dueWork = loanDueWork({ ...view, position }, date);
  const penalties = new Map(dueWork.penalties.map(item => [item.id, item]));
  const schedule = position.installments.map(item => {
    const assessment = penalties.get(item.id);
    return assessment ? { ...item, penaltyAssessed: assessment.amount, penaltyAssessedOn: assessment.assessedOn } : item;
  });
  const totals = loanTotals(schedule, date);
  const penaltiesDue = amountToCents(totals.penalties);
  const due = schedule.filter(item => item.dueDate <= date).reduce((total, item) =>
    total + amountToCents(item.total) - amountToCents(item.paidTotal), penaltiesDue);
  return {
    schedule, dueWork,
    amounts: {
      due: centsToAmount(due),
      penalties: totals.penalties,
      balance: totals.remaining,
      maximum: centsToAmount(amountToCents(totals.remaining) + penaltiesDue),
    },
  };
}

export async function getLoanPaymentSummary(id: number) {
  requirePaymentRollout();
  const today = todayManila();
  const view = await readLoanForChange(id, today);
  const ledger = activeLedger(view);
  const { amounts } = paymentPosition(view, ledger, today);
  return {
    id, loanNo: view.loan.loanNo, memberName: view.loan.memberName,
    releasedOn: ledger.release.date, today, channel: view.loan.mode, ...amounts,
  };
}

export type LoanPaymentSummary = Awaited<ReturnType<typeof getLoanPaymentSummary>>;

async function reviewPayment(id: number, input: PaymentInput, remittance?: { view: View; policy: PolicyState }) {
  requirePaymentRollout();
  const today = todayManila();
  const view = remittance?.view ?? await readLoanForChange(id, today);
  const ledger = activeLedger(view);
  if (input.receiptDate < ledger.release.date || input.receiptDate > today) {
    throw new LoanError(422, "Check the receipt date.", "LOAN_PAYMENT_INPUT",
      { receiptDate: "Choose a date from the loan release through today." });
  }
  if (input.channel === "PAYROLL") {
    if (!input.confirmed || !input.reference) {
      throw new LoanError(422, "Confirm the bank receipt and enter its remittance reference.", "LOAN_PAYMENT_INPUT");
    }
    const reversed = new Set(ledger.movements.map(row => row.reversesId));
    if (ledger.movements.some(row => row.channel === "PAYROLL" && row.reversesId === null && !reversed.has(row.id) &&
      row.reference.trim().toLowerCase() === input.reference.toLowerCase())) {
      throw new LoanError(409, "This remittance reference has already been posted for the loan.", "LOAN_REMITTANCE_DUPLICATE");
    }
  }
  const businessDate = remittance ? today : repaymentBusinessDate(ledger, input.receiptDate, today);
  const { schedule, dueWork, amounts } = paymentPosition(view, ledger, businessDate);
  const policy = remittance?.policy ?? await getPolicies();
  if (!policy.settings) throw new LoanError(503, "Cooperative loan payment policy is unavailable.");
  const accounts = loanPostingAccounts(policy);
  const order = policy.settings.paymentOrder;
  const applied = allocatePayment(schedule, input.amount, order === "PENALTIES_FIRST");
  if (amountToCents(applied.remainder) > 0n) {
    throw new LoanError(422, "The payment exceeds the full payoff amount.", "LOAN_PAYMENT_INPUT",
      { amount: "Enter " + amounts.maximum + " or less." });
  }
  const after = loanTotals(applied.schedule, businessDate);
  const needsDueUpdate = dueWork.accruals.length > 0 || dueWork.penalties.length > 0;
  const preview = {
    loanId: id, revision: view.revision, receiptDate: input.receiptDate, businessDate,
    ...amounts, amount: input.amount, order, allocations: applied.allocations, needsDueUpdate,
    afterBalance: after.remaining, afterPenalties: after.penalties,
    status: after.fullyPaid ? "FULLY_PAID" as const : "ACTIVE" as const,
    fingerprint: loanDigest([id, view.revision, businessDate, input, policy.revision, applied.allocations, dueWork]),
  };
  return { ledger, today, view, preview, accounts, applied, input };
}

export function reviewPayrollLoanPayment(view: View, policy: PolicyState, amount: string, receiptDate: string, reference: string) {
  return reviewPayment(view.loan.id, { amount, receiptDate, reference, channel: "PAYROLL", confirmed: true }, { view, policy });
}

export async function getLoanPaymentPreview(id: number, payload: unknown) {
  return (await reviewPayment(id, parseInput(paymentInput, payload))).preview;
}

export type LoanPaymentPreview = Awaited<ReturnType<typeof getLoanPaymentPreview>>;

function total<T>(items: readonly T[], field: (item: T) => string) {
  return items.reduce((sum, item) => sum + amountToCents(field(item)), 0n);
}

async function receivableAccounts(ledger: LoanLedger, items: Installment[]) {
  const accrualIds = items.flatMap(item => item.accrualJournalId ?? []);
  const [lines, results] = await Promise.all([
    readLoanJournalLines([ledger.release.journalId, ...accrualIds]), readLoanJournalResults(accrualIds),
  ]);
  const releaseDebit = lines.get(ledger.release.journalId)?.find(row => row.line_no === 1 && amountToCents(row.debit) > 0n);
  if (!releaseDebit || amountToCents(releaseDebit.debit) !== total(ledger.installments, row => row.principal)) {
    throw new LoanError(503, "The release principal does not match its journal.");
  }
  const accrued = new Map<number, number>();
  for (const item of items) {
    if (!item.accrualJournalId) continue;
    const restored = savedAccrualAccounts.safeParse(results.get(item.accrualJournalId)?.restoredAccrualAccounts);
    const debit = lines.get(item.accrualJournalId)?.find(row => amountToCents(row.debit) > 0n &&
      (restored.success ? row.account_id === restored.data[String(item.id)] : row.line_no === 1));
    if (!debit) throw new LoanError(503, "An accrued installment could not be matched to its journal.");
    accrued.set(item.id, debit.account_id);
  }
  return { principal: releaseDebit.account_id, accrued };
}

async function paymentPairs(review: Awaited<ReturnType<typeof reviewPayment>>, fromEmployer = false) {
  const { view, ledger, preview, accounts } = review;
  const hasGoods = view.loan.productKind === "GOODS";
  const debit = requirePostingAccount(accounts, fromEmployer ? "DUE_FROM_EMPLOYER" :
    review.input.channel === "OTC" ? "CASH_ON_HAND" : "CASH_IN_BANK");
  const involved = new Map(ledger.installments.map(item => [item.no, item]));
  const accrued = preview.allocations.filter(row => amountToCents(row.interest) > 0n)
    .map(row => involved.get(row.installmentNo)!).filter(item => item.dueDate <= preview.businessDate);
  const receivables = await receivableAccounts(ledger, accrued);
  const credits = new Map<number, bigint>();
  function credit(id: number, cents: bigint) {
    if (cents > 0n) credits.set(id, (credits.get(id) ?? 0n) + cents);
  }
  credit(receivables.principal, total(preview.allocations, row => row.principal));
  let advance = 0n;
  for (const row of preview.allocations) {
    const interest = amountToCents(row.interest);
    if (interest === 0n) continue;
    const item = involved.get(row.installmentNo)!;
    if (item.dueDate > preview.businessDate) advance += interest;
    else {
      if (!item.accrualProcessedOn) throw staleLoanReview();
      credit(receivables.accrued.get(item.id) ?? requirePostingAccount(accounts, "INTEREST_MARKUP_RECEIVABLE").id, interest);
    }
  }
  const penalty = total(preview.allocations, row => row.penalty);
  if (penalty > 0n) credit(requirePostingAccount(accounts, "PENALTY_INCOME").id, penalty);
  const pairs: LoanPostingPair[] = [...credits].map(([id, cents]) => ({ debit, credit: { id }, amount: centsToAmount(cents) }));
  const income = advance > 0n ? requirePostingAccount(accounts, hasGoods ? "INSTALLMENT_MARKUP_INCOME" : "LOAN_INTEREST_INCOME") : null;
  if (income) pairs.push({ debit, credit: income, amount: centsToAmount(advance) });
  if (total(pairs, row => row.amount) !== amountToCents(preview.amount)) {
    throw new LoanError(503, "The payment allocations do not match the amount received.");
  }
  return { pairs, prepaymentIncomeAccountId: income?.id ?? null, prepaymentCreditLine: income ? pairs.length * 2 : null };
}

function paidFields(item: Installment, lastPaidOn: string | null, now: Date) {
  return {
    id: item.id, paid_total: item.paidTotal, paid_principal: item.paidPrincipal, paid_interest: item.paidInterest,
    penalty_paid: item.penaltyPaid, status: item.status, last_paid_on: lastPaidOn, updated_at: cooperativeAuditTime(now),
  };
}

export async function postLoanPayment(id: number, payload: unknown, actor: LoanActor) {
  requirePaymentRollout();
  const input = parseInput(paymentInput, payload);
  const submitted = parseInput(confirmation, payload);
  const command = { loanId: id, type: "LOAN_PAYMENT" as const, key: submitted.requestKey,
    hash: loanDigest([id, actor.actorId, input, submitted]) };
  const prior = await findLoanCommand<LoanPaymentResult>(command);
  if (prior) return prior;
  const review = await reviewPayment(id, input).catch(async error => {
    const saved = await findLoanCommand<LoanPaymentResult>(command);
    if (saved) return saved;
    throw error;
  });
  if ("duplicate" in review) return review;
  const { view, preview, accounts } = review;
  if (submitted.revision !== preview.revision || submitted.fingerprint !== preview.fingerprint) {
    const saved = await findLoanCommand<LoanPaymentResult>(command);
    if (saved) return saved;
    throw staleLoanReview();
  }
  if (preview.needsDueUpdate) {
    await catchUpLoanDueDates(view, preview.businessDate, async () => accounts);
    throw new LoanError(409, "Due-date records were updated. Review the refreshed payment before confirming.", "LOAN_DUE_UPDATED");
  }
  const allocation = await paymentPairs(review);
  return writeLoanCommand(command, preview.revision, actor,
    now => prepareLoanPayment(review, actor, now, allocation));
}

export async function preparePayrollLoanPayment(review: Awaited<ReturnType<typeof reviewPayrollLoanPayment>>,
  actor: LoanActor, now: Date, reservedJournalNo: string) {
  return prepareLoanPayment(review, actor, now, await paymentPairs(review, true), reservedJournalNo);
}

async function prepareLoanPayment(review: Awaited<ReturnType<typeof reviewPayment>>, actor: LoanActor, now: Date,
  { pairs, prepaymentIncomeAccountId, prepaymentCreditLine }: Awaited<ReturnType<typeof paymentPairs>>, reservedJournalNo?: string) {
  const { input, view, ledger, preview, applied } = review;
  const id = view.loan.id;
  const type = "LOAN_PAYMENT";
  const schedule = new Map(ledger.installments.map(row => [row.no, row.id]));
  const used = new Set(preview.allocations.map(row => row.installmentNo));
  const principal = centsToAmount(total(preview.allocations, row => row.principal));
  const interest = centsToAmount(total(preview.allocations, row => row.interest));
  const penalty = applied.penaltyPart;
  if (todayManila(now) !== review.today) throw staleLoanReview();
  const paymentId = randomInt(100_000_000, 2_000_000_000);
  const posting = await prepareLoanJournal({
    loanId: id, type, date: preview.businessDate, actor, now, pairs, reservedJournalNo,
    paymentReceipt: input.channel === "OTC" ? { membershipId: view.loan.memberId, amount: input.amount } : undefined,
    audit: ({ journalNo, orNo }) => ({
      ...cooperativeAuditEvent(actor, {
        subject: { type: "LOAN", id }, action: "LOAN_PAYMENT_POSTED",
        before: { balance: preview.balance, status: view.loan.status },
        after: { paymentId, journalNo, orNo, ...input, businessDate: preview.businessDate, principal, interest, penalty,
          balance: preview.afterBalance, penalties: preview.afterPenalties, status: preview.status },
      }, now), actor_name: actor.actorName,
    }),
  });
  const at = cooperativeAuditTime(now);
  const row = {
    id: paymentId, loan_id: id, member_id: view.loan.memberId,
    official_receipt_no: posting.numbers.orNo, reference_no: input.reference || null,
    amount: input.amount, principal_amount: principal, interest_amount: interest, penalty_amount: penalty,
    channel: input.channel, receipt_date: input.receiptDate, posted_at: at, posted_by: actor.actorId,
    status: "POSTED", created_at: at,
    allocations: { create: preview.allocations.map(({ installmentNo, ...values }) =>
      ({ installment_id: schedule.get(installmentNo), ...values, created_at: at })) },
  };
  return {
    result: {
      paymentId, loanId: id, ...posting.numbers, amount: input.amount, principal, interest, penalty,
      businessDate: preview.businessDate, receiptDate: input.receiptDate, status: preview.status,
      balance: preview.afterBalance, penalties: preview.afterPenalties, prepaymentIncomeAccountId, prepaymentCreditLine,
    } satisfies LoanPaymentResult,
    changes: {
      status: preview.status,
      installments: { update: applied.schedule.filter(item => used.has(item.no)).map(item =>
        paidFields({ ...item, id: schedule.get(item.no)! }, preview.businessDate, now)) },
    },
    receipt: { ...posting.receipt, journal_id: {
      ...posting.receipt.journal_id, loan_payments: { create: [row] },
      ...nestedTransactionEntries({ id: posting.numbers.journalId, date: preview.businessDate, postedAt: at }, [{
        kind: type, memberId: view.loan.memberId, loanId: id, paymentId, channel: input.channel, amount: input.amount,
        receivedOn: input.receiptDate, reference: input.reference, orNo: posting.numbers.orNo, sourceReference: view.loan.loanNo,
      }]),
    } },
  };
}

export type LoanPaymentResult = {
  paymentId: number; loanId: number; journalId: number; journalNo: string; orNo: string | null;
  amount: string; principal: string; interest: string; penalty: string; businessDate: string; receiptDate: string;
  status: "ACTIVE" | "FULLY_PAID"; balance: string; penalties: string;
  prepaymentIncomeAccountId: number | null; prepaymentCreditLine: number | null;
};

export async function reviewLoanPaymentReversal(id: number, paymentId: number, loan?: View) {
  requirePaymentRollout();
  const date = todayManila();
  const view = loan ?? await readLoanForChange(id, date);
  const { ledger, position } = view;
  if (!ledger || !position || !["ACTIVE", "FULLY_PAID"].includes(view.loan.status) || ledger.movements.some(row => row.kind === "OFFSET")) {
    throw new LoanError(409, "This loan is outside the payment correction workflow.", "LOAN_PAYMENT_UNAVAILABLE");
  }
  const original = ledger.movements.find(row => row.id === paymentId && row.kind === "PAYMENT" && row.reversesId === null);
  if (!original) throw new LoanError(404, "The original payment is unavailable.");
  if (ledger.movements.some(row => row.reversesId === original.id)) {
    throw new LoanError(409, "This payment already has a reversal.", "LOAN_PAYMENT_REVERSED");
  }
  if (original.date > date) throw new LoanError(409, "This payment has a future posting date.");
  const reversal = { ...original, id: 0, date, postedAt: "9999-12-31T00:00:00", reversesId: original.id };
  const remaining = projectLoanLedger({ ...ledger, movements: [...ledger.movements, reversal] }, date);
  const ids = new Set(original.allocations.map(row => row.installmentId));
  const restored = remaining.installments.filter(row => ids.has(row.id));
  const preview = {
    revision: view.revision, paymentId, date, originalJournal: original.journalNo, reference: original.reference,
    originalBusinessDate: original.date, loanId: id, loanNo: view.loan.loanNo, currentBalance: position.remaining,
    afterBalance: remaining.remaining, afterPenalties: remaining.penalties,
    amount: centsToAmount(total(original.allocations, item => item.principal) +
      total(original.allocations, item => item.interest) + total(original.allocations, item => item.penalty)),
    installments: restored.map(row => ({ no: row.no, paid: row.paidTotal, penaltyPaid: row.penaltyPaid, status: row.status })),
    status: remaining.fullyPaid ? "FULLY_PAID" as const : "ACTIVE" as const,
    fingerprint: loanDigest([id, view.revision, date, original, restored]),
  };
  return { view, ledger, original, restored, preview };
}

export async function getLoanReversalPreview(id: number, payload: unknown) {
  const data = parseInput(z.object({ paymentId: positiveId }), payload);
  return (await reviewLoanPaymentReversal(id, data.paymentId)).preview;
}

export type LoanReversalPreview = Awaited<ReturnType<typeof getLoanReversalPreview>>;

export async function reverseLoanPayment(id: number, payload: unknown, actor: LoanActor) {
  requirePaymentRollout();
  const input = parseInput(reversalInput, payload);
  const submitted = parseInput(confirmation, payload);
  const command = { loanId: id, type: "LOAN_PAYMENT_REVERSED" as const, key: submitted.requestKey,
    hash: loanDigest([id, actor.actorId, input, submitted]) };
  const prior = await findLoanCommand<LoanPaymentResult>(command);
  if (prior) return prior;
  const review = await reviewLoanPaymentReversal(id, input.paymentId).catch(async error => {
    const saved = await findLoanCommand<LoanPaymentResult>(command);
    if (saved) return saved;
    throw error;
  });
  if ("duplicate" in review) return review;
  const { preview } = review;
  if (submitted.revision !== preview.revision || submitted.fingerprint !== preview.fingerprint) throw staleLoanReview();
  const allocation = await prepareReversalAllocations(review);
  return writeLoanCommand(command, preview.revision, actor,
    now => prepareLoanReversal(review, input.reason, actor, now, allocation));
}

async function prepareReversalAllocations(review: Awaited<ReturnType<typeof reviewLoanPaymentReversal>>, policy?: PolicyState) {
  const { view, ledger, original, restored, preview } = review;
  const originalLines = (await readLoanJournalLines([original.journalId])).get(original.journalId) ?? [];
  if (total(originalLines, row => row.debit) !== amountToCents(preview.amount) ||
    total(originalLines, row => row.credit) !== amountToCents(preview.amount)) {
    throw new LoanError(503, "The original payment and its journal do not reconcile.");
  }
  const restore = restored.filter(item => (item.accrualProcessedOn || view.position?.fullyPaid && item.dueDate <= preview.date) && item.dueDate > original.date &&
    original.allocations.some(row => row.installmentId === item.id && amountToCents(row.interest) > 0n));
  const pairs: LoanPostingPair[] = [];
  const restoredAccrualAccounts: Record<string, number> = {};
  if (restore.length) {
    const [receivables, historic, effectivePolicy] = await Promise.all([
      receivableAccounts(ledger, restore), readLoanJournalResults([original.journalId]), policy ?? getPolicies(),
    ]);
    const accounts = loanPostingAccounts(effectivePolicy);
    const income = positiveId.safeParse(historic.get(original.journalId)?.prepaymentIncomeAccountId);
    if (!income.success) throw new LoanError(503, "The original advance interest posting could not be verified.");
    for (const item of restore) {
      const debit = receivables.accrued.get(item.id) ?? requirePostingAccount(accounts, "INTEREST_MARKUP_RECEIVABLE").id;
      const amount = original.allocations.find(row => row.installmentId === item.id)!.interest;
      if (!item.accrualJournalId) restoredAccrualAccounts[item.id] = debit;
      pairs.push({ debit: { id: debit }, credit: { id: income.data }, amount });
    }
  }
  const reversed = new Set([...ledger.movements.map(row => row.reversesId), original.id]);
  const lastPaid = new Map<number, string>();
  for (const row of ledger.movements) {
    if (row.reversesId !== null || reversed.has(row.id)) continue;
    for (const { installmentId } of row.allocations) {
      if (row.date > (lastPaid.get(installmentId) ?? "")) lastPaid.set(installmentId, row.date);
    }
  }
  return { originalLines, pairs, restoredAccrualAccounts, lastPaid };
}

export async function preparePayrollLoanReversal(review: Awaited<ReturnType<typeof reviewLoanPaymentReversal>>, reason: string,
  actor: LoanActor, now: Date, reservedJournalNo: string, policy: PolicyState) {
  return prepareLoanReversal(review, reason, actor, now, await prepareReversalAllocations(review, policy), reservedJournalNo);
}

async function prepareLoanReversal(review: Awaited<ReturnType<typeof reviewLoanPaymentReversal>>, reason: string,
  actor: LoanActor, now: Date, { originalLines, pairs, restoredAccrualAccounts, lastPaid }: Awaited<ReturnType<typeof prepareReversalAllocations>>,
  reservedJournalNo?: string) {
  const { view, original, restored, preview } = review;
  const id = view.loan.id;
  const type = "LOAN_PAYMENT_REVERSED";
  const principal = centsToAmount(total(original.allocations, item => item.principal));
  const interest = centsToAmount(total(original.allocations, item => item.interest));
  const penalty = centsToAmount(total(original.allocations, item => item.penalty));
  if (todayManila(now) !== preview.date) throw staleLoanReview();
  const paymentId = randomInt(100_000_000, 2_000_000_000);
  const posting = await prepareLoanJournal({
    loanId: id, type, date: preview.date, actor, now, pairs, reservedJournalNo,
    reversal: { journalId: original.journalId, lines: originalLines },
    audit: ({ journalNo }) => ({
      ...cooperativeAuditEvent(actor, { subject: { type: "LOAN", id }, action: type,
        before: { paymentId: original.id, balance: preview.currentBalance, status: view.loan.status },
        after: { paymentId, journalNo, originalJournal: original.journalNo, balance: preview.afterBalance, status: preview.status },
        reason,
      }, now), actor_name: actor.actorName,
    }),
  });
  const at = cooperativeAuditTime(now);
  const row = {
    id: paymentId, loan_id: id, member_id: view.loan.memberId, amount: preview.amount,
    principal_amount: principal, interest_amount: interest, penalty_amount: penalty,
    channel: original.channel, reference_no: original.reference, receipt_date: preview.date,
    posted_at: at, posted_by: actor.actorId, status: "POSTED", reverses_payment_id: original.id, created_at: at,
  };
  return {
    result: {
      paymentId, loanId: id, ...posting.numbers, amount: preview.amount, principal, interest, penalty,
      businessDate: preview.date, receiptDate: preview.date, status: preview.status, balance: preview.afterBalance,
      penalties: preview.afterPenalties, prepaymentIncomeAccountId: null, prepaymentCreditLine: null, restoredAccrualAccounts,
    },
    changes: {
      status: preview.status,
      payments: { update: [{ id: original.id, status: "REVERSED" }] },
      installments: { update: restored.map(item => ({
        ...paidFields(item, lastPaid.get(item.id) ?? null, now),
        ...(restoredAccrualAccounts[item.id] ? {
          accrual_journal_id: posting.numbers.journalId, accrual_processed_on: item.accrualProcessedOn ?? preview.date,
        } : {}),
      })) },
    },
    receipt: { ...posting.receipt, journal_id: {
      ...posting.receipt.journal_id, loan_payments: { create: [row] },
      ...nestedTransactionEntries({ id: posting.numbers.journalId, date: preview.date, postedAt: at }, [{
        kind: type, memberId: view.loan.memberId, loanId: id, paymentId, channel: original.channel === "CLEARANCE" ? "SYSTEM" : original.channel,
        amount: preview.amount, receivedOn: preview.date, reference: original.reference, sourceReference: view.loan.loanNo,
      }]),
    } },
  };
}
