import "server-only";

import { z } from "zod";
import { cooperativeAuditTime } from "./audit";
import { settlementRecord } from "./clearance-records";
import { clearanceFinalPay, reviewSettlement } from "./clearance-settlement";
import { ClearanceError } from "./clearance-store";
import {
  buildClearanceJournals, clearanceAudit, commitSettlement, confirmation, loanSettlementChanges,
  settlementChanged, settlementChild, settlementCommand, type SettlementOffset,
} from "./clearance-writes";
import { loanDigest, loanPostingEnabled, type LoanActor } from "./loan-commands";

const settlementInput = confirmation.extend({ reviewedWithMemberAndHr: z.literal(true) });

export async function settleClearance(id: number, body: unknown, actor: LoanActor) {
  if (!loanPostingEnabled()) throw new ClearanceError(409, "Settlement posting is pending rollout in this environment.");
  const input = settlementInput.safeParse(body);
  if (!input.success) throw new ClearanceError(422, "Confirm that you reviewed the current settlement with the member and HR.");
  const command = settlementCommand("CLEARANCE_SETTLED", id, actor, input.data);
  return commitSettlement(command, actor, async () => {
    const review = await reviewSettlement(id);
    const { row, preview, amounts, reviewed } = review;
    if (preview.fingerprint !== input.data.fingerprint) throw settlementChanged(preview);
    const finalPay = clearanceFinalPay(row);
    const { funding, dividend, annualRate } = amounts;
    if (!preview.confirmable || !funding || !finalPay || dividend === null || annualRate === null) {
      throw new ClearanceError(422, preview.issues[0] ?? "Complete the settlement review before posting.", "CLEARANCE_BLOCKED");
    }
    const now = new Date();
    const date = preview.postingDate;
    const memberId = row.membership_id.id;
    const reference = row.clearance_no;
    const at = cooperativeAuditTime(now);
    const offsets = { SAVINGS_OFFSET: new Map<number, SettlementOffset>(), SETTLEMENT_WITHHOLDING: new Map<number, SettlementOffset>() };
    const installmentIds = new Map(reviewed.map(({ view, ledger }) => [
      view.loan.id, new Map(ledger.installments.map(item => [item.no, item.id])),
    ]));
    for (const item of amounts.allocations) {
      const { loanId, installmentNo } = item;
      const installmentId = installmentIds.get(loanId)?.get(installmentNo);
      if (!installmentId) throw settlementChanged();
      const group = item.source === "SAVINGS" ? offsets.SAVINGS_OFFSET : offsets.SETTLEMENT_WITHHOLDING;
      const entry = group.get(loanId) ?? { loanId, allocations: [] };
      entry.allocations.push({ installmentId, principal: item.principal, interest: item.interest, penalty: item.penalty });
      group.set(loanId, entry);
    }
    const built = await buildClearanceJournals(review.journals.map(journal => ({
      ...journal,
      offsets: journal.category === "SAVINGS_OFFSET" || journal.category === "SETTLEMENT_WITHHOLDING"
        ? [...offsets[journal.category].values()] : [],
    })), row, command, actor, now, date);
    if (built.savingsAfter !== "0.00") throw settlementChanged();

    const affected = new Map(reviewed.map(loan => [loan.view.loan.id, loan]));
    const loanTotals = new Map(amounts.loans.map(loan => [loan.id, loan]));
    for (const view of review.views.filter(({ loan }) => loan.status !== "REJECTED")) {
      const loanId = view.loan.id;
      const reviewedLoan = affected.get(loanId);
      let loan = { id: loanId, revision: view.revision + 1, updated_at: at, updated_by: actor.actorId } as Record<string, unknown>;
      let result = { clearance: reference } as Record<string, unknown>;
      if (reviewedLoan) {
        const movements = built.paymentsByLoan.get(loanId) ?? [];
        const changed = new Set(movements.flatMap(move => move.allocations.map(item => item.installmentId)));
        const waivers = new Map(amounts.interestWaivers.filter(item => item.loanId === loanId).map(item => [item.installmentNo, item.amount]));
        const installments = reviewedLoan.ledger.installments.map(item => {
          const amount = waivers.get(item.no);
          if (!amount) return item;
          changed.add(item.id);
          return { ...item, settlementWaiver: { amount, date, reference, reversedOn: null } };
        });
        const ledger = { ...reviewedLoan.ledger, installments, movements: [...reviewedLoan.ledger.movements, ...movements] };
        const applied = loanSettlementChanges(view, ledger, date, now, actor, changed, false);
        if (applied.after !== (loanTotals.get(loanId)?.remaining ?? "0.00")) throw settlementChanged();
        result = { ...result, status: applied.status, remaining: applied.after, provision: review.provision.get(loanId) ?? "0.00" };
        loan = { ...applied.changes };
        if (changed.size || view.loan.status !== applied.status) {
          loan.last_event_id = clearanceAudit(actor, now, {
            subject: { type: "LOAN", id: loanId }, action: applied.status === "DEFAULTED" ? "CLEARANCE_LOAN_ENDORSED" : "CLEARANCE_LOAN_SETTLED",
            before: { status: view.loan.status }, after: { status: applied.status, clearance: reference, remaining: applied.after },
          });
        }
      }
      built.records.push({
        ...settlementChild(command, "CLEARANCE_LOAN", loanId, actor, now, result),
        loan_revision_key: loanDigest([loanId, view.revision]), loan_id: loan,
      });
    }
    const decisionReason = `Cancelled by exit clearance ${reference}.`;
    const withdrawals = review.withdrawals.map(request => {
      const result = { status: "CANCELLED", clearance: reference, amount: request.amount };
      built.records.push({
        ...settlementChild(command, "CLEARANCE_WITHDRAWAL_CANCEL", request.id, actor, now, result),
        withdrawal_event_id: clearanceAudit(actor, now, {
          subject: { type: "WITHDRAWAL", id: request.id }, action: "WITHDRAWAL_CANCELLED",
          before: { status: "PENDING" }, after: result, reason: decisionReason,
        }),
      });
      return { id: request.id, status: "CANCELLED", decided_at: at, decided_by: actor.actorId, decision_reason: decisionReason };
    });
    const record = settlementRecord.parse({
      date, separationDate: row.separation_date, postedAt: at, postedBy: actor.actorId, postedByName: actor.actorName,
      fingerprint: preview.fingerprint, policyRevision: review.policyRevision, annualRate, savingsBefore: amounts.savings, dividend,
      savingsApplied: funding.savingsApplied, finalPayApplied: funding.finalPayApplied, debt: amounts.debt,
      remaining: funding.remaining, refund: funding.refund,
      loans: amounts.loans.map(loan => ({ ...loan, provision: review.provision.get(loan.id) ?? "0.00" })),
      allocations: amounts.allocations, interestWaivers: amounts.interestWaivers, withdrawals: review.withdrawals,
      documentIds: review.documents.map(item => item.id), finalPay, journals: built.journals,
    });
    const journals = record.journals.map(journal => journal.number);
    return {
      row, now, date, journals, records: built.records, series: built.series,
      enrollmentGuard: loanDigest([memberId, review.views.map(view => view.loan.id)]),
      clearance: { status: "COMPLETED", open_member_id: null, settlement_snapshot: record },
      membership: { status: "SEPARATED", savings_balance: built.savingsAfter, savings_per_cutoff: "0.00",
        ...(withdrawals.length ? { withdrawal_requests: { update: withdrawals } } : {}) },
      audit: {
        ...clearanceAudit(actor, now, {
          subject: { type: "CLEARANCE", id }, action: "CLEARANCE_SETTLED", before: { status: "DRAFT", membershipStatus: "ACTIVE" },
          after: { status: "COMPLETED", membershipStatus: "SEPARATED", memberId, reviewedWithMemberAndHr: true,
            separationDate: row.separation_date, debt: amounts.debt, remaining: record.remaining, refund: record.refund, journals },
        }),
        policy_revision: review.policyRevision + 1,
      },
    };
  });
}
