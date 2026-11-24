import "server-only";

import { z } from "zod";
import { money } from "../policies/policy-types";
import { readDirectusItems, usesCooperativeQaDatabase } from "./directus";

export class WithdrawalError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export const withdrawalPostingEnabled = usesCooperativeQaDatabase;
export const withdrawalPendingMessage = "Staff withdrawal requests are pending rollout.";
export const withdrawalId = z.number().int().positive().max(4_294_967_295);
export const withdrawalStatus = z.enum(["PENDING", "RELEASED", "REJECTED", "CANCELLED"]);
export const withdrawalMethod = z.enum(["CASH", "PAYROLL"]);
const decimal = z.union([z.string(), z.number()]).transform(String).pipe(money);

const memberRow = z.object({
  id: withdrawalId,
  user_id: withdrawalId,
  employee_name: z.string(),
  department_name: z.string().nullable(),
});
const savingsRow = z.object({
  id: withdrawalId,
  status: z.enum(["ACTIVE", "SEPARATED"]),
  savings_balance: decimal,
  savings_revision: z.number().int().nonnegative(),
});
const requestRow = z.object({
  id: withdrawalId,
  request_no: z.string(),
  membership_id: memberRow,
  amount: decimal,
  release_method: withdrawalMethod,
  status: withdrawalStatus,
  requested_on: z.iso.date(),
  requested_at: z.string(),
  requested_by: withdrawalId,
  request_reason: z.string().nullable(),
  decided_at: z.string().nullable(),
  decided_by: withdrawalId.nullable(),
  decision_reason: z.string().nullable(),
  payout_reference: z.string().nullable(),
});

const requestFields = Object.keys(requestRow.shape)
  .flatMap(field => field === "membership_id" ? Object.keys(memberRow.shape).map(child => `membership_id.${child}`) : [field])
  .join(",");
const countResult = z.object({
  data: z.array(z.object({ count: z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number).pipe(z.number().int().nonnegative()) })).length(1),
});

async function list<T extends z.ZodType>(
  collection: Parameters<typeof readDirectusItems>[0],
  schema: T,
  params: Record<string, string>,
) {
  return z.object({ data: z.array(schema) }).parse(await readDirectusItems(collection, new URLSearchParams(params))).data;
}

export function withdrawalSearch(search: string) {
  const includes = { _icontains: search };
  return {
    _or: [
      { request_no: includes }, { membership_id: { employee_name: includes } },
      ...(/^[1-9]\d{0,9}$/.test(search) ? [{ membership_id: { user_id: { _eq: Number(search) } } }] : []),
    ],
  };
}

export async function countWithdrawalRequests(filter: object) {
  const query = new URLSearchParams({ "aggregate[count]": "*", filter: JSON.stringify(filter) });
  const { data } = countResult.parse(await readDirectusItems("cooperative_withdrawal_requests", query));
  return data[0].count;
}

export async function readWithdrawalRequests(filter: object, limit: number, offset = 0) {
  const rows = await list("cooperative_withdrawal_requests", requestRow, {
    fields: requestFields, filter: JSON.stringify(filter), limit: String(limit), offset: String(offset), sort: "-requested_on,-id",
  });
  return rows.map(row => ({
    id: row.id, reference: row.request_no, memberId: row.membership_id.id, memberNo: String(row.membership_id.user_id),
    memberName: row.membership_id.employee_name, department: row.membership_id.department_name,
    amount: row.amount, releaseMethod: row.release_method, status: row.status, filedOn: row.requested_on, filedAt: row.requested_at,
    requestedBy: row.requested_by, requestReason: row.request_reason, decidedAt: row.decided_at, decidedBy: row.decided_by,
    decisionReason: row.decision_reason, payoutReference: row.payout_reference,
  }));
}

export type WithdrawalRequest = Awaited<ReturnType<typeof readWithdrawalRequests>>[number];

export async function readWithdrawalRequest(id: number) {
  if (!withdrawalId.safeParse(id).success) throw new WithdrawalError(400, "Choose a valid withdrawal request.");
  const [request] = await readWithdrawalRequests({ id: { _eq: id } }, 1);
  if (!request) throw new WithdrawalError(404, "The withdrawal request is unavailable.");
  return request;
}

const policySchema = z.object({
  id: withdrawalId, maintaining_balance: decimal, withdrawals_per_year: z.number().int().min(0).max(65_535),
});

async function readSavingsPolicy() {
  const data = await readDirectusItems("cooperative_policy_settings",
    new URLSearchParams({ fields: Object.keys(policySchema.shape).join(",") }));
  const policy = z.object({ data: policySchema.nullable() }).safeParse(data);
  if (!policy.success || !policy.data.data) throw new WithdrawalError(503, "Configure the Cooperative savings policy in Policies.");
  return policy.data.data;
}

function readSavingsRows(ids: number[]) {
  return list("cooperative_memberships", savingsRow, {
    fields: Object.keys(savingsRow.shape).join(","), filter: JSON.stringify({ id: { _in: ids } }), limit: String(ids.length),
  });
}

export async function readSavingsRevision(id: number) {
  const [member] = await readSavingsRows([id]);
  if (!member) throw new WithdrawalError(404, "The Cooperative membership is unavailable.");
  return member.savings_revision;
}

const reservationRow = z.object({ id: withdrawalId, membership_id: withdrawalId, amount: decimal });

// All savings and reservation mutations for an existing member advance the same revision.
export async function readWithdrawalSnapshots(ids: number[], year?: number) {
  if (!ids.length) return [];
  if (year !== undefined && ids.length !== 1) throw new Error("Annual usage requires one membership.");
  const policy = await readSavingsPolicy();
  const snapshots = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    for (let attempt = 0; ; attempt++) {
      const members = await readSavingsRows(batch);
      const [pending, used] = await Promise.all([
        list("cooperative_withdrawal_requests", reservationRow, {
          fields: "id,membership_id,amount", limit: "-1",
          filter: JSON.stringify({ membership_id: { _in: batch }, status: { _eq: "PENDING" } }),
        }),
        year === undefined ? 0 : countWithdrawalRequests({
          membership_id: { _eq: batch[0] }, status: { _in: ["PENDING", "RELEASED"] },
          requested_on: { _gte: `${year}-01-01`, _lt: `${year + 1}-01-01` },
        }),
      ]);
      const current = new Map((await readSavingsRows(batch)).map(row => [row.id, row.savings_revision]));
      if (members.length !== batch.length) throw new WithdrawalError(404, "A Cooperative membership is unavailable.");
      if (members.every(member => current.get(member.id) === member.savings_revision)) {
        snapshots.push(...members.map(member => ({
          membershipId: member.id, status: member.status, postedSavings: member.savings_balance,
          revision: member.savings_revision, maintainingBalance: policy.maintaining_balance,
          annualLimit: policy.withdrawals_per_year, annualUsed: used,
          pendingReservations: pending.filter(row => row.membership_id === member.id)
            .map(row => ({ requestId: String(row.id), amount: row.amount })),
        })));
        break;
      }
      if (attempt === 1) throw new WithdrawalError(409, "The savings balance changed. Reload and review the current amounts.", "STALE_WITHDRAWAL");
    }
  }
  return snapshots;
}
