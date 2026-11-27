import "server-only";

import type { MemberDetail, MemberStatement, PayrollReference } from "../members/types";
import type { Product } from "../policies/policy-types";
import { loanStatementForPeriod, type LoanStatementTotals } from "../loans/loan-activity";
import { payrollHeadroom, payrollItemOverlap, payrollTermCommitment, salaryLoanRoom, type PayrollCommitment } from "../loans/loan-assessment";
import { remapPostedPayrollItems } from "./payroll-record-links";
import { nextCutoffDate } from "../loans/loan-schedule";
import { amountToCents, readCooperativePayrollDeductions, signedCentsToAmount } from "./member-read";
import { loanInstallmentAmount, readMemberLoans, type MemberLoanView } from "./loans";

export function memberLoanBalances(loans: MemberLoanView[]) {
  let balance = 0n;
  let pastDue = 0n;
  let penalties = 0n;
  for (const { position } of loans) {
    if (!position) continue;
    balance += amountToCents(position.remaining);
    pastDue += amountToCents(position.pastDue);
    penalties += amountToCents(position.penalties);
  }
  return {
    loanBalance: signedCentsToAmount(balance),
    pastDue: signedCentsToAmount(pastDue),
    penalties: signedCentsToAmount(penalties),
  };
}

export function memberLoanAccount(loans: MemberLoanView[], balance: string, salaryProduct: Product | null, isActive: boolean) {
  let exposure = 0n;
  const items = loans.map(view => {
    const { loan, position } = view;
    if (loan.productId === salaryProduct?.id) {
      if (position) exposure += amountToCents(position.principal);
      else if (loan.status === "PENDING" || loan.status === "APPROVED") exposure += amountToCents(loan.principal);
    }
    return {
      id: loan.id, loanNo: loan.loanNo, productName: loan.productName, status: loan.status,
      amountPerPayment: loanInstallmentAmount(view), balance: position?.remaining ?? null,
      documentsMissing: loan.documents.missing.length, requiredDocuments: loan.documents.required.length,
    };
  }).sort((a, b) => b.id - a.id);
  return {
    items,
    salaryRoom: isActive ? salaryLoanRoom(salaryProduct, balance, exposure)
      : { state: "unavailable" as const, message: "Salary loans are available to active members." },
  };
}

export async function memberPayrollAssessment({
  userId, membershipId, savings, payroll, floor, loans, asOf,
}: {
  userId: number;
  membershipId: number;
  savings: string;
  payroll: Extract<PayrollReference, { state: "verified" }>;
  floor: bigint;
  loans: NonNullable<MemberDetail["loans"]> | null;
  asOf: string;
}, views: MemberLoanView[]): Promise<MemberDetail["takeHome"]> {
  const base = {
    floor: signedCentsToAmount(floor), savingsPerCutoff: savings, payrollDeduction: null,
    loanDeduction: null, includedInNetPay: null, assessmentCutoff: null,
    headroom: null, headroomMessage: null, withdrawalsUnavailable: true,
  } satisfies MemberDetail["takeHome"];
  if (loans?.state !== "ready") return {
    ...base,
    headroomMessage: loans?.message ?? "Cooperative loan commitments are unavailable.",
  };

  const cutoff = nextCutoffDate(asOf);
  const commitments: PayrollCommitment[] = [{ table: "cooperative_memberships", id: membershipId, cents: amountToCents(savings) }];
  let loanDeduction = 0n;
  for (const view of views) {
    const { loan, position } = view;
    if (loan.mode !== "PAYROLL" || !["PENDING", "APPROVED", "ACTIVE"].includes(loan.status)) continue;
    const deduction = payrollTermCommitment(loan.frequency, cutoff, position?.installments ?? [], loanInstallmentAmount(view));
    if (deduction === null || (loan.status === "ACTIVE" && !position)) {
      return { ...base, assessmentCutoff: cutoff, headroomMessage: "A payroll loan is missing verified installment terms." };
    }
    if (deduction > 0n) commitments.push({ table: "cooperative_loans", id: loan.id, cents: deduction });
    loanDeduction += deduction;
  }
  const assessment = { ...base, loanDeduction: signedCentsToAmount(loanDeduction), assessmentCutoff: cutoff };
  try {
    const posted = await readCooperativePayrollDeductions(userId, payroll);
    const overlap = posted ? payrollItemOverlap(await remapPostedPayrollItems(posted, userId), commitments) : null;
    if (overlap !== null && overlap <= amountToCents(payroll.totalDeductions)) {
      return { ...assessment, ...payrollHeadroom(payroll.netPay, floor, commitments, overlap) };
    }
  } catch {
    // Keep the posted payroll figures available while the deduction details are checked.
  }
  return { ...assessment, headroomMessage: "Cooperative deductions in the posted payroll could not be verified. Ask Payroll to review the deduction references." };
}

export async function readMemberLoanStatement(memberId: number, from: string, to: string): Promise<MemberStatement["loans"]> {
  const loans = await readMemberLoans([memberId], to);
  if (loans.state !== "ready") return loans;

  const entries: Extract<MemberStatement["loans"], { state: "ready" }>["data"]["entries"] = [];
  const activity: Extract<MemberStatement["loans"], { state: "ready" }>["data"]["activity"] = [];
  const totals = { opening: 0n, released: 0n, paid: 0n, penaltiesPaid: 0n, offsets: 0n, waivedInterest: 0n, closing: 0n };
  try {
    for (const { loan, ledger } of loans.data) {
      if (!ledger || ledger.release.date > to) continue;
      const statement = loanStatementForPeriod(ledger, from, to);
      if (!statement.activity.length && statement.totals.opening === "0.00" && statement.totals.closing === "0.00") continue;
      entries.push({ id: loan.id, loanNo: loan.loanNo, productName: loan.productName, ...statement.totals });
      for (const item of statement.activity) activity.push({ loanNo: loan.loanNo, ...item });
      for (const key of Object.keys(totals) as Array<keyof LoanStatementTotals>) {
        totals[key] += amountToCents(statement.totals[key] ?? "0.00");
      }
    }
  } catch {
    return { state: "unavailable", message: "Loan activity could not be reconciled for this statement. Try again or ask the Cooperative office to review the postings." };
  }
  entries.sort((a, b) => a.loanNo.localeCompare(b.loanNo));
  activity.sort((a, b) => a.date.localeCompare(b.date) || a.journalNo.localeCompare(b.journalNo) || a.loanNo.localeCompare(b.loanNo));
  return {
    state: "ready",
    data: {
      entries, activity,
      totals: {
        opening: signedCentsToAmount(totals.opening), released: signedCentsToAmount(totals.released),
        paid: signedCentsToAmount(totals.paid), penaltiesPaid: signedCentsToAmount(totals.penaltiesPaid),
        offsets: signedCentsToAmount(totals.offsets), closing: signedCentsToAmount(totals.closing),
        ...(totals.waivedInterest ? { waivedInterest: signedCentsToAmount(totals.waivedInterest) } : {}),
      },
    },
  };
}
