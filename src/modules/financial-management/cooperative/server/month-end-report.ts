import "server-only";

import { reportManilaTime } from "../console/reports/report-dates";
import { cashEvidenceLabels, type CashEvidenceContext, type CashEvidencePurpose, type ReportResult } from "../console/reports/types";
import type { StatementPeriod } from "../members/types";
import { CooperativeDirectusError, usesCooperativeQaDatabase } from "./directus";
import { readCloseAccountMappings, readTrialBalance } from "./ledger-report";
import { amountToCents, signedCentsToAmount } from "./member-read";
import { reconcileEmployerRemittances } from "./payroll-reconciliation";
import { readCloseEvidence } from "./reconciliation-evidence";

const cashPurposes = Object.keys(cashEvidenceLabels) as CashEvidencePurpose[];
const amount = (value: bigint | null) => value === null ? null : signedCentsToAmount(value);

export async function getMonthEndReport(period: StatementPeriod): Promise<ReportResult> {
  const { chart, balances } = await readTrialBalance(period);
  const notices: NonNullable<ReportResult["notices"]> = [];
  const [mappingRead, evidenceRead] = await Promise.allSettled([readCloseAccountMappings(chart), readCloseEvidence(period.to)]);
  const mappings = mappingRead.status === "fulfilled" ? mappingRead.value : null;
  const evidence = evidenceRead.status === "fulfilled" ? evidenceRead.value : null;
  const cashEvidence: CashEvidenceContext[] = [];
  const metadata: ReportResult["metadata"] = [["From", period.from], ["To", period.to]];
  if (!mappings) notices.push({ label: "Cooperative account mappings", state: "unavailable", message: "The mapped accounts could not be loaded." });
  if (evidenceRead.status === "rejected") {
    const missing = evidenceRead.reason instanceof CooperativeDirectusError && [403, 404].includes(evidenceRead.reason.status);
    notices.push({
      label: "Cash and bank evidence", state: missing ? "pending_rollout" : "unavailable",
      message: missing ? "Month-end evidence is awaiting setup." : "Saved evidence could not be loaded.",
    });
  }

  const rows = cashPurposes.map(purpose => {
    const account = mappings?.get(purpose);
    const saved = evidence?.get(purpose);
    const book = account ? balances.get(account.id)!.closing : null;
    const matches = Boolean(saved && account && saved.account_id === account.id);
    const verified = saved && matches ? amountToCents(saved.verified_amount) : null;
    const delta = book !== null && verified !== null && matches ? book - verified : null;
    const label = account ? account.code + " · " + account.name : null;
    if (account && evidence) cashEvidence.push({
      purpose, periodEnd: period.to, accountId: account.id, accountLabel: label!, revision: saved?.revision ?? 0,
      amount: matches ? amount(verified) : null, reference: matches ? saved!.source_reference : null,
    });
    const status = !account ? "Needs mapping" : !evidence ? "Pending evidence" : !saved ? "Evidence required" :
      !matches ? "Mapping changed" : delta === 0n ? "Matched" : "Difference";
    const prior = saved && !matches ? chart.find(candidate => candidate.id === saved.account_id) : undefined;
    const reference = saved ? saved.source_reference + (prior ? " · saved for " + prior.code : "") : null;
    return { id: String(purpose), cells: [
      cashEvidenceLabels[purpose], label, amount(book), amount(verified), amount(delta), status,
      reference, saved?.verifier_name ?? null, saved ? reportManilaTime(saved.verified_at) : null,
    ] };
  });

  const employer = mappings?.get("DUE_FROM_EMPLOYER");
  const book = employer ? balances.get(employer.id)! : null;
  const sections: NonNullable<ReportResult["sections"]> = [];
  let expected: bigint | null = null;
  let status = book ? "Pending verification" : "Needs mapping";
  let reference: string | null = null;
  if (book && employer) {
    if (!usesCooperativeQaDatabase()) {
      notices.push({ label: "Due from Employer", state: "pending_rollout", message: "Verified payroll remittance data is awaiting rollout." });
    } else {
      try {
        const payroll = await reconcileEmployerRemittances(period, employer.id, mappings?.get("CASH_IN_BANK")?.id);
        const movement = book.debit - book.credit + payroll.bookClearing;
        metadata.push(["Employer opening balance", signedCentsToAmount(book.opening)], ["Net recognized employer receivables", signedCentsToAmount(movement)]);
        if (!payroll.incomplete) {
          expected = book.opening + movement - payroll.verifiedClearing;
          metadata.push(["Net verified remittances", signedCentsToAmount(payroll.verifiedClearing)]);
        }
        status = payroll.incomplete ? "Needs review" : payroll.difference || expected !== book.closing ? "Difference" :
          payroll.timing ? "Timing difference" : "Matched";
        reference = payroll.section.rows.length ? "See payroll remittance references" : "No verified remittances in this period";
        if (payroll.section.rows.length) sections.push(payroll.section);
      } catch {
        notices.push({ label: "Due from Employer", state: "unavailable", message: "Payroll remittance evidence could not be verified." });
      }
    }
  }
  rows.push({ id: "DUE_FROM_EMPLOYER", cells: [
    "Due from Employer", employer ? employer.code + " · " + employer.name : null,
    amount(book?.closing ?? null), amount(expected), amount(book && expected !== null ? book.closing - expected : null),
    status, reference, null, null,
  ] });
  return {
    columns: [
      { label: "Comparison" }, { label: "GL account" }, { label: "Book closing", kind: "money" },
      { label: "Verified or expected", kind: "money" }, { label: "Book less evidence", kind: "money" },
      { label: "Status" }, { label: "Source reference" }, { label: "Verified by" }, { label: "Verified at (PHT)" },
    ],
    metadata, rows, totals: [], departments: [], notices, sections, cashEvidence,
  };
}
