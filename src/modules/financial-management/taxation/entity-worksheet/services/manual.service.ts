import "server-only";

import { phtStamp } from "../pht";
import { MANUAL_LINE_KEYS, isManualLineKey, type ManualLineKey } from "../constants";
import type { QuarterFigures } from "../types";
import { appendAudit } from "./auditLog";
import {
  DirectusError,
  asNumber,
  asNumberOrNull,
  asString,
  createItem,
  deleteItem,
  listItems,
  roundMoney,
  updateItem,
} from "./directus";
import type { Actor } from "./actor";

/**
 * Manual entry mode (QA deck item 10): the figures a preparer types for a company whose
 * ledgers carry no history.
 *
 * One row per company, tax year, line and quarter. The typed value replaces the ledger
 * figure on that line only; the engine then runs exactly as it always does, so gross
 * income, MCIT/RCIT and the cumulative credits stay computed. Clearing the value removes
 * the row and the ledger figure comes back.
 */

const COLLECTION = "tax_worksheet_manual";
const FIELDS = ["id", "line_key", "quarter", "amount"];

/** `values[lineKey][index]` is the typed figure, or null where the ledgers still answer. */
export interface ManualValues {
  values: Record<ManualLineKey, Array<number | null>>;
  notice: string | null;
}

function emptyValues(): Record<ManualLineKey, Array<number | null>> {
  const values = {} as Record<ManualLineKey, Array<number | null>>;
  for (const key of MANUAL_LINE_KEYS) values[key] = [null, null, null, null];
  return values;
}

/**
 * Reads this company-year's typed figures.
 *
 * A missing collection or field answers 403 on this instance, not 404, and that is the
 * honest state before the owner runs the DDL: no manual figures yet. The notice says so
 * instead of letting the page look like a year nobody has typed into.
 */
export async function loadManualValues(companyId: number, taxYear: number): Promise<ManualValues> {
  try {
    const { rows } = await listItems<Record<string, unknown>>(COLLECTION, {
      fields: FIELDS,
      filter: { _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear } }] },
      limit: 500,
    });
    const values = emptyValues();
    for (const row of rows) {
      const key = asString(row.line_key);
      const quarter = asNumberOrNull(row.quarter);
      const amount = asNumberOrNull(row.amount);
      if (!isManualLineKey(key) || quarter == null || amount == null) continue;
      if (quarter < 1 || quarter > 4) continue;
      values[key][quarter - 1] = amount;
    }
    return { values, notice: null };
  } catch (error) {
    if (error instanceof DirectusError) {
      return {
        values: emptyValues(),
        notice:
          "Manual figures cannot be read yet: the tax_worksheet_manual table did not answer. Every line shows the computed figure until it exists.",
      };
    }
    throw error;
  }
}

const total = (figures: QuarterFigures[], pick: (quarter: QuarterFigures) => number) =>
  roundMoney(figures.reduce((sum, quarter) => sum + pick(quarter), 0));

/**
 * Overrides the ledger figures with the typed ones. Lines the engine computes from other
 * lines are never touched: only these five inputs are.
 */
export function applyManualValues(
  figures: QuarterFigures[],
  values: ManualValues["values"],
  /** What `computeTax` starts the cumulative credits from, so a typed line 11 means the same thing. */
  priorYearExcessCredit = 0,
): QuarterFigures[] {
  const next = figures.map((quarter) => ({ ...quarter }));

  // Lines 1, 2, 3, and 6 print cumulative year-to-date totals on the 1702Q worksheet, so a
  // typed figure is a running YTD total. Convert each typed YTD value into the quarter's
  // incremental movement before computeTax() cumulates the four quarters again.
  let salesBefore = 0;
  let returnsBefore = 0;
  let expensesBefore = 0;
  next.forEach((quarter, index) => {
    const sales = values["1"][index];
    if (sales != null) {
      quarter.sales = roundMoney(sales - salesBefore);
      salesBefore = sales;
    } else {
      salesBefore = roundMoney(salesBefore + quarter.sales);
    }

    // Line 2 prints returns plus discounts, so the typed figure is the whole YTD line 2.
    const returns = values["2"][index];
    if (returns != null) {
      quarter.returns = roundMoney(returns - returnsBefore);
      quarter.discounts = 0;
      returnsBefore = returns;
    } else {
      returnsBefore = roundMoney(returnsBefore + quarter.returns + quarter.discounts);
    }

    const expenses = values["6"][index];
    if (expenses != null) {
      quarter.expenses = roundMoney(expenses - expensesBefore);
      expensesBefore = expenses;
    } else {
      expensesBefore = roundMoney(expensesBefore + quarter.expenses);
    }
  });

  // Line 11 prints the year-to-date credits, so a typed figure is that running total. The engine
  // adds the withholding quarter by quarter, so hand it the movement: the typed total less what
  // the credits already stand at. Typing the total again would otherwise print total + the rest.
  let creditsBefore = priorYearExcessCredit;
  next.forEach((quarter, index) => {
    const credits = values["11"][index];
    if (credits == null) {
      creditsBefore = roundMoney(creditsBefore + quarter.cwt);
      return;
    }
    quarter.cwt = roundMoney(credits - creditsBefore);
    creditsBefore = credits;
  });

  // Line 3 sits on one of three bases; computeTax headlines the ledger when it carries cost and
  // falls back to product cost, then purchase orders. De-cumulate into the active basis.
  const ledgerCost = total(next, (quarter) => quarter.cogsLedger);
  const productCost = total(next, (quarter) => quarter.cogsProductCost);
  const purchaseBasis = ledgerCost === 0 && productCost === 0;
  let costBefore = 0;
  next.forEach((quarter, index) => {
    const costOfSales = values["3"][index];
    if (costOfSales == null) {
      const current = ledgerCost > 0 ? quarter.cogsLedger : purchaseBasis ? quarter.purchases : quarter.cogsProductCost;
      costBefore = roundMoney(costBefore + current);
      return;
    }
    const delta = roundMoney(costOfSales - costBefore);
    if (ledgerCost > 0) quarter.cogsLedger = delta;
    else if (purchaseBasis) quarter.purchases = delta;
    else quarter.cogsProductCost = delta;
    costBefore = costOfSales;
  });

  return next;
}

/** Marks the quarters a preparer typed, so the table can say which figures are not from the ledgers. */
export function manualFlags(line: { key: string }, values: ManualValues["values"]): boolean[] | undefined {
  if (!isManualLineKey(line.key)) return undefined;
  const flags = values[line.key].map((amount) => amount != null);
  return flags.some(Boolean) ? flags : undefined;
}

export interface ManualSaveInput {
  companyId: number;
  taxYear: number;
  lineKey: ManualLineKey;
  quarter: number;
  amount: number | null;
}

export interface ManualSaved {
  lineKey: ManualLineKey;
  quarter: number;
  amount: number | null;
}

/** Writes one typed figure, or removes it when the amount is null. */
export async function saveManualValue(input: ManualSaveInput, actor: Actor): Promise<ManualSaved> {
  const { rows } = await listItems<Record<string, unknown>>(COLLECTION, {
    fields: ["id", "amount"],
    filter: {
      _and: [
        { company_id: { _eq: input.companyId } },
        { tax_year: { _eq: input.taxYear } },
        { line_key: { _eq: input.lineKey } },
        { quarter: { _eq: input.quarter } },
      ],
    },
    limit: 1,
  });

  const existing = rows[0];
  const before = existing ? asNumberOrNull(existing.amount) : null;
  const stamp = phtStamp();

  if (input.amount == null) {
    if (existing) await deleteItem(COLLECTION, asNumber(existing.id));
  } else if (existing) {
    await updateItem(COLLECTION, asNumber(existing.id), {
      amount: input.amount,
      updated_at: stamp,
      updated_by: actor.userId,
    });
  } else {
    await createItem(COLLECTION, {
      company_id: input.companyId,
      tax_year: input.taxYear,
      line_key: input.lineKey,
      quarter: input.quarter,
      amount: input.amount,
      created_at: stamp,
      created_by: actor.userId,
      updated_at: stamp,
      updated_by: actor.userId,
    });
  }

  if (before !== input.amount) {
    await appendAudit({
      companyId: input.companyId,
      taxYear: input.taxYear,
      entity: COLLECTION,
      entityRef: `line ${input.lineKey} · Q${input.quarter}`,
      field: "amount",
      beforeValue: before == null ? null : String(before),
      afterValue: input.amount == null ? null : String(input.amount),
      reason: input.amount == null ? "Manual figure cleared" : "Manual figure entered",
      actor,
    });
  }

  return { lineKey: input.lineKey, quarter: input.quarter, amount: input.amount };
}
