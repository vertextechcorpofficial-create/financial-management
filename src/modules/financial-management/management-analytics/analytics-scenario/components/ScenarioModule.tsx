"use client";

import * as React from "react";
import { Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useScenario } from "../hooks/useScenario";
import { computeScenario } from "../services/model";
import { ACCENT, type Tone } from "../constants";
import { Notice } from "./Notice";
import { RemoveScenarioDialog } from "./RemoveScenarioDialog";
import type { Levers, ScenarioRow } from "../types";

const MONEY = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 });

/** Tile figures carry the tone in their colour only; the card itself stays neutral. */
/** Zero is not a gain, so a figure with no movement keeps the neutral tone. */
function sign(value: number): -1 | 0 | 1 {
  if (Math.abs(value) < 0.005) return 0;
  return value > 0 ? 1 : -1;
}

const FIGURE_TONE: Record<Tone, string> = {
  neutral: "",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-destructive",
  info: "text-sky-600 dark:text-sky-400",
  accent: "text-primary",
};

const MONEY_PLAIN = (value: number) => MONEY.format(Math.abs(Number.isFinite(value) ? value : 0));
const money = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe < 0 ? "−" : ""}₱${MONEY_PLAIN(safe)}M`;
};
const pct = (value: number) => `${PERCENT.format(Number.isFinite(value) ? value : 0)}%`;

const LEVER_FIELDS: Array<{ key: keyof Omit<Levers, "code">; label: string; step: string }> = [
  { key: "revenuePct", label: "Revenue", step: "0.5" },
  { key: "cmPoints", label: "Margin", step: "0.1" },
  { key: "fixedPct", label: "Fixed cost", step: "0.5" },
  { key: "cccDays", label: "Cycle", step: "1" },
];

export function ScenarioModule() {
  const scenario = useScenario();
  const [name, setName] = React.useState("");
  const [basePeriod, setBasePeriod] = React.useState(() => new Date().toISOString().slice(0, 7));
  const [note, setNote] = React.useState("");
  const [removing, setRemoving] = React.useState<ScenarioRow | null>(null);

  const live = React.useMemo(() => {
    const companies = scenario.data?.companies ?? [];
    return companies.length > 0 ? computeScenario(companies, scenario.levers, scenario.fxPct) : null;
  }, [scenario.data, scenario.levers, scenario.fxPct]);

  const moved = scenario.levers.some(
    (lever) => lever.revenuePct !== 0 || lever.cmPoints !== 0 || lever.fixedPct !== 0 || lever.cccDays !== 0,
  );

  const tiles: Array<{ label: string; value: string; hint: string; tone?: Tone }> = live
    ? [
        { label: "Revenue", value: money(live.totals.revenueScenario), hint: `run-rate ${money(live.totals.revenue)}` },
        {
          label: "EBITDA",
          value: money(live.totals.ebitdaScenario),
          hint: `${live.totals.ebitdaDelta >= 0 ? "+" : ""}${money(live.totals.ebitdaDelta)} against run-rate`,
          tone: sign( live.totals.ebitdaDelta ) === 1 ? "success" : sign( live.totals.ebitdaDelta ) === -1 ? "danger" : "neutral",
        },
        { label: "Margin", value: pct(live.totals.ebitdaMargin), hint: "EBITDA over revenue" },
        {
          label: "Cash effect",
          value: money(live.totals.cashEffect),
          hint: `after tax and ${live.totals.workingCapitalDelta >= 0 ? "working capital" : "released capital"}`,
          tone: sign( live.totals.cashEffect ) === 1 ? "success" : sign( live.totals.cashEffect ) === -1 ? "danger" : "neutral",
        },
      ]
    : [];

  const submit = async () => {    if (!name.trim()) return;
    const created = await scenario.save({ name: name.trim(), basePeriod, note: note.trim() || null });
    if (created) {
      setName("");
      setNote("");
    }
  };

  if (scenario.error) {
    return <Notice tone="danger" title="The planner could not be read">{scenario.error}</Notice>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Scenario Planner</h1>
          <p className="text-sm text-muted-foreground">Levers move the run-rate in the table. Nothing is stored until you name the scenario.</p>
        </div>
      </div>

      <Card className={cn("overflow-hidden", ACCENT.rail)}>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b border-border/60 px-4 py-3">
          <div>
            <CardTitle className="text-sm font-semibold">Levers</CardTitle>
            <p className="text-xs text-muted-foreground">Each row moves one company against its run-rate.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[11px] font-medium">
              {scenario.data?.scenarios.length ?? 0} saved
            </Badge>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="fx" className="text-xs text-muted-foreground">
                Peso move
              </Label>
              <Input
                id="fx"
                type="number"
                step="0.5"
                value={scenario.fxPct}
                onChange={(event) => scenario.setFxPct(Number(event.target.value))}
                className="h-9 w-[92px] text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={scenario.reset} disabled={!moved && scenario.fxPct === 0}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4">
          {scenario.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the run-rate…
            </div>
          ) : null}

          {live ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {tiles.map((tile) => (
                  <div key={tile.label} className="rounded-lg border border-border/60 bg-card px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
                    <p className={`mt-1 text-xl font-semibold tabular-nums ${FIGURE_TONE[tile.tone ?? "neutral"]}`}>{tile.value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p>
                  </div>
                ))}
              </div>

              {scenario.data?.notices.length ? (
                <p className="text-xs leading-5 text-muted-foreground">{scenario.data.notices.join(" ")}</p>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table className="min-w-[720px] [&_th:first-child]:pl-4 [&_td:first-child]:pl-4 [&_th:last-child]:pr-4 [&_td:last-child]:pr-4 [&_th]:py-2.5 [&_td]:py-3">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      {LEVER_FIELDS.map((field) => (
                        <TableHead key={field.key} className="text-right">
                          {field.label}
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                            {field.key === "cccDays" ? "days" : field.key === "cmPoints" ? "pp" : "%"}
                          </span>
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
                            <span className="block truncate" title={row.name}>{row.name}</span>
                            <span className="mt-0.5 text-xs text-muted-foreground">
                              {money(row.revenue)} revenue · {pct(row.cmPct)} margin · {money(row.fixed)} fixed
                            </span>
                          </TableCell>
                          {LEVER_FIELDS.map((field) => (
                            <TableCell key={field.key} className="text-right">
                              <Input
                                type="number"
                                step={field.step}
                                value={lever ? lever[field.key] : 0}
                                onChange={(event) => scenario.setLever(row.code, field.key, Number(event.target.value))}
                                className="ml-auto h-8 w-[84px] text-right tabular-nums"
                                aria-label={`${row.name} ${field.label}`}
                              />
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums">{money(row.ebitdaScenario)}</TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${row.ebitdaDelta > 0 ? "text-emerald-600 dark:text-emerald-500" : row.ebitdaDelta < 0 ? "text-destructive" : ""}`}
                          >
                            {row.ebitdaDelta > 0 ? "+" : ""}
                            {money(row.ebitdaDelta)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Working capital</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {live.totals.workingCapitalDelta >= 0 ? "+" : ""}
                    {money(live.totals.workingCapitalDelta)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">a rise absorbs cash</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cash today</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{money(live.totals.cashRunRate)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">96 days of fixed cost</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cash after</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{money(live.totals.cashScenario)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">tax at 25% on the EBITDA change</p>
                </div>
              </div>

              {live.notes.length ? (
                <p className="text-xs leading-5 text-muted-foreground">{live.notes.join(" ")}</p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border px-4 py-3">
            <CardTitle className="text-sm font-semibold">Save this scenario</CardTitle>
            <p className="text-xs text-muted-foreground">The saved scenario becomes the live one the planner opens with.</p>
          </CardHeader>
          <CardContent className="space-y-3 px-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="scenario-name" className="text-xs">Name</Label>
              <Input
                id="scenario-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Freight shock, Q1 2027"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scenario-period" className="text-xs">Base period</Label>
              <Input
                id="scenario-period"
                type="month"
                value={basePeriod}
                onChange={(event) => setBasePeriod(event.target.value)}
                className="h-9 w-full sm:w-[180px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scenario-note" className="text-xs">Note</Label>
              <Input
                id="scenario-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What this case assumes"
                className="h-9"
              />
            </div>
            <Button
                  className="h-9 gap-1"
                  onClick={submit}
                  disabled={scenario.isSaving || !name.trim()}
                  title={name.trim() ? undefined : "Give the scenario a name first."}
                >
              {scenario.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save scenario
            </Button>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border px-4 py-3">
            <CardTitle className="text-sm font-semibold">Saved scenarios</CardTitle>
            <p className="text-xs text-muted-foreground">One is live. Activating another replaces the levers on open.</p>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {(scenario.data?.scenarios.length ?? 0) === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No scenario is saved yet.</p>
            ) : (
              <div className="overflow-x-auto">
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
                        <span className="block truncate font-medium" title={row.name}>{row.name}</span>
                        {row.note ? (
                          <span className="block truncate mt-0.5 text-xs text-muted-foreground" title={row.note}>{row.note}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.base_period}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(row.fx_pct)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {row.is_active ? (
                            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[11px]">Live</Badge>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => scenario.activate(row.id)}>
                              Activate
                            </Button>
                          )}
                          <span
                            className="inline-flex"
                            title={row.is_active ? "This scenario is live. Activate another one first, then remove it." : undefined}
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
          </CardContent>
        </Card>
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
