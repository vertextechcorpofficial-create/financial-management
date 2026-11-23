import "server-only";

import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { cooperativeDirectus, CooperativeDirectusError, readDirectusItems } from "./directus";
import { assessLoanEnrollment, loanDraftError, loanDraftSchema } from "./loan-enrollment";
import { LoanError } from "./loans";

const commandType = "LOAN_ENROLLMENT";
const resultSchema = z.object({
  id: z.number().int().positive(), loanNo: z.string(), agreementNo: z.string(), status: z.literal("PENDING"),
});

const submission = z.object({
  draft: loanDraftSchema,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  requestKey: z.uuid(),
  signed: z.literal(true, { error: "Confirm that the member signed the agreement and promissory note." }),
});
const seriesSchema = z.object({ id: z.number().int().positive(), prefix: z.string(), last_number: z.number().int().min(0).max(9999) });

type Actor = { actorId: number; actorRole: string | null; actorName: string };
export type LoanEnrollmentResult = z.infer<typeof resultSchema>;
const digest = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");

async function replay(requestKey: string, requestHash: string) {
  const query = new URLSearchParams({
    fields: "request_hash,result", limit: "2",
    filter: JSON.stringify({ command_type: { _eq: commandType }, idempotency_key: { _eq: requestKey } }),
  });
  const payload = await readDirectusItems("cooperative_command_receipts", query);
  const { data } = z.object({
    data: z.array(z.object({ request_hash: z.string(), result: resultSchema })).max(1),
  }).parse(payload);
  const receipt = data[0];
  if (!receipt) return null;
  if (receipt.request_hash !== requestHash) throw new LoanError(409, "This request was already used for different loan details.", "IDEMPOTENCY_CONFLICT");
  return { ...receipt.result, duplicate: true };
}

async function numbers(year: number, prefix: string) {
  const query = new URLSearchParams({
    fields: "id,prefix,last_number", limit: "-1",
    filter: JSON.stringify({ business_year: { _eq: year }, prefix: { _in: [prefix, "LA"] } }),
  });
  const { data } = z.object({ data: z.array(seriesSchema) }).parse(await readDirectusItems("cooperative_number_series", query));
  const series = new Map(data.map(row => [row.prefix, row]));
  if (series.size !== data.length || prefix === "LA") throw new LoanError(503, "The Cooperative number series requires review.");

  function next(value: string) {
    const row = series.get(value);
    const counter = (row?.last_number ?? 0) + 1;
    if (counter > 9999) throw new LoanError(409, "The yearly " + value + " number series is exhausted.", "SERIES_EXHAUSTED");
    return {
      number: value + "-" + year + "-" + String(counter).padStart(4, "0"),
      reference: row ? { id: row.id, last_number: counter } : { prefix: value, business_year: year, last_number: counter },
    };
  }
  return { loan: next(prefix), agreement: next("LA") };
}

export async function saveLoanEnrollment(payload: unknown, actor: Actor) {
  const parsed = submission.safeParse(payload);
  if (!parsed.success) throw loanDraftError(parsed.error);
  const { draft, fingerprint, requestKey } = parsed.data;
  const requestHash = digest([actor.actorId, draft, fingerprint]);
  const prior = await replay(requestKey, requestHash);
  if (prior) return prior;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { member, snapshot, loanIds, canEnroll, fingerprint: current } = await assessLoanEnrollment(draft);
    if (fingerprint !== current) {
      // Another attempt with the same key may have committed since the first receipt read.
      const recovered = await replay(requestKey, requestHash);
      if (recovered) return recovered;
      throw new LoanError(409, "The assessment changed. Review the updated terms and confirm signing again.", "STALE_ASSESSMENT");
    }
    if (!canEnroll) throw new LoanError(422, "Resolve the loan eligibility checks before enrolling.", "NOT_ELIGIBLE");

    const series = await numbers(Number(snapshot.signingDate.slice(0, 4)), snapshot.prefix);
    const id = randomInt(100_000_000, 2_000_000_000);
    const result: LoanEnrollmentResult = { id, loanNo: series.loan.number, agreementNo: series.agreement.number, status: "PENDING" };
    const createdAt = cooperativeAuditTime();
    const audit = cooperativeAuditEvent(actor, {
      subject: { type: "LOAN", id }, action: "LOAN_ENROLLED",
      after: { loanNo: result.loanNo, agreementNo: result.agreementNo, memberId: member.id, status: result.status,
        principal: snapshot.principal, product: snapshot.productCode, policyRevision: snapshot.policyRevision },
    });
    const body = {
      id, loan_no: result.loanNo, agreement_no: result.agreementNo, status: result.status,
      member_id: member.id, member_no: String(member.user_id), member_name: member.employee_name, department_name: member.department_name,
      product_id: snapshot.productId, product_code: snapshot.productCode, product_name: snapshot.productName, product_kind: snapshot.kind,
      product_item_id: snapshot.item?.id ?? null, item_name: snapshot.item?.name ?? null, item_quantity: snapshot.item?.quantity ?? 1,
      principal: snapshot.principal, rate: snapshot.kind === "CASH" ? snapshot.ratePercent : "0.000000",
      markup: snapshot.kind === "GOODS" ? snapshot.ratePercent : "0.000000", method: snapshot.method.toUpperCase(), months: snapshot.term,
      frequency: snapshot.frequency.toUpperCase(), mode: snapshot.mode.toUpperCase(), purpose: snapshot.purpose || null,
      release_method: snapshot.releaseMethod, processing_fee: snapshot.processingFee, penalty_percent: snapshot.penaltyPercent,
      grace_days: snapshot.graceDays, total_payable: snapshot.pricing.totalPayable, applied_on: snapshot.signingDate,
      agreement_signed: true, terms_snapshot: { ...snapshot, ...result, signed: true, recordedBy: actor.actorId },
      revision: 0, created_at: createdAt, created_by: actor.actorId, updated_at: createdAt, updated_by: actor.actorId,
      last_event_id: { ...audit, actor_name: actor.actorName },
      enrollment_receipts: { create: [{
        command_type: commandType, idempotency_key: requestKey, request_hash: requestHash, actor_user_id: actor.actorId,
        result, created_at: createdAt, loan_enrollment_guard_key: digest([member.id, loanIds]),
        loan_series_id: series.loan.reference, loan_agreement_series_id: series.agreement.reference,
      }] },
    };
    try {
      await cooperativeDirectus("/items/cooperative_loans?fields=id", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }, 60_000);
      return { ...result, duplicate: false };
    } catch (cause) {
      const recovered = await replay(requestKey, requestHash);
      if (recovered) return recovered;
      if (!(cause instanceof CooperativeDirectusError) || !/unique|duplicate|already exists/i.test(cause.detail ?? "")) {
        throw new LoanError(503, "The loan save could not be confirmed. Retry with the same request.", "ENROLLMENT_RETRY");
      }
    }
  }
  throw new LoanError(409, "The number series is busy. Retry this enrollment.", "ENROLLMENT_CONTENTION");
}
