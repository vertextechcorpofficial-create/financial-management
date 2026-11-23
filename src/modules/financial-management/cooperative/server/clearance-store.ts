import "server-only";

import { z } from "zod";
import { CASE_STATUS_LABEL, CLEARANCE_REASONS } from "../console/types";
import type { DocumentRequirement } from "../members/types";
import { money } from "../policies/policy-types";
import { readCooperativeAuditHistory } from "./audit";
import { readDirectusByIds, readDirectusItems, readDirectusPages } from "./directus";
import { privateCooperativeFolder } from "./document-storage";
import { readMemberLoans } from "./loans";
import { memberLoanBalances } from "./member-loans";
import { addCents, todayManila } from "./member-read";
import { settlementRecord, settlementReversalRecord } from "./clearance-records";

export class ClearanceError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly fieldErrors?: Record<string, string>,
    readonly preview?: unknown) {
    super(message);
  }
}

export const clearanceCollection = "cooperative_clearances";
export const clearanceId = z.number().int().positive().max(4_294_967_295);
export const clearanceStatus = z.enum(Object.keys(CASE_STATUS_LABEL) as Array<keyof typeof CASE_STATUS_LABEL>);
export const clearanceReason = z.enum(Object.keys(CLEARANCE_REASONS) as Array<keyof typeof CLEARANCE_REASONS>);
export const evidenceDocumentId = z.string().regex(/^[a-f0-9]{64}$/);
export const finalPaySource = z.enum(["HR", "PAYROLL"]);
const decimal = z.union([z.number(), z.string()]).transform(String).pipe(money);
const member = z.object({
  id: clearanceId, user_id: clearanceId, employee_name: z.string(), department_name: z.string().nullable(),
  status: z.enum(["ACTIVE", "SEPARATED"]), savings_balance: decimal, savings_revision: z.number().int().nonnegative(),
});
const evidence = z.object({
  source: finalPaySource, reference: z.string(), documentId: evidenceDocumentId, filename: z.string(),
  verifiedBy: clearanceId, verifier: z.string(), verifiedAt: z.string(),
});
const clearanceRow = z.object({
  id: clearanceId, clearance_no: z.string(), membership_id: member, status: clearanceStatus, reason: clearanceReason,
  separation_date: z.iso.date(), notes: z.string().nullable(), revision: z.number().int().nonnegative(),
  final_pay_available: decimal.nullable(), final_pay_evidence: evidence.nullable(),
  cancellation_reason: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
const fields = [
  ...Object.keys(clearanceRow.shape).filter(key => key !== "membership_id"),
  ...Object.keys(member.shape).map(key => "membership_id." + key),
].join(",");

type Collection = Parameters<typeof readDirectusItems>[0];
function rows<T extends z.ZodType>(
  collection: Collection, schema: T, params: Record<string, string>,
) {
  return readDirectusItems(collection, new URLSearchParams(params)).then(data => z.object({ data: schema.array() }).parse(data).data);
}

function clearanceRows(filter: object, limit: number, offset = 0) {
  return rows(clearanceCollection, clearanceRow, {
    fields, filter: JSON.stringify(filter), sort: "-created_at,-id", limit: String(limit), offset: String(offset),
  });
}

export async function readClearance(id: number) {
  if (!clearanceId.safeParse(id).success) throw new ClearanceError(400, "Choose a valid clearance case.");
  const [row] = await rows(clearanceCollection, clearanceRow.extend({
    settlement_snapshot: settlementRecord.nullable(),
    reversal_snapshot: settlementReversalRecord.nullable(),
  }), { fields: fields + ",settlement_snapshot,reversal_snapshot", filter: JSON.stringify({ id: { _eq: id } }), limit: "1" });
  if (!row) throw new ClearanceError(404, "The clearance case is unavailable.");
  return row;
}

export type ClearanceRow = Awaited<ReturnType<typeof readClearance>>;

export async function readOpenClearance(memberId: number) {
  const [row] = await rows(clearanceCollection, z.object({ id: clearanceId, clearance_no: z.string() }), {
    fields: "id,clearance_no", filter: JSON.stringify({ open_member_id: { _eq: memberId } }), limit: "1",
  });
  return row;
}

export async function requireActiveClearanceMember(id: number) {
  const [row] = await rows("cooperative_memberships", member, {
    fields: Object.keys(member.shape).join(","), filter: JSON.stringify({ id: { _eq: id } }), limit: "1",
  });
  if (row?.status !== "ACTIVE") throw new ClearanceError(409, "Choose an active Cooperative member.", "MEMBER_INACTIVE");
  return row;
}

function searchMember(term: string) {
  return [
    { employee_name: { _icontains: term } },
    ...(/^[1-9]\d{0,9}$/.test(term) ? [{ user_id: { _eq: Number(term) } }] : []),
  ];
}

function pageOf(params: URLSearchParams, size: number) {
  const page = Number(params.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(page * size)) {
    throw new ClearanceError(400, "Choose a valid page.");
  }
  return page;
}

export async function getClearanceMemberChoices(params: URLSearchParams) {
  const pageSize = 10;
  const page = pageOf(params, pageSize);
  const term = params.get("q")?.trim().slice(0, 120);
  const candidates = await rows("cooperative_memberships", member.pick({ id: true, user_id: true, employee_name: true, department_name: true }), {
    fields: "id,user_id,employee_name,department_name",
    filter: JSON.stringify({
      status: { _eq: "ACTIVE" }, clearance_cases: { _none: { status: { _eq: "DRAFT" } } },
      ...(term ? { _or: [...searchMember(term), { department_name: { _icontains: term } }] } : {}),
    }),
    sort: "employee_name,id", limit: String(pageSize + 1), offset: String((page - 1) * pageSize),
  });
  return {
    page, hasMore: candidates.length > pageSize,
    members: candidates.slice(0, pageSize).map(row => ({
      id: row.id, employeeNumber: String(row.user_id), name: row.employee_name, department: row.department_name,
    })),
  };
}

const documentType = z.object({ id: clearanceId, name: z.string() });
const documentRule = z.object({ document_type_id: clearanceId, enforcement: z.enum(["WARN", "BLOCK"]) });

async function documentPolicy() {
  const [types, rules] = await Promise.all([
    readDirectusPages("cooperative_document_types", documentType, {
      fields: "id,name", filter: JSON.stringify({ is_active: { _eq: true } }), sort: "name,id",
    }),
    readDirectusPages("cooperative_policy_document_requirements", documentRule, {
      fields: "document_type_id,enforcement", filter: JSON.stringify({ is_active: { _eq: true }, scope: { _eq: "CLEARANCE" } }),
    }),
  ]);
  const names = new Map(types.map(type => [type.id, type.name]));
  const required: DocumentRequirement[] = rules.flatMap(rule => {
    const name = names.get(rule.document_type_id);
    return name ? [{ documentTypeId: rule.document_type_id, name, enforcement: rule.enforcement }] : [];
  });
  return { types, required };
}

export async function readClearanceDocumentCompliance(ids: number[]) {
  const { types, required } = await documentPolicy();
  const documents = required.length ? await readDirectusByIds(
    "cooperative_documents", z.object({ owner_id: clearanceId, document_type_id: clearanceId }),
    "owner_id,document_type_id", "owner_id", ids, {
      owner_type: { _eq: "CLEARANCE" }, removed_at: { _null: true },
      document_type_id: { _in: required.map(rule => rule.documentTypeId) },
    },
  ) : [];
  const found = new Set(documents.map(row => `${row.owner_id}:${row.document_type_id}`));
  return {
    types, required,
    cases: new Map(ids.map(id => {
      const missing = required.filter(rule => !found.has(`${id}:${rule.documentTypeId}`));
      return [id, {
        onFile: required.length - missing.length, required: required.length,
        warnings: missing.filter(rule => rule.enforcement === "WARN").map(rule => rule.name),
        blocks: missing.filter(rule => rule.enforcement === "BLOCK").map(rule => rule.name),
      }] as const;
    })),
  };
}

async function clearanceCounts(filter: object) {
  const groups = await rows(clearanceCollection, z.object({ status: clearanceStatus, count: z.coerce.number().int().nonnegative() }), {
    filter: JSON.stringify(filter), "groupBy[]": "status", "aggregate[count]": "*", limit: "3",
  });
  const byStatus = new Map(groups.map(row => [row.status, row.count]));
  return { draft: byStatus.get("DRAFT") ?? 0, completed: byStatus.get("COMPLETED") ?? 0, cancelled: byStatus.get("CANCELLED") ?? 0 };
}

function toView(row: z.output<typeof clearanceRow>) {
  const { membership_id: member } = row;
  return {
    id: row.id, reference: row.clearance_no, revision: row.revision,
    member: { id: member.id, name: member.employee_name, employeeNumber: String(member.user_id), department: member.department_name },
    status: row.status, reason: row.reason, separationDate: row.separation_date, notes: row.notes ?? "",
    savings: member.savings_balance, finalPay: row.final_pay_available, evidence: row.final_pay_evidence,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export async function getClearanceRegister(params: URLSearchParams) {
  const size = 50;
  const page = pageOf(params, size);
  const term = params.get("q")?.trim().slice(0, 120);
  const stage = params.get("status") || "";
  const reason = params.get("reason") || "";
  if (stage && !clearanceStatus.safeParse(stage).success || reason && !clearanceReason.safeParse(reason).success) {
    throw new ClearanceError(400, "Check the clearance filters.");
  }
  const filter = {
    ...(stage ? { status: { _eq: stage } } : {}), ...(reason ? { reason: { _eq: reason } } : {}),
    ...(term ? { _or: [{ clearance_no: { _icontains: term } }, ...searchMember(term).map(value => ({ membership_id: value }))] } : {}),
  };
  const [counts, filtered] = await Promise.all([
    clearanceCounts({}), Object.keys(filter).length ? clearanceCounts(filter) : null,
  ]);
  const result = filtered ?? counts;
  const total = result.draft + result.completed + result.cancelled;
  const lastPage = Math.max(1, Math.ceil(total / size));
  const actualPage = Math.min(page, lastPage);
  const pageRows = total ? await clearanceRows(filter, size, (actualPage - 1) * size) : [];
  const ids = [...new Set(pageRows.map(row => row.membership_id.id))];
  const [docs, loans] = await Promise.all([
    readClearanceDocumentCompliance(pageRows.map(row => row.id)), ids.length ? readMemberLoans(ids, todayManila()) : null,
  ]);
  const byMember = new Map<number, ReturnType<typeof memberLoanBalances>>();
  if (loans?.state === "ready") {
    for (const id of ids) byMember.set(id, memberLoanBalances(loans.data.filter(view => view.loan.memberId === id)));
  }
  return {
    rows: pageRows.map(row => {
      const amount = byMember.get(row.membership_id.id);
      return { ...toView(row), documents: docs.cases.get(row.id)!,
        owed: amount ? addCents(amount.loanBalance, amount.penalties) : null };
    }),
    counts, total, page: actualPage, hasMore: actualPage < lastPage,
  };
}

export async function getClearanceDetail(id: number) {
  const row = await readClearance(id);
  const [policy, audit, storageReady] = await Promise.all([
    readClearanceDocumentCompliance([id]), readCooperativeAuditHistory({ type: "CLEARANCE", id }),
    privateCooperativeFolder().then(() => true, () => false),
  ]);
  return {
    ...toView(row), settlement: row.settlement_snapshot, reversal: row.reversal_snapshot,
    documents: policy.cases.get(id)!, rules: policy.required, uploadTypes: policy.types, storageReady, history: audit.items,
  };
}

export async function readFinalPayDocument(clearance: number, documentId: string) {
  const [file] = await rows("cooperative_documents", z.object({ file_name: z.string() }), {
    fields: "file_name", limit: "1",
    filter: JSON.stringify({
      id: { _eq: documentId }, owner_type: { _eq: "CLEARANCE" }, owner_id: { _eq: clearance },
      clearance_id: { _eq: clearance }, removed_at: { _null: true },
    }),
  });
  if (!file) throw new ClearanceError(422, "Choose a document on file for this clearance.", "CLEARANCE_EVIDENCE");
  return file;
}

export type ClearanceRegister = Awaited<ReturnType<typeof getClearanceRegister>>;
export type ClearanceDetail = Awaited<ReturnType<typeof getClearanceDetail>>;
export type ClearanceMemberChoices = Awaited<ReturnType<typeof getClearanceMemberChoices>>;
