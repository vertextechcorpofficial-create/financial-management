"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCENT, DOMAIN_LABEL, STATUS_META, TIER_LABEL, TIER_ORDER } from "../constants";
import { formatNumber, signedMagnitude } from "../services/engine";
import { fetchCatalogDetail } from "../providers/catalogApi";
import { useCatalog } from "../hooks/useCatalog";
import type { CatalogDetail, CatalogRow } from "../types";
import { KpiDetailDialog } from "./KpiDetailDialog";
import { OptionCombobox } from "./OptionCombobox";
import { StatusBadge } from "./StatusBadge";
import { TablePager } from "./TablePager";

const COLUMNS = 7;

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">KPI Catalogue</h1>
          <p className="text-sm text-muted-foreground">
            Every measure the group runs, what makes it breach, and who answers for it.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TIER_ORDER.map((tier) => {
          const active = catalog.filters.tier === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => catalog.updateFilters({ tier: active ? "ALL" : tier })}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                active ? "border-primary/60 bg-primary/5" : "border-border/60 bg-muted/30 hover:bg-muted/50"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{TIER_LABEL[tier] ?? tier}</p>
              <p className="text-xl font-semibold tabular-nums">{formatNumber(catalog.counts[tier] ?? 0, 0)}</p>
            </button>
          );
        })}
      </div>

      <section className={`overflow-hidden rounded-xl border bg-card ${ACCENT.rail}`}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Measures</h2>
            <p className="text-xs text-muted-foreground">
              Judged on the newest recorded month{catalog.period ? ` · ${catalog.period}` : ""}
            </p>
          </div>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {formatNumber(catalog.total, 0)} KPI{catalog.total === 1 ? "" : "s"}
          </span>
        </header>

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

        <div className="hidden min-[1300px]:block">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Measure</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Rule</th>
                <th className="px-4 py-2.5 text-right font-medium">Latest</th>
                <th className="px-4 py-2.5 text-right font-medium">Target</th>
                <th className="px-4 py-2.5 text-right font-medium">Change</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
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
                          <p className="max-w-[240px] truncate font-medium" title={row.kpi.name}>
                            {row.kpi.name}
                          </p>
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
                          <span className="max-w-[190px] truncate" title={row.rule}>
                            {row.rule}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.actualText}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{row.targetText}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.change === null ? "—" : signedMagnitude(row.change, row.kpi.unit, row.kpi.dp)}
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
              No measure matches these filters. Clear one, or change the tier.
            </p>
          ) : null}
        </div>

        <ul className="divide-y divide-border min-[1300px]:hidden">
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
      </section>

      <KpiDetailDialog detail={detail} open={detailOpen} onOpenChange={setDetailOpen} />
      {detailError && detailOpen ? (
        <p className="text-sm text-destructive">{detailError}</p>
      ) : null}
    </div>
  );
}
