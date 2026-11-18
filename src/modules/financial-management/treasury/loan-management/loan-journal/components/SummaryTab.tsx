"use client";

import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

import { ACCENT, JOURNAL_PAGE_SIZE, JOURNAL_PAGE_SIZE_STORAGE_KEY } from "../constants";
import { filtersAreActive, useSummary, type JournalFilters } from "../hooks/useJournal";
import { money } from "../money";
import { JournalFilters as JournalFilterBand } from "./JournalFilters";
import { SummaryTable } from "./SummaryTable";
import { TablePager, pageCountFor, usePageSize } from "./TablePager";

interface Props {
  filters: JournalFilters;
  onChange: (patch: Partial<JournalFilters>) => void;
  onClear: () => void;
  /** The page lives above this tab so a filter change can reset it without an effect. */
  page: number;
  onPageChange: (page: number) => void;
}

export function SummaryTab({ filters, onChange, onClear, page, onPageChange }: Props) {
  const [pageSize, setPageSize] = usePageSize(JOURNAL_PAGE_SIZE_STORAGE_KEY, JOURNAL_PAGE_SIZE);

  const shared = useMemo(() => ({ page, pageSize, filters }), [page, pageSize, filters]);
  const { payload, isLoading, error } = useSummary(shared);

  const rows = payload?.rows ?? [];
  const total = payload?.total ?? 0;
  const totals = payload?.totals;
  const active = filtersAreActive(filters);
  const pageCount = pageCountFor(total, pageSize);

  return (
    <Card className={`border-t-[3px] ${ACCENT.rail}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Summary by account</h3>
          <p className="text-xs text-muted-foreground">
            The same entries, totalled per GL account. A positive net is a debit balance.
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
          {active ? `${formatNumber(total)} matching` : `${formatNumber(total)} ${total === 1 ? "account" : "accounts"}`}
        </span>
      </div>

      <JournalFilterBand
        filters={filters}
        options={payload?.options ?? null}
        onChange={onChange}
        onClear={onClear}
      />

      {error ? <div className="border-b border-border px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <SummaryTable rows={rows} isLoading={isLoading} isFiltered={active} />

      {totals && total > 0 ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          <span>
            Debit <span className="ml-1 font-medium tabular-nums text-foreground">{money(totals.debit)}</span>
          </span>
          <span>
            Credit <span className="ml-1 font-medium tabular-nums text-foreground">{money(totals.credit)}</span>
          </span>
          <span>
            Net <span className="ml-1 font-medium tabular-nums text-foreground">{money(totals.net)}</span>
          </span>
          <span>
            {formatNumber(totals.lines)} {totals.lines === 1 ? "line" : "lines"} across {formatNumber(totals.accounts)}{" "}
            {totals.accounts === 1 ? "account" : "accounts"}
          </span>
        </div>
      ) : null}

      <TablePager
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={(size) => {
          setPageSize(size);
          onPageChange(1);
        }}
        allowAll={false}
        isLoading={isLoading}
        className="border-t border-border/50 px-4 py-3"
      />
    </Card>
  );
}
