import "server-only";

import type { EnrollmentSnapshot } from "../enrollment/types";
import type { PayrollHandoffPayload } from "../payroll-handoff/types";
import { readLinkedPayrollLoans } from "./enrollment-sources";
import type { readStagedEnrollment } from "./loan-enrollment";
import { commitRequestRevision, loanCommandPartKey, type loanCommand } from "./loan-requests";
import { readSuccessorHandoff } from "./payroll-handoff-store";
import { LoanRequestError } from "./request-input";

type Enrollment = Awaited<ReturnType<typeof readStagedEnrollment>>;
type Command = ReturnType<typeof loanCommand>;

const conflictingRenewal = () => new LoanRequestError(409, "Another renewal already reserves this prior Payroll loan.");

export async function commitEnrollmentActivation(row: Enrollment, command: Command, code: string,
  enrollment: EnrollmentSnapshot, audit: object, now: string) {
  const { employeeId, agencyId, program } = row.form;
  if (!employeeId || !agencyId) throw new LoanRequestError(422, "Confirm the active employee and agency before verification.");
  const remainingInstallments = enrollment.installmentCount - enrollment.installmentsPaid;
  if (remainingInstallments < 1) throw new LoanRequestError(422, "The verified loan needs at least one remaining installment.");

  const handoffId = loanCommandPartKey(command.key, "payroll-handoff");
  const firstMonth = enrollment.firstDeductionMonth;
  const priorId = enrollment.priorLoanId;
  let stop: PayrollHandoffPayload["stop"] = null;
  if (priorId) {
    const [[prior], successor] = await Promise.all([readLinkedPayrollLoans([priorId]), readSuccessorHandoff(priorId)]);
    if (successor) throw conflictingRenewal();
    stop = {
      id: loanCommandPartKey(handoffId, "stop"), payrollLoanId: priorId,
      effectiveMonth: firstMonth, enrollmentId: prior?.id ?? null,
    };
  }
  const payload: PayrollHandoffPayload = {
    handoffId, enrollmentId: row.id, employeeId, agencyId, benefitCode: code, program, stop,
    start: {
      id: loanCommandPartKey(handoffId, "start"), agencyReference: enrollment.agencyReference, effectiveMonth: firstMonth,
      monthlyAmount: enrollment.monthlyAmortization, remainingInstallments, payrollLoanId: row.payroll_loan_id,
    },
  };
  const action = row.status === "VERIFIED" ? "PAYROLL_HANDOFF_QUEUED" : "ENROLLMENT_VERIFIED";
  return commitRequestRevision(command, action, row, {
    status: "ACTIVE",
    enrollment,
    payroll_handoffs: { create: [{
      id: handoffId, prior_payroll_loan_id: priorId, state: "QUEUED", payload, updated_at: now,
      delivery: { reason: null, acknowledgements: [], lease: null, fileExchange: true, lastImport: null },
    }] },
  }, { status: row.status }, {
    ...audit, status: "ACTIVE", enrollment, state: "QUEUED", handoffId, instruction: payload,
  }, now).catch(async error => {
    if (priorId && error instanceof LoanRequestError && error.status === 409) {
      const successor = await readSuccessorHandoff(priorId);
      if (successor && successor.request_id !== row.id) throw conflictingRenewal();
    }
    throw error;
  });
}
