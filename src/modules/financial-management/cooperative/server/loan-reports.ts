import "server-only";

import { reportLoanStatuses, reportMenu, type ReportColumn, type ReportResult, type ReportRow } from "../console/reports/types";
import { daysBetween, isPastDue } from "../loans/loan-schedule";
import { statusText } from "../members/format";
import { readReportLoans, type MemberLoanView } from "./loans";
import { amountToCents, signedCentsToAmount } from "./member-read";
import { blockedReport, reportProducts, reportDepartments, reportTotals, textMatch, type LoanReportFilters } from "./report-data";

const loanColumns: ReportColumn[] = [{ label: "Loan" }, { label: "Member" }, { label: "Department" }, { label: "Product" }];
const portfolioColumns: ReportColumn[] = [
  ...loanColumns, { label: "Released", kind: "date" }, { label: "Terms" }, { label: "Repayment" }, { label: "Status" },
  { label: "Principal", kind: "money" }, { label: "Balance", kind: "money" },
  { label: "Past due", kind: "money" }, { label: "Penalties", kind: "money" },
];
const agingColumns: ReportColumn[] = [
  ...loanColumns, { label: "Status" }, { label: "Oldest due", kind: "date" }, { label: "Days overdue", kind: "number" },
  ...["1–30", "31–60", "61–90", "91+", "Penalties", "Total past due"].map(label => ({ label, kind: "money" as const })),
];

type LoanFilters = LoanReportFilters & { status: string; from: string; to: string };

function loanStatus({ loan, position }: MemberLoanView) {
  if (position?.fullyPaid) return "FULLY_PAID";
  if (loan.status === "ACTIVE" && position &&
    (amountToCents(position.pastDue) > 0n || amountToCents(position.penalties) > 0n)) return "PAST_DUE";
  return loan.status;
}

function statusLabel(status: string) {
  return reportLoanStatuses[status as keyof typeof reportLoanStatuses] ?? statusText(status);
}

function loanCells({ loan }: MemberLoanView) {
  return [loan.loanNo, loan.memberName, loan.department, loan.productName];
}

function portfolioRow(view: MemberLoanView, status: string): ReportRow {
  const { loan, position, ledger } = view;
  const terms = loan.months > 0 ? loan.months + " mo · " + (loan.frequency === "MONTHLY" ? "Monthly" : "Every cutoff") : null;
  return { id: loan.id, cells: [
    ...loanCells(view), ledger?.release.date ?? null, terms,
    loan.mode === "OTC" ? "Over the counter" : "Payroll remittance", statusLabel(status),
    position ? loan.principal : null, position?.remaining ?? null, position?.pastDue ?? null, position?.penalties ?? null,
  ] };
}

function agingRow(view: MemberLoanView, asOf: string): ReportRow | null {
  const { position } = view;
  if (!position) return null;
  const buckets = [0n, 0n, 0n, 0n];
  let oldest = "";
  for (const installment of position.installments) {
    const late = isPastDue(installment, asOf);
    const penalty = amountToCents(installment.penaltyAssessed) > amountToCents(installment.penaltyPaid);
    if (!late && !penalty) continue;
    if (!oldest || installment.dueDate < oldest) oldest = installment.dueDate;
    if (late) {
      const days = daysBetween(installment.dueDate, asOf);
      const bucket = Math.min(3, Math.floor((days - 1) / 30));
      buckets[bucket] += amountToCents(installment.total) - amountToCents(installment.paidTotal);
    }
  }
  if (!oldest) return null;
  const total = buckets.reduce((a, b) => a + b, amountToCents(position.penalties));
  return { id: view.loan.id, cells: [
    ...loanCells(view), statusLabel(loanStatus(view)), oldest, daysBetween(oldest, asOf),
    ...buckets.map(signedCentsToAmount), position.penalties, signedCentsToAmount(total),
  ] };
}

export async function getLoanReport(report: "portfolio" | "aging", filters: LoanFilters, asOf: string): Promise<ReportResult> {
  const aging = report === "aging";
  const columns = aging ? agingColumns : portfolioColumns;
  const range = filters.from || filters.to ? { released_on: {
    ...(filters.from ? { _gte: filters.from } : {}), ...(filters.to ? { _lte: filters.to } : {}),
  } } : {};
  const filter = {
    ...(filters.q ? textMatch(filters.q, ["loan_no", "member_name", "member_no", "agreement_no"]) : {}),
    ...(filters.department ? { department_name: { _eq: filters.department } } : {}),
    ...(filters.product ? { product_id: { _eq: filters.product } } : {}),
    ...(aging ? { status: { _in: ["ACTIVE", "DEFAULTED"] } } : range),
  };
  try {
    const source = await readReportLoans(filter, asOf);
    if (source.state !== "ready") return blockedReport(columns, { label: reportMenu[report].label, state: source.state, message: source.message });
    const [products, departments] = await Promise.all([reportProducts(), reportDepartments("cooperative_loans")]);
    const rows = aging ? source.data.flatMap(view => agingRow(view, asOf) ?? [])
      .sort((a, b) => Number(b.cells[6]) - Number(a.cells[6]) || String(a.cells[0]).localeCompare(String(b.cells[0])) || Number(a.id) - Number(b.id))
      : source.data.sort((a, b) => (b.loan.appliedOn ?? "").localeCompare(a.loan.appliedOn ?? "") || b.loan.id - a.loan.id)
        .flatMap(view => {
          const status = loanStatus(view);
          if (!view.ledger && view.loan.releasedOn) return [];
          if (filters.status && filters.status !== status && !(filters.status === "ACTIVE" && status === "PAST_DUE")) return [];
          return [portfolioRow(view, status)];
        });
    return { columns, metadata: [], rows, totals: reportTotals(columns, rows), products, departments };
  } catch {
    return blockedReport(columns, { label: reportMenu[report].label, state: "unavailable", message: "Posted loan data could not be verified." });
  }
}
