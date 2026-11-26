import { registerStatusLabels, type RegisterLoan } from "./types";

const headers = ["Loan", "Employee", "Department", "Agency", "Program", "Agency reference", "Loan amount",
  "Monthly amortization", "Installments counted", "Total installments", "Estimated balance", "Statement date",
  "Statement balance", "Adjusted agency balance", "Difference", "Status", "Payroll results pending"];

export function csvCell(input: string | number | null) {
  const value = String(input ?? "");
  const formula = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(value);
  const safe = formula && !/^-\d+\.\d{2}$/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function registerCsvRow(loan: RegisterLoan) {
  const { latest, adjusted, difference } = loan.agencyBalance;
  return [loan.reference, loan.employee, loan.department, loan.agency, loan.program, loan.agencyReference, loan.principal,
    loan.amortization, loan.counted, loan.term, loan.estimate, latest?.date ?? null, latest?.balance ?? null,
    adjusted, difference, registerStatusLabels[loan.status], loan.awaitingPayroll ? "Yes" : "No"].map(csvCell).join(",");
}

export const registerCsvHeader = headers.map(csvCell).join(",");
