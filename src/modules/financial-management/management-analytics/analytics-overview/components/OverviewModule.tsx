import Link from "next/link";

import { cn } from "@/lib/utils";

import { StackBar, type Tone } from "@/modules/financial-management/management-analytics/shared/Charts";
import { displayDay } from "@/modules/financial-management/management-analytics/shared/dates";
import {
  BoardHeader,
  Callout,
  Dot,
  MicroLabel,
  Panel,
  PanelHead,
  Stat,
} from "@/modules/financial-management/management-analytics/shared/BoardKit";

import { STATUS_META } from "../constants";
import { ConsolidationBridge } from "./ConsolidationBridge";
import { OverviewInteractiveSection } from "./OverviewInteractiveSection";
import { changeText, formatNumber, formatValue, ruleText } from "../services/engine";
import type { OverviewPayload, OverviewRow, StatusCode } from "../types";
import { Notice } from "./Notice";
import { PagerLinks } from "./PagerLinks";
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

const TONE: Record<StatusCode, Tone> = {
  ON_TRACK: "success",
  FAVORABLE: "info",
  WATCH: "warning",
  PROVISIONAL: "primary",
  CONFIRMED: "danger",
  NO_DATA: "muted",
};

/** The exceptions panel names six and links to the register for the rest. */
const VISIBLE_EXCEPTIONS = 6;

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



export function OverviewModule({ payload, page, pageSize, basePath, status, company }: Props) {
  const rows = status ? payload.rows.filter((row) => row.status.code === status) : payload.rows;
  const companies = payload.companies.filter((row) => row.kind !== "GROUP" && row.kind !== "HOLDINGS");
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const counts = payload.counts;
  const staleSources = payload.sources.filter((source) => source.stale);
  const freshSources = payload.sources.length - staleSources.length;
  const escalatedCount = payload.exceptions.filter((ex) => ex.status === "ESCALATED").length;
  const isGroupView = !payload.company || payload.company.kind === "GROUP";

  const healthByCode = new Map(payload.companyScorecard.map((co) => [co.code, co.health]));
  const healthDotTone = (score: number | null | undefined): Tone =>
    score == null ? "primary" : score >= 75 ? "success" : score >= 55 ? "warning" : "danger";

  const mix = companies
    .map((entity) => {
      const cells = payload.heat.flatMap((line) => line.cells.filter((cell) => cell.code === entity.code));
      return {
        entity,
        total: cells.length,
        segments: ORDER.map((code) => ({
          label: STATUS_META[code].label,
          tone: TONE[code],
          value: cells.filter((cell) => cell.status === code).length,
        })),
      };
    })
    .filter((entry) => entry.total > 0);

  return (
    <div className="space-y-4">
      <BoardHeader
        title={isGroupView ? "Group Overview" : (payload.company?.name ?? "Overview")}
        subtitle={
          <>
            {payload.company ? payload.company.name : "Every entity"} · {payload.rows.length}{" "}
            {payload.rows.length === 1 ? "measure" : "measures"} scored for {payload.asOf}. Status is decided by the
            engine, never on the screen: a breach needs its confirming readings and a memo.
          </>
        }
        meta={
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
            As of {payload.asOf}
          </span>
        }
      />

      {/* Entity selector bar with industry micro-label and health dot (matching reference #entbar) */}
      <div className="flex flex-wrap gap-1.5">
        {payload.companies.map((row) => {
          const active = payload.company?.code === row.code;
          const score = row.kind === "GROUP" ? payload.health : healthByCode.get(row.code);
          return (
            <Link
              key={row.id}
              href={href(basePath, { company: row.code, period: payload.asOf, size: pageSize, status })}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/70 bg-card text-foreground hover:border-foreground/30",
              )}
            >
              <Dot tone={healthDotTone(score)} />
              <span className="min-w-0 leading-tight">
                <span className={cn("block text-[10px] uppercase tracking-[0.06em]", active ? "opacity-75" : "text-muted-foreground")}>
                  {row.industry ?? (row.kind === "GROUP" ? "Consolidated" : row.kind === "HOLDINGS" ? "Parent" : "Operating")}
                </span>
                <span className="block text-xs font-semibold">{row.name}</span>
              </span>
            </Link>
          );
        })}
      </div>

      {payload.rows.length === 0 ? (
        <Callout tone="warning" title={`No measure is scored for ${payload.asOf}.`}>
          {payload.company
            ? `${payload.company.name} has no active measure, so every figure on this board would be an invented zero.`
            : "No active measure is defined for this month, so every figure on this board would be an invented zero."}
        </Callout>
      ) : null}

      {staleSources.length > 0 ? (
        <Notice
          tone="warning"
          title={`${staleSources.length} of ${payload.sources.length} feeds ${staleSources.length === 1 ? "is" : "are"} past ${staleSources.length === 1 ? "its" : "their"} freshness limit.`}
        >
          Readings from {staleSources.map((source) => source.code).join(", ")} are shown as stored, not refreshed.
        </Notice>
      ) : null}

      {/* 5-Stat Top Row (matching reference #stats) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Panel className="p-4">
          <Stat
            label="On track"
            value={formatNumber((counts.ON_TRACK ?? 0) + (counts.FAVORABLE ?? 0), 0)}
            tone="success"
            note={`of ${payload.rows.length} ${payload.rows.length === 1 ? "KPI" : "KPIs"} in scope`}
          />
        </Panel>
        <Panel className="p-4">
          <Stat
            label="Watch / provisional"
            value={formatNumber((counts.WATCH ?? 0) + (counts.PROVISIONAL ?? 0), 0)}
            tone="warning"
            note="Near limit or unconfirmed"
          />
        </Panel>
        <Panel className="p-4">
          <Stat
            label="Confirmed breaches"
            value={formatNumber(counts.CONFIRMED ?? 0, 0)}
            tone="danger"
            note="Memo + owner required"
          />
        </Panel>
        <Panel className="p-4">
          <Stat
            label="Escalated memos"
            value={formatNumber(escalatedCount, 0)}
            tone={escalatedCount > 0 ? "danger" : "success"}
            note="Past memo deadline"
          />
        </Panel>
        <Panel className="p-4">
          <Stat
            label="Stale sources"
            value={formatNumber(staleSources.length, 0)}
            tone={staleSources.length > 0 ? "warning" : "success"}
            note={staleSources.length > 0 ? "KPIs flagged with caveat" : `${freshSources} of ${payload.sources.length} fresh`}
          />
        </Panel>
      </div>

      <OverviewInteractiveSection
        payload={payload}
        rows={rows}
        basePath={basePath}
        pageSize={pageSize}
        status={status}
        isGroupView={isGroupView}
      />

      {payload.bridge ? <ConsolidationBridge bridge={payload.bridge} /> : null}

      {mix.length > 0 ? (
        <Panel>
          <PanelHead
            title="Status mix by company"
            description={`The ${payload.heat.length} core measures, counted per company for ${payload.asOf}.`}
          />
          <div className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
            {mix.map((entry) => (
              <div key={entry.entity.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-medium" title={entry.entity.name}>
                    {entry.entity.code}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {entry.total} {entry.total === 1 ? "measure" : "measures"}
                  </span>
                </div>
                <StackBar segments={entry.segments} />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel>
        <PanelHead
          title="Measures"
          description={`Every scored measure for ${payload.asOf}, with the reading, the target and the change.`}
          count={`${rows.length} of ${payload.rows.length}`}
          right={
            <div className="flex flex-wrap items-center gap-1.5">
              {ORDER.map((code) => (
                <Link
                  key={code}
                  href={href(basePath, {
                    company,
                    period: payload.asOf,
                    status: status === code ? undefined : code,
                    size: pageSize,
                  })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    status === code
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Dot tone={TONE[code]} />
                  {STATUS_META[code].label}
                </Link>
              ))}
            </div>
          }
        />
        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left"><MicroLabel>Measure</MicroLabel></th>
                <th className="px-4 py-2 text-left"><MicroLabel>Rule</MicroLabel></th>
                <th className="px-4 py-2 text-right"><MicroLabel>Latest</MicroLabel></th>
                <th className="px-4 py-2 text-right"><MicroLabel>Target</MicroLabel></th>
                <th className="px-4 py-2 text-right"><MicroLabel>Change</MicroLabel></th>
                <th className="px-4 py-2 text-left"><MicroLabel>Status</MicroLabel></th>
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
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={row.kpi.owner_position ?? "no owner"}>
                        {row.kpi.kpi_key} · {row.kpi.owner_position ?? "no owner"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground"><Rule row={row} /></td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {row.actual === null ? <span className="text-muted-foreground">no reading</span> : formatValue(row.actual, row.kpi)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {row.target === null ? <span className="text-muted-foreground">no target</span> : formatValue(row.target, row.kpi)}
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-mono tabular-nums", dev?.unfavorable && "text-destructive")}>
                      {dev ? changeText(dev.value, row.kpi) : "not comparable"}
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
        <ul className="divide-y divide-border/50 xl:hidden">
          {slice.map((row) => {
            const meta = STATUS_META[row.status.code];
            const dev = row.status.deviation;
            return (
              <li key={row.kpi.id} className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium" title={row.kpi.name}>{row.kpi.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground" title={row.kpi.owner_position ?? "no owner"}>
                      {row.kpi.kpi_key} · {row.kpi.owner_position ?? "no owner"}
                    </p>
                  </div>
                  <StatusBadge tone={meta.tone} title={row.status.label}>{meta.label}</StatusBadge>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground"><Rule row={row} /></span>
                  <span className="font-mono tabular-nums">
                    {row.actual === null ? "no reading" : formatValue(row.actual, row.kpi)}
                    <span className="text-muted-foreground"> of {row.target === null ? "no target" : formatValue(row.target, row.kpi)}</span>
                  </span>
                  <span className={cn("font-mono tabular-nums", dev?.unfavorable && "text-destructive")}>
                    {dev ? changeText(dev.value, row.kpi) : "not comparable"}
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
        <div className="border-t border-border/60 px-4 py-2.5">
          <PagerLinks page={page} total={rows.length} pageSize={pageSize} basePath={basePath} query={{ company, period: payload.asOf, status }} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHead
            title="Open exceptions"
            description={`${payload.exceptions.length} on the board for ${payload.company?.name ?? "this view"}`}
            count={payload.exceptions.length}
            right={
              <Link href="/fm/management-analytics/analytics-variance" className="text-[11px] font-medium text-primary hover:underline">
                Variance protocol
              </Link>
            }
          />
          <div className="divide-y divide-border/50 px-4">
            {payload.exceptions.slice(0, VISIBLE_EXCEPTIONS).map((row) => (
              <div key={row.id} className="py-2.5">
                <p className="text-[13px] font-medium">{row.companyName} · {row.kpiName}</p>
                <p className="text-[11.5px] text-muted-foreground">{row.reason}</p>
              </div>
            ))}
            {payload.exceptions.length > VISIBLE_EXCEPTIONS ? (
              <Link
                href="/fm/management-analytics/analytics-variance"
                className="flex items-baseline justify-between gap-3 py-2.5 text-[12.5px] font-medium text-primary hover:underline"
              >
                <span>and {payload.exceptions.length - VISIBLE_EXCEPTIONS} more on the variance register</span>
                <span className="font-mono tabular-nums">{payload.exceptions.length - VISIBLE_EXCEPTIONS}</span>
              </Link>
            ) : null}
            {payload.exceptions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No open exception for {payload.company?.name ?? "this view"}. Company-level breaches stay on Variance Protocol.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Feeds"
            description={`${freshSources} of ${payload.sources.length} current at ${payload.asOf}`}
            count={payload.sources.length}
          />
          <div className="divide-y divide-border/50 px-4">
            {payload.sources.map((source) => (
              <div key={source.code} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px]" title={source.name}>{source.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {source.code} · {source.state.toLowerCase()} · {displayDay(source.last_sync_at)} · SLA {source.sla_minutes} min
                  </p>
                </div>
                <StatusBadge tone={source.stale ? "warning" : "success"}>{source.stale ? "stale" : "fresh"}</StatusBadge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
