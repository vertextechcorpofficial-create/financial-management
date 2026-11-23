import "server-only";

import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { CooperativeDirectusError } from "./directus";
import { loanDigest, nextRemittanceJournals, prepareCooperativeJournal, type LoanActor } from "./loan-commands";
import { preparePayrollLoanPayment } from "./loan-payments";
import { LoanError } from "./loans";
import { todayManila } from "./member-read";
import { readRemittanceFile, remittanceAmount, type RemittanceFileRow } from "./payroll-remittance-file";
import { loanDeductionCode, remittanceInput, remittanceRowValues, reviewPayrollRemittance,
  type RemittanceInput, type RemittanceReview } from "./payroll-remittance-review";
import { readRemittanceBatch, readRemittanceLines, remittanceRows, requireRemittanceRollout, writeRemittanceBatch,
  type RemittanceBatch } from "./payroll-remittance-store";
import { findSavingsCommand } from "./savings-commands";
import { nestedTransactionEntries } from "./transaction-index";
import { withdrawalId as id } from "./withdrawal-store";

const postingAction = "PAYROLL_REMITTANCE";
const postingResult = z.object({
  id, amount: z.string(), journalNo: z.string(),
  loan: z.object({
    paymentId: id, loanId: id, journalId: id, journalNo: z.string(), orNo: z.string().nullable(),
    amount: z.string(), principal: z.string(), interest: z.string(), penalty: z.string(),
    businessDate: z.iso.date(), receiptDate: z.iso.date(), status: z.enum(["ACTIVE", "FULLY_PAID"]),
    balance: z.string(), penalties: z.string(),
    prepaymentIncomeAccountId: id.nullable(), prepaymentCreditLine: id.nullable(),
  }).nullable(),
});
export const remittanceConfirmation = z.object({
  requestKey: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true),
});
export const remittanceStale = () => new LoanError(409, "The payroll evidence or a balance changed. Review the batch again.", "STALE_REMITTANCE");
type Receipt = { type: string; key: string; hash: string };

export function parseRemittanceInput<T extends z.ZodType>(schema: T, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new LoanError(422, "Check the payroll run, bank receipt and confirmation details.", "REMITTANCE_INPUT",
    Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message])));
  return parsed.data;
}

export function remittanceBatchReceipt(batchId: number, command: Receipt, actor: LoanActor, now: Date, result: object) {
  return {
    command_type: command.type, idempotency_key: command.key, request_hash: command.hash,
    actor_user_id: actor.actorId, created_at: cooperativeAuditTime(now), result,
    remittance_batch_id: batchId,
  };
}

export function targetRemittanceReceipt(batchId: number, type: string, targetId: number, revision: number, actor: LoanActor,
  now: Date, result: object, target: "loan" | "savings") {
  const key = `${batchId}:${type}:${targetId}`;
  return {
    ...remittanceBatchReceipt(batchId, { type, key, hash: loanDigest([batchId, type, targetId, revision]) }, actor, now, result),
    [target === "loan" ? "loan_revision_key" : "savings_revision_key"]: loanDigest([targetId, revision]),
  };
}

export async function commitRemittance<T>(command: Receipt & { result: z.ZodType<T> }, body: object, batchId?: number) {
  try {
    // A batch PATCH or POST owns the clearing journal, guarded target writes and claims.
    await writeRemittanceBatch(body, batchId);
  } catch (cause) {
    const prior = await findSavingsCommand(command);
    if (prior) return prior;
    if (cause instanceof CooperativeDirectusError && (cause.status < 500 ||
      /unique|duplicate|already exists|deadlock/i.test(cause.detail ?? ""))) throw remittanceStale();
    throw new LoanError(503, "Posting could not be confirmed. Retry the same confirmation to check its result.", "REMITTANCE_RETRY");
  }
  const prior = await findSavingsCommand(command);
  if (!prior) throw new LoanError(503, "The posting result could not be verified. Retry the same confirmation.", "REMITTANCE_RETRY");
  return { ...prior, duplicate: false };
}

function batchInput(batch: RemittanceBatch): RemittanceInput {
  return { payrollRunId: batch.payroll_run_id, bankDate: batch.bank_date,
    bankReference: batch.bank_reference, bankAmount: batch.bank_amount };
}

function newBatch(input: RemittanceInput, cutoff: string, fileName: string, hash: string, origin: "FILE" | "INDIVIDUAL", actor: LoanActor) {
  return {
    origin, file_name: fileName, file_hash: hash, payroll_run_id: input.payrollRunId, cutoff_date: cutoff,
    bank_date: input.bankDate, bank_reference: input.bankReference, bank_amount: input.bankAmount, posted_amount: "0.00",
    created_at: cooperativeAuditTime(), created_by: actor.actorId, created_name: actor.actorName,
  };
}

function reviewedRows(review: RemittanceReview) {
  return review.rows.map(item => ({
    ...item.file, ...remittanceRowValues(item), amount: item.amount,
  }));
}

export async function getRemittanceDetail(batchId: number, refresh = false) {
  requireRemittanceRollout();
  const [batch, rows] = await Promise.all([readRemittanceBatch(batchId), readRemittanceLines(batchId)]);
  if (batch.state !== "REVIEW" || !refresh) return {
    batch, rows: rows.map(row => ({ ...row, amount: remittanceAmount(row.amount_input) })), review: null,
  };
  const input = batchInput(batch);
  const review = await reviewPayrollRemittance(input, rows);
  if (batch.cutoff_date !== review.cutoff) throw remittanceStale();
  return { batch, rows: reviewedRows(review), review: {
    fingerprint: review.fingerprint, canPost: review.canPost, eligibleAmount: review.eligibleAmount,
    difference: review.difference, bankTaken: review.bankTaken,
  } };
}

export async function previewRemittanceFile(form: FormData, actor: LoanActor) {
  requireRemittanceRollout();
  const input = parseRemittanceInput(remittanceInput, {
    payrollRunId: Number(form.get("payrollRunId")), bankDate: form.get("bankDate"),
    bankReference: form.get("bankReference"), bankAmount: form.get("bankAmount"),
  });
  const file = form.get("file");
  if (!(file instanceof File) || !/\.xlsx$/i.test(file.name) || file.size > 1_000_000) {
    throw new LoanError(422, "Choose an Excel .xlsx file of up to 1 MB.", "REMITTANCE_FILE");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const rows = readRemittanceFile(bytes);
  const review = await reviewPayrollRemittance(input, rows);
  const fields = newBatch(input, review.cutoff, file.name.slice(0, 255), createHash("sha256").update(bytes).digest("hex"), "FILE", actor);
  const batchId = await writeRemittanceBatch({
    ...fields, state: "REVIEW", lines: { create: review.rows.map(item => ({ ...item.file, ...remittanceRowValues(item) })) },
  });
  return { batch: { id: batchId, ...fields, state: "REVIEW" as const }, rows: reviewedRows(review), review: {
    fingerprint: review.fingerprint, canPost: review.canPost, eligibleAmount: review.eligibleAmount,
    difference: review.difference, bankTaken: review.bankTaken,
  } };
}

type PostContext = { id: number; review: RemittanceReview; input: RemittanceInput; existing: boolean; metadata?: object };

async function postReviewedBatch(command: Receipt & { result: typeof postingResult }, context: PostContext, actor: LoanActor) {
  const { id: batchId, review, input, existing } = context;
  if (!review.canPost || !review.bank || !review.due) {
    throw new LoanError(422, review.bankTaken ? "This bank receipt has already been used." :
      "Confirm only when the verified rows equal the bank receipt.", "REMITTANCE_BALANCE");
  }
  const now = new Date();
  if (todayManila(now) !== review.date) throw remittanceStale();
  const at = cooperativeAuditTime(now);
  const series = await nextRemittanceJournals(Number(review.date.slice(0, 4)), 1 + review.savings.length + review.loanPayments.length);
  const clearing = await prepareCooperativeJournal({
    type: postingAction, source: { type: "PAYROLL_REMITTANCE", id: batchId }, date: review.date, actor, now,
    reservedJournalNo: series.numbers[0], pairs: [{ debit: review.bank, credit: review.due, amount: review.eligibleAmount }],
    audit: ({ journalNo }) => ({ ...cooperativeAuditEvent(actor, {
      subject: { type: "PAYROLL_REMITTANCE", id: batchId }, action: "PAYROLL_REMITTANCE_POSTED",
      before: { status: "REVIEW" }, after: {
        status: "POSTED", amount: review.eligibleAmount, bankReference: input.bankReference, bankDate: input.bankDate,
        payrollRunId: input.payrollRunId, cutoffDate: review.cutoff, journalNo,
        rowsPosted: review.rows.filter(row => row.state === "READY").length,
        exceptions: review.rows.filter(row => row.state !== "READY").length,
      },
    }, now), actor_name: actor.actorName }),
  });
  const { journalId, journalNo } = clearing.numbers;
  const effects = new Map<number, Record<string, unknown>>();
  let numberIndex = 1;
  for (const group of review.savings) {
    const { member, rows, amount, balanceAfter } = group;
    const journal = await prepareCooperativeJournal({
      type: "SAVINGS_DEPOSIT", source: { type: "MEMBERSHIP", id: member.id }, date: review.date, actor, now,
      reservedJournalNo: series.numbers[numberIndex++],
      pairs: [{ debit: review.due, credit: review.liability!, amount }],
      audit: ({ journalNo }) => ({ ...cooperativeAuditEvent(actor, {
        subject: { type: "MEMBERSHIP", id: member.id }, action: "SAVINGS_DEPOSIT_POSTED",
        before: { savingsBalance: member.savings_balance },
        after: { savingsBalance: balanceAfter, amount, batchId, journalNo, channel: "PAYROLL" },
      }, now), actor_name: actor.actorName }),
    });
    const postingReceipt = {
      ...targetRemittanceReceipt(batchId, "SAVINGS_DEPOSIT", member.id, member.savings_revision, actor, now,
        { amount, balanceAfter, batchId, ...journal.numbers }, "savings"),
      membership_id: { id: member.id, savings_revision: member.savings_revision + 1, savings_balance: balanceAfter },
      journal_id: {
        ...journal.receipt.journal_id,
        savings_entries: { create: [{ membership_id: member.id, kind: "DEPOSIT", entry_date: review.date, amount,
          balance_after: balanceAfter, reference: input.bankReference, posted_at: at, posted_by: actor.actorId }] },
        ...nestedTransactionEntries({ id: journal.numbers.journalId, date: review.date, postedAt: at }, [
          { kind: "SAVINGS_DEPOSIT", channel: "PAYROLL", amount, memberId: member.id, receivedOn: input.bankDate, reference: input.bankReference },
        ]),
      },
    };
    rows.forEach((row, index) => effects.set(row.file.row_number, {
      journal_id: journal.numbers.journalId, journal_no: journal.numbers.journalNo,
      ...(index === 0 ? { posting_command_id: postingReceipt } : {}),
    }));
  }
  let individual: z.output<typeof postingResult>["loan"] = null;
  for (const group of review.loanPayments) {
    const prepared = await preparePayrollLoanPayment(group.review, actor, now, series.numbers[numberIndex++]);
    const result = prepared.result;
    const postingReceipt = {
      ...targetRemittanceReceipt(batchId, "LOAN_PAYMENT", result.loanId, group.review.preview.revision, actor, now,
        { ...result, batchId }, "loan"),
      ...prepared.receipt,
      loan_id: { ...prepared.changes, id: result.loanId, revision: group.review.preview.revision + 1,
        updated_at: at, updated_by: actor.actorId },
    };
    group.rows.forEach((row, index) => effects.set(row.file.row_number, {
      journal_id: result.journalId, journal_no: result.journalNo, payment_id: result.paymentId,
      ...(index === 0 ? { posting_command_id: postingReceipt } : {}),
    }));
    if (!existing) individual = result;
  }
  const result = { id: batchId, amount: review.eligibleAmount, journalNo, loan: individual };
  const lines = review.rows.map(item => {
    const { file, key } = item;
    const values = remittanceRowValues(item);
    return {
      ...(existing ? { id: file.id } : file), ...values,
      ...(item.state === "READY" ? { ...effects.get(file.row_number), state: "POSTED", deduction_key: key } : {}),
    };
  });
  return commitRemittance(command, {
    ...(existing ? {} : { id: batchId, ...context.metadata }),
    state: "POSTED", bank_key: review.bankKey, posted_amount: review.eligibleAmount,
    posted_at: at, posted_by: actor.actorId, posted_name: actor.actorName,
    clearing_journal_id: journalId, clearing_journal_no: journalNo,
    posting_command_id: { ...remittanceBatchReceipt(batchId, command, actor, now, result), ...clearing.receipt, journal_series_id: series.reference },
    lines: existing ? { update: lines } : { create: lines },
  }, existing ? batchId : undefined);
}

export async function postRemittanceFile(batchId: number, payload: unknown, actor: LoanActor) {
  requireRemittanceRollout();
  const data = parseRemittanceInput(remittanceConfirmation, payload);
  const command = { type: postingAction, key: data.requestKey, hash: loanDigest([actor.actorId, batchId, data]), result: postingResult };
  const prior = await findSavingsCommand(command);
  if (prior) return prior;
  const [batch, rows] = await Promise.all([readRemittanceBatch(batchId), readRemittanceLines(batchId)]);
  if (batch.state !== "REVIEW") {
    const saved = await findSavingsCommand(command);
    if (saved) return saved;
    throw remittanceStale();
  }
  const input = batchInput(batch);
  const review = await reviewPayrollRemittance(input, rows);
  if (review.fingerprint !== data.fingerprint || review.cutoff !== batch.cutoff_date) {
    const saved = await findSavingsCommand(command);
    if (saved) return saved;
    throw remittanceStale();
  }
  return postReviewedBatch(command, { id: batchId, review, input, existing: true }, actor);
}

const individualInput = remittanceInput.extend({
  deductionReference: z.string().trim().max(120).default(""),
});

async function reviewIndividualPayment(loanId: number, data: z.output<typeof individualInput>) {
  const [loanRecord] = await remittanceRows("cooperative_loans",
    z.object({ loan_no: z.string(), member_no: z.string().nullable() }), "loan_no,member_no", { id: { _eq: loanId } }, 1);
  if (!loanRecord) throw new LoanError(404, "The loan is unavailable.");
  const row: RemittanceFileRow = {
    row_number: 1, employee_number: loanRecord.member_no ?? "", deduction_code: loanDeductionCode, amount_input: data.bankAmount,
    reference: data.deductionReference || loanRecord.loan_no, input_error: null,
  };
  const review = await reviewPayrollRemittance(data, [row], loanId);
  if (review.bankTaken) throw new LoanError(409, "This bank receipt has already been used.", "LOAN_REMITTANCE_DUPLICATE");
  const loan = review.loanPayments[0];
  if (!loan || !review.canPost) throw new LoanError(422, review.rows[0].message ?? "Verify the payroll deduction before posting.", "REMITTANCE_PAYMENT");
  return { review, preview: { ...loan.review.preview, fingerprint: review.fingerprint } };
}

const parseIndividual = (payload: unknown) => {
  const body = parseRemittanceInput(z.object({
    payrollRunId: id, amount: z.string(), receiptDate: z.string(), reference: z.string(), deductionReference: z.string().optional(),
    confirmed: z.literal(true),
  }), payload);
  return parseRemittanceInput(individualInput, {
    payrollRunId: body.payrollRunId, bankDate: body.receiptDate, bankReference: body.reference,
    bankAmount: body.amount, deductionReference: body.deductionReference,
  });
};

export async function previewIndividualRemittance(loanId: number, payload: unknown) {
  requireRemittanceRollout();
  const input = parseIndividual(payload);
  return (await reviewIndividualPayment(loanId, input)).preview;
}

export async function postIndividualRemittance(loanId: number, payload: unknown, actor: LoanActor) {
  requireRemittanceRollout();
  const input = parseIndividual(payload);
  const confirmation = parseRemittanceInput(remittanceConfirmation.extend({ revision: z.number().int().nonnegative() }), payload);
  const command = { type: postingAction, key: confirmation.requestKey, hash: loanDigest([actor.actorId, loanId, input, confirmation]), result: postingResult };
  const prior = await findSavingsCommand(command);
  if (prior?.loan) return prior.loan;
  const checked = await reviewIndividualPayment(loanId, input).catch(async error => {
    const saved = await findSavingsCommand(command);
    if (saved?.loan) return saved;
    throw error;
  });
  if ("duplicate" in checked && checked.loan) return checked.loan;
  if (!("review" in checked) || checked.preview.fingerprint !== confirmation.fingerprint || checked.preview.revision !== confirmation.revision) {
    throw remittanceStale();
  }
  const result = await postReviewedBatch(command, {
    id: randomInt(100_000_000, 2_000_000_000), review: checked.review, input, existing: false,
    metadata: newBatch(input, checked.review.cutoff, "Individual loan payment", loanDigest([input, loanId]), "INDIVIDUAL", actor),
  }, actor);
  if (!result.loan) throw new LoanError(503, "The posted loan payment could not be verified.");
  return result.loan;
}

export type RemittancePreview = Awaited<ReturnType<typeof previewRemittanceFile>>;
export type RemittanceDetail = Awaited<ReturnType<typeof getRemittanceDetail>>;
export type RemittanceResult = z.output<typeof postingResult>;
