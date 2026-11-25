"use client";

import * as React from "react";
import { Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BoardHeader, MicroLabel, Panel, PanelHead, Stat } from "@/modules/financial-management/management-analytics/shared/BoardKit";
import { useScenario } from "../hooks/useScenario";
import { CASH_DAYS, computeScenario } from "../services/model";
import { Notice } from "./Notice";
import { RemoveScenarioDialog } from "./RemoveScenarioDialog";
import { Tornado, Waterfall } from "./ScenarioCharts";
import { TablePager, pageSlice } from "./TablePager";
import type { CompanyResult, Levers, ScenarioRow } from "../types";

const MONEY = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

const money = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe < 0 ? "−" : ""}₱${MONEY.format(Math.abs(safe))}M`;
};
const signedMoney = (value: number) => `${value > 0 ? "+" : ""}${money(value)}`;
const pct = (value: number) => `${PERCENT.format(Number.isFinite(value) ? value : 0)}%`;

const LEVER_FIELDS: Array<{
  key: keyof Omit<Levers, "code">;
  label: string;
  step: string;
  min: number;
  max: number;
  unit: string;
}> = [
  { key: "revenuePct", label: "Revenue", step: "0.5", min: -30, max: 30, unit: "%" },
  { key: "cmPoints", label: "Margin", step: "0.1", min: -10, max: 10, unit: "pp" },
  { key: "fixedPct", label: "Fixed cost", step: "0.5", min: -20, max: 20, unit: "%" },
  { key: "cccDays", label: "Cash cycle", step: "1", min: -30, max: 30, unit: "days" },
];

const PRESETS: Array<{
  label: string;
  targetMatch?: RegExp;
  field?: keyof Omit<Levers, "code">;
  value?: number;
  fx?: number;
}> = [
  { label: "Construction margin −2 pp", targetMatch: /con/i, field: "cmPoints", value: -2 },
  { label: "Peso weakens 5%", fx: 5 },
  { label: "Distribution volume −10%", targetMatch: /dist/i, field: "revenuePct", value: -10 },
  { label: "Collections slip 15 days", field: "cccDays", value: 15 },
  { label: "Fixed cost program −5%", field: "fixedPct", value: -5 },
];

const marginOf = (row: CompanyResult) => (row.revenueScenario > 0 ? (row.ebitdaScenario / row.revenueScenario) * 100 : 0);

export function ScenarioModule() {
  const scenario = useScenario();
  const [name, setName] = React.useState("");
  const [basePeriod, setBasePeriod] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [note, setNote] = React.useState("");
  const [removing, setRemoving] = React.useState<ScenarioRow | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const baselines = React.useMemo(() => scenario.data?.companies ?? [], [scenario.data]);

  const live = React.useMemo(
    () => (baselines.length > 0 ? computeScenario(baselines, scenario.levers, scenario.fxPct) : null),
    [baselines, scenario.levers, scenario.fxPct],
  );

  const moved =
    scenario.levers.some(
      (lever) => lever.revenuePct !== 0 || lever.cmPoints !== 0 || lever.fixedPct !== 0 || lever.cccDays !== 0,
    ) || scenario.fxPct !== 0;

  const runPreset = (preset: (typeof PRESETS)[number]) => {
    scenario.reset();
    if (preset.fx !== undefined) {
      scenario.setFxPct(preset.fx);
      return;
    }
    if (preset.field && preset.value !== undefined) {
      const targets = preset.targetMatch
        ? scenario.levers.filter((l) => preset.targetMatch!.test(l.code))
        : scenario.levers;
      const list = targets.length > 0 ? targets : scenario.levers;
      for (const lever of list) scenario.setLever(lever.code, preset.field, preset.value);
    }
  };

  const presetActive = (preset: (typeof PRESETS)[number]) => {
    if (preset.fx !== undefined) return scenario.fxPct === preset.fx;
    if (!preset.field || preset.value === undefined) return false;
    const targets = preset.targetMatch
      ? scenario.levers.filter((l) => preset.targetMatch!.test(l.code))
      : scenario.levers;
    const list = targets.length > 0 ? targets : scenario.levers;
    return list.length > 0 && list.every((lever) => lever[preset.field!] === preset.value);
  };

  const totals = live?.totals;
  const runMargin = totals && totals.revenue > 0 ? (totals.ebitda / totals.revenue) * 100 : 0;
  const marginMove = totals ? totals.ebitdaMargin - runMargin : 0;
  const daysCash =
    totals && totals.cashRunRate > 0 ? CASH_DAYS * (totals.cashScenario / totals.cashRunRate) : CASH_DAYS;

  const operating = baselines.filter((row) => row.kind === "OPERATING");
  const revenueWeight = operating.reduce((sum, row) => sum + row.revenue, 0);
  const weighted = (pick: (row: (typeof operating)[number]) => number) =>
    revenueWeight > 0
      ? operating.reduce((sum, row) => sum + pick(row) * row.revenue, 0) / revenueWeight
      : 0;

  // Dual-sided per-company sensitivity shocks (top 10 widest EBITDA swings; Cash cycle excluded).
  const shocks = React.useMemo(() => {
    if (!live || baselines.length === 0) return [];
    const op = baselines.filter((row) => row.kind === "OPERATING");
    const base = live.totals.ebitdaScenario;
    const companyShock = (code: string, field: keyof Omit<Levers, "code">, amount: number) =>
      computeScenario(
        baselines,
        scenario.levers.map((lever) => (lever.code === code ? { ...lever, [field]: lever[field] + amount } : lever)),
        scenario.fxPct,
      ).totals.ebitdaScenario - base;
    const fxShock = (amount: number) =>
      computeScenario(baselines, scenario.levers, scenario.fxPct + amount).totals.ebitdaScenario - base;

    const list: Array<{ label: string; up: number; down: number }> = [];
    for (const co of op) {
      list.push({ label: `${co.name} · revenue ±5%`, up: companyShock(co.code, "revenuePct", 5), down: companyShock(co.code, "revenuePct", -5) });
      list.push({ label: `${co.name} · margin ±1 pp`, up: companyShock(co.code, "cmPoints", 1), down: companyShock(co.code, "cmPoints", -1) });
      list.push({ label: `${co.name} · fixed cost ±5%`, up: companyShock(co.code, "fixedPct", 5), down: companyShock(co.code, "fixedPct", -5) });
    }
    list.push({ label: "USD/PHP ±5%", up: fxShock(5), down: fxShock(-5) });
    return list
      .sort((a, b) => Math.max(Math.abs(b.up), Math.abs(b.down)) - Math.max(Math.abs(a.up), Math.abs(a.down)))
      .slice(0, 10);
  }, [baselines, live, scenario.levers, scenario.fxPct]);

  const submit = async () => {
    if (!name.trim()) return;
    const created = await scenario.save({ name: name.trim(), basePeriod, note: note.trim() || null });
    if (created) {
      setName("");
      setNote("");
    }
  };

  if (scenario.error) {
    return (
      <Notice tone="danger" title="The planner could not be read">
        {scenario.error}
      </Notice>
    );
  }

  const resultsPage = live ? pageSlice(live.companies, page, pageSize) : [];
  const resultsPages = live ? Math.max(1, Math.ceil(live.companies.length / pageSize)) : 1;

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Scenario Planner"
        subtitle="Move the levers to see what the run-rate becomes. Nothing is stored until you name the scenario, and the saved case becomes the one the planner opens with."
        meta={
          <>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {scenario.data?.scenarios.length ?? 0} saved
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              peso move {pct(scenario.fxPct)}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {operating.length} {operating.length === 1 ? "company" : "companies"} modelled
            </span>
          </>
        }
        right={
          <Button
            variant="ghost"
            className="min-h-11 gap-1.5 md:min-h-0"
            onClick={scenario.reset}
            disabled={!moved}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <MicroLabel className="mr-1">Presets</MicroLabel>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={presetActive(preset)}
            onClick={() => runPreset(preset)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs transition-colors",
              presetActive(preset)
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {live && totals ? (
        <Panel className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Revenue"
            value={money(totals.revenueScenario)}
            note={`run rate ${money(totals.revenue)} · ${signedMoney(totals.revenueScenario - totals.revenue)}`}
          />
          <Stat
            label="EBITDA"
            value={money(totals.ebitdaScenario)}
            note={`run rate ${money(totals.ebitda)} · ${signedMoney(totals.ebitdaDelta)}`}
            tone={totals.ebitdaDelta > 0 ? "success" : totals.ebitdaDelta < 0 ? "danger" : undefined}
          />
          <Stat
            label="EBITDA margin"
            value={pct(totals.ebitdaMargin)}
            note={`run rate ${pct(runMargin)} · ${marginMove > 0 ? "+" : ""}${PERCENT.format(marginMove)} pp`}
            tone={marginMove > 0 ? "success" : marginMove < 0 ? "danger" : undefined}
          />
          <Stat
            label="Working capital"
            value={signedMoney(totals.workingCapitalDelta)}
            note={totals.workingCapitalDelta > 0 ? "a rise absorbs cash" : totals.workingCapitalDelta < 0 ? "a fall releases cash" : "unchanged"}
            tone={totals.workingCapitalDelta > 0 ? "danger" : totals.workingCapitalDelta < 0 ? "success" : undefined}
          />
          <Stat
            label="Days cash"
            value={`${PERCENT.format(daysCash)} days`}
            note={`run rate ${CASH_DAYS} days of fixed cost`}
            tone={daysCash > CASH_DAYS ? "success" : daysCash < CASH_DAYS ? "danger" : undefined}
          />
        </Panel>
      ) : null}

      <Panel>
        <PanelHead
          title="Levers"
          description="Each row moves one company against its own run-rate. A blank or zero lever leaves the company untouched."
          count={`${operating.length} ${operating.length === 1 ? "company" : "companies"}`}
          right={
            <div className="flex items-center gap-1.5">
              <Label htmlFor="fx" className="text-xs text-muted-foreground">
                Peso move
              </Label>
              <Input
                id="fx"
                type="number"
                step="0.5"
                inputMode="decimal"
                value={scenario.fxPct}
                onChange={(event) => scenario.setFxPct(Number(event.target.value))}
                className="h-9 w-[92px] text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          }
        />

        {scenario.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the run-rate…
          </div>
        ) : null}

        {live ? (
          <>
            <div className="hidden overflow-x-auto border-t border-border/60 md:block">
              <Table className="min-w-[760px] [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    {LEVER_FIELDS.map((field) => (
                      <TableHead key={field.key} className="text-right">
                        {field.label}
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">{field.unit}</span>
                      </TableHead>
                    ))}
                    <TableHead className="text-right">EBITDA after</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {live.companies.map((row) => {
                    const lever = scenario.levers.find((item) => item.code === row.code);
                    return (
                      <TableRow key={row.code}>
                        <TableCell className="font-medium">
                          <span className="block truncate" title={row.name}>
                            {row.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {money(row.revenue)} revenue · {pct(row.cmPct)} margin · {money(row.fixed)} fixed
                          </span>
                        </TableCell>
                        {LEVER_FIELDS.map((field) => {
                          const currentVal = lever ? lever[field.key] : 0;
                          return (
                            <TableCell key={field.key} className="text-right">
                              <Input
                                type="number"
                                min={field.min}
                                max={field.max}
                                step={field.step}
                                inputMode="decimal"
                                value={currentVal}
                                onChange={(event) => {
                                  const raw = Number(event.target.value);
                                  const clamped = Number.isFinite(raw) ? Math.max(field.min, Math.min(field.max, raw)) : 0;
                                  scenario.setLever(row.code, field.key, clamped);
                                }}
                                className={cn(
                                  "ml-auto h-8 w-[84px] text-right tabular-nums",
                                  currentVal !== 0 && "border-primary font-semibold",
                                )}
                                aria-label={`${row.name} ${field.label}`}
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right tabular-nums">{money(row.ebitdaScenario)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            row.ebitdaDelta > 0 && "text-success",
                            row.ebitdaDelta < 0 && "text-destructive",
                          )}
                        >
                          {signedMoney(row.ebitdaDelta)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 border-t border-border/60 p-4 md:hidden">
              {live.companies.map((row) => {
                const lever = scenario.levers.find((item) => item.code === row.code);
                return (
                  <div key={row.code} className="rounded-lg border border-border/60 bg-card p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium" title={row.name}>
                        {row.name}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-xs tabular-nums",
                          row.ebitdaDelta > 0 && "text-success",
                          row.ebitdaDelta < 0 && "text-destructive",
                        )}
                      >
                        {signedMoney(row.ebitdaDelta)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {LEVER_FIELDS.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <Label htmlFor={`${row.code}-${field.key}`} className="text-[11px] text-muted-foreground">
                            {field.label} ({field.unit})
                          </Label>
                          <Input
                            id={`${row.code}-${field.key}`}
                            type="number"
                            step={field.step}
                            inputMode="decimal"
                            value={lever ? lever[field.key] : 0}
                            onChange={(event) => scenario.setLever(row.code, field.key, Number(event.target.value))}
                            className="h-10 tabular-nums"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/60 px-4 py-3">
              <div>
                <p className="text-xs font-semibold">USD/PHP rate change</p>
                <p className="text-[11.5px] text-muted-foreground">
                  + = peso weakens. Raises export USD revenue and imported variable input costs.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={1}
                  value={scenario.fxPct}
                  onChange={(event) => scenario.setFxPct(Number(event.target.value))}
                  aria-label="USD/PHP rate change slider"
                  className="w-40 accent-primary"
                />
                <span className="w-12 text-right font-mono text-xs font-semibold tabular-nums">
                  {scenario.fxPct > 0 ? "+" : ""}
                  {scenario.fxPct}%
                </span>
              </div>
            </div>

            {scenario.data?.notices.length ? (
              <p className="border-t border-border/60 px-4 py-3 text-xs leading-5 text-muted-foreground">
                {scenario.data.notices.join(" ")}
              </p>
            ) : null}
          </>
        ) : null}
      </Panel>

      {live && totals ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <PanelHead
              title="EBITDA bridge"
              description="The run-rate, what each company adds or gives back, and where the scenario lands."
              count={signedMoney(totals.ebitdaDelta)}
            />
            <div className="px-4 pb-4 pt-3">
              {!moved ? (
                <div className="py-6 text-center">
                  <p className="font-mono text-2xl font-semibold tabular-nums">{money(totals.ebitda)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Run-rate EBITDA. No levers changed yet — pick a preset above or adjust a lever to see the bridge.
                  </p>
                </div>
              ) : (
                <>
                  <Waterfall
                    steps={[
                      ...live.companies
                        .filter((company) => Math.abs(company.ebitdaDelta) >= 0.005)
                        .map((company) => ({
                          label: company.code,
                          value: company.ebitdaDelta,
                          tone:
                            company.ebitdaDelta > 0
                              ? ("success" as const)
                              : company.ebitdaDelta < 0
                                ? ("danger" as const)
                                : ("muted" as const),
                        })),
                      ...(Math.abs(totals.holdingsDelta) >= 0.005
                        ? [
                            {
                              label: "Holdings fee",
                              value: totals.holdingsDelta,
                              tone: totals.holdingsDelta > 0 ? ("success" as const) : ("danger" as const),
                            },
                          ]
                        : []),
                    ]}
                    runRate={totals.ebitda}
                    scenario={totals.ebitdaScenario}
                  />
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    Change vs run-rate:{" "}
                    <strong className={cn("font-mono", totals.ebitdaDelta >= 0 ? "text-success" : "text-destructive")}>
                      {signedMoney(totals.ebitdaDelta)}
                    </strong>{" "}
                    ({totals.ebitda !== 0 ? `${((totals.ebitdaDelta / totals.ebitda) * 100).toFixed(1)}%` : "0.0%"}).{" "}
                    {live.companies.filter((c) => Math.abs(c.ebitdaDelta) < 0.005).length > 0
                      ? `${live.companies.filter((c) => Math.abs(c.ebitdaDelta) < 0.005).length} unchanged.`
                      : ""}
                  </p>
                </>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="What would move it most"
              description="Ten standard shocks applied to the live scenario, widest swing first."
              count={`${shocks.length} shocks`}
            />
            <div className="px-4 pb-4 pt-3">
              {shocks.length > 0 ? (
                <Tornado items={shocks} />
              ) : (
                <p className="text-xs text-muted-foreground">No shock can be computed without a run-rate.</p>
              )}
            </div>
          </Panel>
        </div>
      ) : null}

      {live ? (
        <Panel>
          <PanelHead
            title="Company results"
            description="Revenue, contribution and cash cycle after the levers, with the change each company contributes against its run-rate."
            count={`${live.companies.length} ${live.companies.length === 1 ? "company" : "companies"}`}
          />
          <div className="hidden overflow-x-auto border-t border-border/60 md:block">
            <Table className="min-w-[880px] [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Contrib. margin</TableHead>
                  <TableHead className="text-right">EBITDA</TableHead>
                  <TableHead className="text-right">EBITDA margin</TableHead>
                  <TableHead className="text-right">Cash cycle</TableHead>
                  <TableHead className="text-right">Working capital</TableHead>
                  <TableHead className="text-right">Δ EBITDA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultsPage.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell className="font-medium">
                      <span className="block truncate" title={row.name}>
                        {row.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{row.code}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.revenueScenario)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(row.cmPct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.ebitdaScenario)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(marginOf(row))}</TableCell>
                    <TableCell className="text-right tabular-nums">{`${PERCENT.format(row.cccScenario)} days`}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.workingCapitalScenario)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        row.ebitdaDelta > 0 && "text-success",
                        row.ebitdaDelta < 0 && "text-destructive",
                      )}
                    >
                      {signedMoney(row.ebitdaDelta)}
                    </TableCell>
                  </TableRow>
                ))}
                {totals ? (
                  <>
                    <TableRow className="bg-muted/20 text-xs text-muted-foreground">
                      <TableCell>Holdings net cost &amp; intercompany eliminations</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {money(-(live.companies.reduce((s, c) => s + c.revenueScenario, 0) - totals.revenueScenario))}
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono tabular-nums">
                        {money(-(live.companies.reduce((s, c) => s + c.ebitdaScenario, 0) - totals.ebitdaScenario))}
                      </TableCell>
                      <TableCell colSpan={4} />
                    </TableRow>
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Group (consolidated)</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{money(totals.revenueScenario)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono tabular-nums">{money(totals.ebitdaScenario)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{pct(totals.ebitdaMargin)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono tabular-nums">
                        {money(live.companies.reduce((s, c) => s + c.workingCapitalScenario, 0))}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums",
                          totals.ebitdaDelta > 0 && "text-success",
                          totals.ebitdaDelta < 0 && "text-destructive",
                        )}
                      >
                        {signedMoney(totals.ebitdaDelta)}
                      </TableCell>
                    </TableRow>
                  </>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y divide-border/60 border-t border-border/60 md:hidden">
            {resultsPage.map((row) => (
              <div key={row.code} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium" title={row.name}>
                    {row.name}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-xs tabular-nums",
                      row.ebitdaDelta > 0 && "text-success",
                      row.ebitdaDelta < 0 && "text-destructive",
                    )}
                  >
                    {signedMoney(row.ebitdaDelta)}
                  </span>
                </div>
                <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Revenue</dt>
                    <dd className="tabular-nums">{money(row.revenueScenario)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">EBITDA</dt>
                    <dd className="tabular-nums">{money(row.ebitdaScenario)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Margin</dt>
                    <dd className="tabular-nums">{pct(marginOf(row))}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Cash cycle</dt>
                    <dd className="tabular-nums">{`${PERCENT.format(row.cccScenario)} days`}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <TablePager
            page={page}
            pageCount={resultsPages}
            total={live.companies.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </Panel>
      ) : null}

      <Panel>
        <PanelHead
          title="Model assumptions"
          description="Per-company run-rate baselines, imported cost exposure, and USD revenue share driving the FX and EBITDA model."
        />
        <div className="overflow-x-auto border-t border-border/60">
          <Table className="min-w-[680px] [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4">
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Annual revenue</TableHead>
                <TableHead className="text-right">Contrib. margin</TableHead>
                <TableHead className="text-right">Imported cost share</TableHead>
                <TableHead className="text-right">USD revenue share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operating.map((row) => (
                <TableRow key={row.code}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{money(row.revenue)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{pct(row.cmPct)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{pct(row.importShare * 100)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{pct(row.usdShare * 100)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <dl className="grid gap-x-6 gap-y-2 border-t border-border/60 bg-muted/20 px-4 py-3 sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">Annual revenue, run-rate</dt>
            <dd className="font-mono text-xs tabular-nums">{money(revenueWeight)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">Run-rate EBITDA margin</dt>
            <dd className="font-mono text-xs tabular-nums">{pct(runMargin)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">Imported cost share, revenue weighted</dt>
            <dd className="font-mono text-xs tabular-nums">{pct(weighted((row) => row.importShare * 100))}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-muted-foreground">Dollar revenue share, revenue weighted</dt>
            <dd className="font-mono text-xs tabular-nums">{pct(weighted((row) => row.usdShare * 100))}</dd>
          </div>
        </dl>
        {live?.notes.length ? (
          <ul className="list-disc space-y-1 border-t border-border/60 px-8 py-3 text-xs text-muted-foreground">
            {live.notes.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel>
          <PanelHead
            title="Save this scenario"
            description="A saved scenario keeps its levers, its peso move and the base period you name."
          />
          <div className="space-y-3 border-t border-border/60 px-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="scenario-name" className="text-xs">
                Name
              </Label>
              <Input
                id="scenario-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Freight shock, Q1 2027"
                className="h-10 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scenario-period" className="text-xs">
                Base period
              </Label>
              <Input
                id="scenario-period"
                type="month"
                value={basePeriod}
                onChange={(event) => setBasePeriod(event.target.value)}
                className="h-10 w-full sm:h-9 sm:w-[180px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scenario-note" className="text-xs">
                Note
              </Label>
              <Input
                id="scenario-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What this case assumes"
                className="h-10 sm:h-9"
              />
            </div>
            <Button
              className="min-h-11 gap-1.5 md:min-h-0"
              onClick={submit}
              disabled={scenario.isSaving || !name.trim()}
              title={name.trim() ? undefined : "Give the scenario a name first."}
            >
              {scenario.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save scenario
            </Button>
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Saved scenarios"
            description="One is live. Activating another replaces the levers the planner opens with."
            count={`${scenario.data?.scenarios.length ?? 0} saved`}
          />
          {(scenario.data?.scenarios.length ?? 0) === 0 ? (
            <p className="border-t border-border/60 px-4 py-6 text-sm text-muted-foreground">No scenario is saved yet.</p>
          ) : (
            <div className="overflow-x-auto border-t border-border/60">
              <Table className="min-w-[520px] [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Base</TableHead>
                    <TableHead className="text-right">Peso</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenario.data?.scenarios.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[240px]">
                        <span className="block truncate font-medium" title={row.name}>
                          {row.name}
                        </span>
                        {row.note ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={row.note}>
                            {row.note}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.base_period}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.fx_pct)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {row.is_active ? (
                            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[11px]">
                              Live
                            </Badge>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => scenario.activate(row.id)}>
                              Activate
                            </Button>
                          )}
                          <span
                            className="inline-flex"
                            title={
                              row.is_active ? "This scenario is live. Activate another one first, then remove it." : undefined
                            }
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-40"
                              onClick={() => setRemoving(row)}
                              disabled={Boolean(row.is_active) || scenario.isSaving}
                              aria-label={row.is_active ? `Remove ${row.name} (not while it is live)` : `Remove ${row.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>

      <RemoveScenarioDialog
        row={removing}
        open={Boolean(removing)}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        busy={scenario.isSaving}
        onConfirm={async (id) => {
          await scenario.remove(id, removing?.name ?? "this scenario");
          setRemoving(null);
        }}
      />
    </div>
  );
}
