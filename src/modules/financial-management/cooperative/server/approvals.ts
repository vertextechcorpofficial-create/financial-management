import "server-only";

import { z } from "zod";
import { approvalStatuses, approvalTypes, type ApprovalStatusFilter, type ApprovalType } from "../approvals/filters";
import { amountToCents, centsToAmount } from "../loans/loan-schedule";
import { readDirectusItems } from "./directus";
import { getLoanDetail, readLoanDocumentStatuses } from "./loans";

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
const loanPage = z.object({ data: z.array(loanRow).max(pageSize) });
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

async function readLoanApprovalPage(filter: object, page: number) {
  const query = new URLSearchParams({
    fields: Object.keys(loanRow.shape).join(","),
    sort: "-applied_on,-id",
    limit: String(pageSize),
    offset: String((page - 1) * pageSize),
    filter: JSON.stringify(filter),
  });
  const { data } = loanPage.parse(await readDirectusItems("cooperative_loans", query));
  const documents = await readLoanDocumentStatuses(data);
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
    documents: documents.get(loan.id) ?? null,
  } as const));
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
  const search = params.get("search")?.trim() ?? "";
  // Cancelled requests will come from sources that support cancellations.
  const filter = (!type || type === "loan") && status !== "CANCELLED" ? loanFilter(status, search) : null;

  let rows: Awaited<ReturnType<typeof readLoanApprovalPage>> = [];
  let total = 0;
  let page = 1;
  let loan: Source;
  try {
    const countFiltered = filter && (status !== "PENDING" || search) ? countLoans(filter) : null;
    const [pending, filtered] = await Promise.all([countLoans(pendingLoans), countFiltered]);
    const matching = filter ? filtered ?? pending : 0;
    const availablePage = Math.min(requestedPage, Math.max(1, Math.ceil(matching / pageSize)));
    if (filter && matching > 0) rows = await readLoanApprovalPage(filter, availablePage);
    total = matching;
    page = availablePage;
    loan = { type: "loan", label: "Loan", state: "ready", message: null, count: pending };
  } catch {
    loan = { type: "loan", label: "Loan", state: "unavailable", message: "Loan requests are temporarily unavailable.", count: null };
  }

  const membership: Source = {
    type: "membership", label: "Membership", state: "pending_rollout", count: null,
    message: "Membership requests will appear when employee applications are enabled. Staff enroll members in Members.",
  };
  const withdrawal: Source = {
    type: "withdrawal", label: "Withdrawal", state: "pending_rollout", count: null,
    message: "Withdrawal requests will appear when Record withdrawal request is available in Transactions.",
  };
  return {
    sources: [membership, loan, withdrawal],
    tiles: { membership, loan, withdrawal },
    rows,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
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
  const placeholder = approvalTypes.find(option => option.value === type);
  if (placeholder) {
    throw new ApprovalError(501, `${placeholder.label} requests are pending rollout.`, "PENDING_ROLLOUT");
  }
  throw new ApprovalError(400, "Choose a valid approval type.");
}

export type ApprovalQueue = Awaited<ReturnType<typeof getApprovalQueue>>;
export type ApprovalDetail = Awaited<ReturnType<typeof getApprovalDetail>>;
