import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCENT, STATUS_META, toneClass } from "../constants";
import { changeText, formatNumber, formatValue, ruleText } from "../services/engine";
import type { OverviewPayload, OverviewRow, StatusCode } from "../types";
import { PagerLinks } from "./PagerLinks";
import { Notice } from "./Notice";
import { StatusBadge } from "./StatusBadge";

interface Props {
  payload: OverviewPayload;
  page: number;
  pageSize: number;
  basePath: string;
  status?: string;
  company?: string;
}

const ORDER: StatusCode[] = ["CONFIRMED", "PROVISIONAL", "WATCH", "FAVORABLE", "ON_TRACK", "NO_DATA"];

const DASH = "\u2014";

function href(basePath: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function Rule({ row }: { row: OverviewRow }) {
  if (row.missingTarget && row.missingActual) return <span className="text-muted-foreground">No reading and no target</span>;
  if (row.missingTarget) return <span className="text-muted-foreground">No target set</span>;
  return <>{ruleText(row.kpi)}</>;
}

function Cell({ status }: { status: StatusCode }) {
  const meta = STATUS_META[status];
  return (
    <div className="flex items-center justify-center">
      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} title={meta.label} aria-label={meta.label} />
    </div>
  );
}

export function OverviewModule({ payload, page, pageSize, basePath, status, company }: Props) {
  const rows = status ? payload.rows.filter((row) => row.status.code === status) : payload.rows;
  const companies = payload.companies.filter((row) => row.kind !== "GROUP" && row.kind !== "HOLDINGS");
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const counts = payload.counts;
  const healthDot = payload.health === null ? "bg-muted-foreground/40" : payload.health >= 75 ? "bg-emerald-500" : payload.health >= 55 ? "bg-amber-500" : "bg-red-500";
  const staleSources = payload.sources.filter((source) => source.stale);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Group Overview</h1>
          <p className="text-sm text-muted-foreground">
            {payload.company ? `${payload.company.name} · ` : "All entities · "}
            period {payload.asOf} · {payload.rows.length} {payload.rows.length === 1 ? "measure" : "measures"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href(basePath, { period: payload.asOf, size: pageSize })}
            className="inline-flex h-9 items-center rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            Everything
          </Link>
          {payload.companies.map((row) => (
            <Link
              key={row.id}
              href={href(basePath, { company: row.code, period: payload.asOf, size: pageSize })}
              className={`inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium transition-colors ${
                payload.company?.code === row.code ? "border-primary/50 bg-primary/10 text-foreground" : "border-border hover:bg-muted"
              }`}
            >
              {row.code}
            </Link>
          ))}
        </div>
      </div>

      <Card className={`border-border/60 ${toneClass("neutral")}`}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${healthDot}`} />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Health score · {payload.company?.code ?? "All entities"}
              </p>
              <p className="text-2xl font-semibold tabular-nums leading-tight">{payload.health === null ? DASH : formatNumber(payload.health, 0)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Counts below cover {payload.company?.name ?? "every entity"}; the grid compares each company.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {ORDER.map((code) => (
              <span key={code} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${STATUS_META[code].dot}`} />
                <span className="text-muted-foreground">{STATUS_META[code].label}</span>
                <span className="font-medium tabular-nums">{counts[code] ?? 0}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {staleSources.length > 0 ? (
        <Notice
          tone="warning"
          title={`${staleSources.length} of ${payload.sources.length} feeds ${staleSources.length === 1 ? "is" : "are"} past ${staleSources.length === 1 ? "its" : "their"} freshness limit.`}
        >
          {staleSources.map((source) => source.code).join(", ")} — readings from {staleSources.length === 1 ? "it are" : "them are"} shown as stored, not refreshed.
        </Notice>
      ) : null}

      {companies.length > 0 && payload.heat.length > 0 ? (
        <Card className="border-border/60">
          <CardHeader className="border-b border-border/60 px-4 py-3">
            <CardTitle className="text-sm font-semibold">Core measures by entity</CardTitle>
            <p className="text-xs text-muted-foreground">Each dot is the status of that measure for {payload.asOf}.</p>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 py-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Measure</th>
                  {companies.map((row) => (
                    <th key={row.id} className="px-2 py-2.5 text-center font-medium">{row.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {payload.heat.map((line) => (
                  <tr key={line.kpiKey}>
                    <td className="px-4 py-2">{line.kpiName}</td>
                    {companies.map((row) => {
                      const cell = line.cells.find((entry) => entry.code === row.code);
                      return <td key={row.id} className="px-2 py-2">{cell ? <Cell status={cell.status} /> : <span className="block text-center text-muted-foreground">{DASH}</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Card className={`border-border/60 ${ACCENT.rail}`}>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b border-border/60 px-4 py-3">
          <div>
            <CardTitle className="text-sm font-semibold">Measures</CardTitle>
            <p className="text-xs text-muted-foreground">
              {rows.length} of {payload.rows.length} shown
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {ORDER.map((code) => (
              <Link
                key={code}
                href={href(basePath, { company: company, period: payload.asOf, status: status === code ? undefined : code, size: pageSize })}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${
                  status === code ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_META[code].dot}`} />
                {STATUS_META[code].label}
              </Link>
            ))}
          </div>
        </CardHeader>
        <div className="hidden overflow-x-auto min-[1300px]:block">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Measure</th>
                <th className="px-4 py-2.5 font-medium">Rule</th>
                <th className="px-4 py-2.5 text-right font-medium">Latest</th>
                <th className="px-4 py-2.5 text-right font-medium">Target</th>
                <th className="px-4 py-2.5 text-right font-medium">Change</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {slice.map((row) => {
                const meta = STATUS_META[row.status.code];
                const dev = row.status.deviation;
                return (
                  <tr key={row.kpi.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <p className="truncate font-medium" title={row.kpi.name}>{row.kpi.name}</p>
                      <p className="truncate mt-0.5 text-xs text-muted-foreground" title={row.kpi.owner_position ?? "no owner"}>
                        {row.kpi.kpi_key} · {row.kpi.owner_position ?? "no owner"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground"><Rule row={row} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {row.actual === null ? <span className="text-muted-foreground">{DASH}</span> : formatValue(row.actual, row.kpi)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {row.target === null ? DASH : formatValue(row.target, row.kpi)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${dev && dev.unfavorable ? "text-destructive" : ""}`}>
                      {dev ? changeText(dev.value, row.kpi) : DASH}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={meta.tone} title={row.status.label}>{meta.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
              {slice.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nothing matches that status for {payload.asOf}. Clear the filter to see every measure.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-border min-[1300px]:hidden">
          {slice.map((row) => {
            const meta = STATUS_META[row.status.code];
            const dev = row.status.deviation;
            return (
              <li key={row.kpi.id} className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={row.kpi.name}>{row.kpi.name}</p>
                    <p className="truncate text-xs text-muted-foreground" title={row.kpi.owner_position ?? "no owner"}>
                      {row.kpi.kpi_key} · {row.kpi.owner_position ?? "no owner"}
                    </p>
                  </div>
                  <StatusBadge tone={meta.tone} title={row.status.label}>{meta.label}</StatusBadge>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground"><Rule row={row} /></span>
                  <span className="tabular-nums">
                    {row.actual === null ? DASH : formatValue(row.actual, row.kpi)}
                    <span className="text-muted-foreground"> of {row.target === null ? DASH : formatValue(row.target, row.kpi)}</span>
                  </span>
                  <span className={`tabular-nums ${dev && dev.unfavorable ? "text-destructive" : ""}`}>
                    {dev ? changeText(dev.value, row.kpi) : DASH}
                  </span>
                </div>
              </li>
            );
          })}
          {slice.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing matches that status for {payload.asOf}. Clear the filter to see every measure.
            </li>
          ) : null}
        </ul>
        <PagerLinks page={page} total={rows.length} pageSize={pageSize} basePath={basePath} query={{ company, period: payload.asOf, status }} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="border-b border-border/60 px-4 py-3">
            <CardTitle className="text-sm font-semibold">Open exceptions</CardTitle>
            <p className="text-xs text-muted-foreground">
              {payload.exceptions.length} on the board for {payload.company?.name ?? "this view"}
            </p>
          </CardHeader>
          <CardContent className="divide-y divide-border/50 px-4 py-1">
            {payload.exceptions.slice(0, 6).map((row) => (
              <div key={row.id} className="py-2.5">
                <p className="text-sm font-medium">{row.companyName} · {row.kpiName}</p>
                <p className="text-xs text-muted-foreground">{row.reason}</p>
              </div>
            ))}
            {payload.exceptions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No open exception for {payload.company?.name ?? "this view"}. Company-level breaches stay on Variance Protocol.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="border-b border-border/60 px-4 py-3">
            <CardTitle className="text-sm font-semibold">Feeds</CardTitle>
            <p className="text-xs text-muted-foreground">{payload.sources.filter((source) => !source.stale).length} of {payload.sources.length} current</p>
          </CardHeader>
          <CardContent className="divide-y divide-border/50 px-4 py-1">
            {payload.sources.map((source) => (
              <div key={source.code} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm" title={source.name}>{source.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{source.state.toLowerCase()}</p>
                </div>
                <StatusBadge tone={source.stale ? "warning" : "success"}>{source.stale ? "stale" : "fresh"}</StatusBadge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
