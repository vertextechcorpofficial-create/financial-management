import "server-only";

import { z } from "zod";
import { AGENCY_HISTORY_FIELDS } from "../remittances/agencies/types";
import {
  GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_AGENCY_HISTORY, GOVERNMENT_LOAN_BILLING_REVISIONS, GOVERNMENT_LOAN_CLOSES,
  GOVERNMENT_LOAN_IMPORT_BATCHES, GOVERNMENT_LOAN_PAYROLL_RECEIPTS, GOVERNMENT_LOAN_REMITTANCE_BATCHES,
  GOVERNMENT_LOAN_REMITTANCE_DECISIONS, GOVERNMENT_LOAN_REMITTANCES, GOVERNMENT_LOAN_REQUEST_HISTORY,
  GOVERNMENT_LOAN_SETUP_EVENTS, GOVERNMENT_LOAN_STAFF_EVENTS, type GovernmentLoansCollection,
} from "./directus";
import { readEnrollmentRows, readGroups } from "./enrollment-sources";
import { isoDateTime, referenceFor } from "./loan-requests";
import { LoanRequestError, parseInput, positiveId } from "./request-input";
import { csvReport, pageReport, reportQuery, sortReport } from "./report-output";

type Values = Record<string, unknown>;
const values = (value: unknown): Values => value && typeof value === "object" && !Array.isArray(value) ? value as Values : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const scalar = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) :
  typeof value === "boolean" ? (value ? "Yes" : "No") : "";
const title = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, part => part.toUpperCase());
const textList = (...items: string[]) => items.filter(Boolean);
const field = (label: string, value: unknown) => scalar(value) ? label + " " + scalar(value) : "";
const loanRefs = (id: unknown) => positiveId.safeParse(id).success ?
  [referenceFor(Number(id)), "GL-" + String(id).padStart(6, "0")] : [];
const reason = (row: Values) => field("Reason", row.reason);
const revision = (row: Values) => field("Revision", row.revision);
const note = (row: Values) => field("Note", row.note);
const auditRow = z.object({ id: z.union([z.number().int().positive(), z.string()]) }).catchall(z.unknown());
type Row = z.output<typeof auditRow>;
type Entry = { key: string; source: string; id: string | number; at: string; time: number; actor: string; actorId: string;
  role: string; action: string; label: string; references: string[]; details: string[] };
type Normalized = Pick<Entry, "action" | "references" | "details"> & Partial<Pick<Entry, "actor" | "actorId" | "role">>;

const paymentSchema = z.object({ id: z.uuid(), batch_id: z.uuid(), agency_code: z.string(), payroll_month: z.string(), payment_reference: z.string() });
type Payment = z.output<typeof paymentSchema>;
const allPaymentRefs = (row?: Payment) => row ? [row.payment_reference, row.agency_code + " " + row.payroll_month, row.payroll_month, row.id] : [];
const agencySchema = z.object({ id: positiveId, short_code: z.string() });

type Lookups = { payments: Map<string, Payment>; batches: Map<string, Payment[]>; agencies: Map<number, string> };
type Source = { collection: GovernmentLoansCollection; time: string; actor: string; actorId?: string; role?: string; fields: string[];
  normalize: (row: Row, lookup: Lookups) => Normalized };

function bulkDetails(items: unknown[], lookup: Lookups) {
  const selections = items.map(values);
  const skipped = selections.filter(item => item.outcome === "skipped" || item.approved === false);
  const references = selections.flatMap(item => textList(scalar(item.reference), ...loanRefs(item.id), ...allPaymentRefs(lookup.payments.get(scalar(item.id))), scalar(item.id)));
  return { references, details: [`${selections.length - skipped.length} completed · ${skipped.length} skipped`,
    ...skipped.map(item => (scalar(item.reference) || allPaymentRefs(lookup.payments.get(scalar(item.id)))[0] ||
      loanRefs(item.id)[0] || scalar(item.id)) + " · " + (scalar(item.reason) || "Skipped"))] };
}

const sources: Source[] = [
  { collection: GOVERNMENT_LOAN_REQUEST_HISTORY, time: "occurred_at", actor: "actor_name", actorId: "actor_user_id", role: "actor_role",
    fields: ["request_id", "revision", "action", "before_values", "after_values"],
    normalize: (row, lookup) => {
      const before = values(row.before_values);
      const after = values(row.after_values);
      const change = values(after.loanChange);
      const bulk = list(after.items);
      const affected = [...list(after.requestIds), ...list(after.enrollmentIds)].flatMap(loanRefs);
      const outcome = bulk.length ? bulkDetails(bulk, lookup) : null;
      const details = textList(revision(row), before.status !== after.status ?
        [scalar(before.status), scalar(after.status)].filter(Boolean).map(title).join(" → ") : "",
        reason(after), scalar(after.remarks), field("Reverses revision", after.reversedRevision),
        field("Effective month", change.month), field("Agency reference", change.reference), field("Amount", change.amount),
        field("Previous amount", change.previousAmount), field("Suspended through", change.throughMonth),
        field("Separation date", change.separationDate), field("Agency balance", change.balance),
        field("Instruction status", after.instructionState), ...(outcome?.details ?? []));
      return { action: scalar(row.action), references: textList(...loanRefs(row.request_id),
        scalar(change.reference), ...affected, ...(outcome?.references ?? [])), details };
    } },
  { collection: GOVERNMENT_LOAN_AGENCY_HISTORY, time: "occurred_at", actor: "actor_name", actorId: "actor_user_id", role: "actor_role",
    fields: ["agency_code", "agency_revision", "action", "before_values", "after_values"],
    normalize: row => {
      const before = values(row.before_values);
      const after = values(row.after_values);
      const show = (value: unknown) => (Array.isArray(value) ? value.map(scalar).filter(Boolean).join(", ") : scalar(value)) || "—";
      return { action: "AGENCY_" + scalar(row.action), references: textList(scalar(row.agency_code)),
        details: textList(field("Revision", row.agency_revision), ...Object.entries(AGENCY_HISTORY_FIELDS)
          .filter(([key]) => key in after).map(([key, label]) => label + " " + show(before[key]) + " → " + show(after[key]))) };
    } },
  { collection: GOVERNMENT_LOAN_PAYROLL_RECEIPTS, time: "received_at", actor: "received_by",
    fields: ["month", "revision", "previous_id", "reason", "audit", "coverage"],
    normalize: row => {
      const audit = values(row.audit);
      const coverage = values(row.coverage);
      const runs = list(coverage.cutoffs).flatMap(cutoff => list(values(cutoff).runIds).map(id => field("Payroll run", id)));
      return { action: row.previous_id ? "CORRECT_PAYROLL_RECEIPT" : "RECEIVE_PAYROLL_RESULTS",
        actor: scalar(audit.actor) || scalar(row.received_by) || "Payroll system", role: scalar(audit.role),
        references: textList(scalar(row.month), scalar(row.previous_id), scalar(coverage.approvalReference), ...runs,
          ...list(audit.finalPay).flatMap(item => loanRefs(values(item).loanId))),
        details: textList(revision(row), field("Replaces receipt", row.previous_id), reason(row),
          field("Confirmed by", audit.confirmedBy), field("Coverage", coverage.approvalReference), ...runs) };
    } },
  { collection: GOVERNMENT_LOAN_BILLING_REVISIONS, time: "uploaded_at", actor: "uploaded_by", actorId: "uploaded_by_id",
    fields: ["agency_id", "month", "revision", "previous_id", "file_name", "row_count", "reason"],
    normalize: (row, lookup) => {
      const agency = lookup.agencies.get(Number(row.agency_id)) ?? "Agency " + scalar(row.agency_id);
      return { action: row.previous_id ? "AGENCY_BILLING_REVISED" : "AGENCY_BILLING_IMPORTED",
        references: textList(agency + " " + scalar(row.month), scalar(row.month), scalar(row.previous_id), scalar(row.file_name)),
        details: textList(revision(row), field("Replaces bill", row.previous_id), field("Rows", row.row_count), reason(row)) };
    } },
  { collection: GOVERNMENT_LOAN_REMITTANCE_BATCHES, time: "uploaded_at", actor: "uploaded_by", actorId: "uploaded_by_id",
    fields: ["payment_date", "channel", "audit"], normalize: (row, lookup) => {
      const audit = values(row.audit);
      return { action: "REMITTANCE_PREPARED", role: scalar(audit.actorRole),
        references: textList(...(lookup.batches.get(String(row.id)) ?? []).flatMap(allPaymentRefs), ...list(audit.agencyMonths).map(scalar)),
        details: textList(field("Payment date", row.payment_date), field("Channel", row.channel)) };
    } },
  { collection: GOVERNMENT_LOAN_REMITTANCE_DECISIONS, time: "decided_at", actor: "actor_name", actorId: "actor_id", role: "actor_role",
    fields: ["action", "reason", "evidence", "remittance_id"],
    normalize: (row, lookup) => {
      const evidence = values(row.evidence);
      const payment = values(evidence.payment);
      const bulk = row.action === "BULK_COMPLETE" ? bulkDetails(list(evidence.items), lookup) : null;
      const references = [...allPaymentRefs(lookup.payments.get(scalar(row.remittance_id))), ...(bulk?.references ?? []),
        ...list(evidence.ids).flatMap(id => [scalar(id), ...allPaymentRefs(lookup.payments.get(scalar(id)))])];
      const action = { APPROVE: "REMITTANCE_APPROVED", RETURN: "REMITTANCE_RETURNED",
        BULK_START: "BULK_REMITTANCE_STARTED", BULK_COMPLETE: "BULK_REMITTANCE_COMPLETED" }[scalar(row.action)];
      return { action: action ?? "REMITTANCE_DECISION", references: textList(scalar(payment.reference),
        scalar(payment.month), ...references), details: textList(reason(row), field("Principal", payment.amount),
        field("Penalty", payment.penalty), ...(bulk?.details ?? [])) };
    } },
  { collection: GOVERNMENT_LOAN_CLOSES, time: "closed_at", actor: "actor_name", actorId: "actor_id", role: "actor_role",
    fields: ["month", "next_month", "reason", "checklist"],
    normalize: row => ({ action: "PERIOD_CLOSED", references: textList(scalar(row.month), scalar(row.next_month)),
      details: textList(field("Next open month", row.next_month), field("Open items", values(row.checklist).openItemCount), reason(row)) }) },
  { collection: GOVERNMENT_LOAN_SETUP_EVENTS, time: "recorded_at", actor: "actor_name", actorId: "actor_id", role: "actor_role",
    fields: ["action", "month", "previous_month", "detail"],
    normalize: row => {
      const detail = values(row.detail);
      const actions: Record<string, string> = { INITIALIZE_PERIOD: "PERIOD_INITIALIZED", CHANGE_PERIOD: "PERIOD_CHANGED",
        SAVE_CONTRACT: "PAYROLL_COVERAGE_SAVED", CLEAR_CONTRACT: "PAYROLL_COVERAGE_CLEARED" };
      const action = actions[scalar(row.action)];
      return { action: action ?? scalar(row.action),
        references: textList(scalar(row.month), scalar(row.previous_month), scalar(detail.approvalReference),
          ...list(detail.runIds).map(scalar)),
        details: textList(field("Previous month", row.previous_month), field("New month", row.month), reason(detail),
          field("Payroll approval", detail.approvalReference), field("Cutoffs", list(detail.cutoffs).length),
          field("Payroll runs", list(detail.runIds).length), field("Withholding controls", detail.controls),
          field("File", detail.fileName)) };
    } },
  { collection: GOVERNMENT_LOAN_STAFF_EVENTS, time: "recorded_at", actor: "actor_name", actorId: "actor_id", role: "actor_role",
    fields: ["kind", "reference", "loan_id", "employee_id", "revision", "status", "detail"],
    normalize: row => ({ action: "STAFF_" + scalar(row.kind) + "_" + scalar(row.status),
      references: textList(scalar(row.reference), ...loanRefs(row.loan_id), field("Employee", row.employee_id)),
      details: textList(revision(row), title(scalar(row.status)), note(values(row.detail)), field("Effective date", values(row.detail).effectiveDate)) }) },
  { collection: GOVERNMENT_LOAN_IMPORT_BATCHES, time: "created_at", actor: "actor_name", actorId: "actor_user_id", role: "actor_role",
    fields: ["filename", "open_month", "ready_count", "skipped_count", "warning_count"],
    normalize: row => ({ action: "ENROLLMENT_IMPORTED", references: textList(scalar(row.filename), scalar(row.open_month)),
      details: textList(field("Imported", row.ready_count), field("Skipped", row.skipped_count), field("Warnings", row.warning_count)) }) },
];

const cursorInput = z.object({ at: z.iso.datetime(), source: z.string(), id: z.union([z.number().int().positive(), z.string().min(1).max(64)]) });
type Cursor = z.output<typeof cursorInput>;
const filtersInput = z.object({ user: z.string().trim().max(120).default(""), action: z.string().trim().max(100).default(""),
  reference: z.string().trim().max(200).default(""), from: z.iso.date().optional(), to: z.iso.date().optional(),
  cursor: z.string().max(512).optional(), ...reportQuery("audit", "at", "desc") });
const pageSize = 25;
const sourceActions: Partial<Record<GovernmentLoansCollection, string[]>> = {
  [GOVERNMENT_LOAN_AGENCY_HISTORY]: ["AGENCY_CREATED", "AGENCY_UPDATED", "AGENCY_ACTIVATED", "AGENCY_DEACTIVATED"],
  [GOVERNMENT_LOAN_PAYROLL_RECEIPTS]: ["CORRECT_PAYROLL_RECEIPT", "RECEIVE_PAYROLL_RESULTS"],
  [GOVERNMENT_LOAN_BILLING_REVISIONS]: ["AGENCY_BILLING_REVISED", "AGENCY_BILLING_IMPORTED"],
  [GOVERNMENT_LOAN_REMITTANCE_BATCHES]: ["REMITTANCE_PREPARED"],
  [GOVERNMENT_LOAN_REMITTANCE_DECISIONS]: ["REMITTANCE_APPROVED", "REMITTANCE_RETURNED", "BULK_REMITTANCE_STARTED", "BULK_REMITTANCE_COMPLETED"],
  [GOVERNMENT_LOAN_CLOSES]: ["PERIOD_CLOSED"],
  [GOVERNMENT_LOAN_SETUP_EVENTS]: ["PERIOD_INITIALIZED", "PERIOD_CHANGED", "PAYROLL_COVERAGE_SAVED", "PAYROLL_COVERAGE_CLEARED"],
  [GOVERNMENT_LOAN_STAFF_EVENTS]: ["STAFF_DECLARATION_DECLARED", "STAFF_CLEARANCE_ISSUED",
    "STAFF_DISPUTE_OPEN", "STAFF_DISPUTE_IN_PROGRESS", "STAFF_DISPUTE_RESOLVED"],
  [GOVERNMENT_LOAN_IMPORT_BATCHES]: ["ENROLLMENT_IMPORTED"],
};
const matchesAction = (action: string, filter: string) =>
  [action.toLowerCase(), title(action).toLowerCase()].some(value => value.includes(filter.toLowerCase()));
const manilaStart = (date: string) => new Date(date + "T00:00:00+08:00").toISOString().slice(0, -1);
const manilaEndExclusive = (date: string) => new Date(Date.parse(date + "T00:00:00+08:00") + 86_400_000).toISOString().slice(0, -1);

function auditCursor(value: string | undefined) {
  if (!value) return null;
  try {
    const cursor = cursorInput.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!sources.some(source => source.collection === cursor.source)) throw new Error("Invalid source");
    return cursor;
  } catch {
    throw new LoanRequestError(422, "Choose a valid audit page.");
  }
}

async function lookupFor(source: Source, rows: Row[]): Promise<Lookups> {
  const payments = new Map<string, Payment>();
  const batches = new Map<string, Payment[]>();
  const agencies = new Map<number, string>();
  if (source.collection === GOVERNMENT_LOAN_REMITTANCE_DECISIONS || source.collection === GOVERNMENT_LOAN_REMITTANCE_BATCHES) {
    const byBatch = source.collection === GOVERNMENT_LOAN_REMITTANCE_BATCHES;
    const ids = byBatch ? rows.map(row => String(row.id)) : rows.flatMap(row => {
      const evidence = values(row.evidence);
      return textList(scalar(row.remittance_id), ...list(evidence.ids).map(scalar), ...list(evidence.items).map(item => scalar(values(item).id)));
    });
    const records = await readGroups<Payment, string>(GOVERNMENT_LOAN_REMITTANCES, paymentSchema, ids,
      group => ({ [byBatch ? "batch_id" : "id"]: { _in: group } }), "id");
    for (const payment of records) {
      payments.set(payment.id, payment);
      const batch = batches.get(payment.batch_id) ?? [];
      batch.push(payment);
      batches.set(payment.batch_id, batch);
    }
  }
  if (source.collection === GOVERNMENT_LOAN_BILLING_REVISIONS) {
    const records = await readGroups<z.output<typeof agencySchema>, number>(GOVERNMENT_LOAN_AGENCIES, agencySchema,
      rows.map(row => Number(row.agency_id)).filter(id => Number.isSafeInteger(id) && id > 0), ids => ({ id: { _in: ids } }), "id");
    for (const row of records) agencies.set(row.id, row.short_code);
  }
  return { payments, batches, agencies };
}

async function* sourceEntries(source: Source, cursor: Cursor | null, filters: z.output<typeof filtersInput>): AsyncGenerator<Entry, void> {
  if (filters.action && sourceActions[source.collection]?.every(action => !matchesAction(action, filters.action))) return;
  const fields = ["id", source.time, source.actor, source.actorId, source.role, ...source.fields].filter(Boolean).join(",");
  // Directus stores these dateTime fields in UTC without an offset.
  const clauses = [];
  if (filters.from) clauses.push({ [source.time]: { _gte: manilaStart(filters.from) } });
  if (filters.to) clauses.push({ [source.time]: { _lt: manilaEndExclusive(filters.to) } });
  if (filters.action && source.collection === GOVERNMENT_LOAN_REQUEST_HISTORY) {
    clauses.push({ action: { _icontains: filters.action.replaceAll(" ", "_") } });
  }
  if (cursor) {
    const at = cursor.at.slice(0, -1);
    if (source.collection === cursor.source) clauses.push({ _or: [
      { [source.time]: { _lt: at } }, { [source.time]: { _eq: at }, id: { _lt: cursor.id } },
    ] });
    else clauses.push({ [source.time]: { [source.collection > cursor.source ? "_lte" : "_lt"]: at } });
  }
  if (filters.user && source.collection !== GOVERNMENT_LOAN_PAYROLL_RECEIPTS) {
    const alternatives = [{ [source.actor]: { _icontains: filters.user } }];
    const id = positiveId.safeParse(filters.user);
    if (id.success && source.actorId) clauses.push({ _or: [...alternatives, { [source.actorId]: { _eq: id.data } }] });
    else clauses.push(alternatives[0]);
  }
  const filter = clauses.length ? { _and: clauses } : {};
  for (let offset = 0; ; offset += pageSize) {
    const rows = await readEnrollmentRows(source.collection, auditRow, fields, filter, pageSize, "-" + source.time + ",-id", offset);
    const lookup = await lookupFor(source, rows);
    for (const row of rows) {
      const mapped = source.normalize(row, lookup);
      const time = Date.parse(isoDateTime(scalar(row[source.time])));
      if (!Number.isFinite(time)) continue;
      const actor = mapped.actor || scalar(row[source.actor]) || "Unknown actor";
      const actorId = mapped.actorId || scalar(source.actorId ? row[source.actorId] : null);
      const role = mapped.role || scalar(source.role ? row[source.role] : null);
      const label = title(mapped.action);
      const references = [...new Set(textList(...mapped.references, String(row.id)))];
      const payrollConfirmation = source.collection === GOVERNMENT_LOAN_PAYROLL_RECEIPTS ? values(row.audit) : {};
      const userSearch = filters.user.toLowerCase();
      if (userSearch && !actor.toLowerCase().includes(userSearch) && actorId !== userSearch &&
          !scalar(payrollConfirmation.confirmedBy).toLowerCase().includes(userSearch) && scalar(payrollConfirmation.confirmedById) !== userSearch) continue;
      if (!matchesAction(mapped.action, filters.action)) continue;
      if (filters.reference && ![...references, ...mapped.details].some(value => value.toLowerCase().includes(filters.reference.toLowerCase()))) continue;
      yield { key: source.collection + ":" + row.id, source: source.collection, id: row.id, at: new Date(time).toISOString(),
        time, actor, actorId, role, action: mapped.action, label, references, details: mapped.details };
    }
    if (rows.length < pageSize) return;
  }
}

export async function reportAuditTrail(params: URLSearchParams, full = false) {
  const filters = parseInput(filtersInput, Object.fromEntries(params));
  if (filters.from && filters.to && filters.from > filters.to) throw new LoanRequestError(422, "Choose an end date on or after the start date.");
  const cursor = full ? null : auditCursor(filters.cursor);
  if (cursor && (filters.sort !== "at" || filters.direction !== "desc" || filters.page !== 1)) {
    throw new LoanRequestError(422, "Choose a valid audit page for this sort.");
  }
  const streams = sources.map(source => sourceEntries(source, cursor, filters));
  // Prime and merge small source batches instead of loading every history row.
  const heads: IteratorResult<Entry, void>[] = [];
  for (const stream of streams) heads.push(await stream.next());
  const events: Entry[] = [];
  const useNewestOrder = filters.sort === "at" && filters.direction === "desc";
  const offset = (filters.page - 1) * filters.size;
  let total = 0;
  for (;;) {
    const index = heads.reduce((best, head, index) => {
      if (head.done) return best;
      const previous = heads[best];
      if (!previous || previous.done) return index;
      const current = previous.value;
      return head.value.time > current.time || (head.value.time === current.time && head.value.source < current.source) ? index : best;
    }, -1);
    if (index === -1) break;
    const head = heads[index];
    if (head.done) break;
    if (full || !useNewestOrder || (total >= offset && total < offset + filters.size)) events.push(head.value);
    total++;
    heads[index] = await streams[index].next();
  }
  if (!useNewestOrder) {
    sortReport(events, row => filters.sort === "at" ? row.time : filters.sort === "reference" ? row.references[0] ?? null :
      filters.sort === "detail" ? row.details.join(" ") : filters.sort === "actor" ? row.actor : row.label, row => row.key, filters.direction);
  }
  const visible = useNewestOrder ? events : pageReport(events, filters, full);
  const last = visible.at(-1);
  return { items: visible.map(({ key, at, actor, actorId, role, action, label, references, details }) =>
    ({ key, at, actor, actorId, role, action, label, references, details })),
  total, hasMore: total > filters.page * filters.size,
  nextCursor: !full && useNewestOrder && total > filters.page * filters.size && last ?
    Buffer.from(JSON.stringify({ at: last.at, source: last.source, id: last.id })).toString("base64url") : null };
}

export async function exportAuditTrail(params: URLSearchParams) {
  const report = await reportAuditTrail(params, true);
  const manila = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila" });
  return csvReport("audit-trail", [
    ["Time (Manila)", "Timestamp (UTC)", "User", "User ID", "Role", "Action", "References", "Details", "Event ID"],
    ...report.items.map(row => [manila.format(new Date(row.at)), row.at, row.actor, row.actorId, row.role, row.label,
      row.references.join("\n"), row.details.join("\n"), row.key]),
  ], report.total);
}
