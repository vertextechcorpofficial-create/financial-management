import { enrollmentCsvMaxBytes, readEnrollmentCsv } from "../../enrollment/import-csv";
import { exactMoney, normalizedReference } from "../../enrollment/rules";

export const billingHeaders = ["Loan reference", "Name", "Amount"] as const;
export const billingMaxBytes = enrollmentCsvMaxBytes;
export const billingMaxRows = 5000;

export type BillingLine = { rowNumber: number; reference: string; name: string; amount: string };
export type BillingIssue = { rowNumber: number | null; message: string };

export function parseAgencyBill(csv: string, mapping?: number[]) {
  const empty = (message: string) => ({
    headers: [] as string[], columns: [] as number[], lines: [] as BillingLine[],
    issues: [{ rowNumber: null, message }], issueCount: 1,
  });
  if (new TextEncoder().encode(csv).byteLength > billingMaxBytes) return empty("Choose a CSV up to 1 MB.");
  let parsed: ReturnType<typeof readEnrollmentCsv>;
  try {
    parsed = readEnrollmentCsv(csv, billingMaxRows);
  } catch (error) {
    return empty(error instanceof Error ? error.message : "Could not read this CSV.");
  }
  const { headers, rows } = parsed;
  const columns = mapping ?? billingHeaders.map(label => {
    const matches = headers.flatMap((heading, index) => heading.toLowerCase() === label.toLowerCase() ? [index] : []);
    return matches.length === 1 ? matches[0] : -1;
  });
  const issues: BillingIssue[] = [];
  let issueCount = 0;
  const lines: BillingLine[] = [];
  function report(rowNumber: number | null, message: string) {
    issueCount++;
    if (issues.length < 100) issues.push({ rowNumber, message });
  }
  if (columns.length !== billingHeaders.length || columns.some(column => !Number.isInteger(column) || column < 0 || column >= headers.length)
    || new Set(columns).size !== columns.length) {
    report(null, "Map Loan reference, Name, and Amount to three different columns.");
    return { headers, columns, lines, issues, issueCount };
  }
  const seen = new Map<string, number>();
  for (const { rowNumber, cells } of rows) {
    if (cells.length !== headers.length) {
      report(rowNumber, "This row does not have the same number of columns as the header.");
      continue;
    }
    const [reference, name, rawAmount] = columns.map(index => cells[index].trim());
    const firstIssue = issueCount;
    const referenceKey = normalizedReference(reference);
    if (!referenceKey || reference.length > 120 || /[\x00-\x1f\x7f]/.test(reference)) {
      report(rowNumber, "Enter a loan reference of up to 120 characters.");
    } else {
      const previous = seen.get(referenceKey);
      if (previous !== undefined) report(rowNumber, "Duplicate loan reference from row " + previous + ".");
      else seen.set(referenceKey, rowNumber);
    }
    if (!name || name.length > 255 || /[\x00-\x1f\x7f]/.test(name)) report(rowNumber, "Enter a name of up to 255 characters.");
    const amountText = rawAmount.replace(/^₱\s*/, "");
    const ungrouped = amountText.replaceAll(",", "");
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amountText) || !/^\d{1,13}(?:\.\d{1,2})?$/.test(ungrouped)) {
      report(rowNumber, "Enter a nonnegative amount with at most two decimal places.");
    }
    if (issueCount === firstIssue) lines.push({ rowNumber, reference, name, amount: exactMoney(ungrouped) });
  }
  return { headers, columns, lines, issues, issueCount };
}
