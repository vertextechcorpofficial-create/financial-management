"use client";


import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DOMAIN_LABEL, STATUS_META, TIER_LABEL, toneClass, type Tone } from "../constants";
import { formatValue, ruleText, signedMagnitude } from "../services/engine";
import { TrendChart, type Tone as ChartTone } from "@/modules/financial-management/management-analytics/shared/Charts";
import type { CatalogDetail } from "../types";
import { StatusBadge } from "./StatusBadge";

const CHART_TONE: Record<Tone, ChartTone> = {
  neutral: "muted",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  accent: "primary",
};

function Tile({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone ? toneClass(tone) : "border-border/60 bg-muted/30"}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60">
      <header className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
      </header>
      <dl className="divide-y divide-border/50">{children}</dl>
    </section>
  );
}

export function KpiDetailDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: CatalogDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!detail) return null;
  const { row, points, status, forecast } = detail;
  const meta = STATUS_META[status.code];
  const recent = points.slice(-6).reverse();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[720px]">
        <DialogHeader className="space-y-2 border-b px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{row.kpi.name}</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {row.companyName} · {TIER_LABEL[row.kpi.tier] ?? row.kpi.tier} · {DOMAIN_LABEL[row.kpi.domain] ?? row.kpi.domain} ·{" "}
                {row.period ?? "no readings"}
              </DialogDescription>
            </div>
            <StatusBadge tone={meta.tone} title={status.label}>
              {status.label}
            </StatusBadge>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Latest" value={row.actualText} />
            <Tile label="Target" value={row.targetText} />
            <Tile label="Rule" value={ruleText(row.kpi)} />
            <Tile
              label="Next three months"
              value={forecast ? formatValue(forecast.points.at(-1) ?? 0, row.kpi) : "no forecast"}
              tone={forecast?.breachProbability !== null && forecast?.breachProbability !== undefined && forecast.breachProbability >= 0.5 ? "danger" : undefined}
            />
          </div>

          <section className="overflow-hidden rounded-lg border border-border/60">
            <header className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Readings against target</span>
              <span className="mt-0.5 text-xs text-muted-foreground">
                breach odds{" "}
                {forecast?.breachProbability === null || forecast?.breachProbability === undefined
                  ? "not modelled yet"
                  : `${Math.round(forecast.breachProbability * 100)}%`}
              </span>
            </header>
            <div className="px-2 py-3">
              <TrendChart
                points={points}
                dp={row.kpi.dp}
                height={200}
                tone={CHART_TONE[meta.tone]}
                bandPct={row.kpi.rule_type === "PCT" && row.kpi.threshold !== null ? Math.abs(row.kpi.threshold) / 100 : undefined}
                forecast={forecast}
              />
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Group title="Rule">
              <Row label="Measure" value={row.kpi.definition ?? "No definition recorded."} />
              <Row label="Rule" value={ruleText(row.kpi)} />
              <Row label="Direction" value={row.kpi.polarity === "HIGH" ? "Higher is better" : "Lower is better"} />
              <Row label="Precision" value={`${row.kpi.dp} decimal${row.kpi.dp === 1 ? "" : "s"}`} />
              <Row label="Roll-up" value={row.kpi.rollup} />
            </Group>
            <Group title="Ownership">
              <Row label="Owner position" value={row.kpi.owner_position ?? "unassigned"} />
              <Row label="Sources" value={row.kpi.source_codes ?? "none declared"} />
              <Row label="Key" value={row.kpi.kpi_key} />
              <Row label="Memo required" value={row.memoRequired ? "Yes" : "No"} />
            </Group>
          </div>

          <section className="overflow-hidden rounded-lg border border-border/60">
            <header className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              Recent months
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-4 py-2 text-right font-medium">Reading</th>
                  <th className="px-4 py-2 text-right font-medium">Target</th>
                  <th className="px-4 py-2 text-right font-medium">Difference</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((point) => {
                  const difference =
                    point.actual !== null && point.target !== null ? point.actual - point.target : null;
                  return (
                    <tr key={point.period} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2 tabular-nums">{point.period}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {point.actual === null ? "no reading" : formatValue(point.actual, row.kpi)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {point.target === null ? "no target" : formatValue(point.target, row.kpi)}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums ${
                          difference === null ? "" : Math.abs(difference) < 1e-9 ? "text-muted-foreground" : ""
                        }`}
                      >
                        {difference === null ? "not comparable" : signedMagnitude(difference, row.kpi.unit, row.kpi.dp)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t bg-muted/20 px-6 py-4">
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
