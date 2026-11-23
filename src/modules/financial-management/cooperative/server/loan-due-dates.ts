import "server-only";

import { z } from "zod";
import { projectLoanLedger, type LoanLedger } from "../loans/loan-activity";
import { amountToCents, centsToAmount, daysBetween, isPastDue, penaltyDueForAssessment } from "../loans/loan-schedule";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { readDirectusItems } from "./directus";
import {
  loanDigest, loanPostingAccounts, loanPostingEnabled, prepareLoanJournal, readLoanJournalLines,
  readLoanJournalResults, requirePostingAccount, writeLoanCommand,
} from "./loan-commands";
import { LoanError, readLoanForChange } from "./loans";
import { todayManila } from "./member-read";
import { getPolicies } from "./policies";

const systemActor = { actorId: 0, actorRole: "SYSTEM", actorName: "Cooperative due-date job" };
async function prepaidIncome(ledger: LoanLedger, id: number, dueDate: string, through: string, incomeAccount: number) {
  const relevant = ledger.movements.filter(movement => movement.kind === "PAYMENT" && movement.date < dueDate && movement.allocations.some(
    allocation => allocation.installmentId === id && amountToCents(allocation.interest) > 0n,
  ) && movement.reversesId === null);
  if (!relevant.length) return 0n;
  const reversed = new Set(ledger.movements.filter(movement => movement.date <= through).map(movement => movement.reversesId));
  const originals = relevant.filter(movement => !reversed.has(movement.id));
  if (!originals.length) return 0n;
  const ids = originals.map(movement => movement.journalId);
  const [lines, results] = await Promise.all([readLoanJournalLines(ids), readLoanJournalResults(ids)]);
  const schedule = new Map(ledger.installments.map(row => [row.id, row.dueDate]));
  let recognized = 0n;
  for (const original of originals) {
    const result = results.get(original.journalId);
    const storedIncome = result?.prepaymentIncomeAccountId;
    const storedLine = result?.prepaymentCreditLine;
    const credit = (lines.get(original.journalId) ?? []).filter(row => row.account_id === (storedIncome ?? incomeAccount) &&
      (typeof storedLine !== "number" || row.line_no === storedLine))
      .reduce((sum, row) => sum + amountToCents(row.credit) - amountToCents(row.debit), 0n);
    if (credit === 0n && typeof storedLine !== "number") continue;
    const advanceInterest = original.allocations.reduce((sum, row) =>
      (schedule.get(row.installmentId) ?? "") > original.date ? sum + amountToCents(row.interest) : sum, 0n);
    if (credit !== advanceInterest) throw new LoanError(503, "A prepayment does not reconcile to the posted interest or markup income.");
    recognized += amountToCents(original.allocations.find(row => row.installmentId === id)?.interest);
  }
  return recognized;
}

type DueView = Awaited<ReturnType<typeof readLoanForChange>>;

function penaltyAssessment(view: DueView, item: NonNullable<DueView["position"]>["installments"][number], date: string) {
  if (!view.ledger || item.penaltyAssessedOn || amountToCents(item.penaltyAssessed) > 0n ||
    daysBetween(item.dueDate, date) <= view.loan.graceDays || Number(view.loan.penaltyPercent) === 0) return null;
  const firstLate = new Date(item.dueDate + "T00:00:00Z");
  firstLate.setUTCDate(firstLate.getUTCDate() + view.loan.graceDays + 1);
  const assessedOn = firstLate.toISOString().slice(0, 10);
  const atDeadline = projectLoanLedger(view.ledger, assessedOn).installments.find(row => row.id === item.id)!;
  const amount = penaltyDueForAssessment(atDeadline, assessedOn, view.loan.penaltyPercent, view.loan.graceDays);
  return amountToCents(amount) > 0n ? { id: item.id, assessedOn, amount } : null;
}

export function loanDueWork(view: DueView, date: string) {
  const due = view.position?.installments.filter(item => item.dueDate <= date) ?? [];
  return {
    pastDue: due.filter(item => isPastDue(item, date)).length,
    accruals: due.filter(item => !item.accrualProcessedOn && amountToCents(item.interest) > 0n).map(item => item.id),
    penalties: due.flatMap(item => penaltyAssessment(view, item, date) ?? []),
  };
}

async function applyAccrual(view: DueView, installmentId: number, date: string, accounts: ReturnType<typeof loanPostingAccounts>) {
  const item = view.position?.installments.find(row => row.id === installmentId);
  if (!item || !view.ledger || item.accrualProcessedOn || item.dueDate > date) return 0;
  const scheduled = amountToCents(item.interest);
  if (scheduled === 0n) return 0;
  const income = requirePostingAccount(accounts, view.loan.productKind === "GOODS" ? "INSTALLMENT_MARKUP_INCOME" : "LOAN_INTEREST_INCOME");
  const priorIncome = await prepaidIncome(view.ledger, item.id, item.dueDate, date, income.id);
  if (priorIncome > scheduled) throw new LoanError(503, "Posted prepayment income exceeds installment interest or markup.");
  const amount = centsToAmount(scheduled - priorIncome);
  const id = view.loan.id;
  const command = { loanId: id, type: "LOAN_DUE_ACCRUAL",
    key: String(item.id), hash: loanDigest([id, item.id, item.dueDate]) };
  const result = await writeLoanCommand(command, view.revision, systemActor, async now => {
    const audit = (journalNo: string | null) => ({
      ...cooperativeAuditEvent(systemActor, {
        subject: { type: "LOAN", id }, action: journalNo ? "LOAN_DUE_ACCRUAL" : "LOAN_DUE_ACCRUAL_ALREADY_RECORDED",
        after: { installment: item.no, dueDate: item.dueDate, journalNo, amount, prepaidIncome: centsToAmount(priorIncome) },
      }, now), actor_name: systemActor.actorName,
    });
    const posting = amountToCents(amount) > 0n ? await prepareLoanJournal({
      loanId: id, type: "LOAN_DUE_ACCRUAL", date: item.dueDate, actor: systemActor, now,
      pairs: [{ debit: requirePostingAccount(accounts, "INTEREST_MARKUP_RECEIVABLE"), credit: income, amount }],
      audit: ({ journalNo }) => audit(journalNo),
    }) : null;
    return {
      result: { amount, journalNo: posting?.numbers.journalNo ?? null },
      receipt: posting?.receipt,
      changes: {
        ...(posting ? {} : { last_event_id: audit(null) }),
        installments: { update: [{
          id: item.id, accrual_processed_on: date, accrual_journal_id: posting?.numbers.journalId ?? null, updated_at: cooperativeAuditTime(now),
        }] },
      },
    };
  });
  return !result.duplicate && result.journalNo ? 1 : 0;
}

async function assessPenalty(view: DueView, installmentId: number, date: string) {
  const item = view.position?.installments.find(row => row.id === installmentId);
  if (!item) return 0;
  const assessment = penaltyAssessment(view, item, date);
  if (!assessment) return 0;
  const { amount, assessedOn } = assessment;
  const id = view.loan.id;
  const command = { loanId: id, type: "LOAN_PENALTY_ASSESSED", key: String(item.id), hash: loanDigest([id, item.id, assessedOn]) };
  const result = await writeLoanCommand(command, view.revision, systemActor, async now => ({
    result: { assessedOn, amount },
    changes: {
      installments: { update: [{ id: item.id, penalty_assessed: amount, penalty_assessed_on: assessedOn, updated_at: cooperativeAuditTime(now) }] },
      last_event_id: {
        ...cooperativeAuditEvent(systemActor, {
          subject: { type: "LOAN", id }, action: command.type, before: { penalty: item.penaltyAssessed },
          after: { penalty: amount, installment: item.no, dueDate: item.dueDate, assessedOn },
        }, now), actor_name: systemActor.actorName,
      },
    },
  }));
  return result.duplicate ? 0 : 1;
}

async function applyDueAction(id: number, date: string, action: (loan: DueView) => Promise<number>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const view = await readLoanForChange(id, date);
    if (view.loan.status !== "ACTIVE") return 0;
    try {
      return await action(view);
    } catch (cause) {
      if (!(cause instanceof LoanError && cause.code === "STALE_LOAN_REVIEW") || attempt === 2) throw cause;
    }
  }
  return 0;
}

export async function catchUpLoanDueDates(view: DueView, date: string, accounts: () => Promise<ReturnType<typeof loanPostingAccounts>>) {
  const work = loanDueWork(view, date);
  let accrued = 0;
  let penaltiesAssessed = 0;
  for (const id of work.accruals) {
    const mappings = await accounts();
    accrued += await applyDueAction(view.loan.id, date, current => applyAccrual(current, id, date, mappings));
  }
  for (const { id } of work.penalties) {
    penaltiesAssessed += await applyDueAction(view.loan.id, date, current => assessPenalty(current, id, date));
  }
  return { pastDue: work.pastDue, accrued, penaltiesAssessed };
}

export async function runLoanDueDates(date = todayManila()) {
  if (!loanPostingEnabled()) throw new LoanError(409, "Loan posting is pending rollout in this environment.", "PENDING_ROLLOUT");
  let accounts: Promise<ReturnType<typeof loanPostingAccounts>> | undefined;
  const result = { date, loans: 0, pastDue: 0, accrued: 0, penaltiesAssessed: 0, failed: [] as Array<{ id: number; message: string }> };
  const size = 50;
  let cursor = 0;
  while (true) {
    const query = new URLSearchParams({
      fields: "id", limit: String(size), sort: "id",
      filter: JSON.stringify({ status: { _eq: "ACTIVE" }, id: { _gt: cursor } }),
    });
    const { data } = z.object({ data: z.array(z.object({ id: z.number().int().positive() })) })
      .parse(await readDirectusItems("cooperative_loans", query));
    for (const { id } of data) {
      result.loans += 1;
      try {
        const view = await readLoanForChange(id, date);
        const updated = await catchUpLoanDueDates(view, date, () => accounts ??= getPolicies().then(loanPostingAccounts));
        result.pastDue += updated.pastDue;
        result.accrued += updated.accrued;
        result.penaltiesAssessed += updated.penaltiesAssessed;
      } catch (cause) {
        result.failed.push({ id, message: cause instanceof LoanError ? cause.message : "Due-date processing could not be confirmed." });
      }
    }
    if (data.length < size) return result;
    cursor = data[data.length - 1].id;
  }
}
