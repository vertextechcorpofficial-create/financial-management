import "server-only";

import { z } from "zod";
import { projectLoanLedger, type LoanLedger } from "../loans/loan-activity";
import { amountToCents, centsToAmount, daysBetween, isPastDue, penaltyDueForAssessment } from "../loans/loan-schedule";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { readDirectusItems } from "./directus";
import {
  loanDigest, loanPostingAccounts, loanPostingEnabled, prepareLoanJournal, requirePostingAccount, writeLoanCommand,
} from "./loan-commands";
import { LoanError, readLoanForChange } from "./loans";
import { todayManila } from "./member-read";
import { getPolicies } from "./policies";

const systemActor = { actorId: 0, actorRole: "SYSTEM", actorName: "Cooperative due-date job" };
const glLineSchema = z.object({
  journal_id: z.number(), account_id: z.number(), debit: z.coerce.string(), credit: z.coerce.string(),
});

async function prepaidIncome(ledger: LoanLedger, id: number, dueDate: string, through: string, incomeAccount: number) {
  const relevant = ledger.movements.filter(movement => movement.date < dueDate && movement.allocations.some(
    allocation => allocation.installmentId === id && amountToCents(allocation.interest) > 0n,
  ) && movement.reversesId === null);
  if (!relevant.length) return 0n;
  const reversed = new Set(ledger.movements.filter(movement => movement.date <= through).map(movement => movement.reversesId));
  const originals = relevant.filter(movement => !reversed.has(movement.id));
  if (!originals.length) return 0n;
  const query = new URLSearchParams({
    fields: "journal_id,account_id,debit,credit", limit: "-1",
    filter: JSON.stringify({ journal_id: { _in: originals.map(movement => movement.journalId) },
      account_id: { _eq: incomeAccount } }),
  });
  const { data } = z.object({ data: z.array(glLineSchema) }).parse(await readDirectusItems("cooperative_gl_lines", query));
  const schedule = new Map(ledger.installments.map(row => [row.id, row.dueDate]));
  let recognized = 0n;
  for (const original of originals) {
    const credit = data.filter(row => row.journal_id === original.journalId)
      .reduce((sum, row) => sum + amountToCents(row.credit) - amountToCents(row.debit), 0n);
    if (credit === 0n) continue;
    const advanceInterest = original.allocations.reduce((sum, row) =>
      (schedule.get(row.installmentId) ?? "") > original.date ? sum + amountToCents(row.interest) : sum, 0n);
    if (credit !== advanceInterest) throw new LoanError(503, "A prepayment does not reconcile to the posted interest or markup income.");
    recognized += amountToCents(original.allocations.find(row => row.installmentId === id)?.interest);
  }
  return recognized;
}

type DueView = Awaited<ReturnType<typeof readLoanForChange>>;

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
  const { loan, ledger } = view;
  if (!item || !ledger || item.penaltyAssessedOn || amountToCents(item.penaltyAssessed) > 0n ||
    daysBetween(item.dueDate, date) <= loan.graceDays) return 0;
  const firstLate = new Date(item.dueDate + "T00:00:00Z");
  firstLate.setUTCDate(firstLate.getUTCDate() + loan.graceDays + 1);
  const assessedOn = firstLate.toISOString().slice(0, 10);
  const atDeadline = projectLoanLedger(ledger, assessedOn).installments.find(row => row.id === item.id)!;
  const amount = penaltyDueForAssessment(atDeadline, assessedOn, loan.penaltyPercent, loan.graceDays);
  if (amountToCents(amount) === 0n) return 0;
  const id = loan.id;
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
        const due = view.position?.installments.filter(row => row.dueDate <= date) ?? [];
        result.pastDue += due.filter(row => isPastDue(row, date)).length;
        for (const item of due) {
          if (!item.accrualProcessedOn && amountToCents(item.interest) > 0n) {
            accounts ??= getPolicies().then(loanPostingAccounts);
            const mappings = await accounts;
            result.accrued += await applyDueAction(id, date, current => applyAccrual(current, item.id, date, mappings));
          }
          if (!item.penaltyAssessedOn && daysBetween(item.dueDate, date) > view.loan.graceDays &&
              amountToCents(item.penaltyAssessed) === 0n && Number(view.loan.penaltyPercent) > 0) {
            result.penaltiesAssessed += await applyDueAction(id, date, current => assessPenalty(current, item.id, date));
          }
        }
      } catch (cause) {
        result.failed.push({ id, message: cause instanceof LoanError ? cause.message : "Due-date processing could not be confirmed." });
      }
    }
    if (data.length < size) return result;
    cursor = data[data.length - 1].id;
  }
}
