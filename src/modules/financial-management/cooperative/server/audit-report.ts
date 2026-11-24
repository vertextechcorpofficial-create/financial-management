import "server-only";

import { z } from "zod";
import { manilaUtcRange, reportManilaTime } from "../console/reports/report-dates";
import type { ReportResult, ReportRow } from "../console/reports/types";
import { peso, statusText } from "../members/format";
import type { StatementPeriod } from "../members/types";
import { policyFieldLabel, policyValue } from "../policies/policy-labels";
import { cooperativeAuditFields } from "./audit";
import { readDirectusByIds, readDirectusPages } from "./directus";

const event = cooperativeAuditFields.extend({ journal_id: z.number().int().positive().nullish() });
const actor = event.pick({ actor_user_id: true, actor_name: true, actor_role: true, action: true });
type AuditEvent = z.output<typeof event>;
type Actor = z.output<typeof actor>;

const referenceKeys = ["agreementNo", "loanNo", "clearance", "clearanceNo", "reference", "sourceReference",
  "bankReference", "payoutReference", "journalNo", "originalJournal", "orNo", "journals"];
const monetary = new Set([
  "amount", "balance", "savingsBalance", "savingsBefore", "savingsAfter", "savingsRestored", "savingsPerCutoff",
  "openingDeposit", "membershipFee", "principal", "interest", "penalty", "penalties", "prepaidIncome",
  "processingFee", "remaining", "finalPay", "refund", "dividend", "withheld", "finalPayUsed",
  "maintainingBalance", "minimumSavings", "floorFixedAmount", "fixedCeiling", "netSurplus",
  "reserve", "education", "savingsCredits", "patronageRefunds", "undividedSurplus",
]);
const approved = new Set([
  ...referenceKeys, ...monetary, "status", "state", "membershipStatus", "accountingStatus", "category", "channel", "feeChannel",
  "policyRevision", "revision", "accountId", "purpose", "periodEnd", "approvedOn", "releasedOn", "releaseMethod",
  "receiptDate", "businessDate", "bankDate", "payrollRunId", "cutoffDate", "rowsPosted", "exceptions", "dueDate", "assessedOn",
  "installment", "confirmed", "paymentId", "reason", "separationDate", "reviewedWithMemberAndHr", "evidence", "removedAt",
  "name", "shortName", "code", "account", "kind", "classification", "isContra", "isActive", "isOpen", "enforcement",
  "prefix", "methods", "rateMin", "rateDefault", "rateMax", "markup", "termsMonths", "frequencies", "modes",
  "limitType", "savingsMultiple", "minimumMembershipMonths", "penaltyPercent", "graceDays",
  "withdrawalsPerYear", "floorMode", "floorPercent", "paymentOrder", "exitSavingsAnnualRates",
  "year", "reservePercent", "educationPercent", "savingsSharePercent",
]);
const scalar = z.union([z.string().max(500), z.number(), z.boolean()]);
const sources = [
  ["MEMBERSHIP", "cooperative_membership_agreements", "membership_id", ["agreement_no"]],
  ["LOAN", "cooperative_loans", "id", ["loan_no", "agreement_no"]],
  ["WITHDRAWAL", "cooperative_withdrawal_requests", "id", ["request_no"]],
  ["CLEARANCE", "cooperative_clearances", "id", ["clearance_no"]],
  ["PAYROLL_REMITTANCE", "cooperative_payroll_remittance_batches", "id", ["bank_reference"]],
] as const;

function recordedValue(key: string, input: unknown): string | null {
  if (input == null || input === "") return null;
  if (key === "evidence") {
    const parsed = z.object({ source: z.enum(["HR", "PAYROLL"]), reference: z.string().max(160) }).safeParse(input);
    return parsed.success ? parsed.data.source + " · " + parsed.data.reference : null;
  }
  if (key === "exitSavingsAnnualRates") {
    const rates = z.record(z.string().regex(/^\d{4}$/), z.string().regex(/^\d+(?:\.\d+)?$/)).safeParse(input);
    return rates.success ? policyValue(key, rates.data) : null;
  }
  if (Array.isArray(input)) {
    const list = z.array(scalar).max(100).safeParse(input);
    return list.success ? policyValue(key, list.data) : null;
  }
  const value = scalar.safeParse(input);
  if (!value.success) return null;
  if (monetary.has(key) && /^-?\d+(?:\.\d{1,2})?$/.test(String(value.data))) return peso(String(value.data));
  if (typeof value.data === "string" && /^[A-Z][A-Z_]+$/.test(value.data) && ["status", "state", "membershipStatus", "accountingStatus"].includes(key)) {
    return statusText(value.data);
  }
  return policyValue(key, value.data);
}

function visibleChanges(row: AuditEvent): NonNullable<ReportRow["changes"]> {
  const keys = new Set([...Object.keys(row.before_state ?? {}), ...Object.keys(row.after_state ?? {})]);
  return [...keys].filter(key => approved.has(key)).flatMap(key => {
    const before = recordedValue(key, row.before_state?.[key]);
    const after = recordedValue(key, row.after_state?.[key]);
    return before === after ? [] : [{ field: policyFieldLabel(key), before, after }];
  });
}

function savedRefs(row: AuditEvent) {
  return [row.after_state, row.before_state].flatMap(state => referenceKeys.flatMap(key => {
    const value = state?.[key];
    const candidates = Array.isArray(value) ? value : [value];
    return candidates.filter((item): item is string => typeof item === "string" && Boolean(item.trim()) && item.length <= 160);
  }));
}

async function readReferences(events: AuditEvent[]) {
  const result = new Map<string, string[]>();
  await Promise.all(sources.map(async ([type, collection, field, fields]) => {
    const ids = events.flatMap(row => row.entity_type === type && /^[1-9]\d{0,9}$/.test(row.entity_id) ? [Number(row.entity_id)] : []);
    const rows = await readDirectusByIds(collection, z.record(z.string(), z.unknown()), [field, ...fields].join(","), field, ids)
      .catch(() => []);
    for (const row of rows) {
      const key = type + ":" + String(row[field]);
      const valid = fields.flatMap(field => typeof row[field] === "string" && row[field] ? [String(row[field])] : []);
      result.set(key, [...result.get(key) ?? [], ...valid]);
    }
  }));
  return result;
}

async function missingActorNames(actors: Actor[]) {
  const ids = [...new Set(actors.flatMap(row => row.actor_name?.trim() || row.actor_user_id === 0 ? [] : [row.actor_user_id]))];
  const names = new Map<number, string>();
  const user = z.object({ user_id: z.number(), user_fname: z.string().nullish(), user_lname: z.string().nullish() });
  for (let offset = 0; offset < ids.length; offset += 50) {
    const rows = await readDirectusPages("user", user, {
      fields: Object.keys(user.shape).join(","), sort: "user_id",
      filter: JSON.stringify({ user_id: { _in: ids.slice(offset, offset + 50) } }),
    }).catch(() => []);
    for (const row of rows) {
      const name = [row.user_fname, row.user_lname].map(part => part?.trim()).filter(Boolean).join(" ");
      if (name) names.set(row.user_id, name);
    }
  }
  return names;
}

export async function getAuditReport(period: StatementPeriod, filters: { actorId?: number; action: string; q: string }): Promise<ReportResult> {
  const date = { occurred_at: manilaUtcRange(period.from, period.to) };
  const [events, choices] = await Promise.all([
    readDirectusPages("cooperative_audit_events", event, {
      fields: Object.keys(event.shape).join(","), sort: "-occurred_at,-id", filter: JSON.stringify({
        ...date, ...(filters.actorId !== undefined ? { actor_user_id: { _eq: filters.actorId } } : {}),
        ...(filters.action ? { action: { _eq: filters.action } } : {}),
      }),
    }),
    readDirectusPages("cooperative_audit_events", actor, {
      groupBy: "actor_user_id,actor_name,actor_role,action", "aggregate[count]": "*",
      sort: "actor_user_id,actor_name,actor_role,action", filter: JSON.stringify(date),
    }),
  ]);
  const [sourceRefs, names, journals, evidence] = await Promise.all([
    readReferences(events),
    missingActorNames([...choices, ...events]),
    readDirectusByIds("cooperative_journals", z.object({ id: z.number(), journal_no: z.string() }),
      "id,journal_no", "id", events.flatMap(row => row.journal_id ? [row.journal_id] : [])).catch(() => []),
    readDirectusByIds("cooperative_reconciliation_evidence", z.object({ audit_event_id: z.number(), source_reference: z.string() }),
      "audit_event_id,source_reference", "audit_event_id",
      events.filter(row => row.entity_type === "RECONCILIATION_EVIDENCE").map(row => row.id)).catch(() => []),
  ]);
  const byJournal = new Map(journals.map(row => [row.id, row.journal_no]));
  const byEvidenceEvent = new Map(evidence.map(row => [row.audit_event_id, row.source_reference]));
  const actorName = (row: Actor) => row.actor_name?.trim() ||
    (row.actor_user_id === 0 || row.actor_role === "SYSTEM" ? "System" : names.get(row.actor_user_id) || "User " + row.actor_user_id);
  const actorOptions = new Map(choices.map(row => [row.actor_user_id, actorName(row)]));
  for (const row of choices) {
    if (row.actor_name?.trim()) actorOptions.set(row.actor_user_id, actorName(row));
  }
  const actionOptions = [...new Set(choices.map(row => row.action))].map(code => ({ code, name: statusText(code) }));
  const rows = events.flatMap(row => {
    const key = row.entity_type + ":" + row.entity_id;
    const journal = row.journal_id ? byJournal.get(row.journal_id) : undefined;
    const evidenceReference = byEvidenceEvent.get(row.id);
    const references = [...new Set([...savedRefs(row), ...sourceRefs.get(key) ?? [], journal, evidenceReference]
      .filter((reference): reference is string => Boolean(reference)))];
    const subject = statusText(row.entity_type) + " " + row.entity_id;
    if (filters.q && ![subject, key, ...references].some(ref => ref.toLocaleLowerCase("en-PH").includes(filters.q))) return [];
    const changes = visibleChanges(row);
    return [{ id: row.id, changes, cells: [
      reportManilaTime(row.occurred_at), actorName(row), statusText(row.action), statusText(row.entity_type),
      references.length ? references.join(" · ") : subject, row.reason,
      changes.map(change => change.field + " · " + (change.before ?? "—") + " → " + (change.after ?? "—")).join(" | ") || null,
    ] }];
  });
  return {
    columns: [
      { label: "When (PHT)" }, { label: "Actor" }, { label: "Action" }, { label: "Record type" },
      { label: "Reference" }, { label: "Decision reason" }, { label: "Recorded changes", kind: "changes" },
    ],
    rows, totals: [], departments: [], metadata: [["From", period.from], ["To", period.to]],
    actors: [...actorOptions].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
    actions: actionOptions.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
