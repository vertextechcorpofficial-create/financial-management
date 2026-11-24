import "server-only";

import type {
  CertificateRegister,
  CertificateRow,
  CertificateSummaryRow,
  PeriodKey,
  QuarterFigures,
  RegistryCompany,
} from "../types";
import { PERIOD_KEYS, PERIOD_LABELS } from "../constants";
import { asNumber, asString, listItems } from "./directus";

/**
 * 2307 certificates received — the only place this group records them.
 *
 * The ERP never collected 2307s: `purchase_order`/`sales_invoice` only carry a
 * `ewt_amount`, so "expected" means "what customers said they withheld on the invoice"
 * and "on certificates" means "what a 2307 row here actually documents". A missing
 * table degrades to an empty register with a notice, never a failed page.
 */

interface CertificateTableRow {
  id?: number | string;
  period_key?: string | null;
  counterparty_name?: string | null;
  counterparty_tin?: string | null;
  income_type?: string | null;
  income_amount?: number | string | null;
  tax_rate?: number | string | null;
  tax_withheld?: number | string | null;
  date_received?: string | null;
  source_ref?: string | null;
  remarks?: string | null;
}

const FIELDS = [
  "id",
  "period_key",
  "counterparty_name",
  "counterparty_tin",
  "income_type",
  "income_amount",
  "tax_rate",
  "tax_withheld",
  "date_received",
  "source_ref",
  "remarks",
];

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The rates RR 2-98 publishes for expanded withholding. Anything else is not a 2307 rate. */
const STATUTORY_RATES = [1, 2, 5, 10, 15];

/**
 * The rate the payor actually applied, as a percent.
 *
 * `tax_rate` cannot be trusted on its own: the column mixes units — some rows store 0.02
 * (a fraction) beside 1.01 (a percent) — and the 1.01% rows applied 1% to a base that
 * already carried the tax, which is why they read as 1.01 rather than 1. Dividing the two
 * money figures answers the question the column was supposed to answer.
 */
function impliedRateOf(income: number, withheld: number): number | null {
  if (!(income > 0) || !(withheld > 0)) return null;
  return (withheld / income) * 100;
}

function isStatutory(rate: number | null): boolean {
  if (rate === null) return false;
  return STATUTORY_RATES.some((statutory) => Math.abs(rate - statutory) < 0.005);
}

function periodOf(value: string): PeriodKey | null {
  const key = value.trim().toUpperCase();
  return (PERIOD_KEYS as string[]).includes(key) ? (key as PeriodKey) : null;
}

function quarterIndexOf(periodKey: PeriodKey | null, rawPeriod: string, dateReceived: string | null): number {
  // A period the table names is authoritative, even when it is not a quarter (ANNUAL):
  // such a certificate counts in no quarter rather than being guessed into one.
  if (rawPeriod) return periodKey ? PERIOD_KEYS.indexOf(periodKey) : -1;
  const month = dateReceived ? Number(dateReceived.slice(5, 7)) : 0;
  return month ? Math.min(3, Math.floor((month - 1) / 3)) : -1;
}

export function emptyRegister(): CertificateRegister {
  return {
    rows: [],
    summary: summaryFrom([0, 0, 0, 0]),
    verifiedTotal: 0,
    pendingTotal: 0,
    pendingCount: 0,
    notices: [],
  };
}

function summaryFrom(onCertificates: number[]): CertificateSummaryRow[] {
  return PERIOD_KEYS.map((quarter, index) => ({
    quarter,
    expected: 0,
    onCertificates: round(onCertificates[index] ?? 0),
    difference: 0,
  }));
}

export async function loadCertificates(
  company: RegistryCompany,
  taxYear: number,
  figures: QuarterFigures[],
): Promise<CertificateRegister> {
  const notices: string[] = [];
  let table: CertificateTableRow[] = [];

  try {
    const { rows } = await listItems<CertificateTableRow>("tax_2307", {
      fields: FIELDS,
      filter: {
        _and: [
          { company_id: { _eq: company.companyId } },
          { tax_year: { _eq: taxYear } },
          { direction: { _eq: "RECEIVED" } },
        ],
      },
      sort: "date_received",
      // Was capped at 200, which silently dropped the tail of a company that receives
      // certificates from many customers — the register understated its own credits.
      limit: -1,
    });
    table = rows;
  } catch (error) {
    void error;
    notices.push(
      "The 2307 register could not be read, so the certificates on file are unknown rather than none. " +
        "Check that this company's tax_2307 table exists and its instance answers, then refresh.",
    );
    return { ...emptyRegister(), notices };
  }

  const onCertificates = [0, 0, 0, 0];
  let unplaced = 0;
  let pendingCount = 0;
  let pendingTotal = 0;
  let nonStatutory = 0;
  const rows: CertificateRow[] = table.map((row, index) => {
    const rawPeriod = asString(row.period_key);
    const periodKey = periodOf(rawPeriod);
    const dateReceived = asString(row.date_received) || null;
    const quarter = quarterIndexOf(periodKey, rawPeriod, dateReceived);
    const taxWithheld = asNumber(row.tax_withheld);
    const incomeAmount = asNumber(row.income_amount);
    const sourceRef = asString(row.source_ref) || null;
    const counterpartyTin = asString(row.counterparty_tin) || null;
    const impliedRate = impliedRateOf(incomeAmount, taxWithheld);
    // A credit needs a payor's TIN, the certificate's own number and the day it arrived.
    // Without all three this is an invoice estimate, and counting it would credit tax
    // nobody has substantiated (RR 2-98).
    const verified = Boolean(counterpartyTin && sourceRef && dateReceived);
    if (!isStatutory(impliedRate)) nonStatutory += 1;

    if (verified) {
      if (quarter >= 0) onCertificates[quarter] += taxWithheld;
      else unplaced += 1;
    } else {
      pendingCount += 1;
      pendingTotal += taxWithheld;
    }

    return {
      id: row.id ?? `row-${index}`,
      periodKey,
      periodLabel: periodKey ? PERIOD_LABELS[periodKey] : rawPeriod || "—",
      counterpartyName: asString(row.counterparty_name) || "Unnamed payor",
      counterpartyTin,
      incomeType: asString(row.income_type) || "—",
      incomeAmount,
      taxRate: asNumber(row.tax_rate),
      impliedRate,
      statutory: isStatutory(impliedRate),
      verified,
      taxWithheld,
      dateReceived,
      sourceRef,
      remarks: asString(row.remarks) || null,
    };
  });

  const summary: CertificateSummaryRow[] = PERIOD_KEYS.map((quarter, index) => {
    const expected = round(figures[index]?.cwt ?? 0);
    const documented = round(onCertificates[index]);
    return { quarter, expected, onCertificates: documented, difference: round(documented - expected) };
  });

  if (pendingCount > 0) {
    notices.push(
      `${pendingCount} row${pendingCount === 1 ? "" : "s"} carry an invoice's withholding without a payor TIN, a certificate number and a date received: shown as pending, and left out of "on certificates" until the 2307 arrives.`,
    );
  }

  if (nonStatutory > 0) {
    notices.push(
      `${nonStatutory} row${nonStatutory === 1 ? "" : "s"} imply a withholding rate the BIR does not publish for expanded withholding (1%, 2%, 5%, 10%, 15%). The usual cause is withholding on an amount that already includes the tax, which is why the rate reads 1.01% rather than 1%.`,
    );
  }

  if (unplaced > 0) {
    notices.push(
      `${unplaced} certificate${unplaced === 1 ? "" : "s"} name a period outside Q1–Q4 (an annual 2307) or no date: listed below, but not counted in the quarterly summary.`,
    );
  }

  return {
    rows,
    summary,
    verifiedTotal: round(onCertificates.reduce((sum, value) => sum + value, 0)),
    pendingTotal: round(pendingTotal),
    pendingCount,
    notices,
  };
}

