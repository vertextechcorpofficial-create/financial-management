import "server-only";

import { z } from "zod";
import { projectLoanLedger, type LoanLedger, type LoanMovement } from "../loans/loan-activity";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { cooperativeAuditTime } from "./audit";
import { settlementReversalRecord } from "./clearance-records";
import { ClearanceError, readClearance } from "./clearance-store";
import {
  buildClearanceJournals, clearanceAudit, commitSettlement, confirmation, loanSettlementChanges,
  settlementChanged, settlementChild, settlementCommand, type ClearanceJournal,
} from "./clearance-writes";
import { readDirectusItems } from "./directus";
import { loanDigest, loanPostingEnabled, readLoanJournalLines, type LoanActor } from "./loan-commands";
import { readMemberLoans } from "./loans";
import { readPostedSavingsThrough, todayManila } from "./member-read";

const reversalInput = confirmation.extend({ reason: z.string().trim().min(1).max(500), confirmed: z.literal(true) });
const blocked = () => new ClearanceError(409, "Reconcile linked payouts, collections, or other later postings before reversing this settlement.", "CLEARANCE_REVERSAL_BLOCKED");
const timestamp = (value: string) => Date.parse(value.endsWith("Z") ? value : value + "Z");

function reverseLoanLedger(ledger: LoanLedger, reference: string, date: string, movements: LoanMovement[]): LoanLedger {
  return {
    ...ledger, movements: [...ledger.movements, ...movements],
    installments: ledger.installments.map(item => item.settlementWaiver?.reference === reference
      ? { ...item, settlementWaiver: { ...item.settlementWaiver, reversedOn: date } }
      : item),
  };
}

async function reviewReversal(id: number) {
  if (!loanPostingEnabled()) throw new ClearanceError(409, "Settlement reversals are pending rollout in this environment.");
  const row = await readClearance(id);
  const record = row.settlement_snapshot;
  if (row.status !== "COMPLETED" || !record?.journals.length || row.reversal_snapshot || row.membership_id.status !== "SEPARATED") {
    throw new ClearanceError(409, "This clearance has no reversible settlement.", "CLEARANCE_REVERSAL_UNAVAILABLE");
  }
  const date = todayManila();
  if (record.date > date) throw blocked();
  const ids = record.journals.map(journal => journal.id);
  const query = new URLSearchParams({ fields: "id,journal_no,source_type,source_id,command_type,reverses_journal_id", limit: String(ids.length + 1),
    filter: JSON.stringify({ _or: [
      { source_type: { _eq: "CLEARANCE" }, source_id: { _eq: String(id) } },
      { reverses_journal_id: { _in: ids } },
      { id: { _in: ids } },
    ] }) });
  const [raw, lines, source, savings] = await Promise.all([
    readDirectusItems("cooperative_journals", query), readLoanJournalLines(ids),
    readMemberLoans([row.membership_id.id], "9999-12-31"),
    readPostedSavingsThrough(row.membership_id.id, "9999-12-31"),
  ]);
  if (source.state !== "ready") throw new ClearanceError(503, source.message);
  if (savings !== "0.00" || row.membership_id.savings_balance !== "0.00") throw blocked();
  const { data } = z.object({ data: z.array(z.object({
    id: z.number(), journal_no: z.string(), source_type: z.string(), source_id: z.string(),
    command_type: z.string(), reverses_journal_id: z.number().nullable(),
  })) }).parse(raw);
  if (data.length !== ids.length || data.some(journal => journal.reverses_journal_id !== null || journal.source_type !== "CLEARANCE" ||
    journal.source_id !== String(id) || journal.command_type !== "CLEARANCE_SETTLEMENT")) throw blocked();

  const active = new Map(record.loans.map(loan => [loan.id, loan.remaining]));
  for (const waiver of record.interestWaivers) if (!active.has(waiver.loanId)) active.set(waiver.loanId, "0.00");
  const reviewed = source.data.filter(view => active.has(view.loan.id)).sort((a, b) => a.loan.id - b.loan.id).map(view => {
    const { ledger, position, loan } = view;
    if (!ledger || !position || centsToAmount(amountToCents(position.remaining) + amountToCents(position.penalties)) !== active.get(loan.id) ||
      ledger.movements.some(move => !ids.includes(move.journalId) &&
        (move.date > record.date || timestamp(move.postedAt) > timestamp(record.postedAt)))) throw blocked();
    const payments = ledger.movements.filter(move => move.kind === "OFFSET" && move.reversesId === null && ids.includes(move.journalId));
    const synthetic = payments.map((move, index) => ({ ...move, id: -index - 1, date, postedAt: `${date}T23:59:59`, reversesId: move.id }));
    const after = projectLoanLedger(reverseLoanLedger(ledger, row.clearance_no, date, synthetic), date);
    return { view, ledger, payments,
      remaining: centsToAmount(amountToCents(after.remaining) + amountToCents(after.penalties)) };
  });
  if (reviewed.length !== active.size) throw blocked();

  const drafts: ClearanceJournal[] = [...record.journals].reverse().map(journal => {
    const original = data.find(row => row.id === journal.id && row.journal_no === journal.number);
    const posted = lines.get(journal.id) ?? [];
    const debit = posted.reduce((sum, line) => sum + amountToCents(line.debit), 0n);
    const credit = posted.reduce((sum, line) => sum + amountToCents(line.credit), 0n);
    if (!original || debit !== amountToCents(journal.amount) || debit !== credit || posted.length < 2) throw blocked();
    return {
      category: journal.category, amount: journal.amount, pairs: [], original: { id: journal.id, number: journal.number, lines: posted },
      offsets: reviewed.flatMap(({ view, payments }) => payments.filter(payment => payment.journalId === journal.id)
        .map(payment => ({ loanId: view.loan.id, allocations: payment.allocations, reversesId: payment.id }))),
    };
  });
  const current = await readClearance(id);
  if (current.revision !== row.revision || current.membership_id.savings_revision !== row.membership_id.savings_revision) throw settlementChanged();
  const loans = reviewed.map(({ view, remaining }) => ({ id: view.loan.id, reference: view.loan.loanNo, remaining }));
  const fingerprint = loanDigest([id, date, row.revision, row.membership_id.savings_revision, drafts,
    reviewed.map(({ view }) => [view.loan.id, view.revision]), loans]);
  return {
    row, record, drafts, reviewed,
    preview: {
      reference: row.clearance_no, date, fingerprint, journals: record.journals,
      savingsRestored: record.savingsBefore, finalPayWithholdingReversed: record.finalPayApplied,
      refundPayableReversed: record.refund, loans,
    },
  };
}

export async function getSettlementReversalPreview(id: number) {
  return (await reviewReversal(id)).preview;
}

export type SettlementReversalPreview = Awaited<ReturnType<typeof getSettlementReversalPreview>>;

export async function reverseClearanceSettlement(id: number, body: unknown, actor: LoanActor) {
  if (!loanPostingEnabled()) throw new ClearanceError(409, "Settlement reversals are pending rollout in this environment.");
  const input = reversalInput.safeParse(body);
  if (!input.success) throw new ClearanceError(422, "Enter a reason and confirm the current settlement reversal.");
  const { reason, fingerprint } = input.data;
  const command = settlementCommand("CLEARANCE_REVERSED", id, actor, input.data);
  return commitSettlement(command, actor, async () => {
    const { row, preview, drafts, reviewed } = await reviewReversal(id);
    if (preview.fingerprint !== fingerprint) throw settlementChanged(preview);
    const { date } = preview;
    const now = new Date();
    const built = await buildClearanceJournals(drafts, row, command, actor, now, date, reason);
    if (built.savingsAfter !== preview.savingsRestored) throw blocked();
    for (const { view, ledger, remaining } of reviewed) {
      const loanId = view.loan.id;
      const moves = built.paymentsByLoan.get(loanId) ?? [];
      const adjusted = reverseLoanLedger(ledger, row.clearance_no, date, moves);
      const changed = new Set(moves.flatMap(move => move.allocations.map(item => item.installmentId)));
      for (const item of adjusted.installments) if (item.settlementWaiver?.reference === row.clearance_no) changed.add(item.id);
      const applied = loanSettlementChanges(view, adjusted, date, now, actor, changed, true);
      if (applied.after !== remaining) throw blocked();
      const result = { status: applied.status, remaining, clearance: row.clearance_no };
      built.records.push({
        ...settlementChild(command, "CLEARANCE_LOAN_REVERSAL", loanId, actor, now, result),
        loan_revision_key: loanDigest([loanId, view.revision]),
        loan_id: { ...applied.changes, last_event_id: clearanceAudit(actor, now, {
          subject: { type: "LOAN", id: loanId }, action: "CLEARANCE_LOAN_REVERSED",
          before: { status: view.loan.status }, after: result, reason,
        }) },
      });
    }
    const reversal = settlementReversalRecord.parse({
      date, postedAt: cooperativeAuditTime(now), postedBy: actor.actorId, postedByName: actor.actorName, reason,
      savingsRestored: built.savingsAfter, loans: preview.loans, journals: built.journals,
    });
    const journals = reversal.journals.map(journal => journal.number);
    return {
      row, now, date, journals, records: built.records, series: built.series,
      clearance: { reversal_snapshot: reversal },
      membership: { savings_balance: built.savingsAfter },
      audit: clearanceAudit(actor, now, {
        subject: { type: "CLEARANCE", id }, action: "CLEARANCE_REVERSED", reason,
        after: { accountingStatus: "REVERSED", savingsRestored: reversal.savingsRestored, journals },
      }),
    };
  });
}
