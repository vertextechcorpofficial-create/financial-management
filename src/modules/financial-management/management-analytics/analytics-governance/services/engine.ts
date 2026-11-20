import type { Deviation, KpiRow, KpiStatus, PeriodPoint, Policy, RunInfo } from "../types";

/**
 * Ported from the reference prototype (`loan`-style parity with management-analytics.html):
 * `dev`, `runInfo`, `status`, `holtFit`, `hwFit`, `Phi`, `forecast`.
 * Keep these functions pure. The screen must never decide a status on its own.
 */

const round = (value: number, dp: number) => Number(value.toFixed(dp));

export function formatNumber(value: number, dp: number): string {
  return value.toLocaleString("en-PH", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function formatValue(value: number, kpi: KpiRow): string {
  const unit = kpi.unit ?? "";
  const number = formatNumber(value, kpi.dp);
  if (unit.startsWith("\u20b1M")) return `\u20b1${number}M`;
  if (unit.startsWith("\u20b1")) return `\u20b1${number}`;
  if (unit.startsWith("%")) return `${number}%`;
  return unit ? `${number} ${unit}` : number;
}

/** A signed figure with its own trailer: `%` for a percent rule, the unit for a limit rule. */
/**
 * A magnitude with its measure's unit placed the way a reader expects it: currency in front,
 * `pp` for anything measured in percent, a space before a word unit, and nothing when the unit
 * is a phrase the screen already explains.
 */
/**
 * A movement with its sign in front: `+0.2 pp`, `\u2212\u20b10.03M`, and no sign at all when the
 * figure rounds to zero at the measure's precision.
 */
export function signedMagnitude(value: number, unit: string | null | undefined, dp: number): string {
  if (Math.abs(value) < 0.5 * Math.pow(10, -dp)) return magnitudeText(0, unit, dp);
  return `${value < 0 ? "\u2212" : "+"}${magnitudeText(value, unit, dp)}`;
}

export function magnitudeText(value: number, unit: string | null | undefined, dp: number): string {
  const measure = unit ?? "";
  const number = formatNumber(Math.abs(value), dp);
  if (measure.startsWith("\u20b1M")) return `\u20b1${number}M`;
  if (measure.startsWith("\u20b1")) return `\u20b1${number}`;
  if (measure.startsWith("%")) return `${number} pp`;
  if (/^[A-Za-z]/.test(measure)) return `${number} ${measure}`;
  return number;
}

export function signed(value: number, dp: number, trailer = ""): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${formatNumber(Math.abs(value), dp)}${trailer}`;
}

export function ruleText(kpi: KpiRow): string {
  if (kpi.rule_type === "PCT") return `±${formatNumber(kpi.threshold ?? 0, kpi.threshold && kpi.threshold % 1 ? 1 : 0)}% of target`;
  if (kpi.rule_type === "MAX") {
    if (!kpi.threshold) return "Zero tolerance";
    return `Ceiling ${formatValue(kpi.threshold, kpi)}`;
  }
  return `Floor ${formatValue(kpi.threshold ?? 0, kpi)}`;
}

/** Deviation of one reading against its target under the KPI's own rule. */
export function deviation(kpi: KpiRow, actual: number, target: number): Deviation {
  if (kpi.rule_type === "PCT") {
    const threshold = kpi.threshold ?? 0;
    const percent = target === 0 ? 0 : ((actual - target) / target) * 100;
    const unfavorable = kpi.polarity === "LOW" ? percent > 0 : percent < 0;
    const magnitude = Math.abs(percent);
    return {
      value: percent,
      text: signed(percent, kpi.dp, "%"),
      unfavorable,
      over: magnitude > threshold,
      watch: unfavorable && magnitude >= threshold * 0.5 && magnitude <= threshold,
      ratio: threshold === 0 ? 0 : magnitude / threshold,
    };
  }

  const limit = kpi.threshold ?? 0;
  const roundedActual = round(actual, kpi.dp);
  const delta = round(roundedActual - limit, kpi.dp + 2);
  const unfavorable = kpi.rule_type === "MAX" ? delta > 0 : delta < 0;
  const over = unfavorable && Math.abs(delta) > 1e-9;
  const band = kpi.watch_band ?? 0;
  const watch = !over && band > 0 && (kpi.rule_type === "MAX" ? roundedActual > limit - band : roundedActual < limit + band);
  return {
    value: delta,
    text: signed(delta, kpi.dp, kpi.unit === "%" ? " pp" : kpi.unit ? ` ${kpi.unit}` : ""),
    unfavorable,
    over,
    watch,
    ratio: over ? 3 : watch ? 0.6 : 0,
  };
}

/**
 * How long the current run over the threshold has lasted and whether it confirms.
 * A ceiling, floor or zero-tolerance rule confirms on the first period; a percent
 * rule needs the sustained-breach setting, a spike, or the required run length.
 */
export function runInfo(kpi: KpiRow, points: PeriodPoint[], index: number, policy: Policy): RunInfo | null {
  const targetAt = (i: number) => points[i]?.target ?? null;
  const actualAt = (i: number) => points[i]?.actual ?? null;

  const current = points[index];
  const currentTarget = targetAt(index);
  if (!current || current.actual === null || currentTarget === null) return null;

  const currentDev = deviation(kpi, current.actual, currentTarget);
  if (!currentDev.over) return null;

  let start = index;
  while (start - 1 >= 0) {
    const previousActual = actualAt(start - 1);
    const previousTarget = targetAt(start - 1);
    if (previousActual === null || previousTarget === null) break;
    const previous = deviation(kpi, previousActual, previousTarget);
    if (previous.over && previous.unfavorable === currentDev.unfavorable) start -= 1;
    else break;
  }

  const label = (i: number) => points[i]?.period ?? "";
  let confirmedAt: number | null = null;
  let reason = "";

  for (let q = start; q <= index; q += 1) {
    const actual = actualAt(q);
    const target = targetAt(q);
    if (actual === null || target === null) continue;
    const pointDev = deviation(kpi, actual, target);

    if (kpi.rule_type !== "PCT") {
      confirmedAt = q;
      reason = `${ruleText(kpi)} breached in ${label(q)} (confirms immediately)`;
      break;
    }
    if (!policy.sustainedRule) {
      confirmedAt = q;
      reason = `Strict rule: over ${ruleText(kpi)} in ${label(q)}`;
      break;
    }
    if (pointDev.ratio >= policy.spikeMultiple) {
      confirmedAt = q;
      reason = `Spike ${policy.spikeMultiple}× threshold in ${label(q)}`;
      break;
    }
    if (q - start + 1 >= policy.confirmPeriods) {
      confirmedAt = q;
      reason = `${policy.confirmPeriods} consecutive periods over ${ruleText(kpi)} (since ${label(start)})`;
      break;
    }
  }

  return { start, length: index - start + 1, confirmedAt, reason, deviation: currentDev };
}

export function statusOf(kpi: KpiRow, points: PeriodPoint[], index: number, policy: Policy): KpiStatus {
  const point = points[index];
  if (!point || point.actual === null) {
    return { code: "NO_DATA", label: "No reading", memoRequired: false, deviation: null, run: null };
  }
  if (point.target === null) {
    return { code: "NO_DATA", label: "No target", memoRequired: false, deviation: null, run: null };
  }

  const dev = deviation(kpi, point.actual, point.target);
  const run = runInfo(kpi, points, index, policy);

  if (run && run.confirmedAt !== null) {
    return dev.unfavorable
      ? { code: "CONFIRMED", label: "Confirmed breach", memoRequired: true, deviation: dev, run }
      : { code: "FAVORABLE", label: "Favorable · memo required", memoRequired: true, deviation: dev, run };
  }
  if (run) {
    return { code: "PROVISIONAL", label: `Provisional · ${run.length}/${policy.confirmPeriods}`, memoRequired: false, deviation: dev, run };
  }
  if (dev.watch) return { code: "WATCH", label: "Watch", memoRequired: false, deviation: dev, run: null };
  return { code: "ON_TRACK", label: "On track", memoRequired: false, deviation: dev, run: null };
}

const HEALTH_WEIGHT: Record<string, number> = {
  ON_TRACK: 1,
  FAVORABLE: 1,
  WATCH: 0.6,
  PROVISIONAL: 0.45,
  CONFIRMED: 0,
};

/** Average of the KPI statuses that have a reading, ×100. Null when nothing can be judged. */
export function healthScore(statuses: KpiStatus[]): number | null {
  const judged = statuses.filter((s) => s.code !== "NO_DATA");
  if (judged.length === 0) return null;
  const total = judged.reduce((sum, s) => sum + (HEALTH_WEIGHT[s.code] ?? 0), 0);
  return Math.round((total / judged.length) * 100);
}

export function healthTone(score: number | null): "success" | "warning" | "danger" | "neutral" {
  if (score === null) return "neutral";
  if (score >= 75) return "success";
  if (score >= 55) return "warning";
  return "danger";
}

/* ------------------------------------------------------------------ forecast */

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
}

function holtFit(y: number[], alpha: number, beta: number, phi: number, from = 1) {
  let level = y[0];
  let trend = y[1] - y[0];
  let sse = 0;
  let n = 0;
  for (let t = 1; t < y.length; t += 1) {
    const forecastValue = level + phi * trend;
    const error = y[t] - forecastValue;
    if (t >= from) {
      sse += error * error;
      n += 1;
    }
    const previousLevel = level;
    level = alpha * y[t] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - previousLevel) + (1 - beta) * phi * trend;
  }
  return { sse, n, level, trend };
}

function hwFit(y: number[], seasonLength: number, alpha: number, beta: number, gamma: number) {
  const level0 = mean(y.slice(0, seasonLength));
  let trend = (mean(y.slice(seasonLength, 2 * seasonLength)) - level0) / seasonLength;
  const season = y.slice(0, seasonLength).map((v, i) => v - (level0 + (i - (seasonLength - 1) / 2) * trend));
  let level = level0 + ((seasonLength - 1) / 2) * trend;
  let sse = 0;
  let n = 0;
  for (let t = seasonLength; t < y.length; t += 1) {
    const s = season[t % seasonLength];
    const forecastValue = level + trend + s;
    const error = y[t] - forecastValue;
    sse += error * error;
    n += 1;
    const previousLevel = level;
    level = alpha * (y[t] - s) + (1 - alpha) * (level + trend);
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
    season[t % seasonLength] = gamma * (y[t] - level) + (1 - gamma) * s;
  }
  return { sse, n, level, trend, season, length: y.length };
}

/** Normal CDF, Abramowitz and Stegun 26.2.17. */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export interface Forecast {
  method: string;
  points: number[];
  sigma: number;
  band80: number[];
  band95: number[];
  breachProbability: number | null;
  threshold: number | null;
  enoughHistory: boolean;
}

/**
 * Holt damped trend always; additive Holt-Winters only when it beats Holt by more
 * than ten percent and there are two full seasons. Ranges are ±z·σ·√h.
 */
export function forecast(points: PeriodPoint[], kpi: KpiRow, horizon = 3): Forecast {
  const actuals = points.map((p) => p.actual).filter((v): v is number => v !== null);
  const y = actuals.slice(-36);
  if (y.length < 4) {
    return { method: "Needs at least four readings", points: [], sigma: 0, band80: [], band95: [], breachProbability: null, threshold: null, enoughHistory: false };
  }

  let bestHolt: { sse: number; n: number; level: number; trend: number } | null = null;
  for (const alpha of [0.2, 0.4, 0.6, 0.8]) {
    for (const beta of [0.05, 0.15, 0.3]) {
      const fit = holtFit(y, alpha, beta, 0.9, y.length >= 24 ? 12 : 1);
      if (!bestHolt || fit.sse < bestHolt.sse) bestHolt = fit;
    }
  }

  let bestHw: ReturnType<typeof hwFit> | null = null;
  if (y.length >= 24) {
    for (const alpha of [0.2, 0.4, 0.6, 0.8]) {
      for (const beta of [0.05, 0.15, 0.3]) {
        for (const gamma of [0.1, 0.3, 0.5]) {
          const fit = hwFit(y, 12, alpha, beta, gamma);
          if (!bestHw || fit.sse < bestHw.sse) bestHw = fit;
        }
      }
    }
  }

  const holt = bestHolt as { sse: number; n: number; level: number; trend: number };
  let forecasts: number[];
  let method: string;
  let sse: number;
  let n: number;

  if (bestHw && bestHw.sse < holt.sse * 0.9) {
    forecasts = Array.from({ length: horizon }, (_, i) => bestHw!.level + (i + 1) * bestHw!.trend + bestHw!.season[(bestHw!.length + i) % 12]);
    method = "Holt-Winters (additive, 12-month season)";
    sse = bestHw.sse;
    n = bestHw.n;
  } else {
    forecasts = Array.from({ length: horizon }, (_, i) => {
      let damped = 0;
      for (let j = 1; j <= i + 1; j += 1) damped += Math.pow(0.9, j);
      return holt.level + damped * holt.trend;
    });
    method = y.length >= 24 ? "Holt damped trend (seasonality too weak to use)" : "Holt damped trend (needs 24 months to test seasonality)";
    sse = holt.sse;
    n = holt.n;
  }

  if (kpi.kpi_key.endsWith(".lti")) forecasts = forecasts.map((v) => Math.max(0, v));

  const sigma = Math.max(1e-6, Math.sqrt(sse / Math.max(1, n - 1)));
  const band80 = forecasts.map((_, i) => 1.2816 * sigma * Math.sqrt(i + 1));
  const band95 = forecasts.map((_, i) => 1.96 * sigma * Math.sqrt(i + 1));

  const nextTarget = points[points.length - 1]?.target ?? null;
  let threshold: number | null = null;
  if (nextTarget !== null) {
    if (kpi.rule_type === "PCT") {
      const move = (kpi.threshold ?? 0) / 100;
      threshold = kpi.polarity === "LOW" ? nextTarget * (1 + move) : nextTarget * (1 - move);
    } else {
      threshold = kpi.threshold;
    }
  }
  if (kpi.kpi_key.endsWith(".lti")) threshold = 0.5;

  let breachProbability: number | null = null;
  if (threshold !== null && forecasts.length > 0) {
    const z = (threshold - forecasts[0]) / sigma;
    breachProbability = kpi.polarity === "LOW" ? 1 - normalCdf(z) : normalCdf(z);
  }

  return { method, points: forecasts, sigma, band80, band95, breachProbability, threshold, enoughHistory: true };
}

export const DEFAULT_POLICY: Policy = {
  seasonalTargets: true,
  sustainedRule: true,
  confirmPeriods: 2,
  spikeMultiple: 2,
  memoDeadlineDays: 3,
  toleranceReadings: 2,
};
