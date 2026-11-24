import "server-only";

import { z } from "zod";
import { calculateSettlement } from "../console/clearance/settlement-calculations";
import { projectLoanLedger } from "../loans/loan-activity";
import { amountToCents } from "../loans/loan-schedule";
import { prepareSettlementEntries, type ReviewedLoan, type SettlementJournalDraft } from "./clearance-journals";
import { ClearanceError, readClearance, type ClearanceRow } from "./clearance-store";
import { readDirectusItems } from "./directus";
import { loanDigest, loanPostingEnabled } from "./loan-commands";
import { LoanError, readMemberLoans, type MemberLoanView } from "./loans";
import { readPostedSavingsThrough, todayManila } from "./member-read";
import { getPolicies } from "./policies";
import { readWithdrawalRequests } from "./withdrawal-store";

const latest = "9999-12-31";
const stale = () => new ClearanceError(409, "The settlement changed during review. Refresh the preview and confirm again.", "CLEARANCE_STALE");
const loadSavings = (id: number, date: string) => readPostedSavingsThrough(id, date).catch(() => {
  throw new ClearanceError(503, "Posted savings could not be verified. Refresh the preview or ask the Cooperative office to review the ledger.");
});

async function activeDocuments(id: number) {
  const query = new URLSearchParams({ fields: "id,document_type_id", sort: "id", limit: "-1", filter: JSON.stringify({
    clearance_id: { _eq: id }, owner_type: { _eq: "CLEARANCE" }, owner_id: { _eq: id }, removed_at: { _null: true },
  }) });
  return z.object({ data: z.array(z.object({ id: z.string(), document_type_id: z.number() })) })
    .parse(await readDirectusItems("cooperative_documents", query)).data;
}

async function lateSavingsEntries(id: number, date: string) {
  const query = new URLSearchParams({ fields: "id,entry_date,reference", limit: "50", sort: "entry_date,id",
    filter: JSON.stringify({ membership_id: { _eq: id }, entry_date: { _gt: date } }) });
  const { data } = z.object({ data: z.array(z.object({ id: z.number(), entry_date: z.iso.date(), reference: z.string() })) })
    .parse(await readDirectusItems("cooperative_savings_entries", query));
  return data.map(row => ({ date: row.entry_date, reference: row.reference || String(row.id), source: "Savings" }));
}

function compareLoans(views: MemberLoanView[], date: string) {
  const reviewed: ReviewedLoan[] = [];
  const later: { date: string; reference: string; source: string }[] = [];
  for (const view of views) {
    const { ledger, position: current } = view;
    if (!ledger || !current) continue;
    const position = projectLoanLedger(ledger, date);
    if (ledger.release.date > date) {
      if (!current.fullyPaid) later.push({ date: ledger.release.date, reference: ledger.release.journalNo, source: view.loan.loanNo });
      continue;
    }
    reviewed.push({ view, ledger, position });
    if (position.installments.some((item, index) => {
      const live = current.installments[index];
      return item.paidPrincipal !== live.paidPrincipal || item.paidInterest !== live.paidInterest ||
        item.penaltyPaid !== live.penaltyPaid || item.penaltyAssessed !== live.penaltyAssessed;
    })) {
      later.push(...ledger.movements.filter(move => move.date > date).map(move => ({
        date: move.date, reference: move.journalNo, source: view.loan.loanNo,
      })));
      later.push(...ledger.installments.flatMap(item => item.penaltyAssessedOn && item.penaltyAssessedOn > date ? [{
        date: item.penaltyAssessedOn, reference: `Installment ${item.no} penalty`, source: view.loan.loanNo,
      }] : []));
    }
    for (const item of position.installments) {
      if (item.dueDate > date && item.accrualJournalId && amountToCents(item.interest) > amountToCents(item.paidInterest)) {
        later.push({ date: item.dueDate, reference: `Installment ${item.no} accrual`, source: view.loan.loanNo });
      }
    }
  }
  return { reviewed, later };
}

export function clearanceFinalPay(row: ClearanceRow) {
  const evidence = row.final_pay_evidence;
  return evidence && row.final_pay_available !== null
    ? { amount: row.final_pay_available, source: evidence.source, reference: evidence.reference, documentId: evidence.documentId }
    : null;
}

export async function reviewSettlement(id: number) {
  const row = await readClearance(id);
  if (row.status !== "DRAFT") throw new ClearanceError(409, "Settlement previews are available for draft clearances.", "CLEARANCE_READ_ONLY");
  const date = row.separation_date;
  const memberId = row.membership_id.id;
  const [policy, savings, source, documents, pending] = await Promise.all([
    getPolicies(), loadSavings(memberId, date), readMemberLoans([memberId], latest), activeDocuments(id),
    readWithdrawalRequests({ membership_id: { _eq: memberId }, status: { _eq: "PENDING" } }, -1),
  ]);
  if (source.state !== "ready") throw new ClearanceError(503, source.message);
  const views = source.data.sort((a, b) => a.loan.id - b.loan.id);
  const { reviewed, later } = compareLoans(views, date);
  const now = new Date();
  const postingDate = todayManila(now);
  const estimated = postingDate < date;
  const annualRate = policy.settings?.exitSavingsAnnualRates?.[date.slice(0, 4)] ?? null;
  const savedPay = clearanceFinalPay(row);
  const finalPay = documents.some(file => file.id === savedPay?.documentId) ? savedPay : null;
  const required = policy.documentRules.filter(rule => rule.isActive && rule.scope === "CLEARANCE")
    .filter(rule => !documents.some(file => file.document_type_id === rule.documentTypeId))
    .flatMap(rule => {
      const type = policy.documentTypes.find(type => type.isActive && type.id === rule.documentTypeId);
      return type ? [{ name: type.name, enforcement: rule.enforcement }] : [];
    });
  const issues: string[] = [];
  const warnings = required.filter(rule => rule.enforcement === "WARN").map(rule => rule.name);
  const blocks = required.filter(rule => rule.enforcement === "BLOCK").map(rule => rule.name);
  if (blocks.length) issues.push("Attach required documents before settlement. " + blocks.join(", "));
  if (!finalPay) issues.push("Verify the final-pay amount against an active document. Enter zero if no amount is available.");
  if (annualRate === null) issues.push("Set the approved annual savings rate for the separation year.");
  if (estimated) issues.push("Posting becomes available on the separation date.");
  if (row.membership_id.status !== "ACTIVE") issues.push("This membership is already closed.");
  if (!loanPostingEnabled()) issues.push("Settlement posting is pending rollout in this environment.");
  if (amountToCents(savings) !== amountToCents(row.membership_id.savings_balance)) {
    const entries = await lateSavingsEntries(memberId, date);
    later.push(...entries);
    if (!entries.length) issues.push("Posted savings do not reconcile to the member's balance. Review the savings ledger.");
  }
  if (later.length) issues.push("Reconcile the listed activity dated after separation before posting.");

  const amounts = calculateSettlement({
    separationDate: date, savings, annualRate, finalPay: finalPay?.amount ?? null,
    penaltiesFirst: policy.settings?.paymentOrder === "PENALTIES_FIRST",
    loans: reviewed.map(({ view, ledger, position }) => ({
      id: view.loan.id, reference: view.loan.loanNo, kind: view.loan.productKind,
      releasedOn: ledger.release.date, installments: position.installments,
    })),
  });
  let journals: SettlementJournalDraft[] = [];
  let provision = new Map<number, string>();
  if (!issues.length && amounts.funding) {
    try {
      ({ journals, provision } = await prepareSettlementEntries(reviewed, amounts, policy));
    } catch (cause) {
      if ((cause instanceof LoanError || cause instanceof ClearanceError) && cause.status === 422) issues.push(cause.message);
      else throw cause;
    }
  }
  const current = await readClearance(id);
  if (current.revision !== row.revision || current.status !== "DRAFT" ||
    current.membership_id.savings_revision !== row.membership_id.savings_revision) throw stale();

  const withdrawals = pending.map(request => ({ id: request.id, reference: request.reference, amount: request.amount }))
    .sort((a, b) => a.id - b.id);
  const fingerprint = loanDigest([id, row.revision, row.membership_id.savings_revision,
    views.map(({ loan, revision }) => [loan.id, revision]), policy.revision, date, postingDate, documents, withdrawals, finalPay, amounts, journals]);
  const account = (id: number) => {
    const match = policy.accounts.find(row => row.id === id);
    return match ? `${match.code} · ${match.name}` : String(id);
  };
  return {
    row, amounts, journals, provision, reviewed, views, policyRevision: policy.revision, withdrawals, documents,
    preview: {
      ...amounts, finalPay: finalPay && { amount: finalPay.amount, source: finalPay.source, reference: finalPay.reference },
      caseRevision: row.revision, separationDate: date, estimated, calculatedAt: now.toISOString(),
      postingDate, confirmable: !issues.length, fingerprint, issues, warnings, later, withdrawals,
      journalPreview: journals.map(({ category, amount, pairs }) => ({
        category, amount, pairs: pairs.map(pair => ({ debit: account(pair.debit.id), credit: account(pair.credit.id), amount: pair.amount })),
      })),
    },
  };
}

export async function getSettlementPreview(id: number) {
  return (await reviewSettlement(id)).preview;
}

export type SettlementPreview = Awaited<ReturnType<typeof getSettlementPreview>>;
