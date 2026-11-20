import "server-only";

import { getLoanDetail, getLoanRegister, LoanError } from "./loans";

export class ApprovalError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

type SourceState = "ready" | "pending_rollout" | "unavailable";
type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

type ApprovalRow = {
  type: "loan" | "membership" | "withdrawal";
  id: number;
  reference: string;
  title: string;
  memberId: number;
  memberNo: string | null;
  memberName: string;
  department: string | null;
  amount: string;
  filedAt: string | null;
  status: ApprovalStatus;
  released: boolean;
  releasedOn: string | null;
  releaseMethod: string | null;
  documents: {
    required: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
    done: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
    missing: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
    warnings: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
    blocks: Array<{ documentTypeId: number; name: string; enforcement: "WARN" | "BLOCK" }>;
  } | null;
};

type Source = {
  type: "membership" | "loan" | "withdrawal";
  label: string;
  state: SourceState;
  message: string | null;
  count: number | null;
};

const labels = {
  membership: "Membership",
  loan: "Loan",
  withdrawal: "Withdrawal",
} as const;

function pendingCount(rows: ApprovalRow[]) {
  return rows.filter(row => row.status === "PENDING").length;
}

function loanStatus(status: string, approvedOn: string | null, releasedOn: string | null): ApprovalStatus | null {
  if (status === "PENDING") return "PENDING";
  if (status === "APPROVED") return "APPROVED";
  if (status === "REJECTED") return "REJECTED";
  if ((status === "ACTIVE" || status === "FULLY_PAID") && (approvedOn || releasedOn)) return "APPROVED";
  return null;
}

async function readLoanApprovalRows() {
  const rows: ApprovalRow[] = [];
  let page = 1;
  for (;;) {
    const result = await getLoanRegister(new URLSearchParams({ page: String(page) }));
    for (const loan of result.rows) {
      const status = loanStatus(loan.status, loan.approvedOn, loan.releasedOn);
      if (!status) continue;
      rows.push({
        type: "loan",
        id: loan.id,
        reference: loan.loanNo,
        title: loan.productName,
        memberId: loan.memberId,
        memberNo: loan.memberNo,
        memberName: loan.memberName,
        department: loan.department,
        amount: loan.principal,
        filedAt: loan.appliedOn,
        status,
        released: Boolean(loan.releasedOn),
        releasedOn: loan.releasedOn,
        releaseMethod: loan.releaseMethod,
        documents: loan.documents,
      });
    }
    if (!result.hasMore || page >= 20) break;
    page += 1;
  }
  return rows;
}

function pendingSource(type: Source["type"], message: string): Source {
  return { type, label: labels[type], state: "pending_rollout", message, count: null };
}

export async function getApprovalQueue(params: URLSearchParams) {
  const requestedType = params.get("type")?.trim().toLowerCase() ?? "";
  const requestedStatus = (params.get("status")?.trim().toUpperCase() || "PENDING") as ApprovalStatus;
  const search = params.get("search")?.trim().toLowerCase() ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  let loanRows: ApprovalRow[] = [];
  let loanSource: Source;
  try {
    loanRows = await readLoanApprovalRows();
    loanSource = { type: "loan", label: labels.loan, state: "ready", message: null, count: pendingCount(loanRows) };
  } catch (error) {
    loanSource = {
      type: "loan",
      label: labels.loan,
      state: "unavailable",
      message: error instanceof LoanError ? error.message : "Loan requests are temporarily unavailable.",
      count: null,
    };
  }

  const sources: Source[] = [
    pendingSource("membership", "Membership applications will appear after Join the Cooperative is delivered."),
    loanSource,
    pendingSource("withdrawal", "Withdrawal requests will appear after Withdraw Savings is delivered."),
  ];

  const rows = loanRows.filter(row => {
    const text = [row.reference, row.memberName, row.memberNo, row.title, row.department]
      .filter(Boolean).join(" ").toLowerCase();
    if (search && !text.includes(search)) return false;
    if (requestedType && row.type !== requestedType) return false;
    return row.status === requestedStatus;
  }).sort((a, b) => (b.filedAt ?? "").localeCompare(a.filedAt ?? "") || b.id - a.id);

  const total = rows.length;
  const start = (page - 1) * 50;
  return {
    sources,
    tiles: {
      membership: sources[0],
      loan: sources[1],
      withdrawal: sources[2],
    },
    rows: rows.slice(start, start + 50),
    page,
    pageSize: 50,
    total,
    hasMore: start + 50 < total,
    filterOptions: {
      types: [
        { value: "membership", label: labels.membership },
        { value: "loan", label: labels.loan },
        { value: "withdrawal", label: labels.withdrawal },
      ],
      statuses: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
    },
  };
}

export async function getApprovalDetail(type: string, id: number) {
  if (type === "loan") {
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApprovalError(400, "Choose a valid loan.");
    const detail = await getLoanDetail(id);
    if (!detail) throw new ApprovalError(404, "The loan is unavailable.");
    return { type: "loan" as const, sourceState: "ready" as const, detail };
  }
  if (type === "membership" || type === "withdrawal") {
    throw new ApprovalError(501, `${labels[type]} requests are pending rollout.`, "PENDING_ROLLOUT");
  }
  throw new ApprovalError(400, "Choose a valid approval type.");
}
