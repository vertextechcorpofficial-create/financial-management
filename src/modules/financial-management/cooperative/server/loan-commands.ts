import "server-only";

import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { amountToCents } from "../loans/loan-schedule";
import { accountPurposes, type PolicyState } from "../policies/policy-types";
import { cooperativeAuditTime } from "./audit";
import { cooperativeDirectus, CooperativeDirectusError, readDirectusItems, usesCooperativeQaDatabase } from "./directus";
import { LoanError } from "./loans";

export type LoanActor = { actorId: number; actorName: string; actorRole: string | null };
type State = Record<string, unknown>;
type Purpose = typeof accountPurposes[number][0];
type Account = PolicyState["accounts"][number];
export type LoanPostingPair = { debit: { id: number }; credit: { id: number }; amount: string };

const glLine = z.object({ journal_id: z.number(), line_no: z.number(), account_id: z.number(),
  debit: z.coerce.string(), credit: z.coerce.string() });
type GlLine = z.output<typeof glLine>;

export async function readLoanJournalLines(ids: number[]) {
  const grouped = new Map<number, GlLine[]>();
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const query = new URLSearchParams({ fields: "journal_id,line_no,account_id,debit,credit", sort: "line_no", limit: "-1",
      filter: JSON.stringify({ journal_id: { _in: unique.slice(offset, offset + 50) } }) });
    const { data } = z.object({ data: glLine.array() }).parse(await readDirectusItems("cooperative_gl_lines", query));
    for (const line of data) {
      const current = grouped.get(line.journal_id) ?? [];
      current.push(line);
      grouped.set(line.journal_id, current);
    }
  }
  return grouped;
}

export async function readLoanJournalResults(ids: number[]) {
  const grouped = new Map<number, State>();
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const query = new URLSearchParams({ fields: "journal_id,result", limit: "-1",
      filter: JSON.stringify({ journal_id: { _in: unique.slice(offset, offset + 50) } }) });
    const { data } = z.object({ data: z.array(z.object({ journal_id: z.number(), result: z.record(z.string(), z.unknown()).nullable() })) })
      .parse(await readDirectusItems("cooperative_command_receipts", query));
    for (const row of data) {
      if (row.result) grouped.set(row.journal_id, row.result);
    }
  }
  return grouped;
}

export const loanDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function loanPostingEnabled() {
  // The dummy database is the target for supervised rehearsal. Live posting is a separate rollout.
  return usesCooperativeQaDatabase();
}

export function loanPostingAccounts(policy: PolicyState) {
  return new Map(accountPurposes.flatMap(([purpose, , , classification]) => {
    const mapping = policy.mappings.find(row => row.purpose === purpose);
    const account = policy.accounts.find(row => row.id === mapping?.accountId);
    return account?.isActive && !account.isContra && account.classification === classification
      ? [[purpose, account] as const] : [];
  }));
}

export function requirePostingAccount(accounts: Map<Purpose, Account>, purpose: Purpose) {
  const account = accounts.get(purpose);
  if (!account) {
    const name = accountPurposes.find(([key]) => key === purpose)?.[2];
    throw new LoanError(422, `Map an active Cooperative account for ${name} in Policies.`, "LOAN_ACCOUNT_REQUIRED");
  }
  return account;
}

type Command = { type: string; key: string; hash: string; loanId: number };

export async function findLoanCommand<T extends State>({ type, key, hash, loanId }: Command) {
  const query = new URLSearchParams({
    fields: "loan_id,request_hash,result", limit: "2",
    filter: JSON.stringify({ command_type: { _eq: type }, idempotency_key: { _eq: key } }),
  });
  const { data } = z.object({
    data: z.array(z.object({ loan_id: z.number().nullable(), request_hash: z.string(), result: z.record(z.string(), z.unknown()) })).max(1),
  }).parse(await readDirectusItems("cooperative_command_receipts", query));
  const prior = data[0];
  if (!prior) return null;
  if (prior.loan_id !== loanId || prior.request_hash !== hash) {
    throw new LoanError(409, "This request key was already used for a different loan action.", "IDEMPOTENCY_CONFLICT");
  }
  return { ...prior.result as T, duplicate: true };
}

export function staleLoanReview() {
  return new LoanError(409, "The loan changed during review. Review the current details and confirm again.", "STALE_LOAN_REVIEW");
}

export async function writeLoanCommand<T extends State>(
  command: Command, revision: number, actor: LoanActor,
  prepare: (now: Date) => Promise<{ result: T; changes: State; receipt?: State }>,
) {
  const revisionKey = loanDigest([command.loanId, revision]);
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = new Date();
    const at = cooperativeAuditTime(now);
    const { changes, result, receipt } = await prepare(now);
    try {
      // Directus wraps the loan PATCH and all nested relational writes in one transaction.
      await cooperativeDirectus(`/items/cooperative_loans/${command.loanId}?fields=id`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...changes, revision: revision + 1, updated_at: at, updated_by: actor.actorId,
          enrollment_receipts: { create: [{
            ...receipt, command_type: command.type, idempotency_key: command.key, request_hash: command.hash,
            loan_revision_key: revisionKey, result, actor_user_id: actor.actorId, created_at: at,
          }] },
        }),
      }, 60_000);
      return { ...result, duplicate: false };
    } catch (cause) {
      const prior = await findLoanCommand<T>(command);
      if (prior) return prior;
      const response = await cooperativeDirectus(`/items/cooperative_loans/${command.loanId}?fields=revision`);
      const { data } = z.object({ data: z.object({ revision: z.number() }) }).parse(await response.json());
      if (data.revision !== revision) throw staleLoanReview();
      const collision = cause instanceof CooperativeDirectusError && /unique|duplicate|already exists|deadlock/i.test(cause.detail ?? "");
      if (!collision && cause instanceof CooperativeDirectusError && cause.status < 500) {
        throw new LoanError(422, "Directus rejected the loan action. No changes were saved.", "LOAN_WRITE_REJECTED");
      }
      if (!collision) break;
    }
  }
  throw new LoanError(503, "The loan action could not be confirmed. Retry with the same request.", "LOAN_WRITE_RETRY");
}

export async function prepareLoanJournal(input: {
  loanId: number; type: "LOAN_RELEASE" | "LOAN_DUE_ACCRUAL" | "LOAN_PAYMENT" | "LOAN_PAYMENT_REVERSED";
  date: string; actor: LoanActor; now: Date;
  pairs: LoanPostingPair[];
  feeReceipt?: { membershipId: number; amount: string };
  paymentReceipt?: { membershipId: number; amount: string };
  reversal?: { journalId: number; lines: GlLine[] };
  audit: (numbers: { journalNo: string; orNo: string | null }) => State;
}) {
  const { type, loanId, date, now, actor, feeReceipt, paymentReceipt, reversal } = input;
  const officialReceipt = feeReceipt ?? paymentReceipt;
  if (!loanPostingEnabled()) throw new LoanError(409, "Loan posting is pending rollout in this environment.", "PENDING_ROLLOUT");
  if (input.pairs.some(pair => pair.debit.id === pair.credit.id || amountToCents(pair.amount) <= 0n)) {
    throw new LoanError(422, "Check the Cooperative posting account mappings and amounts.", "LOAN_ACCOUNT_REQUIRED");
  }
  const amounts = [
    ...(reversal?.lines ?? []).map(row => ({ account_id: row.account_id, debit: row.credit, credit: row.debit })),
    ...input.pairs.flatMap(({ debit, credit, amount }) => [
      { account_id: debit.id, debit: amount, credit: "0.00" },
      { account_id: credit.id, debit: "0.00", credit: amount },
    ]),
  ];
  const imbalance = amounts.reduce((net, row) => net + amountToCents(row.debit) - amountToCents(row.credit), 0n);
  if (amounts.length < 2 || imbalance !== 0n) throw new LoanError(422, "The loan journal is unbalanced.", "LOAN_JOURNAL_UNBALANCED");
  const year = Number(date.slice(0, 4));
  const prefixes = officialReceipt ? ["JV", "OR"] : ["JV"];
  const query = new URLSearchParams({
    fields: "id,prefix,last_number", limit: "3",
    filter: JSON.stringify({ business_year: { _eq: year }, prefix: { _in: prefixes } }),
  });
  const { data } = z.object({ data: z.array(z.object({
    id: z.number().int().positive(), prefix: z.string(), last_number: z.number().int().min(0).max(9999),
  })) }).parse(await readDirectusItems("cooperative_number_series", query));
  const series = new Map(data.map(row => [row.prefix, row]));
  if (series.size !== data.length) throw new LoanError(503, "The Cooperative number series requires review.");

  function next(prefix: string) {
    const seriesRow = series.get(prefix);
    const count = (seriesRow?.last_number ?? 0) + 1;
    if (count > 9999) throw new LoanError(409, `The yearly ${prefix} number series is exhausted.`, "SERIES_EXHAUSTED");
    return {
      number: `${prefix}-${year}-${String(count).padStart(4, "0")}`,
      ref: seriesRow ? { id: seriesRow.id, last_number: count } : { prefix, business_year: year, last_number: count },
    };
  }

  const jv = next("JV");
  const or = officialReceipt ? next("OR") : null;
  const journalId = randomInt(100_000_000, 2_000_000_000);
  const numbers = { journalId, journalNo: jv.number, orNo: or?.number ?? null };
  const at = cooperativeAuditTime(now);
  const lines = amounts.map((row, index) => ({ ...row, line_no: index + 1 }));
  return {
    numbers,
    receipt: {
      journal_series_id: jv.ref,
      ...(or ? { receipt_series_id: or.ref } : {}),
      journal_id: {
        id: journalId, journal_no: jv.number, business_date: date, posted_at: at,
        source_type: "LOAN", source_id: String(loanId), command_type: type, actor_user_id: actor.actorId,
        ...(reversal ? { reverses_journal_id: reversal.journalId } : {}),
        gl_lines: { create: lines },
        audit_events: { create: [input.audit(numbers)] },
        ...(or && officialReceipt ? { official_receipts: { create: [{
          or_no: or.number, membership_id: officialReceipt.membershipId, business_date: date, amount: officialReceipt.amount,
          fee_part: feeReceipt?.amount ?? "0.00", deposit_part: "0.00", issued_by: actor.actorId, created_at: at,
          ...(paymentReceipt ? { loan_payment_part: paymentReceipt.amount } : {}),
        }] } } : {}),
      },
    },
  };
}
