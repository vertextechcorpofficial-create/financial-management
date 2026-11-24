import {
  WITHHOLDING_LABELS,
  type Tone,
  type WithholdingIncomeType,
} from "./constants";
import type { IntercompanyPair, WithholdingRow } from "./types";

/**
 * What the configured rate would withhold on each pair, against what the ERP actually recorded.
 *
 * The rate comes from `tax_withholding_rates`, never from a hard-coded assumption: without an
 * explicit income type / ATC recorded on the ledger document, the row is flagged as Unclassified
 * rather than assuming a 2% service fee and marking it "Differs".
 */

export const NOT_DETERMINABLE = "Unclassified — no income type / ATC recorded";
export const AMOUNT_TOLERANCE = 1;

/** How each verdict reads on screen, shared by the withholding tab and the pair drilldown. */
export const VERDICT_STYLE: Record<WithholdingRow["verdict"], { label: string; tone: Tone }> = {
  MATCHED: { label: "Within ₱1", tone: "success" },
  DIFFERENT: { label: "Differs", tone: "warning" },
  NOT_DETERMINABLE: { label: "Unclassified", tone: "info" },
};

/** One row of `tax_withholding_rates`, as `GET /api/fm/taxation/rates-references` carries it. */
export interface ConfiguredWithholdingRate {
  incomeType: WithholdingIncomeType;
  /** LARGE | MEDIUM | SMALL where the rate depends on the payee; null where the type has one rate. */
  tier: string | null;
  rate: number;
  /** The rate applies only to a payee with top-withholding status. */
  requiresTopWithholdingAgent: boolean;
}

export interface WithholdingOptions {
  /** The payer company's configured rates; without them no rate can be claimed. */
  rates?: ConfiguredWithholdingRate[];
  /** What the desk reads the pair as; the ledger records no income type. */
  incomeType?: WithholdingIncomeType;
  /** The payee's tier, when something knows it. */
  tier?: string | null;
  /** The payee's top-withholding status, when something knows it. */
  payeeIsTopWithholdingAgent?: boolean;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percent(rate: number): string {
  const points = rate * 100;
  return `${Number.isInteger(points) ? points.toFixed(0) : points.toFixed(2)}%`;
}

interface ResolvedRate {
  rate: number | null;
  label: string;
}

function resolveRate(
  incomeType: WithholdingIncomeType | undefined,
  options: WithholdingOptions,
): ResolvedRate {
  if (!incomeType) {
    return { rate: null, label: NOT_DETERMINABLE };
  }
  const typeLabel = WITHHOLDING_LABELS[incomeType];
  const rows = (options.rates ?? []).filter((row) => row.incomeType === incomeType);
  if (rows.length === 0) return { rate: null, label: `${typeLabel} · unclassified` };

  // A type with one rate is the easy case; a tiered type needs to know whose income it is.
  const flat = rows.find((row) => row.tier == null);
  const tiered = options.tier ? rows.find((row) => row.tier === options.tier) : undefined;
  const chosen = flat ?? tiered;
  if (!chosen) return { rate: null, label: `${typeLabel} · unclassified, payee tier unknown` };

  if (chosen.requiresTopWithholdingAgent && options.payeeIsTopWithholdingAgent !== true) {
    return { rate: null, label: `${typeLabel} · unclassified, top-withholding status unknown` };
  }

  const tier = chosen.tier ? ` (${chosen.tier.toLowerCase()})` : "";
  return { rate: chosen.rate, label: `${percent(chosen.rate)} configured · ${typeLabel}${tier}` };
}

export function buildWithholdingRows(
  pairs: IntercompanyPair[],
  options: WithholdingOptions = {},
): WithholdingRow[] {
  const incomeType = options.incomeType;
  const configured = resolveRate(incomeType, options);

  return pairs.map((pair) => {
    const hasInvoice = pair.invoices > 0;
    const basis: WithholdingRow["basis"] = hasInvoice
      ? "SALES_INVOICE"
      : pair.reciprocalInvoices > 0
        ? "PURCHASE_ORDER"
        : "NONE";

    // A line with no invoice behind it has no base to withhold on, so it borrows no rate.
    const rate = hasInvoice ? configured.rate : null;
    const expected = rate === null ? null : round(pair.amount * rate);

    // The payer's purchase order is the record of what was actually withheld; the seller's own
    // invoice field is the fallback when the buyer has no reachable record.
    const recordedSource: WithholdingRow["recordedSource"] =
      pair.reciprocalInvoices > 0
        ? "purchase_order"
        : hasInvoice
          ? "sales_invoice"
          : null;
    const recorded =
      recordedSource === "purchase_order"
        ? (pair.reciprocalWithheld ?? 0)
        : recordedSource === "sales_invoice"
          ? pair.withheld
          : null;

    const difference = expected !== null && recorded !== null ? round(recorded - expected) : null;
    const verdict: WithholdingRow["verdict"] =
      expected === null
        ? "NOT_DETERMINABLE"
        : difference !== null && Math.abs(difference) <= AMOUNT_TOLERANCE
          ? "MATCHED"
          : "DIFFERENT";

    return {
      fromCode: pair.fromCode,
      fromName: pair.fromName,
      toCode: pair.toCode,
      toName: pair.toName,
      basis,
      rate,
      rateLabel: rate === null && !hasInvoice ? NOT_DETERMINABLE : configured.label,
      base: pair.amount,
      expected,
      recorded,
      recordedSource,
      difference,
      verdict,
      incomeType: rate === null ? null : (incomeType ?? null),
    };
  });
}
