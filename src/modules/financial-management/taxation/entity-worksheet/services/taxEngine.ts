import "server-only";

import type {
  CarryoverInput,
  CostBasis,
  EntityProfile,
  QuarterFigures,
  TaxArbitrage,
  TaxComputation,
  TaxRates,
  TaxScenario,
  VatComputation,
  WorksheetLine,
} from "../types";
import {
  CORPORATE_RATE,
  MCIT_RATE,
  MCIT_START_YEAR,
  OSD_RATE,
  PERCENTAGE_TAX_RATE,
  SMALL_CORPORATION_ASSET_CEILING,
  SMALL_CORPORATION_NTI_CEILING,
  SMALL_CORPORATION_RATE,
  VAT_RATE,
} from "../constants";

/**
 * The arithmetic from the tax desk document, and nothing else.
 *
 * Every figure that arrives here was summed from the company's own tables; this
 * file decides what those sums *mean* for 1702Q/1702, 2550Q and 2551Q.
 *
 * Two rules the document states and this file keeps: the regular rate applies to net
 * taxable income (deductions included), while MCIT is 2% of gross income and ignores
 * them, so the tax is the higher of the two. Gross income already nets returns and
 * discounts, so nothing here subtracts them twice.
 */

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const FALLBACK_RATES: TaxRates = {
  vat: VAT_RATE,
  percentage: PERCENTAGE_TAX_RATE,
  corporate: CORPORATE_RATE,
  smallCorporate: SMALL_CORPORATION_RATE,
  mcit: MCIT_RATE,
  osd: OSD_RATE,
  scit: 0.05,
  withholding: 0.01,
  smallCorporateNtiCeiling: SMALL_CORPORATION_NTI_CEILING,
  smallCorporateAssetCeiling: SMALL_CORPORATION_ASSET_CEILING,
  mcitStartYear: MCIT_START_YEAR,
  source: "DEFAULTS",
  missing: [],
};

function registeredOnly(profile: EntityProfile, value: number): number {
  if (profile.regime === "REGULAR") return value;
  return (value * profile.registeredShare) / 100;
}

/** Cost of sales under one of the three readings the desk shows side by side. */
function costOfSales(figures: QuarterFigures[], basis: CostBasis): number[] {
  return figures.map((quarter) => {
    if (basis === "LEDGER") return quarter.cogsLedger + quarter.icPurchases;
    if (basis === "PRODUCT_COST") return quarter.cogsProductCost + quarter.icPurchases;
    return quarter.purchases + quarter.icPurchases;
  });
}

const BASIS_LABELS: Record<CostBasis, string> = {
  LEDGER: "Ledger cost of goods sold and services",
  PRODUCT_COST: "Product standard cost",
  PURCHASES: "Purchase orders",
};

function scenarioFor(
  figures: QuarterFigures[],
  profile: EntityProfile,
  rates: TaxRates,
  basis: CostBasis,
  creditsPerQuarter: number[],
  carryovers: CarryoverInput,
): TaxScenario {
  const cost = costOfSales(figures, basis);
  const grossIncome = figures.map((quarter, index) =>
    round(quarter.sales + quarter.icSales - quarter.returns - quarter.discounts - cost[index]),
  );

  const deductions = figures.map((quarter, index) => {
    if (profile.deductionMethod === "OSD") return round(grossIncome[index] * rates.osd);
    return round(profile.regime === "REGULAR" ? quarter.expenses : registeredOnly(profile, quarter.expenses));
  });

  // NOLCO is a carryover deduction: oldest year first, never under OSD, and never below zero.
  // Taxable income is year-to-date like the return it feeds, so a quarter that runs a loss nets
  // against the year instead of being floored at zero and lost; `nolcoUsed` stays the movement
  // per quarter, `netTaxableIncome` is the running figure.
  let nolcoLeft = profile.deductionMethod === "OSD" ? 0 : round(sum(carryovers.nolco.map((lot) => lot.amount)));
  let grossToDate = 0;
  let deductionsToDate = 0;
  let nolcoToDate = 0;
  const nolcoUsed: number[] = [];
  const netTaxableIncome = figures.map((_, index) => {
    grossToDate = round(grossToDate + grossIncome[index]);
    deductionsToDate = round(deductionsToDate + deductions[index]);
    const before = round(grossToDate - deductionsToDate - nolcoToDate);
    const applied = nolcoLeft > 0 ? round(Math.min(nolcoLeft, Math.max(0, before))) : 0;
    nolcoLeft = round(nolcoLeft - applied);
    nolcoToDate = round(nolcoToDate + applied);
    nolcoUsed.push(applied);
    return round(Math.max(0, round(grossToDate - deductionsToDate - nolcoToDate)));
  });

  const annualNti = netTaxableIncome[netTaxableIncome.length - 1] ?? 0;
  const smallCorporation =
    annualNti <= rates.smallCorporateNtiCeiling && profile.assetsExcludingLand <= rates.smallCorporateAssetCeiling;
  const rate =
    profile.regime === "SCIT"
      ? rates.scit
      : profile.regime === "INCOME_TAX_HOLIDAY"
        ? 0
        : smallCorporation
          ? rates.smallCorporate
          : rates.corporate;

  const mcitApplies = profile.taxableYearOfOperations >= rates.mcitStartYear && profile.regime === "REGULAR";
  const taxDue: number[] = [];
  const payable: number[] = [];
  /** Cumulative regular tax, cumulative MCIT and which of the two line 10 carried, per quarter. */
  const regularDue: number[] = [];
  const mcitDue: number[] = [];
  const arbitrage: TaxArbitrage[] = [];
  let cumulativeGross = 0;
  let cumulativeCredits = profile.priorYearExcessCredit;
  let paidEarlier = 0;

  figures.forEach((_, index) => {
    // MCIT is charged on gross income: sales net of returns and discounts, less cost of sales.
    cumulativeGross += grossIncome[index];
    cumulativeCredits += creditsPerQuarter[index];

    // SCIT is 5% of gross income by definition, not of net taxable income.
    const regular = round(profile.regime === "SCIT" ? cumulativeGross * rates.scit : netTaxableIncome[index] * rate);
    const mcit = mcitApplies ? round(cumulativeGross * rates.mcit) : 0;
    const due = Math.max(regular, mcit);
    // Excess MCIT from earlier years is usable only when regular tax exceeds MCIT, and only
    // up to that difference; beyond it the credit stays unused.
    const mcitCredit = regular > mcit ? round(Math.min(round(sum(carryovers.mcit.map((lot) => lot.amount))), regular - mcit)) : 0;
    const recorded = carryovers.actualPaid[index];
    const quarterPayable = Math.max(0, round(due - cumulativeCredits - mcitCredit - paidEarlier));

    taxDue.push(due);
    payable.push(quarterPayable);
    regularDue.push(regular);
    mcitDue.push(mcit);
    // Deck item 8: the return carries the higher of the two, quarter by quarter, not the year's.
    arbitrage.push(mcit > regular ? "MCIT" : "REGULAR");
    // A recorded 1702Q payment replaces the computed one for every later quarter.
    paidEarlier = round(paidEarlier + (recorded ?? quarterPayable));
  });

  const annualGross = round(sum(grossIncome));
  const annualDeductions = round(sum(deductions));
  const annualRegular = round(profile.regime === "SCIT" ? annualGross * rates.scit : annualNti * rate);
  const annualMcit = mcitApplies ? round(annualGross * rates.mcit) : 0;
  const annualDue = Math.max(annualRegular, annualMcit);
  const annualCredits = round(sum(creditsPerQuarter) + profile.priorYearExcessCredit);
  const annualMcitCredit =
    annualRegular > annualMcit
      ? round(Math.min(round(sum(carryovers.mcit.map((lot) => lot.amount))), annualRegular - annualMcit))
      : 0;

  return {
    basis,
    label: BASIS_LABELS[basis],
    grossIncome,
    deductions,
    nolcoUsed,
    netTaxableIncome,
    taxDue,
    payable,
    regular: regularDue,
    mcit: mcitDue,
    arbitrage,
    annual: {
      grossIncome: annualGross,
      deductions: annualDeductions,
      netTaxableIncome: annualNti,
      regular: annualRegular,
      mcit: annualMcit,
      taxDue: annualDue,
      netPosition: round(annualDue - annualCredits - annualMcitCredit),
    },
    mcitApplied: annualMcit > annualRegular,
    mcitApplicable: mcitApplies,
    // Shown even while the MCIT is dormant: the 2% the company would owe once it enters its
    // fourth year, so the reader can see what the gate is holding back.
    mcitOnGross: round(annualGross * rates.mcit),
    smallCorporation,
    rate,
  };
}

export const NO_CARRYOVERS: CarryoverInput = { nolco: [], mcit: [], actualPaid: [null, null, null, null] };

export function computeTax(
  figures: QuarterFigures[],
  profile: EntityProfile,
  rates: TaxRates = FALLBACK_RATES,
  carryovers: CarryoverInput = NO_CARRYOVERS,
): TaxComputation {
  const notices: string[] = [];
  const creditsPerQuarter = figures.map((quarter) => quarter.cwt);
  const mcitApplies = profile.taxableYearOfOperations >= rates.mcitStartYear && profile.regime === "REGULAR";

  // The ledger reading leads: cost of goods sold and cost of services are booked accounts, so
  // they are the accrual answer the deck asks for. It disappears when the ledger carries none,
  // because a zero-cost reading would inflate gross income and the MCIT base built on it.
  const ledgerCost = round(sum(figures.map((quarter) => quarter.cogsLedger)));
  const scenarios = [
    ...(ledgerCost > 0 ? [scenarioFor(figures, profile, rates, "LEDGER", creditsPerQuarter, carryovers)] : []),
    scenarioFor(figures, profile, rates, "PRODUCT_COST", creditsPerQuarter, carryovers),
    scenarioFor(figures, profile, rates, "PURCHASES", creditsPerQuarter, carryovers),
  ];

  // When the itemized sales view cannot be read, the product-cost basis silently costs
  // nothing and gross income jumps by the whole cost of sales. Fall back to the
  // purchase-order basis instead of printing a tax due built on a zero cost.
  const productCost = round(sum(figures.map((quarter) => quarter.cogsProductCost)));
  const purchaseCost = round(sum(figures.map((quarter) => quarter.purchases)));
  const basisMissing = ledgerCost === 0 && productCost === 0 && purchaseCost > 0;
  // The first scenario is the headline everywhere the payload is read, so it is the one the
  // tax due was built from.
  const ordered = basisMissing ? [scenarios[scenarios.length - 1], ...scenarios.slice(0, -1)] : scenarios;
  const primary = ordered[0];
  if (basisMissing) {
    notices.push(
      `Neither the ledger nor the product standard cost carries a cost of sales, so the headline basis is purchase orders (₱${purchaseCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}). ` +
        "Tax due on a zero-cost reading would have been higher by the difference shown in the scenarios.",
    );
  }

  const nolcoApplied = round(sum(primary.nolcoUsed));
  if (nolcoApplied > 0) {
    notices.push(
      `NOLCO of ₱${nolcoApplied.toLocaleString("en-PH", { minimumFractionDigits: 2 })} applied from ${carryovers.nolco.length} lot(s), oldest year first.`,
    );
  }
  const recordedQuarters = carryovers.actualPaid.filter((value) => value !== null).length;
  if (recordedQuarters > 0) {
    notices.push(
      `${recordedQuarters} quarter(s) subtract the recorded 1702Q payment instead of the computed amount.`,
    );
  }

  if (!mcitApplies && profile.regime === "REGULAR") {
    notices.push(
      `MCIT applies from the corporation's ${rates.mcitStartYear}th taxable year; this is year ` +
        `${profile.taxableYearOfOperations}, so line 10 carries the regular tax only.`,
    );
  }
  if (profile.regime === "SCIT") {
    notices.push("SCIT applies 5% to gross income; deductions are shown for completeness only.");
  }
  if (profile.regime === "INCOME_TAX_HOLIDAY") {
    notices.push("Income tax holiday: 0% income tax. Still file 1702Q with the holiday figures.");
  }
  if (!profile.vatRegistered) {
    notices.push(`Not VAT-registered: 2551Q percentage tax at ${(rates.percentage * 100).toFixed(0)}% applies instead of 2550Q.`);
  }
  if (rates.source === "DATABASE" && rates.missing.length > 0) {
    notices.push(
      `tax_rates supplied ${rates.missing.length === 8 ? "no" : "some"} of the eight rates; ${rates.missing.join(", ")} fall back to the built-in defaults.`,
    );
  }
  if (rates.source === "DEFAULTS") {
    notices.push("No tax_rates row answered on this instance, so every rate is the built-in default.");
  }

  return {
    grossIncome: primary.grossIncome,
    deductions: primary.deductions,
    osdAmount: figures.map((quarter, index) =>
      profile.deductionMethod === "OSD" ? round(primary.grossIncome[index] * rates.osd) : 0,
    ),
    nolcoUsed: primary.nolcoUsed,
    netTaxableIncome: primary.netTaxableIncome,
    taxDue: primary.taxDue,
    taxCredits: figures.map((_, index) => round(profile.priorYearExcessCredit + sum(creditsPerQuarter.slice(0, index + 1)))),
    payable: primary.payable,
    annual: {
      grossIncome: primary.annual.grossIncome,
      deductions: primary.annual.deductions,
      netTaxableIncome: primary.annual.netTaxableIncome,
      taxDue: primary.annual.taxDue,
      taxCredits: round(sum(creditsPerQuarter) + profile.priorYearExcessCredit),
      netPosition: primary.annual.netPosition,
    },
    regimeApplied: profile.regime,
    rateApplied: primary.rate,
    smallCorporation: primary.smallCorporation,
    mcitApplied: primary.mcitApplied,
    notices,
    scenarios: ordered,
    rates,
  };
}

export function computeVat(
  figures: QuarterFigures[],
  profile: EntityProfile,
  rates: TaxRates = FALLBACK_RATES,
): VatComputation {
  const outputVat = figures.map((quarter) => round(quarter.salesVat));
  const inputVat = figures.map((quarter) => round(quarter.purchasesVat));

  if (!profile.vatRegistered) {
    const percentage = figures.map((quarter) => round((quarter.sales + quarter.icSales) * rates.percentage));
    return {
      outputVat: figures.map(() => 0),
      inputVat: figures.map(() => 0),
      netVat: figures.map(() => 0),
      payable: percentage,
      carriedIn: figures.map(() => 0),
    };
  }

  const netVat = outputVat.map((output, index) => round(output - inputVat[index]));
  const carriedIn: number[] = [];
  const payable: number[] = [];
  let carry = 0;

  netVat.forEach((net) => {
    carriedIn.push(round(carry));
    const settled = round(net - carry);
    payable.push(Math.max(0, settled));
    carry = settled < 0 ? round(-settled) : 0;
  });

  return { outputVat, inputVat, netVat, payable, carriedIn };
}

/** Builds the worksheet rows exactly as the document numbers them. */
export function buildLines(
  figures: QuarterFigures[],
  computation: TaxComputation,
  profile: EntityProfile,
): WorksheetLine[] {
  const column = (pick: (quarter: QuarterFigures, index: number) => number) =>
    figures.map((quarter, index) => round(pick(quarter, index)));

  /**
   * Deck item 7: 1702Q is a cumulative return, so every line down to 11a reads year to date and
   * a quarter's line 1 sits over the same income as its line 10. Line 12 stays the movement —
   * the amount that quarter's return pays — because paying on a running total would pay the
   * year twice.
   */
  const cumulative = (values: number[]): number[] => {
    let running = 0;
    return values.map((value) => (running = round(running + value)));
  };

  const sales = column((quarter) => quarter.sales);
  const icSales = column((quarter) => quarter.icSales);
  const returnsAndDiscounts = column((quarter) => quarter.returns + quarter.discounts);
  const icPurchases = column((quarter) => quarter.icPurchases);
  const expenses = column((quarter) => quarter.expenses);

  // Line 5 was built from one of the three bases. Print that one and only that one: a second
  // cost-of-sales row would show a deduction line 5 never subtracted.
  const basis = computation.scenarios[0]?.basis ?? "LEDGER";
  const costOfSales = column((quarter) => {
    if (basis === "LEDGER") return quarter.cogsLedger;
    if (basis === "PRODUCT_COST") return quarter.cogsProductCost;
    return quarter.purchases;
  });

  const COST_HINTS: Record<CostBasis, string> = {
    LEDGER: "Cost of goods sold and cost of services accounts, by the quarter they were booked",
    PRODUCT_COST: "Quantity sold × products.cost_per_unit, the basis line 5 used",
    PURCHASES: "Purchase orders less their VAT, the basis line 5 used because no cost is booked to the ledger",
  };

  const line = (
    lineNo: string,
    label: string,
    values: number[],
    section: WorksheetLine["section"],
    hint?: string,
    emphasis?: boolean,
    /**
     * Cumulative rows (1702Q is year-to-date) must not be added up: the year figure is the
     * Q4 value, not the sum of four running totals.
     */
    yearMode: "SUM" | "LAST" = "SUM",
  ): WorksheetLine => ({
    key: lineNo,
    lineNo,
    label,
    hint,
    section,
    source: emphasis ? "COMPUTED" : "DERIVED",
    values,
    yearValue: round(yearMode === "LAST" ? (values[values.length - 1] ?? 0) : sum(values)),
    emphasis,
  });

  const primary = computation.scenarios[0];
  const winners = primary?.arbitrage ?? [];
  const winnerText = winners.length
    ? winners.map((winner, index) => `Q${index + 1} ${winner === "MCIT" ? "MCIT" : "regular"}`).join(", ")
    : "regular tax";
  const yearToDate = " · year to date";

  const lines: WorksheetLine[] = [
    line("1", "Sales / receipts from outside customers", cumulative(sales), "INCOME", `VAT-exclusive; group sales excluded${yearToDate}`, false, "LAST"),
    line("1a", "Sales to group companies", cumulative(icSales), "INCOME", `Matched from the intercompany ledger${yearToDate}`, false, "LAST"),
    line("2", "Less: returns, allowances, discounts", cumulative(returnsAndDiscounts), "INCOME", yearToDate.trim(), false, "LAST"),
    line(
      "3",
      basis === "PURCHASES" ? "Less: cost of sales, purchase orders" : "Less: cost of sales",
      cumulative(costOfSales),
      "INCOME",
      `${COST_HINTS[basis]}${yearToDate}`,
      false,
      "LAST",
    ),
    line("3a", "Less: cost of sales from group companies", cumulative(icPurchases), "INCOME", yearToDate.trim(), false, "LAST"),
    line("4", "Other taxable income", figures.map(() => 0), "INCOME", "No source table − reported as zero"),
    line(
      "5",
      "Gross income, year to date",
      cumulative(computation.grossIncome),
      "INCOME",
      "Line 1 + 1a, less line 2, 3 and 3a, cumulatively",
      true,
      "LAST",
    ),
    line("6", "Operating expenses from outside parties", cumulative(expenses), "DEDUCTIONS", `Cost of sales is on line 3, not here${yearToDate}`, false, "LAST"),
    line("6b", "Less: non-deductible expenses in line 6", figures.map(() => 0), "DEDUCTIONS", "No source table"),
  ];

  if (profile.deductionMethod === "OSD") {
    lines.push(
      line("6c", "Optional standard deduction (40%)", cumulative(computation.osdAmount), "DEDUCTIONS", undefined, true, "LAST"),
    );
  }

  // Line 12 subtracts credits and earlier payments the engine nets above (taxEngine.ts:134,
  // :139). Print them on the same year-to-date basis as line 10 so the three rows foot.
  const creditsToDate = computation.taxCredits;
  const paidToDate = computation.taxDue.map((due, index) =>
    round(due - computation.payable[index] - creditsToDate[index]),
  );

  lines.push(
    line("8", "Less: NOLCO applied", cumulative(computation.nolcoUsed), "DEDUCTIONS", "Carryover lots live on the overview", false, "LAST"),
    line("9", "Net taxable income, year to date", computation.netTaxableIncome, "DEDUCTIONS", undefined, true, "LAST"),
    line(
      "10",
      "Income tax due, year to date",
      computation.taxDue,
      "TAX",
      `Higher of the regular tax and MCIT each quarter (${winnerText})`,
      false,
      "LAST",
    ),
    line(
      "10a",
      "Minimum corporate income tax, year to date",
      primary?.mcit ?? figures.map(() => 0),
      "TAX",
      `2% of the gross income on line 5; line 10 carries it only where it beats the regular tax (${winnerText})`,
      false,
      "LAST",
    ),
    line(
      "11",
      "Less: tax credits, year to date",
      creditsToDate,
      "TAX",
      "Prior-year excess credit plus tax withheld by outside customers through this quarter",
      false,
      "LAST",
    ),
    line(
      "11a",
      "Less: prior quarters' payments and excess MCIT",
      paidToDate,
      "TAX",
      "Whichever is left of what line 12 subtracts; negative means the credits exceed the tax due so far",
      false,
      "LAST",
    ),
    line("12", "Tax payable on this return", computation.payable, "TAX", "Line 10 less lines 11 and 11a; this quarter's remittance, so the year is their sum"),
  );

  return lines;
}

export function percentageTaxDue(figures: QuarterFigures[], rate: number = PERCENTAGE_TAX_RATE): number {
  return round(sum(figures.map((quarter) => (quarter.sales + quarter.icSales) * rate)));
}

export const RATES = { VAT_RATE, CORPORATE_RATE, MCIT_RATE, OSD_RATE };



