"use client";

import { moneyShort } from "../format";

type Point = { label: string; value: number; displayValue?: string };

function chartScale(values: number[], top: number, height: number) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const padding = (max - min) * 0.08;
  const low = min < 0 ? min - padding : 0;
  const high = max > 0 ? max + padding : min < 0 ? 0 : 1;
  const ticks = min === max ? [0] : [low, min < 0 && max > 0 ? 0 : (low + high) / 2, high];
  return { ticks, y: (value: number) => top + height * (high - value) / (high - low) };
}

export function LineChart({ points, height = 190 }: { points: Point[]; height?: number }) {
  const width = 620;
  const left = 58;
  const right = 16;
  const top = 16;
  const bottom = 28;
  if (!points.length) return null;
  const x = (index: number) => left + (index * (width - left - right)) / Math.max(1, points.length - 1);
  const { ticks, y } = chartScale(points.map(point => point.value), top, height - top - bottom);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join("");
  const area = `${path}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Savings trend">
      {ticks.map(tick => (
        <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{moneyShort(tick)}</text>
        </g>
      ))}
      <path d={area} className="fill-emerald-500/10" />
      <path d={path} fill="none" className="stroke-emerald-600" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((point, index) => (
        <g key={point.label} aria-label={`${point.label}: ${point.displayValue ?? moneyShort(point.value)}`}>
          <title>{point.label} · {point.displayValue ?? moneyShort(point.value)}</title>
          <circle cx={x(index)} cy={y(point.value)} r={index === points.length - 1 ? 5 : 3.5} className="fill-emerald-600 stroke-card" strokeWidth={2} />
          <text x={x(index)} y={height - 7} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{point.label}</text>
        </g>
      ))}
      {last && (
        <text x={x(points.length - 1) - 8} y={y(last.value) - 10} textAnchor="end" className="fill-foreground font-mono text-[11px] font-semibold">
          {moneyShort(last.value)}
        </text>
      )}
    </svg>
  );
}

export function GroupedBars({
  labels,
  series,
  height = 200,
}: {
  labels: string[];
  series: Array<{ name: string; values: number[]; displayValues?: string[]; color: string }>;
  height?: number;
}) {
  const width = 620;
  const left = 58;
  const right = 12;
  const top = 14;
  const bottom = 28;
  const groupWidth = (width - left - right) / Math.max(1, labels.length);
  const barWidth = Math.min(22, (groupWidth - 18) / Math.max(1, series.length));
  const { ticks, y } = chartScale(series.flatMap(item => item.values), top, height - top - bottom);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Monthly money in">
      {ticks.map(tick => (
        <g key={tick}>
          <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{moneyShort(tick)}</text>
        </g>
      ))}
      {labels.map((label, labelIndex) => {
        const groupStart = left + labelIndex * groupWidth + (groupWidth - barWidth * series.length - 3 * (series.length - 1)) / 2;
        return (
          <g key={label}>
            {series.map((item, seriesIndex) => {
              const value = item.values[labelIndex] ?? 0;
              const barX = groupStart + seriesIndex * (barWidth + 3);
              const barY = y(value);
              const displayValue = item.displayValues?.[labelIndex] ?? moneyShort(value);
              return (
                <g key={item.name} aria-label={`${label} · ${item.name}: ${displayValue}`}>
                  <title>{label} · {item.name} · {displayValue}</title>
                  <rect
                    x={barX}
                    y={Math.min(barY, y(0))}
                    width={barWidth}
                    height={Math.abs(y(0) - barY)}
                    rx={2}
                    fill={item.color}
                  />
                </g>
              );
            })}
            <text x={left + labelIndex * groupWidth + groupWidth / 2} y={height - 7} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function HBars({
  rows,
  format = moneyShort,
  color = "bg-emerald-600",
}: {
  rows: Array<{ label: string; value: number; detail?: string; displayValue?: string }>;
  format?: (value: number) => string;
  color?: string;
}) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return (
    <div className="space-y-2.5">
      {rows.map(row => (
        <div key={row.label} className="grid grid-cols-[minmax(90px,1fr)_1.3fr_auto] items-center gap-2 text-sm">
          <div className="min-w-0">
            <p className="truncate">{row.label}</p>
            {row.detail && <p className="truncate text-[11px] text-muted-foreground">{row.detail}</p>}
          </div>
          <div className="h-2.5 overflow-hidden rounded-sm bg-muted">
            <div className={`h-full ${color}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
          <span className="text-right font-mono text-xs tabular-nums">{row.displayValue ?? format(row.value)}</span>
        </div>
      ))}
    </div>
  );
}
