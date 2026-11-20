import type { BaselineRow, CompanyResult, Levers, ScenarioResult, ScenarioTotals } from "../types";

/** Share of an EBITDA change that reaches cash; the rest is tax. */
export const TAX_RATE = 0.25;
/** Group revenue removed as intercompany sales, ₱M a year, from the specification. */
export const ELIMINATIONS = 599;
/** Holdings charges the group one percent of revenue. */
export const HOLDINGS_CHARGE_PCT = 1;
/** Days of cash cost held, used for the cash run-rate. */
export const CASH_DAYS = 96;

const round = (value: number, dp = 2) => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

const lerp = (base: number, change: number) => base * (1 + change / 100);

export function companyResult(base: BaselineRow, lever: Levers, fxPct: number): CompanyResult {
  const fx = fxPct / 100;
  const revenueLift = 1 + lever.revenuePct / 100;

  // Revenue rises with the volume lever first, then again with the exchange effect on the
  // dollar-priced share. Both compound, which is how the specification writes it.
  const revenueScenario = base.revenue * revenueLift * (1 + base.usdShare * fx);
  const cmPct = base.cmPct + lever.cmPoints;
  const cmAmount = (revenueScenario * cmPct) / 100;

  // Cost of sales is imported in part, so a weaker peso raises cost on the volume-lifted base
  // before the margin lever is applied. The leakage is charged against contribution.
  const costBase = base.revenue * revenueLift * (1 - base.cmPct / 100);
  const leakage = costBase * base.importShare * fx;
  const contribution = cmAmount - leakage;

  const fixedScenario = lerp(base.fixed, lever.fixedPct);
  // The run-rate is the untouched baseline: no lever, no exchange effect, no imported-cost
  // leakage. Using the scenario contribution on both sides would hide the very movement the
  // planner exists to show.
  const ebitda = (base.revenue * base.cmPct) / 100 - base.fixed;
  const ebitdaScenario = contribution - fixedScenario;

  const cccScenario = base.cccDays + lever.cccDays;
  const workingCapital = (base.revenue * base.cccDays) / 365;
  const workingCapitalScenario = (revenueScenario * cccScenario) / 365;
  const workingCapitalDelta = workingCapitalScenario - workingCapital;

  return {
    code: base.code,
    name: base.name,
    kind: base.kind,
    revenue: base.revenue,
    revenueScenario,
    cmPct,
    cmAmount: contribution,
    fixed: base.fixed,
    fixedScenario,
    ebitda,
    ebitdaScenario,
    ebitdaDelta: ebitdaScenario - ebitda,
    cccDays: base.cccDays,
    cccScenario,
    workingCapital,
    workingCapitalScenario,
    workingCapitalDelta,
    cashEffect: (ebitdaScenario - ebitda) * (1 - TAX_RATE) - workingCapitalDelta,
  };
}

export function computeScenario(
  baselines: BaselineRow[],
  levers: Levers[],
  fxPct: number,
): ScenarioResult {
  const leverOf = new Map(levers.map((lever) => [lever.code, lever]));
  const operating = baselines.filter((row) => row.kind === "OPERATING");
  const holdings = baselines.filter((row) => row.kind === "HOLDINGS");
  const leverFor = (code: string): Levers =>
    leverOf.get(code) ?? { code, revenuePct: 0, cmPoints: 0, fixedPct: 0, cccDays: 0 };

  const results = operating.map((base) => companyResult(base, leverFor(base.code), fxPct));
  const holdingsResults = holdings.map((base) => companyResult(base, leverFor(base.code), fxPct));

  const sum = (rows: CompanyResult[], pick: (row: CompanyResult) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  const revenue = sum(results, (row) => row.revenue);
  const revenueScenarioRaw = sum(results, (row) => row.revenueScenario);
  // Holdings is not added to the sum: its income is the fee charged below. Adding both would
  // count the same money twice.
  const ebitdaRaw = sum(results, (row) => row.ebitda);
  const ebitdaScenarioRaw = sum(results, (row) => row.ebitdaScenario);

  // Holdings charges the group a fee on revenue, so it enters on both sides of the comparison.
  const holdingsCostRun = ((revenue - ELIMINATIONS) * HOLDINGS_CHARGE_PCT) / 100;
  const holdingsCost = ((revenueScenarioRaw - ELIMINATIONS) * HOLDINGS_CHARGE_PCT) / 100;

  const ebitda = ebitdaRaw - holdingsCostRun;
  const ebitdaScenario = ebitdaScenarioRaw - holdingsCost;
  const workingCapitalDelta = sum(results, (row) => row.workingCapitalDelta);
  const cashCost = sum(results, (row) => row.fixed) + sum(holdingsResults, (row) => row.fixed);
  const cashRunRate = (CASH_DAYS / 365) * cashCost;
  const ebitdaDelta = ebitdaScenario - ebitda;

  const totals: ScenarioTotals = {
    revenue: round(revenue - ELIMINATIONS),
    revenueScenario: round(revenueScenarioRaw - ELIMINATIONS),
    ebitda: round(ebitda),
    ebitdaScenario: round(ebitdaScenario),
    ebitdaDelta: round(ebitdaDelta),
    ebitdaMargin: round(revenueScenarioRaw > 0 ? (ebitdaScenario / (revenueScenarioRaw - ELIMINATIONS)) * 100 : 0),
    workingCapitalDelta: round(workingCapitalDelta),
    cashEffect: round(ebitdaDelta * (1 - TAX_RATE) - workingCapitalDelta),
    cashRunRate: round(cashRunRate),
    cashScenario: round(cashRunRate + ebitdaDelta * (1 - TAX_RATE) - workingCapitalDelta),
  };

  const notes: string[] = [];
  if (Math.abs(fxPct) > 0) {
    const leakage = results.reduce((total, row) => {
      const base = baselines.find((item) => item.code === row.code);
      if (!base) return total;
      return total + base.revenue * (1 + (leverOf.get(row.code)?.revenuePct ?? 0) / 100) * (1 - base.cmPct / 100) * base.importShare * (fxPct / 100);
    }, 0);
    notes.push(
      `A ${fxPct > 0 ? "rise" : "fall"} of ${Math.abs(fxPct)}% in the dollar ${leakage >= 0 ? "adds" : "removes"} ₱${round(
        Math.abs(leakage),
      )}M of import cost ${leakage >= 0 ? "against" : "from"} contribution, on top of the revenue it moves.`,
    );
  }
  if (ELIMINATIONS > 0) {
    notes.push(`Group revenue is shown net of ₱${ELIMINATIONS}M intercompany sales, and Holdings charges ${HOLDINGS_CHARGE_PCT}% of it.`);
  }
  if (Math.abs(workingCapitalDelta) > 0.005) {
    notes.push(`Working capital ${workingCapitalDelta > 0 ? "absorbs" : "releases"} ₱${round(Math.abs(workingCapitalDelta))}M, which is why cash and EBITDA do not move by the same amount.`);
  }

  return {
    fxPct,
    eliminations: ELIMINATIONS,
    holdingsCost: round(holdingsCost),
    companies: results,
    totals,
    notes,
  };
}

/** Zero levers must reproduce the run-rate exactly; the probe relies on this. */
export function zeroLevers(baselines: BaselineRow[]): Levers[] {
  return baselines.map((row) => ({ code: row.code, revenuePct: 0, cmPoints: 0, fixedPct: 0, cccDays: 0 }));
}
