import "server-only";

import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  AGENCY_HISTORY_ACTIONS, AGENCY_HISTORY_FIELDS, AGENCY_PAGE_SIZE, AGENCY_TYPES, DEADLINE_RULES, PENALTY_BASES,
  parseAgencyList, type Agency, type AgencyHistoryEntry, type AgencyHistoryField, type AgencyHistoryPage,
  type AgencyHistoryValues, type AgencyPage, type AgencySettings,
} from "../remittances/agencies/types";
import {
  GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_AGENCY_HISTORY, GovernmentLoansDirectusError,
  readGovernmentLoansItems, writeGovernmentLoanAgency,
} from "./directus";

export class AgencyError extends Error {
  constructor(readonly status: number, message: string, readonly field?: string) {
    super(message);
  }
}

export type AgencyActor = { actorId: number; actorName: string; actorRole: string | null };
type AgencyPolicy = AgencySettings & { isActive: boolean };

const agencyType = z.enum(Object.keys(AGENCY_TYPES) as AgencySettings["agencyType"][], "Choose the agency type.");
const deadlineRule = z.enum(Object.keys(DEADLINE_RULES) as AgencySettings["deadlineRule"][], "Choose the remittance deadline.");
const penaltyBasis = z.enum(Object.keys(PENALTY_BASES) as AgencySettings["penaltyBasis"][], "Choose the late-payment penalty.");
const nullableText = (length: number) => z.string().trim().max(length).nullish().transform(value => value || null);
const listItems = z.array(z.string().trim().max(160).regex(/^[^,]*$/, "Separate each option into its own list item.")).max(100)
  .transform(values => {
    const seen = new Set<string>();
    return values.filter(value => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const settings = z.strictObject({
  displayName: z.string().trim().min(1, "Enter the display name.").max(160),
  fullName: z.string().trim().min(1, "Enter the full name.").max(160),
  agencyType,
  programs: listItems.refine(values => values.length > 0, "Enter at least one loan program."),
  referenceExample: nullableText(160),
  paymentReferenceLabel: z.string().trim().max(80).optional().transform(value => value || "Payment reference"),
  payoutOptions: listItems.default([]),
  employerNumber: nullableText(80),
  deadlineRule,
  deadlineDay: z.number().int("Enter a whole deadline day.").nullable(),
  penaltyBasis,
  penaltyRatePercent: z.string().trim().nullable(),
  reminderDays: z.number().int().min(0).max(30).default(5),
  catchUp: z.boolean(),
  sendsBilling: z.boolean(),
});

function validatePolicy(input: AgencySettings, context: z.RefinementCtx) {
  if (input.deadlineRule === "FIXED_DAY" && (input.deadlineDay == null || input.deadlineDay < 1 || input.deadlineDay > 28)) {
    context.addIssue({ code: "custom", path: ["deadlineDay"], message: "Enter the deadline day (1–28)." });
  }
  const rate = input.penaltyRatePercent ?? "";
  if (input.penaltyBasis !== "NONE" && (!/^\d{1,8}(?:\.\d{1,2})?$/.test(rate) || Number(rate) <= 0)) {
    context.addIssue({ code: "custom", path: ["penaltyRatePercent"], message: "Enter a positive penalty rate with up to two decimal places." });
  }
}

const createSettings = settings.extend({
  shortCode: z.string().trim().transform(value => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .pipe(z.string().min(1, "Enter a unique short code.").max(32, "Use at most 32 letters or digits.")),
  isActive: z.boolean("Choose Active or Inactive."),
}).superRefine(validatePolicy);
const updateSettings = settings.extend({
  isActive: z.boolean("Choose Active or Inactive."),
  expectedRevision: z.number().int().min(0),
}).superRefine(validatePolicy);

const integer = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)]).pipe(z.number().int());
const storedFlag = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(value => value === true || value === 1);
const storedAgency = z.object({
  id: integer,
  short_code: z.string(),
  display_name: z.string(),
  full_name: z.string(),
  agency_type: agencyType,
  programs: z.string(),
  reference_example: z.string().nullable(),
  payment_reference_label: z.string(),
  payout_options: z.string().nullable(),
  employer_number: z.string().nullable(),
  deadline_rule: deadlineRule,
  deadline_day: integer.nullable(),
  penalty_basis: penaltyBasis,
  penalty_rate_percent: z.union([z.number(), z.string()]).nullable(),
  reminder_days: integer,
  catch_up: storedFlag,
  sends_billing: storedFlag,
  is_active: storedFlag,
  revision: integer,
});
const fields = Object.keys(storedAgency.shape).join(",");
const agencyRows = z.object({ data: z.array(storedAgency) });
const formatRate = (value: string | number | null) => value == null ? null : Number(value).toFixed(2);

function toAgency(row: z.infer<typeof storedAgency>): Agency {
  return {
    id: row.id,
    shortCode: row.short_code,
    displayName: row.display_name,
    fullName: row.full_name,
    agencyType: row.agency_type,
    programs: parseAgencyList(row.programs),
    referenceExample: row.reference_example,
    paymentReferenceLabel: row.payment_reference_label,
    payoutOptions: parseAgencyList(row.payout_options ?? ""),
    employerNumber: row.employer_number,
    deadlineRule: row.deadline_rule,
    deadlineDay: row.deadline_day,
    penaltyBasis: row.penalty_basis,
    penaltyRatePercent: formatRate(row.penalty_rate_percent),
    reminderDays: row.reminder_days,
    catchUp: row.catch_up,
    sendsBilling: row.sends_billing,
    isActive: row.is_active,
    revision: row.revision,
  };
}

const pageNumber = z.coerce.number().int().min(1).max(Math.floor(2_147_483_647 / AGENCY_PAGE_SIZE)).default(1);
const listQuery = z.object({
  search: z.string().trim().max(160).default(""),
  type: agencyType.optional(),
  status: z.enum(["active", "inactive"]).optional(),
  page: pageNumber,
});

export async function listAgencies(params: URLSearchParams): Promise<AgencyPage> {
  const parsed = listQuery.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new AgencyError(422, "Choose valid agency filters and page.");
  const { search, type, status, page } = parsed.data;
  const filter = {
    ...(search ? { _or: ["short_code", "display_name", "full_name", "programs"].map(field => ({ [field]: { _icontains: search } })) } : {}),
    ...(type ? { agency_type: { _eq: type } } : {}),
    ...(status ? { is_active: { _eq: status === "active" } } : {}),
  };
  const query = new URLSearchParams({
    fields, sort: "display_name,short_code", filter: JSON.stringify(filter),
    limit: String(AGENCY_PAGE_SIZE + 1), offset: String((page - 1) * AGENCY_PAGE_SIZE),
  });
  const { data } = agencyRows.parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_AGENCIES, query));
  return { agencies: data.slice(0, AGENCY_PAGE_SIZE).map(toAgency), hasMore: data.length > AGENCY_PAGE_SIZE };
}

function normalizePolicy(input: AgencyPolicy): AgencyPolicy {
  return {
    ...input,
    deadlineDay: input.deadlineRule === "FIXED_DAY" ? input.deadlineDay : null,
    penaltyRatePercent: input.penaltyBasis === "NONE" ? null : formatRate(input.penaltyRatePercent),
  };
}

function writeFields(input: AgencyPolicy, actorId: number, now: string) {
  return {
    display_name: input.displayName,
    full_name: input.fullName,
    agency_type: input.agencyType,
    programs: input.programs.join(", "),
    reference_example: input.referenceExample,
    payment_reference_label: input.paymentReferenceLabel,
    payout_options: input.payoutOptions.join(", ") || null,
    employer_number: input.employerNumber,
    deadline_rule: input.deadlineRule,
    deadline_day: input.deadlineDay,
    penalty_basis: input.penaltyBasis,
    penalty_rate_percent: input.penaltyRatePercent,
    reminder_days: input.reminderDays,
    catch_up: input.catchUp,
    sends_billing: input.sendsBilling,
    is_active: input.isActive,
    updated_by_user_id: actorId,
    date_updated: now,
  };
}

function validationError(error: z.ZodError) {
  const issue = error.issues[0];
  if (issue.code === "unrecognized_keys" && issue.keys.includes("shortCode")) {
    return new AgencyError(422, "Short code is set when the agency is added.", "shortCode");
  }
  return new AgencyError(422, issue.message, issue.path[0]?.toString());
}

function staleAgency() {
  return new AgencyError(409, "This agency has changed. Reload its saved settings before editing again.", "expectedRevision");
}

async function save(body: object, id?: number) {
  try {
    const { data } = z.object({ data: storedAgency }).parse(await writeGovernmentLoanAgency(body, fields, id));
    return toAgency(data);
  } catch (error) {
    if (error instanceof GovernmentLoansDirectusError) {
      if (error.code === "RECORD_NOT_UNIQUE") {
        throw id === undefined ? new AgencyError(409, "Enter a unique short code.", "shortCode") : staleAgency();
      }
      if (error.status === 404) throw new AgencyError(404, "This agency could not be found.");
    }
    throw error;
  }
}

function policyChanges(previous: AgencyPolicy | null, next: AgencyPolicy) {
  const before: AgencyHistoryValues = {};
  const after: AgencyHistoryValues = {};
  for (const field of Object.keys(AGENCY_HISTORY_FIELDS) as AgencyHistoryField[]) {
    if (previous && isDeepStrictEqual(previous[field], next[field])) continue;
    if (previous) before[field] = previous[field];
    after[field] = next[field];
  }
  return { before: previous ? before : null, after };
}

function historyRecord(shortCode: string, revision: number, action: AgencyHistoryEntry["action"], actor: AgencyActor,
  now: string, revisionKey: string, values: ReturnType<typeof policyChanges>) {
  return {
    agency_code: shortCode,
    agency_revision: revision,
    revision_key: revisionKey,
    action,
    actor_user_id: actor.actorId,
    actor_name: actor.actorName,
    actor_role: actor.actorRole,
    occurred_at: now,
    before_values: values.before,
    after_values: values.after,
  };
}

function agencyId(id: string) {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new AgencyError(404, "This agency could not be found.");
  return Number(id);
}

export async function readAgency(id: number) {
  const query = new URLSearchParams({ fields, filter: JSON.stringify({ id: { _eq: id } }), limit: "1" });
  const { data } = agencyRows.parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_AGENCIES, query));
  if (!data.length) throw new AgencyError(404, "This agency could not be found.");
  return toAgency(data[0]);
}

export const payrollBenefitCodes = new Map([["SSS", "SSS"], ["HDMF", "PAGIBIG"], ["PAGIBIG", "PAGIBIG"]]);
const payrollLoan = z.object({ loan_id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]), status: z.string().nullable() });

async function checkDeactivation(shortCode: string) {
  const benefitCode = payrollBenefitCodes.get(shortCode);
  if (!benefitCode) throw new AgencyError(409, "Payroll’s active-loan source still needs verification for this agency.", "isActive");
  const query = new URLSearchParams({
    fields: "loan_id,status", limit: "1",
    filter: JSON.stringify({ benefit_code: { _eq: benefitCode }, _or: [
      { status: { _nin: ["CLOSED", "CANCELLED"] } }, { status: { _null: true } },
    ] }),
  });
  let loan: z.infer<typeof payrollLoan> | undefined;
  try {
    const { data } = z.object({ data: z.array(payrollLoan).max(1) }).parse(await readGovernmentLoansItems("benefit_loans", query));
    [loan] = data;
  } catch {
    throw new AgencyError(503, "Could not verify active loans. Try again.", "isActive");
  }
  if (loan?.status === "ACTIVE") throw new AgencyError(409, "This agency has active loans.", "isActive");
  if (loan) throw new AgencyError(409, "Confirm this agency’s loan status with Payroll before deactivating.", "isActive");
}

export async function createAgency(body: unknown, actor: AgencyActor) {
  const parsed = createSettings.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const { shortCode } = parsed.data;
  const next = normalizePolicy(parsed.data);
  const revision = 1;
  const now = new Date().toISOString();
  return save({
    ...writeFields(next, actor.actorId, now),
    short_code: shortCode,
    revision,
    created_by_user_id: actor.actorId,
    date_created: now,
    history_entries: { create: [historyRecord(shortCode, revision, "CREATED", actor, now, `create:${shortCode}`, policyChanges(null, next))] },
  });
}

export async function updateAgency(id: string, body: unknown, actor: AgencyActor) {
  const key = agencyId(id);
  const parsed = updateSettings.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error);
  const current = await readAgency(key);
  if (current.revision !== parsed.data.expectedRevision) throw staleAgency();
  const next = normalizePolicy(parsed.data);
  const changes = policyChanges(current, next);
  if (!Object.keys(changes.after).length) return current;

  const deactivating = current.isActive && !next.isActive;
  if (deactivating) await checkDeactivation(current.shortCode);
  const action = deactivating ? "DEACTIVATED" : current.isActive === next.isActive ? "UPDATED" : "ACTIVATED";
  const revision = current.revision + 1;
  const now = new Date().toISOString();
  return save({
    ...writeFields(next, actor.actorId, now),
    revision,
    history_entries: { create: [historyRecord(current.shortCode, revision, action, actor, now, `edit:${key}:${revision}`, changes)] },
  }, key);
}

const historyField = z.enum(Object.keys(AGENCY_HISTORY_FIELDS) as AgencyHistoryField[]);
const historyValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
const historyValues = z.partialRecord(historyField, historyValue);
const storedHistoryEntry = z.object({
  id: integer,
  agency_code: z.string(),
  agency_revision: integer,
  action: z.enum(Object.keys(AGENCY_HISTORY_ACTIONS) as AgencyHistoryEntry["action"][]),
  actor_user_id: integer,
  actor_name: z.string(),
  actor_role: z.string().nullable(),
  occurred_at: z.string(),
  before_values: historyValues.nullable(),
  after_values: historyValues,
});

export async function listAgencyHistory(id: string, params: URLSearchParams): Promise<AgencyHistoryPage> {
  const key = agencyId(id);
  const page = pageNumber.safeParse(params.get("page") ?? undefined);
  if (!page.success) throw new AgencyError(422, "Choose a valid history page.");
  const query = new URLSearchParams({
    fields: Object.keys(storedHistoryEntry.shape).join(","), sort: "-occurred_at,-id",
    filter: JSON.stringify({ agency_id: { _eq: key } }),
    limit: String(AGENCY_PAGE_SIZE + 1), offset: String((page.data - 1) * AGENCY_PAGE_SIZE),
  });
  const { data } = z.object({ data: z.array(storedHistoryEntry) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_AGENCY_HISTORY, query));
  return {
    entries: data.slice(0, AGENCY_PAGE_SIZE).map(row => ({
      id: row.id,
      agencyCode: row.agency_code,
      revision: row.agency_revision,
      action: row.action,
      actorId: row.actor_user_id,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      occurredAt: row.occurred_at,
      before: row.before_values,
      after: row.after_values,
    })),
    hasMore: data.length > AGENCY_PAGE_SIZE,
  };
}
