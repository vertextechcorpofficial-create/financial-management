import "server-only";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { projectLoanLedger, type LoanLedger, type LoanMovement } from "../loans/loan-activity";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import type { SettlementJournalDraft } from "./clearance-journals";
import { ClearanceError, type ClearanceRow } from "./clearance-store";
import { cooperativeDirectus, CooperativeDirectusError } from "./directus";
import { loanDigest, nextRemittanceJournals, prepareCooperativeJournal, type GlLine, type LoanActor } from "./loan-commands";
import type { MemberLoanView } from "./loans";
import { todayManila } from "./member-read";
import { findSavingsCommand, type SavingsCommand } from "./savings-commands";
import { nestedTransactionEntries } from "./transaction-index";

export const confirmation = z.object({ requestKey: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) });
const resultSchema = z.object({
  id: z.number().int().positive(), reference: z.string(), status: z.literal("COMPLETED"),
  revision: z.number().int().nonnegative(), journals: z.array(z.string()),
});
type Result = z.output<typeof resultSchema>;
type Command = SavingsCommand<Result>;
type Values = Record<string, unknown>;
export type SettlementOffset = { loanId: number; allocations: LoanMovement["allocations"]; reversesId?: number };
export type ClearanceJournal = SettlementJournalDraft & {
  offsets?: SettlementOffset[];
  original?: { id: number; number: string; lines: GlLine[] };
};

export function clearanceAudit(actor: LoanActor, now: Date, change: Parameters<typeof cooperativeAuditEvent>[1]) {
  return { ...cooperativeAuditEvent(actor, change, now), actor_name: actor.actorName };
}

type Changes = {
  row: ClearanceRow; now: Date; date: string; journals: string[];
  clearance: Values; membership: Values; audit: Values; records: Values[]; series?: Values;
  enrollmentGuard?: string;
};

export function settlementChanged(preview?: unknown) {
  return new ClearanceError(409, "The settlement changed. Review the refreshed figures and confirm again.",
    "CLEARANCE_STALE", undefined, preview);
}

export function settlementCommand(type: string, id: number, actor: LoanActor, input: z.output<typeof confirmation>): Command {
  return { type, key: input.requestKey, hash: loanDigest([id, actor.actorId, input]), result: resultSchema };
}

export async function commitSettlement(command: Command, actor: LoanActor, prepare: () => Promise<Changes>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const prior = await findSavingsCommand(command);
    if (prior) return prior;
    let mutation: Changes;
    try {
      mutation = await prepare();
    } catch (error) {
      const saved = await findSavingsCommand(command);
      if (saved) return saved;
      throw error;
    }
    const { row, date, now, clearance, membership, records, series, audit, enrollmentGuard, journals } = mutation;
    if (todayManila() !== date) throw settlementChanged();
    const at = cooperativeAuditTime(now);
    const member = row.membership_id;
    const result: Result = { id: row.id, reference: row.clearance_no, status: "COMPLETED", revision: row.revision + 1, journals };
    try {
      const response = await cooperativeDirectus(`/items/cooperative_clearances/${row.id}?fields=id`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...clearance, revision: result.revision, updated_at: at, updated_by: actor.actorId,
          last_event_id: audit,
          last_command_id: {
            clearance_id: row.id, command_type: command.type, idempotency_key: command.key, request_hash: command.hash,
            actor_user_id: actor.actorId, result, created_at: at, journal_series_id: series,
            clearance_revision_key: loanDigest([row.id, row.revision]),
            savings_revision_key: loanDigest([member.id, member.savings_revision]),
            loan_enrollment_guard_key: enrollmentGuard,
            membership_id: { ...membership, id: member.id, savings_revision: member.savings_revision + 1 },
          },
          ...(records.length ? { settlement_commands: { create: records } } : {}),
        }),
      }, 60_000);
      await response.body?.cancel();
      return { ...result, duplicate: false };
    } catch (error) {
      const saved = await findSavingsCommand(command);
      if (saved) return saved;
      if (!(error instanceof CooperativeDirectusError) || !/duplicate|unique|already exists|deadlock/i.test(error.detail ?? "")) {
        if (error instanceof CooperativeDirectusError && error.status < 500) {
          throw new ClearanceError(422, "Directus rejected the settlement. Review its records and try again.", "CLEARANCE_WRITE_REJECTED");
        }
        throw new ClearanceError(503, "The settlement could not be confirmed. Retry the same request to check the result.", "CLEARANCE_RETRY");
      }
    }
  }
  throw settlementChanged();
}

export function settlementChild(command: Command, type: string, identity: number, actor: LoanActor, now: Date, result: Values) {
  const idempotency = loanDigest([command.type, command.key, type, identity]);
  return {
    command_type: type, idempotency_key: idempotency, request_hash: command.hash,
    actor_user_id: actor.actorId, created_at: cooperativeAuditTime(now), result,
  };
}

export function savingsEffect(category: ClearanceJournal["category"], reversing: boolean) {
  if (category === "DIVIDEND") return reversing ? "OFFSET" : "DIVIDEND";
  if (category === "SAVINGS_OFFSET") return reversing ? "DEPOSIT" : "OFFSET";
  if (category === "SETTLEMENT_PAYABLE") return reversing ? "DEPOSIT" : "WITHDRAWAL";
  return null;
}

export async function buildClearanceJournals(
  drafts: ClearanceJournal[], row: ClearanceRow, command: Command, actor: LoanActor, now: Date, date: string,
  reason?: string,
) {
  const series = drafts.length ? await nextRemittanceJournals(Number(date.slice(0, 4)), drafts.length) : null;
  const records: Values[] = [];
  const paymentsByLoan = new Map<number, LoanMovement[]>();
  let balance = amountToCents(row.membership_id.savings_balance);
  const journals = [];
  for (const [index, draft] of drafts.entries()) {
    const { category, amount, original } = draft;
    const reversal = Boolean(original);
    const type = reversal ? "CLEARANCE_SETTLEMENT_REVERSED" : "CLEARANCE_SETTLEMENT";
    const at = cooperativeAuditTime(now);
    const posting = await prepareCooperativeJournal({
      type, source: { type: "CLEARANCE", id: row.id }, actor, date, now,
      reservedJournalNo: series!.numbers[index], pairs: draft.pairs,
      reversal: original ? { journalId: original.id, lines: original.lines } : undefined,
      audit: () => clearanceAudit(actor, now, {
        subject: { type: "CLEARANCE", id: row.id }, action: reversal ? "CLEARANCE_JOURNAL_REVERSED" : "CLEARANCE_JOURNAL_POSTED",
        after: { category, amount }, reason,
      }),
    });
    const { journalId, journalNo } = posting.numbers;
    const result = { id: journalId, number: journalNo, category, amount,
      ...(original ? { originalId: original.id, originalNumber: original.number } : {}) };
    journals.push(result);
    const memberId = row.membership_id.id;
    const kind = savingsEffect(category, reversal);
    if (kind) balance += amountToCents(amount) * (kind === "DEPOSIT" || kind === "DIVIDEND" ? 1n : -1n);
    if (balance < 0n) throw new ClearanceError(409, "The settlement would make the savings balance negative. Review the posted activity.");
    const savings = kind ? {
      membership_id: memberId, kind, entry_date: date, amount, balance_after: centsToAmount(balance),
      reference: reversal ? `Reversal of ${row.clearance_no}` : row.clearance_no, posted_at: at, posted_by: actor.actorId,
    } : null;
    const offsets = (draft.offsets ?? []).map(offset => {
      const id = randomInt(100_000_000, 2_000_000_000);
      const allocations = offset.allocations.map(item => ({
        installment_id: item.installmentId, principal: item.principal, interest: item.interest, penalty: item.penalty,
        total: centsToAmount(amountToCents(item.principal) + amountToCents(item.interest) + amountToCents(item.penalty)),
        created_at: at,
      }));
      const [principal, interest, penalty, total] = (["principal", "interest", "penalty", "total"] as const)
        .map(field => centsToAmount(allocations.reduce((sum, item) => sum + amountToCents(item[field]), 0n)));
      const records = paymentsByLoan.get(offset.loanId) ?? [];
      records.push({ id, journalId, journalNo, date, postedAt: at, kind: "OFFSET", channel: "CLEARANCE",
        reference: row.clearance_no, reversesId: offset.reversesId ?? null, allocations: offset.allocations });
      paymentsByLoan.set(offset.loanId, records);
      return {
        id, loan_id: offset.loanId, member_id: memberId, reference_no: row.clearance_no,
        amount: total, principal_amount: principal, interest_amount: interest, penalty_amount: penalty,
        channel: "PAYROLL", receipt_date: date, posted_at: at, posted_by: actor.actorId, status: "POSTED", created_at: at,
        reverses_payment_id: offset.reversesId ?? null, allocations: { create: allocations },
      };
    });
    if ((category === "SAVINGS_OFFSET" || category === "SETTLEMENT_WITHHOLDING") &&
      offsets.reduce((sum, item) => sum + amountToCents(item.amount), 0n) !== amountToCents(amount)) {
      throw new ClearanceError(503, "The loan allocations do not reconcile to the settlement journal.");
    }
    records.push({
      ...settlementChild(command, "CLEARANCE_JOURNAL", journalId, actor, now, result),
      journal_id: {
        ...posting.receipt.journal_id,
        ...(savings ? { savings_entries: { create: [savings] } } : {}),
        ...(offsets.length ? { loan_payments: { create: offsets } } : {}),
        ...nestedTransactionEntries({ id: journalId, date, postedAt: at }, [{
          memberId, kind: reversal ? "SETTLEMENT_REVERSED" : category, amount, channel: "SYSTEM",
          reference: original?.number, sourceReference: row.clearance_no,
        }]),
      },
    });
  }
  return { records, journals, paymentsByLoan, savingsAfter: centsToAmount(balance), series: series?.reference };
}

export function loanSettlementChanges(
  view: MemberLoanView, ledger: LoanLedger, date: string, now: Date, actor: LoanActor, updatedInstallments: Set<number>, reversing: boolean,
) {
  const position = projectLoanLedger(ledger, date);
  const after = centsToAmount(amountToCents(position.remaining) + amountToCents(position.penalties));
  const status = position.fullyPaid ? "FULLY_PAID" : "DEFAULTED";
  const at = cooperativeAuditTime(now);
  return { after, status, changes: {
    id: view.loan.id, revision: view.revision + 1, updated_by: actor.actorId, updated_at: at, status,
    installments: { update: position.installments.filter(item => updatedInstallments.has(item.id)).map(item => {
      const original = view.ledger?.installments.find(row => row.id === item.id);
      const lastPaidOn = ledger.movements.filter(movement => movement.reversesId === null &&
        !ledger.movements.some(reverse => reverse.reversesId === movement.id) &&
        movement.allocations.some(allocation => allocation.installmentId === item.id))
        .reduce<string | null>((last, movement) => last && last > movement.date ? last : movement.date, null);
      return {
        id: item.id, status: item.status, paid_total: item.paidTotal, paid_principal: item.paidPrincipal,
        paid_interest: item.paidInterest, penalty_paid: item.penaltyPaid, last_paid_on: lastPaidOn, updated_at: at,
        offset: !reversing,
        ...(original?.settlementWaiver !== item.settlementWaiver ? { settlement_waiver: item.settlementWaiver } : {}),
      };
    }) },
  } };
}
