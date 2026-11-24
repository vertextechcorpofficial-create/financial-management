import "server-only";

import type { MonthlyWithholdingRow, PeriodKey, RegistryCompany } from "../types";
import { loadPurchaseVat, loadPurchaseWithholding, type WithholdingMonth } from "./purchases";

/**
 * Monthly withholding on outside payees, from the same posted purchases the VAT tab reads.
 *
 * The withheld amount is what each purchase order recorded; a month whose orders carry none
 * is unknown, not zero, so `unknown` marks it and the table prints a dash instead of ₱0.00.
 * The 0619-E column carries each of the first two months; the 1601-EQ column carries what is
 * left of the quarter after those two remittances.
 *
 * ponytail: no remittance ledger read here. `tax_payment` rows with form_code 0619-E /
 * 1601-EQ would let this show what was actually paid.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const QUARTERS: PeriodKey[] = ["Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3", "Q4", "Q4", "Q4"];

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function emptyMonthly(): MonthlyWithholdingRow[] {
  return MONTHS.map((label, index) => buildRow(index + 1, label, 0, 0, true));
}

function buildRow(
  month: number,
  label: string,
  purchases: number,
  withheld: number,
  unknown: boolean,
): MonthlyWithholdingRow {
  const quarterEnd = month % 3 === 0;
  return {
    month,
    label,
    quarter: QUARTERS[month - 1],
    quarterEnd,
    purchases: round(purchases),
    withheld: round(withheld),
    unknown,
    agentForm: quarterEnd ? null : "0619-E",
    quarterlyForm: quarterEnd ? "1601-EQ" : null,
    agentDue: quarterEnd || unknown ? null : round(withheld),
    quarterlyDue: null,
  };
}

export async function loadMonthlyWithholding(
  company: RegistryCompany,
  taxYear: number,
): Promise<{ monthly: MonthlyWithholdingRow[]; notices: string[] }> {
  const notices: string[] = [];
  const from = `${taxYear}-01-01`;
  const to = `${taxYear}-12-31`;

  let orders: Map<number, WithholdingMonth> = new Map();
  try {
    orders = await loadPurchaseWithholding(company, from, to);
  } catch (error) {
    notices.push(
      "Purchase orders could not be read, so no month's withholding is known. " +
        `Check that the company instance answers, then refresh. (${error instanceof Error ? error.message : String(error)})`,
    );
    return { monthly: emptyMonthly(), notices };
  }

  const withheld = new Array<number>(12).fill(0);
  const unknown = new Array<boolean>(12).fill(false);
  for (const [month, sums] of orders) {
    withheld[month - 1] = sums.withheld;
    // A month whose orders recorded nothing is unknown, not zero: MEN2 leaves the column null
    // on its 2025 orders, and printing ₱0.00 there would report a remittance that never existed.
    unknown[month - 1] = sums.withheld === 0 && sums.orders > 0;
  }

  // The base is the same purchase source the VAT tab reads, so the two screens agree.
  const base = new Array<number>(12).fill(0);
  try {
    const vat = await loadPurchaseVat(company, from, to);
    for (const [month, sums] of vat.months) base[month - 1] = sums.base;
  } catch {
    // Without the lines the base stays zero; the VAT tab says why.
  }

  const monthly = MONTHS.map((label, index) => buildRow(index + 1, label, base[index], withheld[index], unknown[index]));

  const unknownMonths = monthly.filter((row) => row.unknown);
  if (unknownMonths.length > 0) {
    notices.push(
      `${unknownMonths.length} month${unknownMonths.length === 1 ? "" : "s"} of ${taxYear} record purchases with no withheld amount, ` +
        "so withholding for those months is unknown rather than zero. Record the withholding on the orders, then refresh.",
    );
  }

  const quarterTotals = [0, 1, 2, 3].map((quarter) =>
    round(withheld.slice(quarter * 3, quarter * 3 + 3).reduce((sum, value) => sum + value, 0)),
  );
  for (const row of monthly) {
    if (!row.quarterEnd) continue;
    const quarter = Math.floor((row.month - 1) / 3);
    // 1601-EQ credits the two 0619-E remittances already due for the quarter, so it carries
    // the remaining third, not the quarter total a second time.
    const firstTwo = withheld.slice(quarter * 3, quarter * 3 + 2).reduce((sum, value) => sum + value, 0);
    row.quarterlyDue = unknown[quarter * 3] || unknown[quarter * 3 + 1] || unknown[quarter * 3 + 2]
      ? null
      : round(quarterTotals[quarter] - firstTwo);
  }

  return { monthly, notices };
}
