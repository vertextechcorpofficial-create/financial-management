"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

import { ACCENT, JOURNAL_PAGE_SIZE, JOURNAL_PAGE_SIZE_STORAGE_KEY } from "../constants";
import { filtersAreActive, useEntries, type JournalFilters } from "../hooks/useJournal";
import type { EntryRow } from "../types";
import { EntriesTable } from "./EntriesTable";
import { EntryLinesDialog } from "./EntryLinesDialog";
import { JournalFilters as JournalFilterBand } from "./JournalFilters";
import { TablePager, pageCountFor, usePageSize } from "./TablePager";

interface Props {
  filters: JournalFilters;
  onChange: (patch: Partial<JournalFilters>) => void;
  onClear: () => void;
  /** The page lives above this tab so a filter change can reset it without an effect. */
  page: number;
  onPageChange: (page: number) => void;
}

export function EntriesTab({ filters, onChange, onClear, page, onPageChange }: Props) {
  const [pageSize, setPageSize] = usePageSize(JOURNAL_PAGE_SIZE_STORAGE_KEY, JOURNAL_PAGE_SIZE);
  const [openEntry, setOpenEntry] = useState<EntryRow | null>(null);

  const shared = useMemo(() => ({ page, pageSize, filters }), [page, pageSize, filters]);
  const { payload, isLoading, error } = useEntries(shared);

  const rows = payload?.rows ?? [];
  const total = payload?.total ?? 0;
  const totals = payload?.totals;
  const active = filtersAreActive(filters);
  const pageCount = pageCountFor(total, pageSize);

  return (
    <Card className={`border-t-[3px] ${ACCENT.rail}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Journal entries</h3>
          <p className="text-xs text-muted-foreground">
            Every entry posted against a loan, oldest first, with the lines it was posted from.
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
          {active ? `${formatNumber(total)} matching` : `${formatNumber(total)} ${total === 1 ? "entry" : "entries"}`}
        </span>
      </div>

      <JournalFilterBand
        filters={filters}
        options={payload?.options ?? null}
        onChange={onChange}
        onClear={onClear}
      />

      {error ? <div className="border-b border-border px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <EntriesTable rows={rows} isLoading={isLoading} isFiltered={active} onOpen={setOpenEntry} />

      {totals && total > 0 ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          <span>
            Debit total <span className="ml-1 font-medium tabular-nums text-foreground">{formatNumber(totals.debit, "en-PH", 2)}</span>
          </span>
          <span>
            Credit total <span className="ml-1 font-medium tabular-nums text-foreground">{formatNumber(totals.credit, "en-PH", 2)}</span>
          </span>
          <span>
            Posted <span className="ml-1 font-medium tabular-nums text-foreground">{formatNumber(totals.posted)}</span>
          </span>
          <span>
            Reversed <span className="ml-1 font-medium tabular-nums text-foreground">{formatNumber(totals.reversed)}</span>
          </span>
          {totals.unbalanced > 0 ? (
            <span className="text-destructive">
              {formatNumber(totals.unbalanced)} {totals.unbalanced === 1 ? "entry does" : "entries do"} not balance
            </span>
          ) : (
            <span>Every entry balances</span>
          )}
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
        className="border-t border-border"
      />

      <EntryLinesDialog
        entry={openEntry}
        open={openEntry !== null}
        onOpenChange={(open) => {
          if (!open) setOpenEntry(null);
        }}
      />
    </Card>
  );
}
