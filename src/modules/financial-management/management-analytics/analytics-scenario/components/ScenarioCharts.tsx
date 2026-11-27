"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "primary" | "muted";

const FILL: Record<Tone, string> = {
  success: "bg-success",
  danger: "bg-destructive",
  primary: "bg-primary",
  muted: "bg-muted-foreground/40",
};

const number = (value: number, dp: number) =>
  new Intl.NumberFormat("en-PH", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(value);

const signed = (value: number, dp: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${number(Math.abs(value), dp)}`;

/**
 * Horizontal bridge: the run-rate total, one floating bar per company, the scenario total.
 * The existing vertical bridge cannot float a bar, so this one is drawn as plain boxes.
 */
export function Waterfall({
  steps,
  runRate,
  scenario,
  dp = 2,
  unit = "₱M",
  showBreak = true,
}: {
  steps: Array<{ label: string; value: number; tone: Tone }>;
  runRate: number;
  scenario: number;
  dp?: number;
  unit?: string;
  showBreak?: boolean;
}) {
  const sym = unit.startsWith("$") ? "$" : "₱";
  const floats = React.useMemo(
    () =>
      steps.map((step, index) => {
        // Steps chain from the run rate, not from zero: a bar for +13 must sit between 210 and 223.
        const start = runRate + steps.slice(0, index).reduce((sum, prior) => sum + prior.value, 0);
        return { ...step, start, end: start + step.value };
      }),
    [steps, runRate],
  );

  const end = floats.length > 0 ? floats[floats.length - 1].end : runRate;
  const unclosed = Math.abs(end - scenario) >= 0.01;
  const edges = [runRate, scenario, ...floats.flatMap((row) => [row.start, row.end])];
  const low = Math.min(...edges);
  const high = Math.max(...edges);
  const span = high - low || 1;
  const at = (value: number) => ((value - low) / span) * 100;
  const truncatedFloor = showBreak && low > 0.01;

  const rows: Array<{ label: string; from: number; to: number; tone: Tone; value: number }> = [
    { label: "Run rate", from: low, to: runRate, tone: "muted", value: runRate },
    ...floats.map((row) => ({
      label: row.label,
      from: row.start,
      to: row.end,
      tone: row.tone,
      value: row.value,
    })),
    { label: "Scenario", from: low, to: scenario, tone: "primary", value: scenario },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const left = at(Math.min(row.from, row.to));
        const width = Math.abs(at(row.to) - at(row.from));
        const total = row.label === "Run rate" || row.label === "Scenario";
        return (
          <div key={`${row.label}-${index}`} className="flex items-center gap-3">
            <span
              className={cn(
                "w-[78px] shrink-0 truncate text-[11px]",
                total ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              title={row.label}
            >
              {row.label}
            </span>
            <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/40">
              <span
                aria-hidden
                className="absolute inset-y-0 w-px bg-border"
                style={{ left: `${at(runRate)}%` }}
              />
              <span
                className={cn(
                  "absolute inset-y-0 rounded-sm",
                  FILL[row.tone],
                  row.label === "Run rate" && "bg-slate-400/75 dark:bg-slate-500/75",
                  row.label === "Scenario" && "bg-teal-700 dark:bg-teal-400",
                )}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.8)}%` }}
              />
              {total && truncatedFloor ? (
                <span
                  aria-hidden
                  title={`Scale starts at ${sym}${number(low, dp)}M`}
                  className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-[10px] font-bold leading-none text-background/90 select-none"
                >
                  ⫽
                </span>
              ) : null}
            </div>
            <span className="w-[78px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              {total ? number(row.value, dp) : signed(row.value, dp)}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
        Values in {unit}, each bar floating from where the previous one ended. The vertical rule marks the{" "}
        {sym}{number(runRate, dp)}M run-rate{truncatedFloor ? `; ⫽ marks an axis floor of ${sym}${number(low, dp)}M` : ""}.
      </p>
      {unclosed ? (
        <p className="text-[11px] text-warning">
          {`The steps end at ${sym}${number(end, dp)}M against a scenario total of ${sym}${number(scenario, dp)}M: ${sym}${number(
            Math.abs(scenario - end),
            dp,
          )}M is unaccounted for, so read the table rather than this chart.`}
        </p>
      ) : null}
    </div>
  );
}

/** Dual-sided sensitivity bars: each shock swings EBITDA both ways from the live scenario. */
export function Tornado({
  items,
  dp = 2,
  unit = "₱M",
}: {
  items: Array<{ label: string; up: number; down: number }>;
  dp?: number;
  unit?: string;
}) {
  const span = Math.max(...items.map((item) => Math.max(Math.abs(item.up), Math.abs(item.down))), 0.001);

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const swing = Math.max(Math.abs(item.up), Math.abs(item.down));
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-[170px] shrink-0 truncate text-[11px] text-muted-foreground" title={item.label}>
              {item.label}
            </span>
            <div className="relative h-3.5 min-w-0 flex-1">
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {[item.up, item.down].map((val, idx) => {
                const half = (Math.abs(val) / span) * 50;
                const good = val >= 0;
                return (
                  <span
                    key={idx}
                    title={`${signed(val, dp)} ${unit}`}
                    className={cn("absolute inset-y-0 rounded-sm opacity-85", good ? "bg-success" : "bg-destructive")}
                    style={good ? { left: "50%", width: `${half}%` } : { right: "50%", width: `${half}%` }}
                  />
                );
              })}
            </div>
            <span className="w-[76px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
              ±{number(swing, dp)}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-muted-foreground">
        Change in group EBITDA ({unit}) from each standard shock applied on top of the live scenario. Cash cycle changes
        affect working capital and cash, not EBITDA, so they are excluded here.
      </p>
    </div>
  );
}
