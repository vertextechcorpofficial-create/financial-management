import "server-only";

import { z } from "zod";
import { passesLoanChecks, type LoanAssessmentCheck } from "../loans/loan-assessment";
import { amountToCents, buildLoanSchedule, type LoanInstallment } from "../loans/loan-schedule";
import { money } from "../policies/policy-types";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { nestedTransactionEntries } from "./transaction-index";
import { readDirectusItems } from "./directus";
import {
  findLoanCommand, loanDigest, loanPostingAccounts, loanPostingEnabled, prepareLoanJournal,
  requirePostingAccount, staleLoanReview, writeLoanCommand, type LoanActor,
} from "./loan-commands";
import { assessBorrower } from "./loan-enrollment";
import { LoanError, readLoanForChange } from "./loans";
import { todayManila } from "./member-read";
import { getPolicies } from "./policies";

const rate = z.string().regex(/^\d{1,3}(?:\.\d{1,6})?$/);
const signedRules = z.object({
  rateMin: rate.nullable(), rateMax: rate.nullable(),
  minimumMembershipMonths: z.number().int().nonnegative(),
  limitType: z.enum(["NONE", "FIXED", "SAVINGS_MULTIPLE"]),
  savingsMultiple: z.string().regex(/^\d{1,5}(?:\.\d{1,4})?$/).nullable(), fixedCeiling: money.nullable(),
}).refine(rules => (rules.limitType === "FIXED") === (rules.fixedCeiling !== null) &&
  (rules.limitType === "SAVINGS_MULTIPLE") === (rules.savingsMultiple !== null));
const signedTerms = z.object({
  signed: z.literal(true), agreementNo: z.string().min(1), policyRevision: z.number().int().nonnegative(),
  productId: z.number().int().positive(), productCode: z.string().min(1), kind: z.enum(["CASH", "GOODS"]),
  principal: money, ratePercent: rate, term: z.number().int().min(1).max(120),
  frequency: z.enum(["monthly", "cutoff"]), mode: z.enum(["payroll", "otc"]),
  method: z.enum(["diminishing", "flat", "markup"]), releaseMethod: z.enum(["CASH", "PAYROLL", "VENDOR"]),
  processingFee: money, penaltyPercent: rate, graceDays: z.number().int().nonnegative(),
  pricing: z.object({ paymentCount: z.number().int().positive(), regularPayment: money, finalPayment: money, totalPayable: money }),
  borrower: z.object({ membershipId: z.number().int().positive() }),
  documents: z.array(z.object({ documentTypeId: z.number().int().positive(), name: z.string().min(1), enforcement: z.enum(["WARN", "BLOCK"]) })),
  eligibilityRules: signedRules.optional(),
});
const actionSchema = z.enum(["APPROVE", "REJECT", "APPROVE_AND_RELEASE", "RELEASE"]);
const inputSchema = z.object({
  action: actionSchema, requestKey: z.uuid(), revision: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  reason: z.string().trim().max(500).optional(),
  payoutConfirmed: z.boolean().optional(), payoutReference: z.string().trim().max(120).optional(),
  feeChannel: z.enum(["CASH", "BANK"]).optional(), feeConfirmed: z.boolean().optional(),
  feeReference: z.string().trim().max(120).optional(),
});
type Terms = z.output<typeof signedTerms>;
type Loan = Awaited<ReturnType<typeof readLoanForChange>>["loan"];
type Action = z.infer<typeof actionSchema>;
export type LoanDecisionResult = {
  id: number; status: string; journalId: number | null; journalNo: string | null; orNo: string | null;
  date: string; payoutReference: string | null; feeChannel: "CASH" | "BANK" | null; feeReference: string | null;
};

function stateActions(status: string): Action[] {
  if (status === "PENDING") return ["APPROVE", "REJECT", "APPROVE_AND_RELEASE"];
  return status === "APPROVED" ? ["RELEASE"] : [];
}

function scheduleFromTerms(terms: Terms, date: string) {
  return buildLoanSchedule({
    principal: terms.principal, rate: terms.ratePercent, markup: terms.ratePercent,
    method: terms.method.toUpperCase() as "DIMINISHING" | "FLAT" | "MARKUP", months: terms.term,
    frequency: terms.frequency === "cutoff" ? "CUTOFF" : "MONTHLY", releaseDate: date,
  });
}

async function signedEligibilityRules(terms: Terms, policy: Awaited<ReturnType<typeof getPolicies>>) {
  if (terms.eligibilityRules) return terms.eligibilityRules;
  const product = policy.products.find(row => row.id === terms.productId && row.code === terms.productCode);
  if (policy.revision === terms.policyRevision && product) return signedRules.parse(product);
  const query = new URLSearchParams({
    fields: "after_state", sort: "policy_revision,id", limit: "-1",
    filter: JSON.stringify({ entity_type: { _eq: "LOAN_PRODUCT" }, entity_id: { _eq: terms.productCode },
      policy_revision: { _lte: terms.policyRevision } }),
  });
  const { data } = z.object({ data: z.array(z.object({ after_state: z.record(z.string(), z.unknown()).nullable() })) })
    .parse(await readDirectusItems("cooperative_audit_events", query));
  const rules = signedRules.safeParse(Object.assign({}, ...data.map(row => row.after_state)));
  if (rules.success) return rules.data;
  // Seeded products may predate the policy audit. The first later edit preserves the previous values of changed fields.
  if (product) {
    query.set("fields", "before_state");
    query.set("sort", "-policy_revision,-id");
    query.set("filter", JSON.stringify({ entity_type: { _eq: "LOAN_PRODUCT" }, entity_id: { _eq: terms.productCode },
      policy_revision: { _gt: terms.policyRevision } }));
    const { data: later } = z.object({ data: z.array(z.object({ before_state: z.record(z.string(), z.unknown()).nullable() })) })
      .parse(await readDirectusItems("cooperative_audit_events", query));
    if (later.every(row => row.before_state)) {
      const restored = signedRules.safeParse(Object.assign({}, product, ...later.map(row => row.before_state)));
      if (restored.success) return restored.data;
    }
  }
  throw new LoanError(409, "The product rules in effect at signing could not be verified. Ask the Cooperative office to review the agreement.");
}

function termsAgreeWithLoan(terms: Terms, loan: Loan, schedule: ReturnType<typeof scheduleFromTerms>) {
  return loan.agreementSigned && terms.agreementNo === loan.agreementNo && terms.borrower.membershipId === loan.memberId &&
    terms.productId === loan.productId && terms.productCode === loan.productCode && terms.kind === loan.productKind &&
    amountToCents(terms.principal) > 0n && amountToCents(terms.principal) === amountToCents(loan.principal) &&
    terms.term === loan.months && terms.frequency.toUpperCase() === loan.frequency && terms.mode.toUpperCase() === loan.mode &&
    terms.method.toUpperCase() === loan.method && terms.releaseMethod === loan.releaseMethod &&
    (terms.kind === "GOODS" ? terms.method === "markup" && terms.releaseMethod === "VENDOR"
      : terms.method !== "markup" && terms.releaseMethod !== "VENDOR") &&
    Number(terms.ratePercent) === Number(terms.kind === "GOODS" ? loan.markup : loan.rate) &&
    amountToCents(terms.processingFee) === amountToCents(loan.processingFee) &&
    Number(terms.penaltyPercent) === Number(loan.penaltyPercent) && terms.graceDays === loan.graceDays &&
    terms.pricing.paymentCount === schedule.installments.length && terms.pricing.regularPayment === schedule.regularPayment &&
    terms.pricing.finalPayment === schedule.finalPayment && terms.pricing.totalPayable === schedule.totalPayable &&
    amountToCents(terms.pricing.totalPayable) === amountToCents(loan.totalPayable);
}

async function reviewLoan(id: number, date: string) {
  const view = await readLoanForChange(id, date, true);
  const { loan, revision, termsSnapshot } = view;
  const actions = stateActions(loan.status);
  const checks: LoanAssessmentCheck[] = [];
  const parsed = signedTerms.safeParse(termsSnapshot);
  const terms = parsed.data;
  const schedule = terms && scheduleFromTerms(terms, date);
  const signed = Boolean(terms && schedule && termsAgreeWithLoan(terms, loan, schedule));
  const checksInput: unknown[] = [];
  let accounts: ReturnType<typeof loanPostingAccounts> = new Map();
  let releaseIssue: string | null = null;
  const feeChannels: Array<"CASH" | "BANK"> = [];
  const principalPurpose = loan.productKind === "CASH" ? "CASH_LOAN_PRINCIPAL" : "GOODS_LOAN_PRINCIPAL";
  const cashPurpose = loan.releaseMethod === "CASH" ? "CASH_ON_HAND" : "CASH_IN_BANK";

  if (actions.length) {
    checks.push({ key: "signed", label: "Signed agreement", ok: signed,
      detail: signed ? loan.agreementNo : "The signed terms could not be verified against the loan." });
    if (signed && terms && schedule) {
      try {
        const policy = await getPolicies();
        if (!policy.settings) throw new LoanError(503, "Cooperative membership settings are unavailable.");
        const rules = await signedEligibilityRules(terms, policy);
        const rateOk = terms.kind === "GOODS" || rules.rateMin !== null && rules.rateMax !== null &&
          Number(terms.ratePercent) >= Number(rules.rateMin) && Number(terms.ratePercent) <= Number(rules.rateMax);
        checks.push({ key: "rate", label: "Signed rate or markup", ok: rateOk,
          detail: terms.kind === "GOODS" ? `${terms.ratePercent}% signed markup.`
            : `${terms.ratePercent}% per month · signed range ${rules.rateMin ?? "—"}% to ${rules.rateMax ?? "—"}%.` });
        const borrower = await assessBorrower({
          memberId: loan.memberId, productId: loan.productId, settings: policy.settings, date, excludeLoanId: loan.id,
          principal: terms.principal, mode: terms.mode, frequency: terms.frequency, installments: schedule.installments, rules,
        });
        checks.push(...borrower.checks);
        checksInput.push(policy.revision, borrower.loanIds, borrower.payroll, borrower.member.savings_balance);
        accounts = loanPostingAccounts(policy);
      } catch (cause) {
        checks.push({ key: "verify", label: "Current eligibility", ok: false,
          detail: cause instanceof LoanError ? cause.message : "Current borrowing and payroll records could not be verified. Try again." });
      }
    }
    checks.push({ key: "documents", label: "Required documents", ok: loan.documents.blocks.length === 0,
      detail: loan.documents.blocks.length ? loan.documents.blocks.map(row => row.name).join(", ") + " required."
        : "All documents required for approval are on file." });
    if (!loanPostingEnabled()) {
      releaseIssue = "Loan posting is pending rollout in this environment.";
    } else if (passesLoanChecks(checks)) {
      try {
        const principalAccount = requirePostingAccount(accounts, principalPurpose);
        const payoutAccount = requirePostingAccount(accounts, cashPurpose);
        if (principalAccount.id === payoutAccount.id) throw new LoanError(422, "Choose distinct principal and payout mappings in Policies.");
        if (amountToCents(loan.processingFee) > 0n) {
          requirePostingAccount(accounts, "LOAN_PROCESSING_FEE_INCOME");
          if (accounts.has("CASH_ON_HAND")) feeChannels.push("CASH");
          if (accounts.has("CASH_IN_BANK")) feeChannels.push("BANK");
        }
      } catch (cause) {
        if (!(cause instanceof LoanError)) throw cause;
        releaseIssue = cause.message;
      }
    }
  }

  const valid = passesLoanChecks(checks);
  const preview = {
    revision, date, status: loan.status, actions, checks,
    canApprove: actions.includes("APPROVE") && valid,
    canRelease: valid && actions.some(action => action === "RELEASE" || action === "APPROVE_AND_RELEASE") && releaseIssue === null,
    releaseIssue, principal: loan.principal, fee: loan.processingFee, releaseMethod: loan.releaseMethod,
    firstDueDate: schedule?.installments[0]?.dueDate ?? null,
    feeChannels, warnings: loan.documents.warnings.map(row => row.name),
    blockedDocuments: loan.documents.blocks.map(row => row.name),
    fingerprint: loanDigest([id, revision, date, loan.status, terms, checks, checksInput, releaseIssue,
      [...accounts].map(([key, account]) => [key, account.id]), view.files.filter(row => !row.removed_at).map(row => row.id).sort()]),
  };
  return { loan, date, schedule, accounts, principalPurpose, cashPurpose, preview } as const;
}

export async function getLoanDecision(id: number) {
  return (await reviewLoan(id, todayManila())).preview;
}

export type LoanDecisionPreview = Awaited<ReturnType<typeof getLoanDecision>>;

function installmentRow(row: LoanInstallment, at: string) {
  return {
    installment_no: row.no, due_date: row.dueDate, principal: row.principal, interest: row.interest, total: row.total,
    paid_total: row.paidTotal, paid_principal: row.paidPrincipal, paid_interest: row.paidInterest, penalty_assessed: row.penaltyAssessed,
    penalty_paid: row.penaltyPaid, status: row.status, last_paid_on: null, offset: false, created_at: at, updated_at: at,
  };
}

export async function decideLoan(id: number, payload: unknown, actor: LoanActor) {
  const parsed = inputSchema.safeParse(payload);
  if (!parsed.success) throw new LoanError(422, "Check the loan action details.", "LOAN_INPUT",
    Object.fromEntries(parsed.error.issues.map(error => [String(error.path[0]), error.message])));
  const input = parsed.data;
  const release = input.action === "RELEASE" || input.action === "APPROVE_AND_RELEASE";
  const command = { loanId: id, type: release ? "LOAN_RELEASE" : "LOAN_" + input.action,
    key: input.requestKey, hash: loanDigest([id, actor.actorId, input]) };
  const prior = await findLoanCommand<LoanDecisionResult>(command);
  if (prior) return prior;
  const { loan, date, schedule, accounts, principalPurpose, cashPurpose, preview } = await reviewLoan(id, todayManila());
  if (input.revision !== preview.revision || input.fingerprint !== preview.fingerprint) {
    const saved = await findLoanCommand<LoanDecisionResult>(command);
    if (saved) return saved;
    throw staleLoanReview();
  }
  if (!preview.actions.includes(input.action)) throw new LoanError(409, "This loan action is no longer available.", "LOAN_ACTION_UNAVAILABLE");
  if (input.action === "APPROVE" && !preview.canApprove || release && !preview.canRelease) {
    throw new LoanError(422, preview.releaseIssue && release ? preview.releaseIssue : "Resolve the review checks before continuing.", "LOAN_REVIEW_BLOCKED");
  }

  if (input.action === "REJECT" && !input.reason) throw new LoanError(422, "Enter a rejection reason.", "LOAN_INPUT", { reason: "Required." });
  const hasFee = release && amountToCents(loan.processingFee) > 0n;
  if (release) {
    if (!input.payoutConfirmed) throw new LoanError(422, "Confirm the payout before releasing the loan.", "LOAN_INPUT");
    if (loan.releaseMethod !== "CASH" && !input.payoutReference) throw new LoanError(422, "Enter the bank transfer reference.", "LOAN_INPUT");
    if (hasFee && (!input.feeConfirmed || !input.feeChannel || !preview.feeChannels.includes(input.feeChannel) ||
        input.feeChannel === "BANK" && !input.feeReference)) {
      throw new LoanError(422, "Confirm the processing fee collection and its payment details.", "LOAN_INPUT");
    }
  }
  const status = release ? "ACTIVE" : input.action === "APPROVE" ? "APPROVED" : "REJECTED";
  const result: LoanDecisionResult = {
    id, status, date, journalId: null, journalNo: null, orNo: null,
    payoutReference: release ? input.payoutReference ?? null : null,
    feeChannel: hasFee ? input.feeChannel ?? null : null, feeReference: hasFee ? input.feeReference ?? null : null,
  };
  return writeLoanCommand(command, preview.revision, actor, async now => {
    if (todayManila(now) !== date) throw staleLoanReview();
    const at = cooperativeAuditTime(now);
    const approvedOn = input.action === "APPROVE" || input.action === "APPROVE_AND_RELEASE" ? date : loan.approvedOn;
    const audit = (posting?: Pick<LoanDecisionResult, "journalNo" | "orNo">) => ({
      ...cooperativeAuditEvent(actor, {
        subject: { type: "LOAN", id }, action: release ? "LOAN_RELEASED" : input.action === "APPROVE" ? "LOAN_APPROVED" : "LOAN_REJECTED",
        before: { status: loan.status, approvedOn: loan.approvedOn },
        after: { status, approvedOn, ...(release ? { releasedOn: date, principal: loan.principal, releaseMethod: loan.releaseMethod,
          processingFee: loan.processingFee, feeChannel: result.feeChannel, payoutReference: result.payoutReference,
          feeReference: result.feeReference, firstDueDate: preview.firstDueDate, ...posting } : {}) },
        reason: input.action === "REJECT" ? input.reason : undefined,
      }, now),
      actor_name: actor.actorName,
    });
    const changes = { status, approved_on: approvedOn, decision_reason: input.action === "REJECT" ? input.reason : null };
    if (!release) return { result, changes: { ...changes, last_event_id: audit() } };
    const pairs = [{
      debit: requirePostingAccount(accounts, principalPurpose), credit: requirePostingAccount(accounts, cashPurpose), amount: loan.principal,
    }];
    if (hasFee) pairs.push({
      debit: requirePostingAccount(accounts, input.feeChannel === "CASH" ? "CASH_ON_HAND" : "CASH_IN_BANK"),
      credit: requirePostingAccount(accounts, "LOAN_PROCESSING_FEE_INCOME"), amount: loan.processingFee,
    });
    const posting = await prepareLoanJournal({
      loanId: id, type: "LOAN_RELEASE", date, actor, now, pairs, audit,
      feeReceipt: hasFee && input.feeChannel === "CASH" ? { membershipId: loan.memberId, amount: loan.processingFee } : undefined,
    });
    return {
      result: { ...result, ...posting.numbers },
      receipt: { ...posting.receipt, journal_id: {
        ...posting.receipt.journal_id,
        ...nestedTransactionEntries({ id: posting.numbers.journalId, date, postedAt: at }, [
          { kind: "LOAN_RELEASE", memberId: loan.memberId, loanId: id, sourceReference: loan.loanNo, amount: loan.principal,
            channel: loan.releaseMethod === "CASH" ? "OTC" : "BANK", reference: result.payoutReference },
          ...(hasFee ? [{ kind: "PROCESSING_FEE", memberId: loan.memberId, loanId: id, sourceReference: loan.loanNo,
            amount: loan.processingFee, channel: result.feeChannel === "CASH" ? "OTC" : "BANK",
            reference: result.feeReference, orNo: posting.numbers.orNo }] as const : []),
        ]),
      } },
      changes: { ...changes, released_on: date, installments: { create: schedule!.installments.map(row => installmentRow(row, at)) } },
    };
  });
}
