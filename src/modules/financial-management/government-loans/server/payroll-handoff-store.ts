import "server-only";

import { z } from "zod";
import { payrollAcknowledgement, payrollHandoffPayload } from "../payroll-handoff/contract";
import { handoffStatusLabels, type HandoffStatus, type PayrollHandoffView, type PayrollInstructionRow } from "../payroll-handoff/types";
import type { Page } from "../requests/types";
import { GOVERNMENT_LOAN_PAYROLL_HANDOFFS } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { isoDateTime, referenceFor } from "./loan-requests";
import { pageNumber, parseInput, positiveId } from "./request-input";

export const handoffStatus = z.enum(Object.keys(handoffStatusLabels) as HandoffStatus[]);
export const payrollFileEvidence = z.object({ name: z.string(), revision: positiveId, importedBy: z.string(), importedAt: z.iso.datetime() });
const storedHandoff = z.object({
  id: z.uuid(), request_id: positiveId, state: handoffStatus,
  payload: payrollHandoffPayload,
  delivery: z.object({
    reason: z.string().nullable(),
    acknowledgements: z.array(payrollAcknowledgement).max(2),
    lease: z.object({ id: z.uuid(), expiresAt: z.iso.datetime() }).nullable(),
    fileExchange: z.boolean().default(false),
    lastExportedAt: z.iso.datetime().nullable().default(null),
    lastImport: payrollFileEvidence.nullable().default(null),
  }),
  updated_at: z.string(),
});
export type StoredHandoff = z.output<typeof storedHandoff>;
const handoffFields = Object.keys(storedHandoff.shape).join(",");

export function readPayrollHandoff(id: number) {
  return readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_HANDOFFS, storedHandoff, handoffFields, { request_id: { _eq: id } }, 1)
    .then(rows => rows[0] ?? null);
}

export async function readSuccessorHandoff(payrollLoanId: number) {
  const [handoff] = await readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_HANDOFFS, storedHandoff, handoffFields, {
    prior_payroll_loan_id: { _eq: payrollLoanId },
  }, 1);
  return handoff ?? null;
}

type Successor = { enrollmentId: number; effectiveMonth: string; state: HandoffStatus };

function successorView(handoff: StoredHandoff | null): Successor | null {
  if (!handoff?.payload.stop || handoff.state === "CANCELLED" || (!handoff.delivery.fileExchange && handoff.state !== "ACCEPTED")) return null;
  return { enrollmentId: handoff.request_id, effectiveMonth: handoff.payload.stop.effectiveMonth, state: handoff.state };
}

export async function readRegisterRenewals(payrollLoanIds: number[]): Promise<Map<number, Successor>> {
  if (!payrollLoanIds.length) return new Map();
  const handoffs = await readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_HANDOFFS, storedHandoff, handoffFields,
    { prior_payroll_loan_id: { _in: payrollLoanIds } }, payrollLoanIds.length);
  const renewals = new Map<number, Successor>();
  for (const handoff of handoffs) {
    const successor = successorView(handoff);
    if (successor && handoff.payload.stop) renewals.set(handoff.payload.stop.payrollLoanId, successor);
  }
  return renewals;
}

export function hasPayrollLease(handoff: StoredHandoff, now = Date.now()) {
  return handoff.delivery.lease !== null && Date.parse(handoff.delivery.lease.expiresAt) > now;
}

function instructionDetails(handoff: StoredHandoff): PayrollHandoffView {
  return {
    payload: handoff.payload, state: handoff.state, acknowledgements: handoff.delivery.acknowledgements,
    reason: handoff.delivery.reason, updatedAt: isoDateTime(handoff.updated_at),
    fileExchange: handoff.delivery.fileExchange, lastImport: handoff.delivery.lastImport,
  };
}

export async function enrollmentPayrollLinks(row: { id: number; status: string; payroll_loan_id: number | null }) {
  const active = row.status === "ACTIVE";
  const [handoff, successor] = await Promise.all([
    active || row.status === "ACTIVATING" ? readPayrollHandoff(row.id) : null,
    active && row.payroll_loan_id ? readSuccessorHandoff(row.payroll_loan_id) : null,
  ]);
  return {
    payrollHandoff: handoff ? instructionDetails(handoff) : null,
    successor: successorView(successor),
  };
}

const instructionRow = storedHandoff.extend({
  request_id: z.object({ id: positiveId, revision: positiveId, employee_name: z.string().nullable(), agency_name: z.string().nullable(), requested_at: z.string().nullable() }),
});
const instructionQuery = z.object({ q: z.string().trim().max(120).default(""), page: pageNumber, state: handoffStatus.optional() });

export async function listPayrollInstructions(params: URLSearchParams): Promise<Page<PayrollInstructionRow>> {
  const { q, page, state } = parseInput(instructionQuery, Object.fromEntries(params));
  const ref = /^(?:GLR?-)?0*([1-9]\d{0,9})$/i.exec(q)?.[1];
  const filter = {
    ...(state ? { state: { _eq: state } } : {}),
    ...(q ? { request_id: { _or: [
      { employee_name: { _icontains: q } }, { live_reference_key: { _icontains: q } },
      ...(ref ? [{ id: { _eq: Number(ref) } }] : []),
    ] } } : {}),
  };
  const limit = 25;
  const rows = await readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_HANDOFFS, instructionRow,
    "id,state,payload,delivery,updated_at,request_id.id,request_id.revision,request_id.employee_name,request_id.agency_name,request_id.requested_at",
    filter, limit + 1, "-updated_at,id", (page - 1) * limit);
  return {
    hasMore: rows.length > limit,
    items: rows.slice(0, limit).map(({ request_id: loan, ...row }) => ({
      ...instructionDetails({ ...row, request_id: loan.id }),
      revision: loan.revision,
      reference: loan.requested_at ? referenceFor(loan.id) : "GL-" + String(loan.id).padStart(6, "0"),
      employeeName: loan.employee_name, agencyName: loan.agency_name,
    })),
  };
}
