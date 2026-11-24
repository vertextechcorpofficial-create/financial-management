import type { EnrollmentEvidenceKind } from "../requests/types";
import type { EnrollmentSnapshot } from "./types";

export function needsImportTransferChoice(enrollment: Pick<EnrollmentSnapshot, "origin" | "installmentsPaid" | "importTransfer">) {
  return enrollment.origin === "IMPORT" && enrollment.installmentsPaid === 0 && enrollment.importTransfer === undefined;
}

export function requiredEnrollmentEvidence(enrollment: Pick<EnrollmentSnapshot, "origin" | "installmentsPaid" | "priorLoanId" | "importTransfer">,
  renewal: boolean): EnrollmentEvidenceKind[] {
  const kinds: EnrollmentEvidenceKind[] = ["AUTHORITY", "AGENCY_APPROVAL"];
  if (renewal || enrollment.priorLoanId || enrollment.origin === "TRANSFER" || enrollment.importTransfer || enrollment.installmentsPaid > 0) {
    kinds.push("STATEMENT_OF_ACCOUNT");
  }
  return kinds;
}

export function isEnrollmentPreparer(enrollment: Pick<EnrollmentSnapshot, "encodedBy" | "resubmittedBy">, userId: number) {
  return enrollment.encodedBy.id === userId || enrollment.resubmittedBy?.id === userId;
}

export function canStartInOpenPeriod(start: string, openMonth: string | null) {
  return openMonth !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(start) && start >= openMonth;
}
