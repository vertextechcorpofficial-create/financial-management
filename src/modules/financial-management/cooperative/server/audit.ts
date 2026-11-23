import "server-only";

import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { readDirectusItems } from "./directus";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type AuditState = Record<string, JsonValue>;
type Subject = { type: string; id: number | string };

const pageSize = 50;
const manila = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila", dateStyle: "short", timeStyle: "medium",
});
const auditFields = z.object({
  id: z.number(),
  actor_user_id: z.number(),
  actor_role: z.string().nullable(),
  actor_name: z.string().nullish(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  before_state: z.record(z.string(), z.unknown()).nullable(),
  after_state: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
  occurred_at: z.string(),
});

export function cooperativeAuditTime(now = new Date()) {
  // Directus dateTime fields omit the timezone. Write and interpret them as UTC.
  return now.toISOString().slice(0, 19);
}

export function cooperativeAuditEvent(
  actor: { actorId: number; actorRole: string | null },
  change: { subject: Subject; action: string; before?: AuditState; after?: AuditState; reason?: string; userAgent?: string | null },
  now = new Date(),
) {
  const { action, subject } = change;
  const entityId = String(subject.id);
  const reason = change.reason?.trim() || null;
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(action) || !/^[A-Z][A-Z0-9_]{0,63}$/.test(subject.type) ||
      !entityId || entityId.length > 80 || (reason?.length ?? 0) > 500) {
    throw new Error("Invalid Cooperative audit event.");
  }
  if (/(?:^|_)(REVERSED|REJECTED|CANCELLED|CANCELED)$/.test(action) && !reason) {
    throw new Error("A reason is required for this action.");
  }
  const before = change.before ?? {};
  const after = change.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !isDeepStrictEqual(before[key], after[key]));
  const changedFields = (state: AuditState) => Object.fromEntries(
    keys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]),
  );
  return {
    actor_user_id: actor.actorId,
    actor_role: actor.actorRole,
    action,
    entity_type: subject.type,
    entity_id: entityId,
    before_state: change.before ? changedFields(before) : null,
    after_state: change.after ? changedFields(after) : null,
    reason,
    user_agent: change.userAgent?.slice(0, 500) || null,
    occurred_at: cooperativeAuditTime(now),
  };
}

// Resolve the subject against the current VOS grant before calling this reader.
export async function readCooperativeAuditHistory(subject: Subject, page = 1) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger((page - 1) * pageSize)) {
    throw new RangeError("Invalid audit history page.");
  }
  const query = new URLSearchParams({
    fields: Object.keys(auditFields.shape).join(","),
    filter: JSON.stringify({ entity_type: { _eq: subject.type }, entity_id: { _eq: String(subject.id) } }),
    sort: "-occurred_at,-id",
    limit: String(pageSize + 1),
    offset: String((page - 1) * pageSize),
  });
  const { data } = z.object({ data: z.array(auditFields) }).parse(await readDirectusItems("cooperative_audit_events", query));
  return {
    items: data.slice(0, pageSize).map(row => ({
      id: row.id,
      actorId: row.actor_user_id,
      actorRole: row.actor_role,
      actorName: row.actor_name ?? null,
      action: row.action,
      recordType: row.entity_type,
      recordId: row.entity_id,
      before: row.before_state,
      after: row.after_state,
      reason: row.reason,
      occurredAt: `${row.occurred_at}Z`,
      occurredAtManila: manila.format(new Date(`${row.occurred_at}Z`)),
    })),
    hasMore: data.length > pageSize,
  };
}
