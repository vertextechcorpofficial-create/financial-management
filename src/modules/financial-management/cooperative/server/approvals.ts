import "server-only";

import { z } from "zod";
import { approvalStatuses, approvalTypes, type ApprovalStatusFilter, type ApprovalType } from "../approvals/filters";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { readDirectusItems } from "./directus";
import { getLoanDetail, readLoanDocumentStatuses } from "./loans";
import { getWithdrawalDetail } from "./withdrawals";
import { countWithdrawalRequests, readWithdrawalRequests, withdrawalPostingEnabled, withdrawalSearch } from "./withdrawal-store";

export class ApprovalError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

const pageSize = 50;
const pendingLoans = { status: { _eq: "PENDING" } };
const loanHistory = {
  _and: [
    { status: { _in: ["ACTIVE", "FULLY_PAID", "DEFAULTED"] } },
    { _or: [{ approved_on: { _nnull: true } }, { released_on: { _nnull: true } }] },
  ],
};

const id = z.union([z.number(), z.string().regex(/^[1-9]\d*$/)]).transform(Number).pipe(z.number().int().positive());
const loanRow = z.object({
  id,
  loan_no: z.string(),
  product_name: z.string(),
  member_id: id,
  member_no: z.string().nullable(),
  member_name: z.string(),
  department_name: z.string().nullable(),
  principal: z.union([z.string(), z.number()]),
  applied_on: z.string().nullable(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ACTIVE", "FULLY_PAID", "DEFAULTED"]),
  released_on: z.string().nullable(),
  release_method: z.string().nullable(),
  terms_snapshot: z.unknown(),
});
const loanPage = z.object({ data: z.array(loanRow).max(pageSize + 1) });
const count = z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number).pipe(z.number().int().nonnegative());
const countResult = z.object({ data: z.array(z.object({ count })).length(1) });

type Source = {
  type: ApprovalType;
  label: string;
  state: "ready" | "pending_rollout" | "unavailable";
  message: string | null;
  count: number | null;
};

function loanFilter(status: ApprovalStatusFilter, search: string) {
  const statuses = status === "ALL" ? { status: { _in: ["PENDING", "APPROVED", "REJECTED"] } } : { status: { _eq: status } };
  const filter = status === "APPROVED" || status === "ALL" ? { _or: [statuses, loanHistory] } : statuses;
  if (!search) return filter;
  const includes = { _icontains: search };
  return {
    _and: [filter, { _or: [
      { member_name: includes }, { member_no: includes }, { loan_no: includes },
      { product_name: includes }, { department_name: includes },
    ] }],
  };
}

async function countLoans(filter: object) {
  const query = new URLSearchParams({ "aggregate[count]": "*", filter: JSON.stringify(filter) });
  const { data } = countResult.parse(await readDirectusItems("cooperative_loans", query));
  return data[0].count;
}

async function readLoanApprovalPage(filter: object, limit: number, offset: number) {
  const query = new URLSearchParams({
    fields: Object.keys(loanRow.shape).join(","),
    sort: "-applied_on,-id",
    limit: String(limit),
    offset: String(offset),
    filter: JSON.stringify(filter),
  });
  const { data } = loanPage.parse(await readDirectusItems("cooperative_loans", query));
  return data.map(loan => ({
    type: "loan",
    id: loan.id,
    reference: loan.loan_no,
    title: loan.product_name,
    memberId: loan.member_id,
    memberNo: loan.member_no,
    memberName: loan.member_name,
    department: loan.department_name,
    amount: centsToAmount(amountToCents(String(loan.principal))),
    filedAt: loan.applied_on,
    status: loan.status === "PENDING" || loan.status === "REJECTED" ? loan.status : "APPROVED",
    released: Boolean(loan.released_on),
    releasedOn: loan.released_on,
    releaseMethod: loan.release_method,
    terms_snapshot: loan.terms_snapshot,
    documents: null,
  } as const));
}

async function readWithdrawalApprovalPage(filter: object, limit: number, offset: number) {
  const requests = await readWithdrawalRequests(filter, limit, offset);
  return requests.map(request => ({
    type: "withdrawal",
    id: request.id,
    reference: request.reference,
    title: "Savings withdrawal",
    memberId: request.memberId,
    memberNo: request.memberNo,
    memberName: request.memberName,
    department: request.department,
    amount: request.amount,
    filedAt: request.filedOn,
    status: request.status === "RELEASED" ? "APPROVED" : request.status,
    released: request.status === "RELEASED",
    documents: null,
  } as const));
}

type QueueRow = Awaited<ReturnType<typeof readLoanApprovalPage | typeof readWithdrawalApprovalPage>>[number];
const queueCursor = z.object({ type: z.enum(["loan", "withdrawal"]), id, filedAt: z.iso.date().nullable() });
type Cursor = z.output<typeof queueCursor>;

function parseCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 200) throw new Error("Invalid cursor");
    return queueCursor.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new ApprovalError(400, "Reload the queue before changing pages.");
  }
}

function afterCursor(filter: object, field: "applied_on" | "requested_on", type: Cursor["type"], cursor: Cursor | null) {
  if (!cursor) return filter;
  const afterId = { id: { [type > cursor.type ? "_lte" : "_lt"]: cursor.id } };
  const rows = cursor.filedAt === null
    ? [{ _and: [{ [field]: { _null: true } }, afterId] }]
    : [{ [field]: { _lt: cursor.filedAt } }, { [field]: { _null: true } },
      { _and: [{ [field]: { _eq: cursor.filedAt } }, afterId] }];
  return { _and: [filter, { _or: rows }] };
}

async function readQueueSource<T extends QueueRow>({
  type, label, filter, pendingFilter, reusedCount, requestedPage, mixed, cursor, dateField, count, readRows,
}: {
  type: Cursor["type"]; label: string; filter: object | null; pendingFilter: object; reusedCount: boolean;
  requestedPage: number; mixed: boolean; cursor: Cursor | null; dateField: "applied_on" | "requested_on";
  count: (filter: object) => Promise<number>; readRows: (filter: object, limit: number, offset: number) => Promise<T[]>;
}): Promise<{ source: Source; rows: T[]; total: number; page: number }> {
  try {
    const [pending, filtered] = await Promise.all([count(pendingFilter), filter && !reusedCount ? count(filter) : null]);
    const total = filter ? filtered ?? pending : 0;
    const page = mixed ? requestedPage : Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const rows = filter && total > 0
      ? await readRows(afterCursor(filter, dateField, type, mixed ? cursor : null),
        mixed ? pageSize + 1 : pageSize, mixed ? 0 : (page - 1) * pageSize) : [];
    return { source: { type, label, state: "ready", message: null, count: pending }, rows, total, page };
  } catch {
    return {
      source: { type, label, state: "unavailable", message: `${label} requests are temporarily unavailable.`, count: null },
      rows: [], total: 0, page: 1,
    };
  }
}

const approvalFilters = z.object({
  type: z.enum(["", "membership", "loan", "withdrawal"]),
  status: z.enum(approvalStatuses),
  page: z.number().int().positive(),
});

export async function getApprovalQueue(params: URLSearchParams) {
  const parsed = approvalFilters.safeParse({
    type: params.get("type")?.trim().toLowerCase() ?? "",
    status: params.get("status")?.trim().toUpperCase() || "PENDING",
    page: Number(params.get("page") ?? "1"),
  });
  if (!parsed.success) throw new ApprovalError(400, "Check the request filters and page number.");
  const { type, status, page: requestedPage } = parsed.data;
  const search = params.get("search")?.trim().slice(0, 160) ?? "";
  const enabled = withdrawalPostingEnabled();
  const mixed = enabled && !type && status !== "CANCELLED";
  const cursor = mixed ? parseCursor(params.get("cursor")) : null;
  if (mixed && requestedPage > 1 && !cursor) throw new ApprovalError(400, "Reload the queue before changing pages.");
  const loanSelected = (!type || type === "loan") && status !== "CANCELLED";
  const withdrawalSelected = enabled && (!type || type === "withdrawal");
  const withdrawnStatus = status === "APPROVED" ? "RELEASED" : status;
  const [loans, withdrawals] = await Promise.all([
    readQueueSource({
      type: "loan", label: "Loan", filter: loanSelected ? loanFilter(status, search) : null, pendingFilter: pendingLoans,
      reusedCount: status === "PENDING" && !search, requestedPage, mixed, cursor, dateField: "applied_on",
      count: countLoans, readRows: readLoanApprovalPage,
    }),
    enabled ? readQueueSource({
      type: "withdrawal", label: "Withdrawal",
      filter: withdrawalSelected ? {
        ...(withdrawnStatus === "ALL" ? {} : { status: { _eq: withdrawnStatus } }),
        ...(search ? withdrawalSearch(search) : {}),
      } : null,
      pendingFilter: { status: { _eq: "PENDING" } }, reusedCount: status === "PENDING" && !search,
      requestedPage, mixed, cursor, dateField: "requested_on", count: countWithdrawalRequests, readRows: readWithdrawalApprovalPage,
    }) : null,
  ]);
  const candidates = [...loans.rows, ...(withdrawals?.rows ?? [])]
    .sort((a, b) => (b.filedAt ?? "").localeCompare(a.filedAt ?? "") || b.id - a.id || a.type.localeCompare(b.type));
  const shown = candidates.slice(0, pageSize);
  const documents = await readLoanDocumentStatuses(shown.filter(row => row.type === "loan"));
  const rows = shown.map(row => {
    if (row.type === "withdrawal") return row;
    return { ...row, terms_snapshot: undefined, documents: documents.get(row.id) ?? null };
  });
  const last = rows.at(-1);
  const nextCursor = mixed && last && candidates.length > pageSize
    ? Buffer.from(JSON.stringify(queueCursor.parse(last))).toString("base64url") : null;
  const total = loans.total + (withdrawals?.total ?? 0);
  const page = mixed ? requestedPage : withdrawalSelected ? withdrawals?.page ?? 1 : loanSelected ? loans.page : 1;

  const membership: Source = {
    type: "membership", label: "Membership", state: "pending_rollout", count: null,
    message: "Membership requests will appear when employee applications are enabled. Staff enroll members in Members.",
  };
  const withdrawal: Source = withdrawals?.source ?? {
    type: "withdrawal", label: "Withdrawal", state: "pending_rollout", count: null,
    message: "Withdrawal requests will appear when Record withdrawal request is available in Transactions.",
  };
  return {
    sources: [membership, loans.source, withdrawal],
    tiles: { membership, loan: loans.source, withdrawal },
    rows,
    page,
    pageSize,
    total,
    hasMore: mixed ? nextCursor !== null : page * pageSize < total,
    nextCursor,
    filterOptions: { types: approvalTypes, statuses: approvalStatuses },
  };
}

export async function getApprovalDetail(type: string, id: number) {
  if (type === "loan") {
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApprovalError(400, "Choose a valid loan.");
    const detail = await getLoanDetail(id);
    if (!detail) throw new ApprovalError(404, "The loan is unavailable.");
    return { type: "loan" as const, sourceState: "ready" as const, detail };
  }
  if (type === "withdrawal" && withdrawalPostingEnabled()) {
    return { type: "withdrawal" as const, sourceState: "ready" as const, detail: await getWithdrawalDetail(id) };
  }
  const placeholder = approvalTypes.find(option => option.value === type);
  if (placeholder) {
    throw new ApprovalError(501, `${placeholder.label} requests are pending rollout.`, "PENDING_ROLLOUT");
  }
  throw new ApprovalError(400, "Choose a valid approval type.");
}

export type ApprovalQueue = Awaited<ReturnType<typeof getApprovalQueue>>;
export type ApprovalDetail = Awaited<ReturnType<typeof getApprovalDetail>>;
