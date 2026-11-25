import "server-only";

import { z } from "zod";
import { remittanceChannels, remittanceStates, maxRemittanceProofBytes } from "../remittances/preparation/rules";
import { DEADLINE_RULES, PENALTY_BASES } from "../remittances/agencies/types";
import { GOVERNMENT_LOAN_REMITTANCE_BATCHES, GOVERNMENT_LOAN_REMITTANCES } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { isoDateTime } from "./loan-requests";
import { payrollMoney, payrollMonth, readPayrollPages } from "./payroll-month-store";
import { LoanRequestError, positiveId } from "./request-input";

export const paymentDate = z.iso.date().refine(date => /^[1-9]/.test(date));
export const channelInput = z.enum(Object.keys(remittanceChannels) as [keyof typeof remittanceChannels, ...(keyof typeof remittanceChannels)[]]);
const policySnapshot = z.object({
  deadlineRule: z.enum(Object.keys(DEADLINE_RULES) as [keyof typeof DEADLINE_RULES, ...(keyof typeof DEADLINE_RULES)[]]),
  deadlineDay: z.number().int().nullable(),
  penaltyBasis: z.enum(Object.keys(PENALTY_BASES) as [keyof typeof PENALTY_BASES, ...(keyof typeof PENALTY_BASES)[]]),
  penaltyRatePercent: z.string().nullable(), reminderDays: z.number().int(), revision: positiveId,
});
const sourceSnapshot = z.object({
  receiptId: z.uuid(), receiptRevision: positiveId,
  billingRevisionId: z.uuid().nullable(), billingRevision: positiveId.nullable(),
  discrepancies: z.number().int().nonnegative(), missingBilling: z.boolean(),
  deductionCount: z.number().int().nonnegative(), partialCount: z.number().int().nonnegative(),
});
const batch = z.object({
  id: z.uuid(), command_key: z.uuid(), request_hash: z.string(), payment_date: paymentDate,
  channel: channelInput, uploaded_by: z.string(), uploaded_by_id: positiveId, uploaded_at: z.string(),
  proof_file_id: z.uuid(), proof_name: z.string(), proof_type: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  proof_size: positiveId.pipe(z.number().max(maxRemittanceProofBytes)), proof_hash: z.string(),
});
const fields = Object.keys(batch.shape).join(",");
const payment = z.object({
  id: z.uuid(), batch_id: z.uuid(), agency_id: positiveId, payroll_month: payrollMonth, live_key: z.string().nullable(),
  payment_reference: z.string(), payment_date: paymentDate, state: z.enum(remittanceStates),
  prior_id: z.uuid().nullable(), return_reason: z.string().nullable(), submitted_at: z.string(),
  withheld: payrollMoney, computed_penalty: payrollMoney, entered_penalty: payrollMoney,
  penalty_overridden: z.boolean(), due_date: paymentDate, days_late: z.number().int().nonnegative(),
  policy_snapshot: policySnapshot, source_snapshot: sourceSnapshot, agency_name: z.string(), agency_code: z.string(),
});
export type SavedRemittance = z.output<typeof payment>;
type Batch = z.output<typeof batch>;
const paymentFields = Object.keys(payment.shape).join(",");
const overview = payment.pick({ id: true, agency_id: true, payroll_month: true, state: true, payment_reference: true,
  withheld: true, entered_penalty: true, due_date: true, payment_date: true, return_reason: true, live_key: true });
export type RemittanceOverview = z.output<typeof overview>;

export async function readRemittanceOverview(filter: object) {
  return readPayrollPages(GOVERNMENT_LOAN_REMITTANCES, overview, Object.keys(overview.shape).join(","), filter, "-submitted_at,-id");
}

export async function readSavedBatch(filter: object) {
  const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_REMITTANCE_BATCHES, batch, fields, filter, 1);
  return row ?? null;
}

export async function readSavedRemittance(id: string) {
  const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_REMITTANCES, payment, paymentFields, { id: { _eq: id } }, 1);
  if (!row) throw new LoanRequestError(404, "Remittance could not be found.");
  return row;
}

export function remittanceBatchSummary(row: Batch) {
  return { id: row.id, paymentDate: row.payment_date, channel: row.channel, preparedBy: row.uploaded_by,
    submittedAt: isoDateTime(row.uploaded_at), proofName: row.proof_name };
}
