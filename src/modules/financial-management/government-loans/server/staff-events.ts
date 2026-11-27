import "server-only";

import { z } from "zod";
import type { AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_STAFF_EVENTS, GovernmentLoansDirectusError, writeGovernmentLoansItem } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { LoanRequestError, positiveId } from "./request-input";
import type { loanCommand } from "./loan-requests";
import type { nextPeriodCommand } from "./period-commands";

export const staffEvent = z.object({
  id: z.uuid(), reference: z.uuid(), event_key: z.string(), command_key: z.uuid(), request_hash: z.string(),
  kind: z.enum(["DECLARATION", "CLEARANCE", "DISPUTE"]), employee_id: positiveId, loan_id: positiveId.nullable(),
  revision: positiveId, status: z.enum(["DECLARED", "ISSUED", "OPEN", "IN_PROGRESS", "RESOLVED"]),
  recorded_at: z.string(), actor_id: positiveId, actor_name: z.string(), actor_role: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
});
export type StaffEvent = z.output<typeof staffEvent>;
type Command = ReturnType<typeof loanCommand>;
const fields = Object.keys(staffEvent.shape).join(",");

export function readStaffEvents(filter: object, limit: number, sort = "-recorded_at,id", offset?: number) {
  return readEnrollmentRows(GOVERNMENT_LOAN_STAFF_EVENTS, staffEvent, fields, filter, limit, sort, offset);
}

export async function staffEventReplay(command: Command) {
  const [row] = await readStaffEvents({ command_key: { _eq: command.key } }, 1);
  if (!row) return null;
  if (row.actor_id !== command.actor.actorId || row.request_hash !== command.hash) {
    throw new LoanRequestError(409, "This action key was already used.");
  }
  return row;
}

export async function saveStaffEvent(command: Command, values: Pick<StaffEvent,
  "id" | "reference" | "event_key" | "kind" | "employee_id" | "loan_id" | "revision" | "status" | "detail">,
  actor: AgencyActor, period?: Awaited<ReturnType<typeof nextPeriodCommand>>) {
  const row = { ...values, command_key: command.key, request_hash: command.hash, recorded_at: new Date().toISOString(),
    actor_id: actor.actorId, actor_name: actor.actorName, actor_role: actor.actorRole };
  try {
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_STAFF_EVENTS, { ...row, ...(period ? { period_command_id: period } : {}) }, "id");
    return row;
  } catch (error) {
    const prior = await staffEventReplay(command);
    if (prior) return prior;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      throw new LoanRequestError(409, "Another action changed this record. Reload and review it.");
    }
    throw error;
  }
}

const personSchema = z.object({
  user_id: positiveId, user_fname: z.string().nullable(), user_lname: z.string().nullable(), user_mname: z.string().nullable(),
  user_dateOfHire: z.iso.date().nullable(), separation_date: z.iso.date().nullable(),
});
export const personFields = Object.keys(personSchema.shape).join(",");
export const staffEmployee = personSchema;
export const employeeFilter = { is_employee: { _eq: true },
  _and: [{ _or: [{ is_deleted: { _null: true } }, { is_deleted: { _eq: false } }] }] };

export async function assertNoIssuedClearance(id: number) {
  const [employee] = await readEnrollmentRows("user", staffEmployee, personFields, { user_id: { _eq: id }, ...employeeFilter }, 1);
  if (!employee?.separation_date) return;
  const [clearance] = await readStaffEvents({ event_key: { _eq: "clearance:" + id + ":" + employee.separation_date } }, 1);
  if (clearance) throw new LoanRequestError(409, "Loan clearance has already been issued for this separation.");
}
