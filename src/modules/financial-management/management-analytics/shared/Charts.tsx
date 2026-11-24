import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { Forecast } from "../analytics-overview/services/engine";
import { formatNumber } from "../analytics-overview/services/engine";
import type { PeriodPoint } from "../analytics-overview/types";

/**
 * The chart language for the analytics boards: plain SVG and CSS-sized divs, no library.
 * Every figure is `tabular-nums`; every colour is a semantic token class so the theme carries.
 */

export type Tone = "success" | "warning" | "danger" | "info" | "primary" | "muted";

export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  primary: "text-primary",
  muted: "text-muted-foreground",
};

export const TONE_FILL: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  primary: "bg-primary",
  muted: "bg-muted-foreground",
};

const shortMonth = (period: string) => {
  const [year, month] = period.split("-");
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1];
  return name ? `${name} ${year.slice(2)}` : period;
};

export function Legend({ items }: { items: Array<{ label: string; className: string; dashed?: boolean }> }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("inline-block h-0.5 w-3.5", item.className, item.dashed && "opacity-70")}
            style={item.dashed ? { backgroundImage: "repeating-linear-gradient(to right, currentColor 0 3px, transparent 3px 6px)" } : undefined}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Twelve-month trend with a target line: the tile's miniature. */
export function Sparkline({ points, tone = "primary" }: { points: PeriodPoint[]; tone?: Tone }) {
  const series = points.slice(-12).filter((point) => point.actual !== null);
  if (series.length < 2) return <span className="text-[11px] text-muted-foreground">Not enough history</span>;

  const values = series.map((point) => point.actual as number);
  const targets = series.map((point) => point.target).filter((value): value is number => value !== null);
  const all = targets.length > 0 ? [...values, ...targets] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || Math.abs(max) || 1;
  const width = 120;
  const height = 34;
  const x = (index: number) => 2 + (index / Math.max(1, series.length - 1)) * (width - 4);
  const y = (value: number) => height - 3 - ((value - min) / span) * (height - 8);
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[34px] w-[120px] overflow-visible" aria-hidden>
      {targets.length > 0 ? (
        <path
          d={series.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.target ?? values[index]).toFixed(1)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 2"
          className="text-muted-foreground/60"
        />
      ) : null}
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.6} className={TONE_TEXT[tone]} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.4} fill="currentColor" className={TONE_TEXT[tone]} />
    </svg>
  );
}

/**
 * Full trend: tolerance band, target, actual, and the three-month forecast with its ranges.
 * `bandPct` is the tolerance as a fraction of target. Pass it only when the rule is a percent.
 * of target, otherwise the band would claim a tolerance the KPI does not have.
 */
export function TrendChart({
  points,
  dp = 1,
  height = 208,
  tone = "primary",
  bandPct,
  forecast,
}: {
  points: PeriodPoint[];
  dp?: number;
  height?: number;
  tone?: Tone;
  bandPct?: number;
  forecast?: Forecast | null;
}) {
  const history = points.filter((point) => point.actual !== null || point.target !== null).slice(-18);
  if (history.length < 2) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">Not enough readings to draw a trend.</p>;
  }

  const forward = forecast?.enoughHistory ? forecast.points : [];
  const width = 600;
  const left = 46;
  const right = 26;
  const top = 12;
  const bottom = 26;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const total = history.length + forward.length;

  const values: number[] = [];
  for (const point of history) {
    if (point.actual !== null) values.push(point.actual);
    if (point.target !== null) values.push(point.target);
  }
  if (bandPct && history.some((point) => point.target !== null)) {
    for (const point of history) if (point.target !== null) values.push(point.target * (1 + bandPct), point.target * (1 - bandPct));
  }
  if (forecast?.enoughHistory) {
    forecast.points.forEach((value, index) => {
      values.push(value, value + (forecast.band95[index] ?? 0), value - (forecast.band95[index] ?? 0));
    });
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || Math.abs(max) || 1) * 0.08;
  const lo = min - pad;
  const hi = max + pad;

  const x = (index: number) => left + (total <= 1 ? 0 : (index / (total - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - ((value - lo) / (hi - lo)) * plotHeight;
  const line = (series: Array<number | null>, from: number) =>
    series
      .map((value, index) => (value === null ? null : `${from + index === 0 ? "M" : "L"}${x(from + index).toFixed(1)} ${y(value).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");

  const actualPath = line(history.map((point) => point.actual), 0);
  const targetPath = line(history.map((point) => point.target), 0);
  const forecastPath = forward.length > 0
    ? line([history[history.length - 1]?.actual ?? null, ...forward], history.length - 1)
    : "";

  const band = bandPct
    ? (() => {
        const upper = history.map((point, index) => (point.target === null ? null : `${x(index).toFixed(1)} ${y(point.target * (1 + bandPct)).toFixed(1)}`)).filter(Boolean);
        const lower = history.map((point, index) => (point.target === null ? null : `${x(index).toFixed(1)} ${y(point.target * (1 - bandPct)).toFixed(1)}`)).filter(Boolean).reverse();
        return upper.length > 1 && lower.length > 1 ? `${upper.join(" L")} L${lower.join(" L")} Z` : "";
      })()
    : "";

  const cone = (bands: number[]) => {
    if (!forecast || bands.length === 0) return "";
    const upper = forward.map((value, index) => `${x(history.length - 1 + index + 1).toFixed(1)} ${y(value + (bands[index] ?? 0)).toFixed(1)}`);
    const lower = forward
      .map((value, index) => `${x(history.length - 1 + index + 1).toFixed(1)} ${y(value - (bands[index] ?? 0)).toFixed(1)}`)
      .reverse();
    const start = `${x(history.length - 1).toFixed(1)} ${y(history[history.length - 1]?.actual ?? forward[0]).toFixed(1)}`;
    return `${start} L${upper.join(" L")} L${lower.join(" L")} Z`;
  };

  const cone95 = forecast ? cone(forecast.band95) : "";
  const cone80 = forecast ? cone(forecast.band80) : "";
  const gridlines = 4;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label="Reading against target by month">
        {Array.from({ length: gridlines + 1 }, (_, index) => {
          const value = lo + ((hi - lo) * index) / gridlines;
          const gy = y(value);
          return (
            <g key={index}>
              <line x1={left} x2={width - right} y1={gy} y2={gy} stroke="currentColor" strokeWidth={0.5} className="text-border" />
              <text x={left - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="currentColor" className="text-muted-foreground tabular-nums">
                {formatNumber(value, dp)}
              </text>
            </g>
          );
        })}

        {band ? <path d={band} fill="currentColor" className="text-primary opacity-[0.08]" /> : null}
        {cone95 ? <path d={cone95} fill="currentColor" className="text-warning opacity-[0.10]" /> : null}
        {cone80 ? <path d={cone80} fill="currentColor" className="text-warning opacity-[0.18]" /> : null}

        {targetPath ? (
          <path d={targetPath} fill="none" stroke="currentColor" strokeWidth={1.1} strokeDasharray="5 4" className="text-primary opacity-80" />
        ) : null}
        {actualPath ? <path d={actualPath} fill="none" stroke="currentColor" strokeWidth={2} className="text-foreground" /> : null}
        {forecastPath ? (
          <path d={forecastPath} fill="none" stroke="currentColor" strokeWidth={1.8} strokeDasharray="4 3" className="text-warning" />
        ) : null}

        {history.map((point, index) =>
          point.actual === null ? null : (
            <circle key={point.period} cx={x(index)} cy={y(point.actual)} r={2.6} fill="currentColor" className={TONE_TEXT[index === history.length - 1 ? tone : "muted"]}>
              <title>{`${shortMonth(point.period)}: ${formatNumber(point.actual, dp)}${point.target !== null ? ` · target ${formatNumber(point.target, dp)}` : ""}`}</title>
            </circle>
          ),
        )}
        {forward.map((value, index) => (
          <circle key={`f${index}`} cx={x(history.length + index)} cy={y(value)} r={2.2} fill="none" stroke="currentColor" strokeWidth={1.4} className="text-warning">
            <title>{`Forecast +${index + 1}: ${formatNumber(value, dp)}`}</title>
          </circle>
        ))}

        {history.map((point, index) =>
          index % 2 === 0 || index === history.length - 1 ? (
            <text key={`l${point.period}`} x={x(index)} y={height - 8} textAnchor="middle" fontSize={9} fill="currentColor" className="text-muted-foreground">
              {shortMonth(point.period)}
            </text>
          ) : null,
        )}
        {forward.map((_, index) =>
          index === forward.length - 1 ? (
            <text key={`fl${index}`} x={x(history.length + index)} y={height - 8} textAnchor="middle" fontSize={9} fill="currentColor" className="text-warning">
              {`+${index + 1}`}
            </text>
          ) : null,
        )}
      </svg>
      <Legend
        items={[
          { label: "Reading", className: "bg-foreground" },
          ...(targetPath ? [{ label: "Target", className: "bg-primary", dashed: true }] : []),
          ...(band ? [{ label: "Tolerance", className: "bg-primary/20" }] : []),
          ...(forecastPath ? [{ label: "Forecast", className: "bg-warning", dashed: true }] : []),
          ...(forecast?.band95.length ? [{ label: "80-95% range", className: "bg-warning/30" }] : []),
        ]}
      />
    </div>
  );
}

/** Horizontal bars with the label and figure in fixed columns: the bridge rows. */
export function BarList({
  rows,
  dp = 1,
  unit,
  className,
}: {
  rows: Array<{ label: string; value: number; note?: string; tone?: Tone; emphasis?: boolean }>;
  dp?: number;
  unit?: string;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1e-9);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(72px,1.1fr)_minmax(0,1fr)_auto] items-center gap-2 text-xs sm:grid-cols-[minmax(96px,150px)_minmax(0,1fr)_84px]">
          <span className={cn("truncate", row.emphasis ? "font-semibold text-foreground" : "text-muted-foreground")} title={row.label}>
            {row.label}
          </span>
          <span className="relative h-4 overflow-hidden rounded-sm bg-muted/60">
            <span
              className={cn("absolute inset-y-1 left-0 rounded-sm", TONE_FILL[row.tone ?? "primary"])}
              style={{ width: `${Math.max(1.5, (Math.abs(row.value) / max) * 100)}%` }}
            />
          </span>
          <span className={cn("text-right tabular-nums", row.emphasis ? "font-semibold" : "text-muted-foreground")}>
            {formatNumber(row.value, dp)}
            {unit ? <span className="ml-0.5 text-[11px] text-muted-foreground">{unit}</span> : null}
            {row.note ? <span className="ml-1 text-[11px] text-muted-foreground">{row.note}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Vertical columns: a consolidation or EBITDA bridge, one column per step with a total. */
export function BridgeBars({
  steps,
  dp = 1,
  unit,
}: {
  steps: Array<{ label: string; value: number; tone?: Tone; total?: boolean }>;
  dp?: number;
  unit?: string;
}) {
  if (steps.length === 0) return null;
  const max = Math.max(...steps.map((step) => Math.abs(step.value)), 1e-9);

  return (
    <div className="flex h-[176px] items-stretch gap-1.5 pt-1">
      {steps.map((step) => (
        <div key={step.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {formatNumber(step.value, dp)}
            {unit ?? ""}
          </span>
          <span
            className={cn("w-full max-w-14 rounded-t-sm", TONE_FILL[step.tone ?? "primary"], !step.total && "opacity-80")}
            style={{ height: `${Math.max(2, (Math.abs(step.value) / max) * 108)}px` }}
            title={`${step.label}: ${formatNumber(step.value, dp)}${unit ?? ""}`}
          />
          <span className="h-7 text-center text-[11px] leading-tight text-muted-foreground">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

/** One track split into proportional segments, with a legend: the status mix. */
export function StackBar({
  segments,
  height = 8,
  legend = false,
}: {
  segments: Array<{ label: string; value: number; tone: Tone }>;
  height?: number;
  legend?: boolean;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return <span className="text-[11px] text-muted-foreground">No readings</span>;

  return (
    <div className="space-y-1.5">
      <div
        className="flex w-full overflow-hidden rounded-sm bg-muted"
        style={{ height }}
        role="img"
        aria-label={segments.filter((segment) => segment.value > 0).map((segment) => `${segment.label} ${segment.value}`).join(", ")}
      >
        {segments.map((segment) =>
          segment.value === 0 ? null : (
            <span
              key={segment.label}
              className={TONE_FILL[segment.tone]}
              style={{ width: `${(segment.value / total) * 100}%` }}
              title={`${segment.label}: ${segment.value}`}
            />
          ),
        )}
      </div>
      {legend ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {segments.map((segment) => (
            <span key={segment.label} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("h-2 w-2 rounded-full", TONE_FILL[segment.tone])} />
              {segment.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A single measure filling a track, e.g. a health score or a coverage ratio. */
export function Meter({ value, tone = "primary", height = 6 }: { value: number; tone?: Tone; height?: number }) {
  return (
    <span className="block w-full overflow-hidden rounded-sm bg-muted" style={{ height }}>
      <span className={cn("block h-full rounded-sm", TONE_FILL[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

/** Grouped cell for a heat table: the tone carries the status, the figure carries the magnitude. */
export function HeatCell({ tone, children, strong }: { tone: Tone; children?: ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-full w-full items-center justify-center rounded-sm px-1 py-1 text-[11px] tabular-nums",
        TONE_TEXT[tone],
        strong ? "bg-muted font-semibold" : "bg-muted/50",
      )}
    >
      {children}
    </span>
  );
}
