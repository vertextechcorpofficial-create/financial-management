"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BoardHeader, ErpTags, MicroLabel, Panel, PanelHead } from "./BoardKit";
import { cn } from "@/lib/utils";
import { DOMAIN_LABEL, STATUS_META, TIER_LABEL, TIER_ORDER } from "../constants";
import { formatNumber, signedMagnitude } from "../services/engine";
import { fetchCatalogDetail } from "../providers/catalogApi";
import { useCatalog } from "../hooks/useCatalog";
import type { CatalogDetail, CatalogRow } from "../types";
import { AnalyticsTaxonomyPanel } from "./AnalyticsTaxonomyPanel";
import { KpiDetailDialog } from "./KpiDetailDialog";
import { OptionCombobox } from "./OptionCombobox";
import { StatusBadge } from "./StatusBadge";
import { TablePager } from "./TablePager";

const COLUMNS = 8;

const CATEGORY_SHORT: Record<string, string> = {
  CORE: "Core",
  WORKFORCE: "Workforce",
  INDUSTRY: "Industry",
  HOLDINGS: "Holdings",
};

export function TiersModule() {
  const catalog = useCatalog();
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(catalog.total / catalog.size)),
    [catalog.total, catalog.size],
  );
  const isFiltered =
    catalog.filters.tier !== "ALL" ||
    catalog.filters.company !== "ALL" ||
    catalog.filters.domain !== "ALL" ||
    catalog.filters.q.trim().length > 0;

  const totalCatalog = Object.values(catalog.counts).reduce((sum, n) => sum + n, 0);

  const companyOptions = catalog.companies.map((company) => ({
    value: company.code,
    label: company.name,
    searchText: `${company.code} ${company.name}`,
    description: company.code,
  }));

  const openDetail = async (row: CatalogRow) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailError(null);
    try {
      setDetail(await fetchCatalogDetail(row.kpi.id));
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "The KPI could not be read.");
    }
  };

  return (
    <div className="space-y-4">
      <BoardHeader
        title="Analytics Taxonomy & KPI Catalogue"
        subtitle={
          catalog.period
            ? `Four analytics maturity tiers (Descriptive, Diagnostic, Predictive, Prescriptive) and every measure the group runs, judged on ${catalog.period}.`
            : "Four analytics maturity tiers (Descriptive, Diagnostic, Predictive, Prescriptive) and every measure the group runs."
        }
        meta={
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">
            {formatNumber(catalog.total, 0)} {catalog.total === 1 ? "measure" : "measures"}
          </span>
        }
      />

      <AnalyticsTaxonomyPanel rows={catalog.rows} allOptions={catalog.allOptions} />

      <Panel>
        <PanelHead
          title="Measure Catalogue"
          description={`Grouped by measure category · newest reading month${catalog.period ? ` ${catalog.period}` : ""}`}
          count={`${formatNumber(catalog.total, 0)} KPI${catalog.total === 1 ? "" : "s"}`}
        />

        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-4 py-2.5">
          <MicroLabel className="mr-1">Category</MicroLabel>
          <button
            type="button"
            aria-pressed={catalog.filters.tier === "ALL"}
            onClick={() => catalog.updateFilters({ tier: "ALL" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              catalog.filters.tier === "ALL"
                ? "border-teal-800 bg-teal-800 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950"
                : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            All <span className="font-mono text-[10px] opacity-75">{formatNumber(totalCatalog, 0)}</span>
          </button>
          {TIER_ORDER.map((category) => {
            const active = catalog.filters.tier === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                onClick={() => catalog.updateFilters({ tier: active ? "ALL" : category })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-teal-800 bg-teal-800 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950"
                    : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {CATEGORY_SHORT[category] ?? category}
                <span className="font-mono text-[10px] opacity-75">{formatNumber(catalog.counts[category] ?? 0, 0)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative w-full min-w-0 sm:w-[280px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Name, key or owner"
              value={catalog.filters.q}
              aria-label="Search measures"
              onChange={(event) => catalog.updateFilters({ q: event.target.value })}
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <Select
              value={catalog.filters.domain}
              onValueChange={(value) => catalog.updateFilters({ domain: value })}
            >
              <SelectTrigger className="h-9 w-full" aria-label="Filter by domain">
                <SelectValue placeholder="Every domain" />
              </SelectTrigger>
              <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                <SelectItem value="ALL">Every domain</SelectItem>
                {catalog.domains.map((domain) => (
                  <SelectItem key={domain} value={domain}>
                    {DOMAIN_LABEL[domain] ?? domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[210px]">
            <OptionCombobox
              value={catalog.filters.company === "ALL" ? "" : catalog.filters.company}
              onChange={(value) => catalog.updateFilters({ company: value === "" ? "ALL" : value })}
              placeholder="Every company"
              searchPlaceholder="Search companies"
              emptyLabel="No company matches."
              options={companyOptions}
            />
          </div>
          {isFiltered ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1 px-2 text-xs"
              onClick={() => catalog.updateFilters({ tier: "ALL", company: "ALL", domain: "ALL", q: "" })}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          ) : null}
        </div>

        {catalog.error ? (
          <div className={`border-l-[3px] border-destructive bg-destructive/10 px-4 py-3 text-sm`}>
            <p className="font-medium">The catalogue could not be read.</p>
            <p className="text-muted-foreground">{catalog.error}</p>
          </div>
        ) : null}

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5"><MicroLabel>Measure</MicroLabel></th>
                <th className="px-4 py-2.5"><MicroLabel>Company</MicroLabel></th>
                <th className="px-4 py-2.5"><MicroLabel>Rule</MicroLabel></th>
                <th className="px-4 py-2.5 text-right"><MicroLabel>Latest</MicroLabel></th>
                <th className="px-4 py-2.5 text-right"><MicroLabel>Target</MicroLabel></th>
                <th className="px-4 py-2.5 text-right"><MicroLabel>Change</MicroLabel></th>
                <th className="px-4 py-2.5"><MicroLabel>Owner</MicroLabel></th>
                <th className="px-4 py-2.5"><MicroLabel>Status</MicroLabel></th>
              </tr>
            </thead>
            <tbody>
              {catalog.isLoading && catalog.rows.length === 0
                ? Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="border-b border-border/40">
                      {Array.from({ length: COLUMNS }).map((__, cell) => (
                        <td key={cell} className="px-4 py-3">
                          <div className="h-3 w-full animate-pulse rounded bg-muted" />
                        </td>
                      ))}
                    </tr>
                  ))
                : catalog.rows.map((row) => {
                    const meta = STATUS_META[row.statusCode];
                    return (
                      <tr
                        key={row.kpi.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open ${row.kpi.name}`}
                        onClick={() => void openDetail(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void openDetail(row);
                          }
                        }}
                        className="cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="max-w-[230px] truncate font-medium" title={row.kpi.name}>
                              {row.kpi.name}
                            </p>
                            <ErpTags kpiKey={row.kpi.kpi_key} sourceCodes={row.kpi.source_codes} compact />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {TIER_LABEL[row.kpi.tier] ?? row.kpi.tier} · {DOMAIN_LABEL[row.kpi.domain] ?? row.kpi.domain}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="max-w-[150px] truncate" title={row.companyName}>
                            {row.companyName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <span className="max-w-[180px] truncate" title={row.rule}>
                            {row.rule}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">{row.actualText}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">{row.targetText}</td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                          {row.change === null ? "—" : signedMagnitude(row.change, row.kpi.unit, row.kpi.dp)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {row.kpi.owner_position ? (
                            <span className="block max-w-[150px] truncate" title={row.kpi.owner_position}>
                              {row.kpi.owner_position}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={meta.tone}>{row.statusLabel}</StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!catalog.isLoading && catalog.total === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No measure matches these filters. Clear one, or change the category.
            </p>
          ) : null}
        </div>

        <ul className="divide-y divide-border md:hidden">
          {catalog.rows.map((row) => {
            const meta = STATUS_META[row.statusCode];
            return (
              <li key={row.kpi.id}>
                <button type="button" className="w-full space-y-1 px-4 py-3 text-left" onClick={() => void openDetail(row)}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium" title={row.kpi.name}>{row.kpi.name}</span>
                    <StatusBadge tone={meta.tone}>{row.statusLabel}</StatusBadge>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.companyName} · {row.rule}
                  </span>
                  <span className="block text-xs tabular-nums">
                    {row.actualText} against {row.targetText}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.kpi.owner_position ? `Owner: ${row.kpi.owner_position}` : "No owner on file"}
                  </span>
                </button>
              </li>
            );
          })}
          {!catalog.isLoading && catalog.total === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">No measure matches these filters.</li>
          ) : null}
        </ul>

        <TablePager
          className="border-t border-border/50 px-4 py-3"
          page={catalog.page}
          pageCount={pageCount}
          total={catalog.total}
          pageSize={catalog.size}
          onPageChange={catalog.setPage}
          onPageSizeChange={catalog.setSize}
          isLoading={catalog.isLoading}
        />
      </Panel>

      <KpiDetailDialog detail={detail} open={detailOpen} onOpenChange={setDetailOpen} />
      {detailError && detailOpen ? (
        <p className="text-sm text-destructive">{detailError}</p>
      ) : null}
    </div>
  );
}
