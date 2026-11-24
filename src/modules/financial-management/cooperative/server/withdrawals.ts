import "server-only";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { peso } from "../members/format";
import { money } from "../policies/policy-types";
import { cooperativeAuditEvent, cooperativeAuditTime, readCooperativeAuditHistory } from "./audit";
import { readDirectusItems } from "./directus";
import { loanDigest, loanPostingAccounts, nextCooperativeNumbers, prepareCooperativeJournal, type LoanActor } from "./loan-commands";
import { readMemberLoans } from "./loans";
import { memberLoanBalances } from "./member-loans";
import { todayManila } from "./member-read";
import { getPolicies } from "./policies";
import { findSavingsCommand, writeSavingsCommand, type SavingsCommand } from "./savings-commands";
import { nestedTransactionEntries } from "./transaction-index";
import { calculateWithdrawalBalance } from "./withdrawal-balances";
import {
  countWithdrawalRequests, readSavingsRevision, readWithdrawalRequest, readWithdrawalRequests, readWithdrawalSnapshots,
  WithdrawalError, withdrawalId, withdrawalMethod, withdrawalPendingMessage, withdrawalPostingEnabled, withdrawalSearch,
  withdrawalStatus, type WithdrawalRequest,
} from "./withdrawal-store";

type Snapshot = Awaited<ReturnType<typeof readWithdrawalSnapshots>>[number];
type Command = "WITHDRAWAL_FILE" | "WITHDRAWAL_RELEASE" | "WITHDRAWAL_REJECT" | "WITHDRAWAL_CANCEL";
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const requestKey = z.uuid();
const reason = z.string().trim().min(1, "Enter a reason.").max(500);
const amount = money.refine(value => amountToCents(value) > 0n, "Enter an amount greater than zero.");
const filing = z.object({
  memberId: withdrawalId, amount, releaseMethod: withdrawalMethod, reason: z.string().trim().max(200).default(""),
  requestKey, fingerprint,
});
const release = z.object({
  action: z.literal("release"), requestKey, fingerprint, confirmed: z.literal(true),
  payoutReference: z.string().trim().max(120).default(""),
});
const decision = z.discriminatedUnion("action", [release, z.object({ action: z.literal("reject"), requestKey, reason })]);
const cancellation = z.object({ requestKey, reason });
const resultSchema = z.object({
  id: withdrawalId, reference: z.string(), status: withdrawalStatus, amount: money,
  journalNo: z.string().nullable(),
});
type Result = z.infer<typeof resultSchema>;

function ensureEnabled() {
  if (!withdrawalPostingEnabled()) throw new WithdrawalError(409, withdrawalPendingMessage, "PENDING_ROLLOUT");
}

function parse<T extends z.ZodType>(schema: T, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw new WithdrawalError(422, "Check the withdrawal details.", "WITHDRAWAL_INPUT",
    Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message])));
  return result.data;
}

function staleWithdrawal() {
  return new WithdrawalError(409, "The request, savings balance, or policy changed. Reload the review before confirming.", "STALE_WITHDRAWAL");
}

function pending(request: WithdrawalRequest) {
  if (request.status !== "PENDING") throw staleWithdrawal();
}

function assessSavings(snapshot: Snapshot, year: number, request?: WithdrawalRequest) {
  if (request && !snapshot.pendingReservations.some(row => row.requestId === String(request.id) && row.amount === request.amount)) {
    throw staleWithdrawal();
  }
  const balance = calculateWithdrawalBalance({ ...snapshot,
    pendingReservations: snapshot.pendingReservations.filter(row => row.requestId !== String(request?.id)),
  });
  const projectedSavings = request ? centsToAmount(amountToCents(balance.postedSavings) - amountToCents(request.amount)) : null;
  const amountLimit = amountToCents(balance.availableSavings);
  const annualUsage = { year, used: snapshot.annualUsed, limit: snapshot.annualLimit };
  const withinAnnualLimit = annualUsage.limit === 0 || annualUsage.used + (request ? 0 : 1) <= annualUsage.limit;
  const issue = snapshot.status !== "ACTIVE" ? "Only active members can withdraw savings."
    : !withinAnnualLimit ? `The member has reached the ${year} withdrawal limit.`
      : request && amountToCents(request.amount) > amountLimit ? "The payout would leave too little savings for the maintaining balance and other pending withdrawals."
        : null;
  return { balance, projectedSavings, annualUsage, issue };
}

async function arrears(memberId: number, date: string) {
  const loans = await readMemberLoans([memberId], date);
  if (loans.state !== "ready") return "Past-due loans could not be verified.";
  const { pastDue } = memberLoanBalances(loans.data);
  return amountToCents(pastDue) > 0n ? `The member has ${peso(pastDue)} in past-due loans.` : null;
}

async function filingReview(memberId: number, now = new Date()) {
  ensureEnabled();
  if (!withdrawalId.safeParse(memberId).success) throw new WithdrawalError(400, "Choose a valid Cooperative member.");
  const date = todayManila(now);
  const year = Number(date.slice(0, 4));
  const [snapshot] = await readWithdrawalSnapshots([memberId], year);
  const review = assessSavings(snapshot, year);
  return {
    ...review, revision: snapshot.revision, date,
    fingerprint: loanDigest([memberId, date, snapshot.revision, review.balance, review.annualUsage]),
  };
}

export async function getWithdrawalFilingReview(memberId: number) {
  const review = await filingReview(memberId);
  return { ...review, warning: await arrears(memberId, review.date) };
}

async function payoutReview(request: WithdrawalRequest, now = new Date()) {
  pending(request);
  const date = todayManila(now);
  const year = Number(request.filedOn.slice(0, 4));
  const [[snapshot], policy] = await Promise.all([readWithdrawalSnapshots([request.memberId], year), getPolicies()]);
  const review = assessSavings(snapshot, year, request);
  if (!policy.settings || policy.settings.maintainingBalance !== snapshot.maintainingBalance ||
    policy.settings.withdrawalsPerYear !== snapshot.annualLimit) throw staleWithdrawal();
  const accounts = loanPostingAccounts(policy);
  const debit = accounts.get("MEMBER_SAVINGS");
  const credit = accounts.get(request.releaseMethod === "CASH" ? "CASH_ON_HAND" : "CASH_IN_BANK");
  const issue = review.issue ?? (!debit || !credit || debit.id === credit.id
    ? "Map active Members’ savings deposits and payout accounts in Policies." : null);
  return {
    ...review, issue, date, revision: snapshot.revision, policyRevision: policy.revision, debit, credit,
    fingerprint: loanDigest([request.id, request.amount, request.releaseMethod, date, snapshot.revision,
      review.balance, review.annualUsage, policy.revision, debit?.id, credit?.id]),
  };
}

async function postedJournal(id: number) {
  const query = new URLSearchParams({
    fields: "id,journal_no,business_date", limit: "2",
    filter: JSON.stringify({ source_type: { _eq: "WITHDRAWAL" }, source_id: { _eq: String(id) }, command_type: { _eq: "WITHDRAWAL_RELEASE" } }),
  });
  const { data } = z.object({ data: z.array(z.object({ id: withdrawalId, journal_no: z.string(), business_date: z.iso.date() })).length(1) })
    .parse(await readDirectusItems("cooperative_journals", query));
  return { id: data[0].id, reference: data[0].journal_no, date: data[0].business_date };
}

export async function getWithdrawalDetail(id: number) {
  ensureEnabled();
  const request = await readWithdrawalRequest(id);
  const [review, history, journal, warning] = await Promise.all([
    request.status === "PENDING" ? payoutReview(request).catch(error => ({
      issue: error instanceof WithdrawalError ? error.message : "Payout checks are temporarily unavailable. Reload the review.",
    })) : null,
    readCooperativeAuditHistory({ type: "WITHDRAWAL", id }),
    request.status === "RELEASED" ? postedJournal(id) : null,
    request.status === "PENDING" ? arrears(request.memberId, todayManila()) : null,
  ]);
  return {
    request, history: history.items, journal, warning,
    review: review && "fingerprint" in review ? {
      balance: review.balance, projectedSavings: review.projectedSavings, annualUsage: review.annualUsage,
      issue: review.issue, date: review.date, fingerprint: review.fingerprint,
    } : review,
  };
}

export async function listStaffWithdrawalRequests(params: URLSearchParams) {
  if (!withdrawalPostingEnabled()) return { state: "pending_rollout" as const, message: withdrawalPendingMessage };
  const requestedPage = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new WithdrawalError(400, "Choose a valid page.");
  const search = params.get("search")?.trim().slice(0, 160) ?? "";
  const status = params.get("status") || "PENDING";
  if (status !== "ALL" && !withdrawalStatus.safeParse(status).success) throw new WithdrawalError(400, "Choose a valid status.");
  const filter = { ...(status !== "ALL" ? { status: { _eq: status } } : {}), ...(search ? withdrawalSearch(search) : {}) };
  const total = await countWithdrawalRequests(filter);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / 50)));
  const rows = total > 0 ? await readWithdrawalRequests(filter, 50, (page - 1) * 50) : [];
  return { state: "ready" as const, rows, total, page, hasMore: page * 50 < total };
}

type ReceiptCommand = SavingsCommand<Result> & { type: Command };
const writeErrors = {
  stale: staleWithdrawal,
  retry: () => new WithdrawalError(503, "The withdrawal action could not be confirmed. Retry with the same request.", "WITHDRAWAL_RETRY"),
};

async function runCommand(command: ReceiptCommand, execute: () => Promise<Result & { duplicate: boolean }>) {
  const prior = await findSavingsCommand(command);
  if (prior) return prior;
  try {
    return await execute();
  } catch (error) {
    if (error instanceof WithdrawalError && error.code === "STALE_WITHDRAWAL") {
      const recovered = await findSavingsCommand(command);
      if (recovered) return recovered;
    }
    throw error;
  }
}

export async function fileWithdrawal(payload: unknown, actor: LoanActor) {
  ensureEnabled();
  const input = parse(filing, payload);
  const command = { type: "WITHDRAWAL_FILE" as const, key: input.requestKey, hash: loanDigest([actor.actorId, input]), result: resultSchema };
  return runCommand(command, () => recordWithdrawal(input, actor, command));
}

async function recordWithdrawal(input: z.infer<typeof filing>, actor: LoanActor, command: ReceiptCommand) {
  const review = await filingReview(input.memberId);
  if (review.fingerprint !== input.fingerprint) throw staleWithdrawal();
  if (review.issue) throw new WithdrawalError(422, review.issue);
  if (amountToCents(input.amount) > amountToCents(review.balance.availableSavings)) {
    throw new WithdrawalError(422, "The amount exceeds the available savings.", "WITHDRAWAL_INPUT", { amount: "Enter an amount within available savings." });
  }
  const id = randomInt(100_000_000, 2_000_000_000);
  return writeSavingsCommand(command, input.memberId, review.revision, actor, writeErrors, async now => {
    const date = todayManila(now);
    if (date !== review.date) throw staleWithdrawal();
    const [number] = await nextCooperativeNumbers(review.annualUsage.year, ["WD"]);
    const result = { id, reference: number.number, status: "PENDING" as const, amount: input.amount, journalNo: null };
    const event = cooperativeAuditEvent(actor, {
      subject: { type: "WITHDRAWAL", id }, action: "WITHDRAWAL_FILED",
      after: { reference: result.reference, status: result.status, amount: input.amount, membershipId: input.memberId },
    }, now);
    return {
      result,
      relations: { withdrawal_series_id: number.ref, withdrawal_event_id: { ...event, actor_name: actor.actorName } },
      membership: { withdrawal_requests: { create: [{
        id, request_no: result.reference, status: result.status, amount: input.amount, release_method: input.releaseMethod,
        requested_on: date, requested_at: cooperativeAuditTime(now), requested_by: actor.actorId, request_reason: input.reason || null,
      }] } },
    };
  });
}

function closeWithdrawal(
  id: number, input: z.infer<typeof decision> | z.infer<typeof cancellation>, actor: LoanActor, action: "release" | "reject" | "cancel",
) {
  const type = action === "release" ? "WITHDRAWAL_RELEASE" : action === "reject" ? "WITHDRAWAL_REJECT" : "WITHDRAWAL_CANCEL";
  const command = { type, key: input.requestKey, hash: loanDigest([actor.actorId, id, input]), result: resultSchema } satisfies ReceiptCommand;
  return runCommand(command, () => recordWithdrawalDecision(id, input, actor, action, command));
}

async function recordWithdrawalDecision(
  id: number, input: z.infer<typeof decision> | z.infer<typeof cancellation>, actor: LoanActor,
  action: "release" | "reject" | "cancel", command: ReceiptCommand,
) {
  const request = await readWithdrawalRequest(id);
  pending(request);
  const payout = "confirmed" in input ? input : null;
  const review = payout ? await payoutReview(request) : null;
  if (payout && review) {
    if (payout.fingerprint !== review.fingerprint) throw staleWithdrawal();
    if (review.issue || !review.debit || !review.credit) throw new WithdrawalError(422, review.issue ?? "The payout accounts are unavailable.");
    if (request.releaseMethod === "PAYROLL" && !payout.payoutReference) {
      throw new WithdrawalError(422, "Enter the bank transfer reference.", "WITHDRAWAL_INPUT", { payoutReference: "Enter the bank transfer reference." });
    }
  }
  const revision = review?.revision ?? await readSavingsRevision(request.memberId);
  // Verify the request again after reading the member revision. A later mutation must win the unique revision key.
  if (!review) pending(await readWithdrawalRequest(id));
  const status = action === "release" ? "RELEASED" : action === "reject" ? "REJECTED" : "CANCELLED";
  const decisionReason = "reason" in input ? input.reason : undefined;
  return writeSavingsCommand(command, request.memberId, revision, actor, writeErrors, async now => {
    const at = cooperativeAuditTime(now);
    const date = todayManila(now);
    const payoutReference = request.releaseMethod === "PAYROLL" ? payout?.payoutReference || null : null;
    const result: Result = { id, reference: request.reference, status, amount: request.amount, journalNo: null };
    const event = (journalNo: string | null) => ({
      ...cooperativeAuditEvent(actor, {
        subject: { type: "WITHDRAWAL", id },
        action: `WITHDRAWAL_${status}`, before: { status: request.status }, reason: decisionReason,
        after: { status, amount: request.amount, reference: request.reference, journalNo, payoutReference,
          ...(review ? { savingsAfter: review.projectedSavings, policyRevision: review.policyRevision } : {}) },
      }, now),
      actor_name: actor.actorName,
    });
    const membership = { withdrawal_requests: { update: [{
      id, status, decided_at: at, decided_by: actor.actorId, decision_reason: decisionReason ?? null, payout_reference: payoutReference,
    }] } };
    if (!review?.debit || !review.credit || !review.projectedSavings) {
      return { result, relations: { withdrawal_event_id: event(null) }, membership };
    }
    if (date !== review.date) throw staleWithdrawal();
    const posting = await prepareCooperativeJournal({
      type: "WITHDRAWAL_RELEASE", source: { type: "WITHDRAWAL", id }, date, actor, now,
      pairs: [{ debit: review.debit, credit: review.credit, amount: request.amount }],
      audit: ({ journalNo }) => event(journalNo),
    });
    const savings = {
      membership_id: request.memberId, entry_date: date, kind: "WITHDRAWAL", amount: request.amount,
      balance_after: review.projectedSavings, reference: request.reference, posted_at: at, posted_by: actor.actorId,
    };
    return {
      result: { ...result, journalNo: posting.numbers.journalNo },
      relations: { ...posting.receipt, journal_id: {
        ...posting.receipt.journal_id, savings_entries: { create: [savings] },
        ...nestedTransactionEntries({ id: posting.numbers.journalId, date, postedAt: at }, [{
          kind: "WITHDRAWAL", memberId: request.memberId, channel: request.releaseMethod === "CASH" ? "OTC" : "BANK",
          amount: request.amount, sourceReference: request.reference, reference: payoutReference,
        }]),
      } },
      membership: { ...membership, savings_balance: review.projectedSavings },
    };
  });
}

export async function decideWithdrawal(id: number, payload: unknown, actor: LoanActor) {
  ensureEnabled();
  if (!withdrawalId.safeParse(id).success) throw new WithdrawalError(400, "Choose a valid withdrawal request.");
  const input = parse(decision, payload);
  return closeWithdrawal(id, input, actor, input.action);
}

export async function cancelWithdrawal(id: number, payload: unknown, actor: LoanActor) {
  ensureEnabled();
  if (!withdrawalId.safeParse(id).success) throw new WithdrawalError(400, "Choose a valid withdrawal request.");
  return closeWithdrawal(id, parse(cancellation, payload), actor, "cancel");
}

export type WithdrawalDetail = Awaited<ReturnType<typeof getWithdrawalDetail>>;
export type WithdrawalFilingReview = Awaited<ReturnType<typeof getWithdrawalFilingReview>>;
export type StaffWithdrawalRequests = Awaited<ReturnType<typeof listStaffWithdrawalRequests>>;
export type WithdrawalDecision = Awaited<ReturnType<typeof decideWithdrawal>>;
