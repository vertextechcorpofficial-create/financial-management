import "server-only";

import { z } from "zod";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { loanDigest, nextRemittanceJournals, prepareCooperativeJournal,
  readLoanJournalLines, type GlLine, type LoanActor } from "./loan-commands";
import { preparePayrollLoanReversal, reviewLoanPaymentReversal } from "./loan-payments";
import { LoanError, readLoansForRemittance } from "./loans";
import { todayManila } from "./member-read";
import { remittanceAmount } from "./payroll-remittance-file";
import { readRemittanceBatch, readRemittanceLines, requireRemittanceRollout, type StoredRemittanceLine } from "./payroll-remittance-store";
import { commitRemittance, parseRemittanceInput, remittanceBatchReceipt, remittanceConfirmation, remittanceStale,
  targetRemittanceReceipt } from "./payroll-remittances";
import { getPolicies } from "./policies";
import { findSavingsCommand } from "./savings-commands";
import { nestedTransactionEntries } from "./transaction-index";
import { calculateWithdrawalBalance } from "./withdrawal-balances";
import { readWithdrawalSnapshots, withdrawalId as id } from "./withdrawal-store";

const reversalType = "PAYROLL_REMITTANCE_REVERSED";
const resultSchema = z.object({ id, journalNo: z.string(), amount: z.string() });

function validatedLines(lines: GlLine[] | undefined, amount: bigint) {
  if (!lines?.length || lines.reduce((sum, row) => sum + amountToCents(row.debit), 0n) !== amount ||
    lines.reduce((sum, row) => sum + amountToCents(row.credit), 0n) !== amount) {
    throw new LoanError(503, "The original payroll journals and amounts could not be reconciled.");
  }
  return lines;
}

function postedGroups(rows: StoredRemittanceLine[]) {
  const groups = new Map<number, StoredRemittanceLine[]>();
  for (const row of rows) {
    if (row.state !== "POSTED") continue;
    if (!row.journal_id || !row.membership_id || !row.journal_no || !row.deduction_key ||
      (row.loan_id === null) !== (row.payment_id === null)) {
      throw new LoanError(503, "A posted remittance row is missing its accounting links.");
    }
    const group = groups.get(row.journal_id) ?? [];
    group.push(row);
    groups.set(row.journal_id, group);
  }
  return groups;
}

async function reviewReversal(batchId: number) {
  const [batch, rows] = await Promise.all([readRemittanceBatch(batchId), readRemittanceLines(batchId)]);
  if (batch.state !== "POSTED" || !batch.clearing_journal_id || !batch.clearing_journal_no) {
    throw new LoanError(409, "Choose a posted batch that still has its original bank clearing journal.", "REMITTANCE_REVERSE");
  }
  const groups = postedGroups(rows);
  const date = todayManila();
  const targets = [...groups.values()].map(group => group[0]);
  const [lines, snapshots, loans, policy] = await Promise.all([
    readLoanJournalLines([batch.clearing_journal_id, ...groups.keys()]),
    readWithdrawalSnapshots(targets.filter(row => !row.loan_id).map(row => row.membership_id!)),
    readLoansForRemittance(targets.flatMap(row => row.loan_id ?? []), date),
    getPolicies(),
  ]);
  const clear = validatedLines(lines.get(batch.clearing_journal_id), amountToCents(batch.posted_amount));
  const savings = new Map(snapshots.map(snapshot => [snapshot.membershipId, snapshot]));
  const payments = [];
  const deposits = [];
  let total = 0n;
  for (const [journalId, group] of groups) {
    const first = group[0];
    if (group.some(row => row.loan_id !== first.loan_id || row.membership_id !== first.membership_id || row.payment_id !== first.payment_id)) {
      throw new LoanError(503, "A payroll journal references inconsistent payment or savings records.");
    }
    const amount = validatedRowTotal(group);
    total += amount;
    const journalLines = validatedLines(lines.get(journalId), amount);
    if (first.loan_id && first.payment_id) {
      const loan = loans.get(first.loan_id);
      if (!loan) throw new LoanError(409, "A loan in this batch is no longer available for correction.");
      const review = await reviewLoanPaymentReversal(first.loan_id, first.payment_id, loan);
      if (review.original.journalId !== journalId || amountToCents(review.preview.amount) !== amount) {
        throw new LoanError(503, "A loan payment does not agree with its remittance journal.");
      }
      payments.push({ first, rows: group, review });
      continue;
    }
    const snapshot = savings.get(first.membership_id!)!;
    const balance = calculateWithdrawalBalance(snapshot);
    const after = amountToCents(balance.postedSavings) - amount;
    const reserved = amountToCents(balance.pendingAmount);
    if (snapshot.status !== "ACTIVE" || after < 0n || (reserved > 0n && after < reserved + amountToCents(balance.maintainingBalance))) {
      throw new LoanError(409, `${first.member_name ?? "A member"} has insufficient uncommitted savings to reverse this batch.`, "REMITTANCE_REVERSE");
    }
    deposits.push({ first, rows: group, snapshot, balanceAfter: centsToAmount(after), amount: centsToAmount(amount),
      journalId, journalLines });
  }
  if (total !== amountToCents(batch.posted_amount)) throw new LoanError(503, "The posted batch total does not agree with its entries.");
  const preview = {
    amount: batch.posted_amount, originalJournal: batch.clearing_journal_no, date,
    journals: [batch.clearing_journal_no, ...targets.map(row => row.journal_no!)],
    fingerprint: loanDigest([batch.id, date, clear, policy.revision, deposits.map(group => [group.journalId, group.snapshot, group.balanceAfter]),
      payments.map(group => group.review.preview.fingerprint)]),
  };
  return { batch, clear, deposits, payments, preview, policy };
}

function validatedRowTotal(group: StoredRemittanceLine[]) {
  // Use the same half-up centavos conversion used during preview and confirmation.
  return group.reduce((sum, row) => {
    const amount = remittanceAmount(row.amount_input);
    if (!amount) throw new LoanError(503, "A posted remittance row is missing its verified amount.");
    return sum + amountToCents(amount);
  }, 0n);
}

export async function getRemittanceReversalPreview(batchId: number) {
  requireRemittanceRollout();
  return (await reviewReversal(batchId)).preview;
}

export async function reverseRemittance(batchId: number, payload: unknown, actor: LoanActor) {
  requireRemittanceRollout();
  const data = parseRemittanceInput(remittanceConfirmation.extend({ reason: z.string().trim().min(1).max(500) }), payload);
  const command = { type: reversalType, key: data.requestKey, hash: loanDigest([actor.actorId, batchId, data]), result: resultSchema };
  const prior = await findSavingsCommand(command);
  if (prior) return prior;
  const checked = await reviewReversal(batchId).catch(async cause => {
    const saved = await findSavingsCommand(command);
    if (saved) return saved;
    throw cause;
  });
  if ("duplicate" in checked) return checked;
  const { batch, clear, deposits, payments, preview, policy } = checked;
  if (preview.fingerprint !== data.fingerprint) throw remittanceStale();
  const now = new Date();
  if (todayManila(now) !== preview.date) throw remittanceStale();
  const at = cooperativeAuditTime(now);
  const date = preview.date;
  const series = await nextRemittanceJournals(Number(date.slice(0, 4)), 1 + deposits.length + payments.length);
  const clearing = await prepareCooperativeJournal({
    type: reversalType, source: { type: "PAYROLL_REMITTANCE", id: batchId }, date, actor, now, pairs: [],
    reservedJournalNo: series.numbers[0], reversal: { journalId: batch.clearing_journal_id!, lines: clear },
    audit: ({ journalNo }) => ({ ...cooperativeAuditEvent(actor, {
      subject: { type: "PAYROLL_REMITTANCE", id: batchId }, action: reversalType,
      before: { state: "POSTED", journalNo: batch.clearing_journal_no }, after: { state: "REVERSED", journalNo, amount: preview.amount },
      reason: data.reason,
    }, now), actor_name: actor.actorName }),
  });
  let numberIndex = 1;
  const changes = [];
  for (const group of deposits) {
    const { first, snapshot, balanceAfter, amount } = group;
    const memberId = snapshot.membershipId;
    const type = "SAVINGS_DEPOSIT_REVERSED";
    const reversed = await prepareCooperativeJournal({
      type, source: { type: "MEMBERSHIP", id: memberId }, date, actor, now, pairs: [],
      reservedJournalNo: series.numbers[numberIndex++], reversal: { journalId: group.journalId, lines: group.journalLines },
      audit: ({ journalNo }) => ({ ...cooperativeAuditEvent(actor, {
        subject: { type: "MEMBERSHIP", id: memberId }, action: type,
        before: { savingsBalance: snapshot.postedSavings }, after: { savingsBalance: balanceAfter, batchId, journalNo, amount },
        reason: data.reason,
      }, now), actor_name: actor.actorName }),
    });
    const command = {
      ...targetRemittanceReceipt(batchId, type, memberId, snapshot.revision, actor, now, {
        amount, balanceAfter, batchId, ...reversed.numbers,
      }, "savings"),
      membership_id: { id: memberId, savings_revision: snapshot.revision + 1, savings_balance: balanceAfter },
      journal_id: {
        ...reversed.receipt.journal_id,
        savings_entries: { create: [{
          membership_id: memberId, kind: "OFFSET", entry_date: date, amount, balance_after: balanceAfter,
          reference: reversed.numbers.journalNo, posted_at: at, posted_by: actor.actorId,
        }] },
        ...nestedTransactionEntries({ id: reversed.numbers.journalId, date, postedAt: at }, [{
          kind: type, channel: "PAYROLL", amount, memberId, receivedOn: date, reference: batch.bank_reference,
          sourceReference: first.journal_no,
        }]),
      },
    };
    changes.push(...reversedRows(group.rows, reversed.numbers, command));
  }
  for (const group of payments) {
    const prepared = await preparePayrollLoanReversal(group.review, data.reason, actor, now, series.numbers[numberIndex++], policy);
    const result = prepared.result;
    const command = {
      ...targetRemittanceReceipt(batchId, "LOAN_PAYMENT_REVERSED", result.loanId, group.review.preview.revision, actor, now,
        { ...result, batchId }, "loan"),
      ...prepared.receipt,
      loan_id: { ...prepared.changes, id: result.loanId, revision: group.review.preview.revision + 1, updated_at: at, updated_by: actor.actorId },
    };
    changes.push(...reversedRows(group.rows, result, command));
  }
  const result = { id: batchId, amount: preview.amount, journalNo: clearing.numbers.journalNo };
  return commitRemittance(command, {
    state: "REVERSED", reversed_at: at, reversed_by: actor.actorId, reversed_name: actor.actorName, reversal_reason: data.reason,
    reversal_journal_id: clearing.numbers.journalId, reversal_journal_no: clearing.numbers.journalNo,
    reversing_command_id: { ...remittanceBatchReceipt(batchId, command, actor, now, result), ...clearing.receipt, journal_series_id: series.reference },
    lines: { update: changes },
  }, batchId);
}

function reversedRows(rows: StoredRemittanceLine[], journal: { journalId: number; journalNo: string }, command: object) {
  return rows.map((row, index) => ({
    id: row.id, state: "REVERSED", reversal_journal_id: journal.journalId, reversal_journal_no: journal.journalNo,
    ...(index === 0 ? { reversing_command_id: command } : {}),
  }));
}

export type RemittanceReversalPreview = Awaited<ReturnType<typeof getRemittanceReversalPreview>>;
