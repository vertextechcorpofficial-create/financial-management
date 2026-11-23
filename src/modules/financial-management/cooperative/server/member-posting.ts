import "server-only";

import { randomInt, createHash } from "node:crypto";
import { z } from "zod";
import { cooperativeDirectus, readDirectusItems } from "./directus";
import { getPolicies } from "./policies";
import { MemberError } from "./member-errors";
import { nestedTransactionEntries } from "./transaction-index";
import type { EnrollmentCheck, EnrollmentResult } from "../members/types";

const int = z.coerce.number().int().positive();
const commandType = "MEMBERSHIP_ACTIVATION";
const money = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
const cents = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const add = (left: string, right: string) => money(cents(left) + cents(right));

type SeriesRow = { id: number; prefix: string; business_year: number; last_number: number };
const seriesSchema = z.object({ id: int, prefix: z.string(), business_year: int, last_number: z.number().int().nonnegative() });
const receiptSchema = z.object({
  id: int,
  request_hash: z.string(),
  result: z.record(z.string(), z.unknown()).nullable(),
});
type Receipt = z.output<typeof receiptSchema>;

async function rows<T extends z.ZodType>(collection: Parameters<typeof readDirectusItems>[0], fields: string, schema: T, query: { filter?: object; sort?: string; limit?: number }) {
  const params = new URLSearchParams({ fields, limit: String(query.limit ?? -1) });
  if (query.filter) params.set("filter", JSON.stringify(query.filter));
  if (query.sort) params.set("sort", query.sort);
  return z.object({ data: z.array(schema) }).parse(await readDirectusItems(collection, params)).data;
}

async function accountMap() {
  const state = await getPolicies();
  const accounts = new Map(state.accounts.map(account => [account.id, account]));
  const map = new Map<string, { id: number }>();
  for (const mapping of state.mappings) {
    const account = accounts.get(mapping.accountId);
    if (account) map.set(mapping.purpose, account);
  }
  for (const purpose of ["CASH_ON_HAND", "DUE_FROM_EMPLOYER", "MEMBERSHIP_FEE_INCOME", "MEMBER_SAVINGS"]) {
    if (!map.get(purpose)) throw new MemberError(503, `Map the Cooperative account purpose ${purpose} before enrolling members.`);
  }
  return map;
}

async function readSeries(year: number, prefixes: string[]) {
  const stored = await rows("cooperative_number_series", "id,prefix,business_year,last_number", seriesSchema, {
    filter: { _and: [{ business_year: { _eq: year } }, { prefix: { _in: prefixes } }] },
  });
  return new Map(stored.map(row => [row.prefix, row]));
}

function seriesRef(series: SeriesRow | undefined, prefix: string, year: number, next: number) {
  return series
    ? { id: series.id, last_number: next }
    : { prefix, business_year: year, last_number: next };
}

function nextNumber(series: SeriesRow | undefined) {
  const next = (series?.last_number ?? 0) + 1;
  if (next > 9999) throw new MemberError(409, "The yearly Cooperative number series is exhausted.", "SERIES_EXHAUSTED");
  return next;
}

function agreementNumber(year: number, number: number) {
  return `MA-${String(year).padStart(4, "0")}-${String(number).padStart(4, "0")}`;
}

export async function previewAgreementNumber(signedAt: string) {
  const year = Number(signedAt.slice(0, 4));
  const series = await readSeries(year, ["MA"]);
  return agreementNumber(year, nextNumber(series.get("MA")));
}

function requestHash(input: { userId: number; signedAt: string; savingsPerCutoff: string; openingDeposit: string; feeChannel: string; beneficiary: string }) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function findReceipt(key: string): Promise<Receipt | undefined> {
  const [receipt] = await rows("cooperative_command_receipts", "id,request_hash,result", receiptSchema, {
    filter: { _and: [{ command_type: { _eq: commandType } }, { idempotency_key: { _eq: key } }] },
    limit: 1,
  });
  return receipt;
}

async function membershipForUser(userId: number) {
  const [membership] = await rows("cooperative_memberships", "id", z.object({ id: int }), {
    filter: { user_id: { _eq: userId } }, limit: 1,
  });
  return membership;
}

function resultFromReceipt(receipt: Receipt, hash: string): EnrollmentResult {
  if (receipt.request_hash !== hash) throw new MemberError(409, "This enrollment request key already belongs to different inputs.", "IDEMPOTENCY_CONFLICT");
  if (!receipt.result) throw new MemberError(409, "The saved enrollment result is unavailable. Review the member register.", "ENROLLMENT_RECOVERED");
  const membership = receipt.result as unknown as EnrollmentResult["membership"];
  return { duplicate: true, membership };
}

function payload(check: EnrollmentCheck, key: string, hash: string, actor: { actorId: number; actorName: string; actorRole: string | null }, accounts: Map<string, { id: number }>, series: Map<string, SeriesRow>, membershipId: number) {
  const year = Number(check.inputs.signedAt.slice(0, 4));
  const maNumber = nextNumber(series.get("MA"));
  const jvNumber = nextNumber(series.get("JV"));
  const agreementNo = agreementNumber(year, maNumber);
  const journalNo = `JV-${year}-${String(jvNumber).padStart(4, "0")}`;
  const fee = check.values.feeAmount;
  const deposit = check.inputs.openingDeposit;
  const feeCounter = check.inputs.feeChannel === "COUNTER" ? fee : "0.00";
  const feePayroll = check.inputs.feeChannel === "PAYROLL" ? fee : "0.00";
  const counterAmount = add(feeCounter, deposit);
  const orNumber = cents(counterAmount) > 0n ? nextNumber(series.get("OR")) : null;
  const orNo = orNumber ? `OR-${year}-${String(orNumber).padStart(4, "0")}` : null;
  const now = new Date().toISOString().slice(0, 19);
  const lines: Array<{ account_id: number; line_no: number; debit: string; credit: string }> = [];
  let line = 0;
  const debit = (purpose: string, amount: string) => {
    if (cents(amount) <= 0n) return;
    line += 1;
    lines.push({ account_id: accounts.get(purpose)!.id, line_no: line, debit: amount, credit: "0.00" });
  };
  const credit = (purpose: string, amount: string) => {
    if (cents(amount) <= 0n) return;
    line += 1;
    lines.push({ account_id: accounts.get(purpose)!.id, line_no: line, debit: "0.00", credit: amount });
  };
  debit("CASH_ON_HAND", add(feeCounter, deposit));
  debit("DUE_FROM_EMPLOYER", feePayroll);
  credit("MEMBERSHIP_FEE_INCOME", fee);
  credit("MEMBER_SAVINGS", deposit);
  const journalId = randomInt(100_000_000, 2_000_000_000);
  const journal = lines.length ? {
    id: journalId,
    journal_no: journalNo,
    business_date: check.inputs.signedAt,
    command_type: commandType,
    source_type: "MEMBERSHIP",
    source_id: String(membershipId),
    actor_user_id: actor.actorId,
    posted_at: now,
    gl_lines: { create: lines },
    audit_events: { create: [{
      actor_user_id: actor.actorId,
      actor_role: actor.actorRole,
      actor_name: actor.actorName,
      action: "MEMBERSHIP_ACTIVATED",
      entity_type: "MEMBERSHIP",
      entity_id: String(membershipId),
      before_state: null,
      after_state: {
        agreementNo, journalNo, orNo, userId: check.employee.userId,
        savingsPerCutoff: check.inputs.savingsPerCutoff, openingDeposit: deposit,
        membershipFee: fee, feeChannel: check.inputs.feeChannel,
      },
      reason: null,
      occurred_at: now,
      user_agent: "Cooperative Members enrollment",
    }] },
  } : null;
  const result: EnrollmentResult["membership"] = {
    membershipId, userId: check.employee.userId, employeeNumber: check.employee.employeeNumber,
    employeeName: check.employee.employeeName, departmentName: check.employee.departmentName,
    status: "ACTIVE", joinedAt: check.inputs.signedAt, savingsPerCutoff: check.inputs.savingsPerCutoff,
    openingDeposit: deposit, membershipFee: fee, feeChannel: check.inputs.feeChannel,
    beneficiary: check.inputs.beneficiary || null, savingsBalance: deposit,
    policyRevision: check.policy.revision, agreementNo, signedAt: check.inputs.signedAt,
    journalNo: journal ? journalNo : null, orNo, journalId: journal ? journalId : null,
  };
  const terms = {
    employee: check.employee, policy: check.policy, payroll: check.payroll, inputs: check.inputs,
    values: check.values, agreementNo, journalNo: journal ? journalNo : null, orNo, generatedAt: now,
  };
  const body = {
    command_type: commandType,
    idempotency_key: key,
    request_hash: hash,
    actor_user_id: actor.actorId,
    journal_id: journal ? journalId : null,
    created_at: now,
    result,
    membership_id: {
      id: membershipId,
      user_id: check.employee.userId,
      employee_number: check.employee.employeeNumber,
      employee_name: check.employee.employeeName,
      department_name: check.employee.departmentName,
      status: "ACTIVE",
      joined_at: check.inputs.signedAt,
      savings_per_cutoff: check.inputs.savingsPerCutoff,
      opening_deposit: deposit,
      membership_fee: fee,
      fee_channel: check.inputs.feeChannel,
      beneficiary: check.inputs.beneficiary || null,
      savings_balance: deposit,
      policy_revision: check.policy.revision,
      created_at: now,
      created_by: actor.actorId,
      agreement: { create: [{
        agreement_no: agreementNo, signed_at: check.inputs.signedAt, policy_revision: check.policy.revision,
        terms_snapshot: terms, created_at: now, created_by: actor.actorId,
      }] },
      ...(journal ? { journal_id: journal } : {}),
      ...(journal ? nestedTransactionEntries({ id: journalId, date: check.inputs.signedAt, postedAt: now }, [
        ...(cents(deposit) > 0n ? [{ kind: "SAVINGS_DEPOSIT", memberId: membershipId, channel: "OTC",
          amount: deposit, sourceReference: agreementNo, orNo }] as const : []),
        ...(cents(fee) > 0n ? [{ kind: "MEMBERSHIP_FEE", memberId: membershipId,
          channel: check.inputs.feeChannel === "COUNTER" ? "OTC" : "PAYROLL",
          amount: fee, sourceReference: agreementNo, orNo: check.inputs.feeChannel === "COUNTER" ? orNo : null }] as const : []),
      ]) : {}),
      ...(cents(deposit) > 0n && journal ? {
        savings_entries: { create: [{
          membership_id: membershipId, journal_id: journalId, entry_date: check.inputs.signedAt, kind: "OPENING",
          amount: deposit, balance_after: deposit, reference: agreementNo, posted_at: now, posted_by: actor.actorId,
        }] },
      } : {}),
      ...(orNo && journal ? {
        official_receipts: { create: [{
          or_no: orNo, membership_id: membershipId, journal_id: journalId, business_date: check.inputs.signedAt,
          amount: counterAmount, fee_part: feeCounter, deposit_part: deposit,
          issued_by: actor.actorId, created_at: now,
        }] },
      } : {}),
    },
    membership_series_id: seriesRef(series.get("MA"), "MA", year, maNumber),
    ...(journal ? { journal_series_id: seriesRef(series.get("JV"), "JV", year, jvNumber) } : {}),
    ...(orNo ? { receipt_series_id: seriesRef(series.get("OR"), "OR", year, orNumber!) } : {}),
  };
  return { body, result };
}

export async function createMembershipActivation(
  check: EnrollmentCheck,
  key: string,
  actor: { actorId: number; actorName: string; actorRole: string | null },
  expectedFingerprint: string,
) {
  const hash = requestHash({ ...check.inputs, userId: check.employee.userId });
  const prior = await findReceipt(key);
  if (prior) return resultFromReceipt(prior, hash);
  if (expectedFingerprint !== check.fingerprint) {
    throw new MemberError(409, "The membership terms or verified pay changed. Review the latest values before enrolling.", "STALE_TERMS", undefined, {
      fingerprint: check.fingerprint,
      fieldErrors: check.fieldErrors,
      checks: check.checks,
    });
  }
  if (!check.canEnroll) {
    const hasFieldErrors = Object.keys(check.fieldErrors).length > 0;
    throw new MemberError(
      hasFieldErrors ? 422 : 409,
      hasFieldErrors ? "Resolve the enrollment checks before continuing." : "The employee is not eligible for enrollment.",
      "NOT_ELIGIBLE",
      undefined,
      { fieldErrors: check.fieldErrors, checks: check.checks, fingerprint: check.fingerprint },
    );
  }
  const accounts = await accountMap();
  const year = Number(check.inputs.signedAt.slice(0, 4));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const series = await readSeries(year, ["MA", "JV", "OR"]);
    const membershipId = randomInt(100_000_000, 2_000_000_000);
    const prepared = payload(check, key, hash, actor, accounts, series, membershipId);
    try {
      const response = await cooperativeDirectus(`/items/cooperative_command_receipts?fields=result`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prepared.body),
      }, 60_000);
      const saved = z.object({
        data: z.object({ result: z.record(z.string(), z.unknown()).nullable() }),
      }).parse(await response.json()).data;
      return {
        duplicate: false,
        membership: (saved.result as unknown as EnrollmentResult["membership"] | null) ?? prepared.result,
      } satisfies EnrollmentResult;
    } catch (error) {
      const recovered = await findReceipt(key).catch(() => undefined);
      if (recovered) return resultFromReceipt(recovered, hash);
      const existing = await membershipForUser(check.employee.userId).catch(() => undefined);
      if (existing) throw new MemberError(409, "This employee already has a Cooperative membership.", "ALREADY_MEMBER");
      if (attempt === 2) throw error;
    }
  }
  throw new MemberError(503, "The membership activation could not be completed. Try again with the same request key.", "ACTIVATION_RETRY");
}
