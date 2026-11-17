import "server-only";

import { listItems } from "./directus";
import type { CarryoverInput, CarryoverLot } from "../types";

/**
 * The two things the 1702Q formula subtracts that do not come from the company's own
 * ledgers: the carryover lots still unused (NOLCO, excess MCIT) and the 1702Q payments
 * the desk already recorded. Both live in the central database, not per-company.
 */

const LOTS = "tax_carryover_lot";
const PAYMENTS = "tax_payment";

/** NOLCO runs three years after the loss, five for 2020 and 2021 losses. */
const DEFAULT_NOLCO_YEARS = 3;

const PERIOD_INDEX: Record<string, number> = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };

interface LotRow {
  kind?: string | null;
  origin_year?: number | string | null;
  amount?: number | string | null;
  amount_used?: number | string | null;
  expires_after_year?: number | string | null;
}

interface PaymentRow {
  form_code?: string | null;
  period_key?: string | null;
  amount?: number | string | null;
}

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function usableYears(row: LotRow, kind: string): number {
  const configured = number(row.expires_after_year);
  if (configured > 0) return configured;
  // NOLCO keeps the five-year window the document gives 2020 and 2021 losses; the column
  // is the honest source, so this only covers rows written before it existed.
  const origin = number(row.origin_year);
  if (kind === "NOLCO" && (origin === 2020 || origin === 2021)) return 5;
  return DEFAULT_NOLCO_YEARS;
}

export interface CarryoverLoad {
  input: CarryoverInput;
  notice: string | null;
}

export async function loadCarryoverInput(companyId: number, taxYear: number): Promise<CarryoverLoad> {
  const empty: CarryoverInput = { nolco: [], mcit: [], actualPaid: [null, null, null, null] };
  try {
    const { rows } = await listItems<LotRow>(LOTS, {
      fields: ["kind", "origin_year", "amount", "amount_used", "expires_after_year"],
      filter: { _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear } }] },
      limit: -1,
    });

    const nolco: CarryoverLot[] = [];
    const mcit: CarryoverLot[] = [];
    for (const row of rows) {
      const kind = String(row.kind ?? "").toUpperCase();
      const originYear = number(row.origin_year);
      const left = number(row.amount) - number(row.amount_used);
      // A lot is usable while the tax year falls inside its window, counted from the year
      // the loss or the excess arose: origin + 1 .. origin + n.
      const stillOpen = taxYear > originYear && taxYear <= originYear + usableYears(row, kind);
      if (left <= 0 || !stillOpen) continue;
      if (kind === "NOLCO") nolco.push({ originYear, amount: left });
      else if (kind === "MCIT") mcit.push({ originYear, amount: left });
    }
    const byYear = (a: CarryoverLot, b: CarryoverLot) => a.originYear - b.originYear;
    nolco.sort(byYear);
    mcit.sort(byYear);

    const paid = await listItems<PaymentRow>(PAYMENTS, {
      fields: ["form_code", "period_key", "amount"],
      filter: { _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear } }, { form_code: { _eq: "1702Q" } }] },
      limit: -1,
    });
    const actualPaid: (number | null)[] = [null, null, null, null];
    for (const row of paid.rows) {
      const index = PERIOD_INDEX[String(row.period_key ?? "").toUpperCase()];
      if (index === undefined) continue;
      actualPaid[index] = Math.round(((actualPaid[index] ?? 0) + number(row.amount)) * 100) / 100;
    }

    return { input: { nolco, mcit, actualPaid }, notice: null };
  } catch {
    return {
      input: empty,
      notice: `The carryover lots and recorded 1702Q payments could not be read (${LOTS}, ${PAYMENTS}), so lines 8 and 12 ignore them.`,
    };
  }
}
