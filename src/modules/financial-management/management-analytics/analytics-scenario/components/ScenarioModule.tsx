"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  BoardHeader,
  Callout,
  LiveBadge,
  MicroLabel,
  Panel,
  PanelHead,
  SampleBadge,
  Stat,
} from "./BoardKit";
import {
  CURRENCY_PARAM,
  FX_PHP_PER_USD,
  PERIOD_PARAM,
  isPeriod,
  recentPeriods,
  type CurrencyCode,
} from "./analytics-screens";
import { useErpEndpoint } from "./useErpEndpoint";
import { useScenario } from "../hooks/useScenario";
import { Notice } from "./Notice";

interface FinancialSummaryPayload {
  sample?: boolean;
  companyCode?: string;
  companyName?: string;
  period?: string;
  monthly?: {
    netRevenue?: number;
    contributionMarginPct?: number;
    operatingExpenses?: number;
    ebitda?: number;
  };
  workingCapitalAndCash?: {
    cashAndEquivalents?: number;
    cashConversionCycleDays?: number;
    daysCashOnHand?: number;
  };
  scenarioAssumptions?: {
    annualBudgetRevenue?: number;
    budgetContributionMarginPct?: number;
    budgetEbitdaMarginPct?: number;
    importedVariableCostShare?: number;
    usdRevenueShare?: number;
    assumptionVersion?: string;
  };
}

interface FxRatesPayload {
  sample?: boolean;
  source?: string;
  annualBudgetRate?: number;
  rates?: Array<{ period: string; monthlyAverage: number; monthEndClose: number }>;
}

const MONEY = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Levers {
  revPct: number;
  marginPp: number;
  fixedPct: number;
  cccDays: number;
  fxPct: number;
}

const DEFAULT_LEVERS: Levers = { revPct: 0, marginPp: 0, fixedPct: 0, cccDays: 0, fxPct: 0 };

const PRESETS: Array<{ label: string; levers: Levers }> = [
  { label: "Base Run-Rate", levers: DEFAULT_LEVERS },
  { label: "Margin −2 pp", levers: { ...DEFAULT_LEVERS, marginPp: -2 } },
  { label: "Peso Weakens 5%", levers: { ...DEFAULT_LEVERS, fxPct: 5 } },
  { label: "Volume −10%", levers: { ...DEFAULT_LEVERS, revPct: -10 } },
  { label: "Collections +15d", levers: { ...DEFAULT_LEVERS, cccDays: 15 } },
  { label: "Fixed Cost −5%", levers: { ...DEFAULT_LEVERS, fixedPct: -5 } },
];

export function ScenarioModule() {
  const searchParams = useSearchParams();
  const currency: CurrencyCode = searchParams.get(CURRENCY_PARAM) === "USD" ? "USD" : "PHP";
  const periodParam = searchParams.get(PERIOD_PARAM);
  const period = isPeriod(periodParam) ? periodParam : recentPeriods(1)[0];

  const scenario = useScenario();
  const fin = useErpEndpoint<FinancialSummaryPayload>("financial-summary", { period });
  const fx = useErpEndpoint<FxRatesPayload>("fx-rates", { from: period, to: period, base: "PHP", quote: "USD" });

  const [levers, setLevers] = React.useState<Levers>(DEFAULT_LEVERS);

  const fxRate = fx.data?.rates?.[0]?.monthlyAverage ?? fx.data?.annualBudgetRate ?? FX_PHP_PER_USD;
  const scale = currency === "USD" ? 1 / fxRate : 1;
  const symbol = currency === "USD" ? "$" : "₱";

  const baselines = React.useMemo(() => scenario.data?.companies ?? [], [scenario.data]);
  const men2 = baselines[0] ?? null;

  const fmtM = (phpM: number | null) => {
    if (phpM === null || !Number.isFinite(phpM)) return "—";
    const v = phpM * scale;
    return `${v < 0 ? "−" : ""}${symbol}${MONEY.format(Math.abs(v))}M`;
  };

  const hasFinancialModel = fin.available && Boolean(fin.data?.scenarioAssumptions?.annualBudgetRevenue);

  const model = React.useMemo(() => {
    if (!hasFinancialModel || !fin.data) return null;
    const a = fin.data.scenarioAssumptions!;
    const revBase = (a.annualBudgetRevenue ?? 0) / 1_000_000;
    const cmBudget = a.budgetContributionMarginPct ?? 18;
    const cmRun = fin.data.monthly?.contributionMarginPct ?? cmBudget;
    const ebitdaBudgetPct = a.budgetEbitdaMarginPct ?? 7;
    const fixedBase = revBase * Math.max(0.01, (cmBudget - ebitdaBudgetPct) / 100);
    const cccRun = fin.data.workingCapitalAndCash?.cashConversionCycleDays ?? 60;
    const importedShare = a.importedVariableCostShare ?? 0.5;
    const usdRevShare = a.usdRevenueShare ?? 0;

    const runEbitda = revBase * (cmRun / 100) - fixedBase;
    const runMargin = revBase > 0 ? (runEbitda / revBase) * 100 : 0;
    const runWc = (revBase * cccRun) / 365;
    const runCashCost = Math.max(1, revBase - runEbitda);
    const runDaysCash = fin.data.workingCapitalAndCash?.daysCashOnHand ?? 90;
    const runCash = (runCashCost / 365) * runDaysCash;

    const evaluate = (l: Levers) => {
      const fxFactor = l.fxPct / 100;
      const rev = revBase * (1 + l.revPct / 100) * (1 + usdRevShare * fxFactor);
      const varCostRatio = (1 - (cmRun + l.marginPp) / 100) * (1 + importedShare * fxFactor);
      const cmAmt = rev * (1 - varCostRatio);
      const fixed = fixedBase * (1 + l.fixedPct / 100);
      const ebitda = cmAmt - fixed;
      const margin = rev > 0 ? (ebitda / rev) * 100 : 0;
      const ccc = Math.max(0, cccRun + l.cccDays);
      const wc = (rev * ccc) / 365;
      const deltaEbitda = ebitda - runEbitda;
      const deltaWc = wc - runWc;
      const cash = runCash + deltaEbitda * 0.75 - deltaWc;
      const scenCashCost = Math.max(1, rev - ebitda);
      const daysCash = cash / (scenCashCost / 365);
      return { rev, ebitda, margin, wc, daysCash, deltaEbitda, deltaWc };
    };

    const current = evaluate(levers);
    const revImpact = evaluate({ ...DEFAULT_LEVERS, revPct: levers.revPct }).deltaEbitda;
    const marginImpact = evaluate({ ...DEFAULT_LEVERS, marginPp: levers.marginPp }).deltaEbitda;
    const fixedImpact = evaluate({ ...DEFAULT_LEVERS, fixedPct: levers.fixedPct }).deltaEbitda;
    const fxImpact = evaluate({ ...DEFAULT_LEVERS, fxPct: levers.fxPct }).deltaEbitda;

    const shocks = [
      { label: "Revenue +5%", delta: evaluate({ ...levers, revPct: levers.revPct + 5 }).ebitda - current.ebitda },
      { label: "Contribution Margin −1 pp", delta: evaluate({ ...levers, marginPp: levers.marginPp - 1 }).ebitda - current.ebitda },
      { label: "Fixed Costs +5%", delta: evaluate({ ...levers, fixedPct: levers.fixedPct + 5 }).ebitda - current.ebitda },
      { label: "Peso Weakens +5%", delta: evaluate({ ...levers, fxPct: levers.fxPct + 5 }).ebitda - current.ebitda },
    ].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

    return {
      revBase,
      runEbitda,
      runMargin,
      runWc,
      runDaysCash,
      current,
      bridge: [
        { label: "Volume / Revenue", delta: revImpact },
        { label: "Margin Shift", delta: marginImpact },
        { label: "Fixed Cost Change", delta: fixedImpact },
        { label: "FX Pass-Through", delta: fxImpact },
      ].filter((b) => Math.abs(b.delta) >= 0.05),
      shocks,
      version: a.assumptionVersion ?? "FY2026",
    };
  }, [hasFinancialModel, fin.data, levers]);

  if (scenario.error) {
    return (
      <Notice tone="danger" title="The planner could not be read">
        {scenario.error}
      </Notice>
    );
  }

  const isDirty = Object.values(levers).some((v) => v !== 0);

  return (
    <div className="space-y-5">
      <BoardHeader
        eyebrow="Management Analytics · What-If Modeling"
        title={`Scenario Planner · ${fin.data?.companyName ?? men2?.name ?? "MEN2 Distribution"}`}
        subtitle="Stress-test Revenue, Contribution Margin, Fixed Costs, Cash Conversion Cycle, and USD/PHP against EBITDA and Days Cash."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {fin.sample ? <SampleBadge label="Sample financial baseline · BCK_DUMMY" /> : hasFinancialModel ? <LiveBadge /> : null}
            <span className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
              {currency === "USD" ? `USD @ ₱${fxRate.toFixed(2)}` : `PHP · ${period}`}
            </span>
          </div>
        }
      />

      {!hasFinancialModel && !fin.loading ? (
        <>
          <Callout tone="warning" title="Waiting on Financial Baseline Endpoints from ERP_SERVER">
            <code className="font-mono text-[11px]">GET /api/management-analytics/financial-summary</code> is not yet
            available on this server. Revenue, Contribution Margin, and Cash Conversion Cycle remain disabled rather
            than invented.{" "}
            <Link href="/fm/management-analytics/analytics-data" className="font-medium underline">
              Inspect live ERP metrics in Data Life Cycle →
            </Link>
          </Callout>
          {men2 ? (
            <Panel>
              <PanelHead title={`${men2.name} · Available Inputs`} description="Only verified ERP figures shown." />
              <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
                <Stat label="Annual Opex Run-rate" value={fmtM(men2.fixed)} note={men2.kpiBasis} />
                <Stat label="Annual Revenue" value="—" note="Awaiting ERP endpoint" />
                <Stat label="Contribution Margin" value="—" note="Awaiting ERP endpoint" />
                <Stat label="Cash Conversion Cycle" value="—" note="Awaiting ERP endpoint" />
              </div>
            </Panel>
          ) : null}
        </>
      ) : fin.loading || !model ? (
        <Panel className="p-8 text-center text-sm text-muted-foreground">Loading financial baseline…</Panel>
      ) : (
        <>
          {fin.sample ? (
            <Callout tone="warning" title="Running on ERP Test-Server Sample Baseline (sample: true)">
              Financial summary figures below come from <code className="font-mono text-[11px]">BCK_DUMMY</code> sample
              responses so you can test the Scenario Workbench layout. Live ERP COGS and inventory valuation are still
              pending.
            </Callout>
          ) : null}

          {/* Preset Shock Strip */}
          <div className="flex flex-wrap items-center gap-1.5">
            <MicroLabel className="mr-1">Presets</MicroLabel>
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setLevers(p.levers)}
              >
                {p.label}
              </Button>
            ))}
            {isDirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-8 text-xs text-muted-foreground"
                onClick={() => setLevers(DEFAULT_LEVERS)}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Reset levers
              </Button>
            ) : null}
          </div>

          {/* 5 Executive Outcome Tiles */}
          <Panel className="grid grid-cols-2 divide-y divide-border/60 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
            <div className="p-4">
              <Stat
                label="Scenario Revenue"
                value={fmtM(model.current.rev)}
                note={`Run-rate ${fmtM(model.revBase)}`}
              />
            </div>
            <div className="p-4">
              <Stat
                label="Scenario EBITDA"
                value={fmtM(model.current.ebitda)}
                tone={model.current.deltaEbitda >= 0 ? "success" : "danger"}
                note={`${model.current.deltaEbitda >= 0 ? "+" : ""}${fmtM(model.current.deltaEbitda)} vs run-rate`}
              />
            </div>
            <div className="p-4">
              <Stat
                label="EBITDA Margin"
                value={`${PCT.format(model.current.margin)}%`}
                tone={model.current.margin >= model.runMargin ? "success" : "warning"}
                note={`Run-rate ${PCT.format(model.runMargin)}%`}
              />
            </div>
            <div className="p-4">
              <Stat
                label="Working Capital"
                value={fmtM(model.current.wc)}
                tone={model.current.deltaWc <= 0 ? "success" : "warning"}
                note={`${model.current.deltaWc >= 0 ? "+" : ""}${fmtM(model.current.deltaWc)} tied up`}
              />
            </div>
            <div className="col-span-2 p-4 lg:col-span-1">
              <Stat
                label="Days Cash on Hand"
                value={`${Math.round(model.current.daysCash)}d`}
                tone={model.current.daysCash >= 75 ? "success" : model.current.daysCash >= 45 ? "warning" : "danger"}
                note={`Run-rate ${Math.round(model.runDaysCash)}d`}
              />
            </div>
          </Panel>

          {/* 2-Column Workbench: Sliders + Bridge/Sensitivity */}
          <div className="grid gap-4 lg:grid-cols-12">
            <Panel className="lg:col-span-5">
              <PanelHead
                title="Operating & Macro Levers"
                description={`Assumption set ${model.version} · Annualised linear sensitivity`}
              />
              <div className="space-y-4 p-4">
                {[
                  { key: "revPct" as const, label: "Revenue / Volume", min: -30, max: 30, step: 1, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v}%` },
                  { key: "marginPp" as const, label: "Contribution Margin", min: -10, max: 10, step: 0.5, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)} pp` },
                  { key: "fixedPct" as const, label: "Fixed Operating Costs", min: -20, max: 20, step: 1, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v}%` },
                  { key: "cccDays" as const, label: "Cash Conversion Cycle", min: -30, max: 30, step: 1, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v} days` },
                  { key: "fxPct" as const, label: "USD / PHP Exchange Rate", min: -10, max: 10, step: 0.5, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` },
                ].map((ctrl) => {
                  const val = levers[ctrl.key];
                  return (
                    <div key={ctrl.key} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("font-medium", val !== 0 && "text-teal-700 dark:text-teal-400")}>
                          {ctrl.label}
                        </span>
                        <span className="font-mono font-semibold tabular-nums">{ctrl.fmt(val)}</span>
                      </div>
                      <input
                        type="range"
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={val}
                        onChange={(e) => setLevers((prev) => ({ ...prev, [ctrl.key]: Number(e.target.value) }))}
                        className="w-full accent-teal-700"
                      />
                    </div>
                  );
                })}
              </div>
            </Panel>

            <div className="space-y-4 lg:col-span-7">
              {/* EBITDA Bridge Waterfall */}
              <Panel>
                <PanelHead
                  title="EBITDA Bridge Waterfall"
                  description="Impact of each active lever from run-rate EBITDA to scenario EBITDA."
                />
                <div className="space-y-2.5 p-4">
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                    <span className="font-semibold">Run-Rate EBITDA</span>
                    <span className="font-mono text-sm font-semibold tabular-nums">{fmtM(model.runEbitda)}</span>
                  </div>
                  {model.bridge.length === 0 ? (
                    <p className="py-3 text-center text-xs text-muted-foreground">
                      Move any lever or pick a preset above to plot EBITDA variance rows.
                    </p>
                  ) : (
                    model.bridge.map((step) => {
                      const pos = step.delta >= 0;
                      const pctWidth = Math.min(100, (Math.abs(step.delta) / Math.max(1, Math.abs(model.runEbitda))) * 100);
                      return (
                        <div key={step.label} className="space-y-1 px-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{step.label}</span>
                            <span
                              className={cn(
                                "font-mono font-semibold tabular-nums",
                                pos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                              )}
                            >
                              {pos ? "+" : ""}
                              {fmtM(step.delta)}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full", pos ? "bg-emerald-500" : "bg-rose-500")}
                              style={{ width: `${Math.max(4, pctWidth)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div className="flex items-center justify-between rounded-lg border border-teal-700/30 bg-teal-700/8 px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">Scenario EBITDA</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {fmtM(model.current.ebitda)}
                    </span>
                  </div>
                </div>
              </Panel>

              {/* Sensitivity Ranking */}
              <Panel>
                <PanelHead
                  title="Top Sensitivity Shocks"
                  description="Incremental EBITDA impact of standard shocks layered on top of current scenario."
                />
                <div className="divide-y divide-border/50 px-4">
                  {model.shocks.map((s) => (
                    <div key={s.label} className="flex items-center justify-between py-2.5 text-xs">
                      <span className="font-medium">{s.label}</span>
                      <span
                        className={cn(
                          "font-mono font-semibold tabular-nums",
                          s.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {s.delta >= 0 ? "+" : ""}
                        {fmtM(s.delta)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/60 bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
                  Model limitations: annualised static run-rate, linear FX pass-through, 25% effective tax approximation,
                  no intra-year cash flow timing.
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
