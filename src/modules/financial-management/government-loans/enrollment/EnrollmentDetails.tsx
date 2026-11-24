import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { RequestDecisionHistory, RequestDetails, RequestSection } from "../requests/RequestReview";
import { enrollmentEvidenceKinds, requestStatusLabels, type DocumentKind, type EnrollmentEvidenceKind } from "../requests/types";
import { enrollmentBatchReference } from "./import-csv";
import { deductionMonthLabel } from "./rules";
import type { EnrollmentDetail } from "./types";
import { requiredEnrollmentEvidence } from "./verification-rules";

export function EnrollmentDetails({ record, documentHref, children }: {
  record: EnrollmentDetail; documentHref: (kind: DocumentKind) => string; children?: ReactNode;
}) {
  const { enrollment, request } = record;
  const values = enrollment ? [
    ["Agency reference", enrollment.agencyReference],
    ["Original principal", peso(enrollment.originalPrincipal)],
    ["Exact monthly amortization", peso(enrollment.monthlyAmortization)],
    ["Number of installments", enrollment.installmentCount],
    ["Installments already paid", enrollment.installmentsPaid],
    ["First deduction month", deductionMonthLabel(enrollment.firstDeductionMonth)],
    ["Prior Payroll loan", enrollment.priorLoanId ?? "—"],
    ["Enrollment source", { REQUEST: "Approved request", EXISTING: "Existing loan", TRANSFER: "Transfer", IMPORT: "CSV import" }[enrollment.origin]],
    ["Encoded by", enrollment.encodedBy.name],
    ["Encoded at", dateTime(enrollment.encodedAt) + " PHT"],
    ...(enrollment.resubmittedBy && enrollment.resubmittedAt ? [
      ["Resubmitted by", enrollment.resubmittedBy.name], ["Resubmitted at", dateTime(enrollment.resubmittedAt) + " PHT"],
    ] : []),
    ...(enrollment.verifiedBy && enrollment.verifiedAt ? [
      ["Verified by", enrollment.verifiedBy.name], ["Verified at", dateTime(enrollment.verifiedAt) + " PHT"],
    ] : []),
    ...(enrollment.payrollLoanId ? [["Linked Payroll loan", enrollment.payrollLoanId]] : []),
    ...(record.importBatchId ? [["Import batch", enrollmentBatchReference(record.importBatchId) + " · Row " + enrollment.sourceRow]] : []),
  ] : [];

  return <>
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{record.reference}</h2>
        <Badge variant="secondary">{requestStatusLabels[record.status]}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{[record.employeeName, record.agencyName, record.program].filter(Boolean).join(" · ")}</p>
    </div>
    {enrollment && <RequestSection title="Saved loan terms">
      <div className="flex flex-wrap gap-2">
        {enrollment.referenceConfirmed && <Badge variant="outline">Reference confirmed as printed</Badge>}
        {enrollment.externalReferenceCheck === "NEEDS_SOURCE" && <Badge variant="outline">External reference check pending</Badge>}
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {values.map(([label, value]) => <div key={label}>
          <dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd>
        </div>)}
      </dl>
      {record.status === "RETURNED" && enrollment.returnReason && <div className="rounded-md border p-3 text-sm">
        <p className="font-medium">Return reason</p>
        <p className="whitespace-pre-wrap break-words">{enrollment.returnReason}</p>
      </div>}
    </RequestSection>}
    {children}
    {request.requestedAt ? <RequestDetails record={request} documentHref={documentHref} /> :
      <RequestDecisionHistory items={request.decisionHistory} />}
  </>;
}

export function EnrollmentEvidenceList({ record, href, controls, transferControl }: {
  record: EnrollmentDetail; href: (kind: EnrollmentEvidenceKind) => string;
  controls?: (kind: EnrollmentEvidenceKind) => ReactNode; transferControl?: ReactNode;
}) {
  if (!record.enrollment) return null;
  const required = requiredEnrollmentEvidence(record.enrollment, record.request.form.applicationType === "RENEWAL");
  const kinds = Object.keys(enrollmentEvidenceKinds) as EnrollmentEvidenceKind[];
  return <RequestSection title="Verification evidence">
    {transferControl}
    <ul className="divide-y text-sm">
      {kinds.map(kind => {
        const document = record.evidence.find(item => item.kind === kind);
        if (!document && !required.includes(kind) && !controls) return null;
        return <li key={kind} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{enrollmentEvidenceKinds[kind]}</p>
            {document ? <a className="break-words text-primary underline" href={href(kind)}>{document.name}</a> :
              <p className="text-muted-foreground">{required.includes(kind) ? "Required for verification" : "Optional"}</p>}
          </div>
          {controls?.(kind)}
        </li>;
      })}
    </ul>
  </RequestSection>;
}
