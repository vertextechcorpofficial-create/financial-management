"use client";

import { useCallback, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { EMPTY_FILTERS, type JournalFilters } from "../hooks/useJournal";
import { EntriesTab } from "./EntriesTab";
import { SummaryTab } from "./SummaryTab";

type View = "entries" | "summary";

export function JournalModule() {
  // One filter set for both views: the ledger and the roll-up must describe the same entries.
  const [filters, setFilters] = useState<JournalFilters>(EMPTY_FILTERS);
  const [pages, setPages] = useState<Record<View, number>>({ entries: 1, summary: 1 });

  const onChange = useCallback((patch: Partial<JournalFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    // A narrower filter set can leave page 4 of nothing on screen.
    setPages({ entries: 1, summary: 1 });
  }, []);

  const onClear = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPages({ entries: 1, summary: 1 });
  }, []);

  const setPage = useCallback((view: View) => (page: number) => {
    setPages((current) => ({ ...current, [view]: page }));
  }, []);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Loan Journal</h1>
        <p className="text-sm text-muted-foreground">
          Every entry the loan desk has posted, with the lines behind it and the account they land on.
        </p>
      </header>

      <Tabs defaultValue="entries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="entries" className="min-h-11 md:min-h-0">
            Entries
          </TabsTrigger>
          <TabsTrigger value="summary" className="min-h-11 md:min-h-0">
            Summary by account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
          <EntriesTab
            filters={filters}
            onChange={onChange}
            onClear={onClear}
            page={pages.entries}
            onPageChange={setPage("entries")}
          />
        </TabsContent>

        <TabsContent value="summary">
          <SummaryTab
            filters={filters}
            onChange={onChange}
            onClear={onClear}
            page={pages.summary}
            onPageChange={setPage("summary")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default JournalModule;
