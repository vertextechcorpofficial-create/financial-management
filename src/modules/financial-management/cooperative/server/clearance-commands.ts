import "server-only";

import { randomInt } from "node:crypto";
import { z } from "zod";
import { money } from "../policies/policy-types";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import {
  clearanceCollection, ClearanceError, clearanceId, clearanceReason, clearanceStatus, evidenceDocumentId,
  finalPaySource, readClearance, readFinalPayDocument, readOpenClearance, requireActiveClearanceMember, type ClearanceRow,
} from "./clearance-store";
import { cooperativeDirectus, CooperativeDirectusError } from "./directus";
import { loanDigest, nextCooperativeNumbers, type LoanActor } from "./loan-commands";
import { todayManila } from "./member-read";
import { findSavingsCommand } from "./savings-commands";

const details = z.object({
  separationDate: z.iso.date(), reason: clearanceReason, notes: z.string().trim().max(300).default(""),
});
const key = z.object({ requestKey: z.uuid() });
const expected = key.extend({ revision: z.number().int().nonnegative() });
const createInput = details.extend({ ...key.shape, memberId: clearanceId });
const editInput = details.extend(expected.shape);
const decideInput = z.discriminatedUnion("action", [
  expected.extend({ action: z.literal("cancel"), reason: z.string().trim().min(1).max(500) }),
  expected.extend({
    action: z.literal("verify-final-pay"), amount: money, source: finalPaySource,
    reference: z.string().trim().min(1).max(120), documentId: evidenceDocumentId, confirmed: z.literal(true),
  }),
]);
const resultSchema = z.object({ id: clearanceId, reference: z.string(), status: clearanceStatus, revision: z.number().int().nonnegative() });
type Command = { type: string; key: string; hash: string; result: typeof resultSchema };
type AuditChange = Parameters<typeof cooperativeAuditEvent>[1];
type Values = Record<string, unknown>;
type PreparedChange = { changes: Values; status?: ClearanceRow["status"]; audit?: Omit<AuditChange, "subject"> };

export type ClearanceActionResult = z.output<typeof resultSchema> & { duplicate: boolean };

function parse<T extends z.ZodType>(schema: T, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ClearanceError(422, "Check the clearance details.", "CLEARANCE_INPUT",
      Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0]), issue.message])));
  }
  return result.data;
}

function command(type: string, key: string, actor: LoanActor, data: unknown): Command {
  return { type, key, hash: loanDigest([actor.actorId, data]), result: resultSchema };
}

function event(actor: LoanActor, id: number, change: Omit<AuditChange, "subject">, now: Date) {
  return { ...cooperativeAuditEvent(actor, { ...change, subject: { type: "CLEARANCE", id } }, now), actor_name: actor.actorName };
}

function receipt(cmd: Command, actor: LoanActor, result: z.output<typeof resultSchema>, now: Date, revision?: number) {
  return {
    command_type: cmd.type, idempotency_key: cmd.key, request_hash: cmd.hash, actor_user_id: actor.actorId,
    created_at: cooperativeAuditTime(now), result,
    ...(revision === undefined ? {} : { clearance_revision_key: loanDigest([result.id, revision]) }),
  };
}

async function mutate(target: number | null, body: Values) {
  const response = await cooperativeDirectus(`/items/${clearanceCollection}${target === null ? "" : "/" + target}?fields=id`, {
    method: target === null ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, 60_000);
  await response.body?.cancel();
}

const conflict = () => new ClearanceError(409, "The clearance changed. Reload it before making another change.", "CLEARANCE_STALE");
const readOnly = () => new ClearanceError(409, "This clearance is read-only.", "CLEARANCE_READ_ONLY");
const retry = () => new ClearanceError(503, "The change could not be confirmed. Retry the same request.", "CLEARANCE_RETRY");
const openConflict = (reference: string) => new ClearanceError(409, `This member already has an open clearance (${reference}).`, "CLEARANCE_OPEN");
function isCollision(error: unknown) {
  return error instanceof CooperativeDirectusError && /unique|duplicate|already exists|deadlock/i.test(error.detail ?? "");
}

export async function startClearance(body: unknown, actor: LoanActor): Promise<ClearanceActionResult> {
  const data = parse(createInput, body);
  const cmd = command("CLEARANCE_STARTED", data.requestKey, actor, data);
  const prior = await findSavingsCommand(cmd);
  if (prior) return prior;
  const open = await readOpenClearance(data.memberId);
  if (open) {
    const saved = await findSavingsCommand(cmd);
    if (saved) return saved;
    throw openConflict(open.clearance_no);
  }
  const id = randomInt(100_000_000, 2_000_000_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { savings_revision: membershipRevision } = await requireActiveClearanceMember(data.memberId);
    const now = new Date();
    const at = cooperativeAuditTime(now);
    const [series] = await nextCooperativeNumbers(Number(todayManila(now).slice(0, 4)), ["CL"]);
    const result = { id, reference: series.number, revision: 0, status: "DRAFT" as const };
    try {
      await mutate(null, {
        id, clearance_no: result.reference, membership_id: { id: data.memberId, savings_revision: membershipRevision + 1 },
        open_member_id: data.memberId, status: result.status,
        separation_date: data.separationDate, reason: data.reason, notes: data.notes || null, revision: result.revision,
        created_at: at, created_by: actor.actorId, updated_at: at, updated_by: actor.actorId,
        number_series_id: series.ref, last_command_id: {
          ...receipt(cmd, actor, result, now),
          savings_revision_key: loanDigest([data.memberId, membershipRevision]),
        },
        last_event_id: event(actor, id, {
          action: cmd.type, after: { reference: result.reference, memberId: data.memberId, status: result.status,
            reason: data.reason, separationDate: data.separationDate, notes: data.notes || null },
        }, now),
      });
      return { ...result, duplicate: false };
    } catch (cause) {
      const saved = await findSavingsCommand(cmd);
      if (saved) return saved;
      const pending = await readOpenClearance(data.memberId);
      if (pending) {
        const completed = await findSavingsCommand(cmd);
        if (completed) return completed;
        throw openConflict(pending.clearance_no);
      }
      if (!isCollision(cause)) throw retry();
    }
  }
  throw retry();
}

async function checkedDraft(id: number, revision: number) {
  const row = await readClearance(id);
  if (row.status !== "DRAFT") throw readOnly();
  if (row.revision !== revision) throw conflict();
  return row;
}

async function writeClearanceChange(
  cmd: Command, row: ClearanceRow, actor: LoanActor, now: Date, changes: Values, audit?: Omit<AuditChange, "subject">,
  status = row.status,
): Promise<ClearanceActionResult> {
  const { id, revision } = row;
  const result = { id, reference: row.clearance_no, revision: revision + 1, status };
  try {
    await mutate(id, {
      ...changes, revision: result.revision, updated_at: cooperativeAuditTime(now), updated_by: actor.actorId,
      last_command_id: receipt(cmd, actor, result, now, revision),
      ...(audit ? { last_event_id: event(actor, id, audit, now) } : {}),
    });
    return { ...result, duplicate: false };
  } catch (cause) {
    const saved = await findSavingsCommand(cmd);
    if (saved) return saved;
    const current = await readClearance(id);
    if (current.revision !== revision || current.status !== "DRAFT") {
      const completed = await findSavingsCommand(cmd);
      if (completed) return completed;
      throw conflict();
    }
    if (cause instanceof CooperativeDirectusError && cause.status < 500 && !isCollision(cause)) {
      throw new ClearanceError(422, "Directus rejected the clearance change.", "CLEARANCE_WRITE_REJECTED");
    }
    throw retry();
  }
}

async function applyClearanceChange(
  cmd: Command, id: number, revision: number, actor: LoanActor,
  prepare: (row: ClearanceRow, now: Date) => Promise<PreparedChange>,
) {
  const saved = await findSavingsCommand(cmd);
  if (saved) return saved;
  const now = new Date();
  let row: ClearanceRow;
  let prepared: PreparedChange;
  try {
    row = await checkedDraft(id, revision);
    prepared = await prepare(row, now);
  } catch (error) {
    const completed = await findSavingsCommand(cmd);
    if (completed) return completed;
    throw error;
  }
  return writeClearanceChange(cmd, row, actor, now, prepared.changes, prepared.audit, prepared.status);
}

const noVerifiedPay = { final_pay_available: null, final_pay_evidence: null };

export async function editClearance(id: number, body: unknown, actor: LoanActor) {
  const data = parse(editInput, body);
  const cmd = command("CLEARANCE_UPDATED", data.requestKey, actor, [id, data]);
  return applyClearanceChange(cmd, id, data.revision, actor, async row => {
    const reset = data.separationDate !== row.separation_date && row.final_pay_evidence !== null;
    return {
      changes: { separation_date: data.separationDate, reason: data.reason, notes: data.notes || null, ...(reset ? noVerifiedPay : {}) },
      audit: {
        action: cmd.type,
        before: { reason: row.reason, separationDate: row.separation_date, notes: row.notes,
          ...(reset ? { finalPay: row.final_pay_available, evidence: row.final_pay_evidence } : {}) },
        after: { reason: data.reason, separationDate: data.separationDate, notes: data.notes || null,
          ...(reset ? { finalPay: null, evidence: null } : {}) },
      },
    };
  });
}

export async function decideClearance(id: number, body: unknown, actor: LoanActor) {
  const data = parse(decideInput, body);
  const type = data.action === "cancel" ? "CLEARANCE_CANCELLED" : "CLEARANCE_FINAL_PAY_VERIFIED";
  const cmd = command(type, data.requestKey, actor, [id, data]);
  return applyClearanceChange(cmd, id, data.revision, actor, async (row, now): Promise<PreparedChange> => {
    if (data.action === "cancel") {
      return {
        status: "CANCELLED" as const,
        changes: { status: "CANCELLED", open_member_id: null, cancellation_reason: data.reason },
        audit: { action: cmd.type, before: { status: row.status }, after: { status: "CANCELLED" }, reason: data.reason },
      };
    }
    const file = await readFinalPayDocument(id, data.documentId);
    const evidence = {
      source: data.source, reference: data.reference, documentId: data.documentId, filename: file.file_name,
      verifiedBy: actor.actorId, verifier: actor.actorName, verifiedAt: now.toISOString(),
    };
    return {
      changes: { final_pay_available: data.amount, final_pay_evidence: evidence },
      audit: {
        action: cmd.type, before: { finalPay: row.final_pay_available, evidence: row.final_pay_evidence },
        after: { finalPay: data.amount, evidence },
      },
    };
  });
}

type DocumentChange = { create: Values[] } | { update: Values[] };

export async function changeClearanceDocuments(
  id: number, revision: number, actor: LoanActor, documents: DocumentChange,
) {
  const upload = "create" in documents;
  const first = upload ? documents.create[0] : documents.update[0];
  const key = String(upload ? first.batch_key : first.id);
  const type = upload ? "CLEARANCE_DOCUMENTS_UPLOADED" : "CLEARANCE_DOCUMENT_REMOVED";
  const cmd = command(type, key, actor, [id, key, upload ? first.request_hash : first.removal_reason]);
  return applyClearanceChange(cmd, id, revision, actor, async row => {
    const reset = !upload && documents.update.some(file => file.id === row.final_pay_evidence?.documentId);
    return {
      changes: {
        documents: upload ? documents : { update: documents.update.map(file => ({ ...file, clearance_id: id })) },
        ...(reset ? noVerifiedPay : {}),
      },
      audit: reset ? {
        action: "CLEARANCE_FINAL_PAY_RESET", before: { finalPay: row.final_pay_available, evidence: row.final_pay_evidence },
        after: { finalPay: null, evidence: null }, reason: "Supporting document removed.",
      } : undefined,
    };
  });
}
