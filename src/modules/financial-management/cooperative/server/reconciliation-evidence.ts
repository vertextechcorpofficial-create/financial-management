import "server-only";

import { z } from "zod";
import { monthPeriod } from "../console/reports/report-dates";
import { cashEvidenceLabels, type CashEvidencePurpose } from "../console/reports/types";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { cooperativeDirectus, readDirectusItems } from "./directus";
import { readCloseAccountMappings } from "./ledger-report";
import type { LoanActor } from "./loan-commands";
import { MemberError } from "./member-errors";
import { amountToCents, signedCentsToAmount, todayManila } from "./member-read";

const collection = "cooperative_reconciliation_evidence";
const purpose = z.enum(Object.keys(cashEvidenceLabels) as [CashEvidencePurpose, ...CashEvidencePurpose[]]);
const id = z.number().int().positive();
const decimal = z.string().regex(/^-?\d{1,10}(?:\.\d{1,2})?$/);
const row = z.object({
  id, period_end: z.iso.date(), purpose, account_id: id, verified_amount: z.union([z.string(), z.number()]).transform(String).pipe(decimal),
  source_reference: z.string(), verified_by: id, verifier_name: z.string(), verified_at: z.string(),
  correction_reason: z.string().nullable(), revision: id,
});
const input = z.object({
  periodEnd: z.iso.date(), purpose, accountId: id,
  amount: z.string().trim().pipe(decimal),
  reference: z.string().trim().min(1).max(160),
  reason: z.string().trim().max(500).optional(),
  expectedRevision: z.number().int().nonnegative().max(2_147_483_646),
});

export type ReconciliationEvidence = z.output<typeof row>;

async function readEvidence(filter: object) {
  const query = new URLSearchParams({
    fields: Object.keys(row.shape).join(","), filter: JSON.stringify(filter), sort: "-revision,-id", limit: "1",
  });
  const { data } = z.object({ data: z.array(row).max(1) }).parse(await readDirectusItems(collection, query));
  return data[0];
}

export async function readCloseEvidence(periodEnd: string) {
  const purposes = Object.keys(cashEvidenceLabels) as CashEvidencePurpose[];
  const rows = await Promise.all(purposes.map(purpose => latestEvidence(periodEnd, purpose)));
  return new Map(rows.flatMap(row => row ? [[row.purpose, row] as const] : []));
}

function latestEvidence(periodEnd: string, purpose: CashEvidencePurpose) {
  return readEvidence({ period_end: { _eq: periodEnd }, purpose: { _eq: purpose } });
}

function staleEvidence() {
  return new MemberError(409, "The worksheet changed. Refresh it before saving the evidence.", "EVIDENCE_CHANGED");
}

export async function saveCloseEvidence(actor: LoanActor, payload: unknown) {
  const result = input.safeParse(payload);
  if (!result.success) throw new MemberError(422, "Enter an amount with up to two decimal places and a source reference.");
  const { periodEnd, purpose, accountId, expectedRevision, reference, reason } = result.data;
  const month = periodEnd.slice(0, 7);
  if (monthPeriod(month)?.to !== periodEnd || month >= todayManila().slice(0, 7)) {
    throw new MemberError(422, "Choose the end of a completed month.", "EVIDENCE_PERIOD");
  }
  const cents = amountToCents(result.data.amount);
  if (purpose === "CASH_ON_HAND" && cents < 0n) throw new MemberError(422, "Counted cash must be zero or greater.", undefined, "amount");
  if (expectedRevision > 0 && !reason) throw new MemberError(422, "Enter the reason for correcting the evidence.", undefined, "reason");

  const amount = signedCentsToAmount(cents);
  const revision = expectedRevision + 1;
  const subjectId = `${periodEnd}:${purpose}`;
  const key = `${subjectId}:${revision}`;
  const existingRevision = () => readEvidence({ revision_key: { _eq: key } });
  const matches = (row?: ReconciliationEvidence) => row?.verified_by === actor.actorId && row.account_id === accountId &&
    amountToCents(row.verified_amount) === cents && row.source_reference === reference && row.correction_reason === (reason || null);
  const saved = (row: ReconciliationEvidence) => ({ id: row.id, revision: row.revision });

  const [accounts, current] = await Promise.all([readCloseAccountMappings(), latestEvidence(periodEnd, purpose)]);
  if ((current?.revision ?? 0) !== expectedRevision) {
    const existing = await existingRevision();
    if (existing && matches(existing)) return saved(existing);
    throw staleEvidence();
  }
  const account = accounts.get(purpose);
  if (!account || account.id !== accountId) throw staleEvidence();

  const now = new Date();
  const audited = cooperativeAuditEvent(actor, {
    subject: { type: "RECONCILIATION_EVIDENCE", id: subjectId },
    action: current ? "MONTH_END_EVIDENCE_CORRECTED" : "MONTH_END_EVIDENCE_RECORDED",
    before: current ? {
      periodEnd, purpose, accountId: current.account_id, amount: current.verified_amount,
      sourceReference: current.source_reference, revision: current.revision,
    } : undefined,
    after: { periodEnd, purpose, accountId, amount, sourceReference: reference, revision },
    reason,
  }, now);
  try {
    const response = await cooperativeDirectus(`/items/${collection}?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period_end: periodEnd, purpose, account_id: accountId, verified_amount: amount, source_reference: reference,
        verified_by: actor.actorId, verifier_name: actor.actorName, verified_at: cooperativeAuditTime(now),
        revision, revision_key: key, correction_reason: reason || null,
        audit_event_id: { ...audited, actor_name: actor.actorName },
      }),
    });
    const { data } = z.object({ data: z.object({ id }) }).parse(await response.json());
    return { id: data.id, revision };
  } catch {
    const existing = await existingRevision().catch(() => undefined);
    if (existing && matches(existing)) return saved(existing);
    if (existing) throw staleEvidence();
    throw new MemberError(503, "Month-end evidence could not be saved. Try again.");
  }
}
