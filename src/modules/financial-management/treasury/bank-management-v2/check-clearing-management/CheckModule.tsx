"use client";

import { useState } from "react";
import { Ban, CheckCheck, FileClock, LoaderCircle, Plus, Undo2 , ScrollText} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { cn, formatNumber } from "@/lib/utils";

import { accentClass, toneClass } from "./constants";
import { BatchActionDialog, type BatchMode } from "./components/BatchActionDialog";
import { CheckActionDialog } from "./components/CheckActionDialog";
import { CheckFlow } from "./components/CheckFlow";
import { CheckFilters } from "./components/CheckFilters";
import { CheckbookDialog } from "./components/CheckbookDialog";
import { ChecksTable, type CheckAction } from "./components/ChecksTable";
import { NewCheckDialog } from "./components/NewCheckDialog";
import { useChecks } from "./hooks/useChecks";
import type { BankCheck } from "./types";

/** Check & Clearing Management (FSD 1.4): register, status tiles and every check action. */
export function CheckModule() {
  const {
    checks,
    counts,
    accounts,
    notice,
    filters,
    setFilters,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    isLoading,
    isSaving,
    error,
    refetch,
    issue,
    receive,
    act,
    bulkClear,
    batchRelease,
    batchDeposit,
    addSeries,
    loadSeries,
    loadDetail,
  } = useChecks();
  const [newOpen, setNewOpen] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [activeCheck, setActiveCheck] = useState<BankCheck | null>(null);
  const [activeAction, setActiveAction] = useState<CheckAction | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState<BatchMode | null>(null);

  function handleAction(check: BankCheck, action: CheckAction) {
    // Clearing always needs the statement date, so a single row uses the same dialog
    // the reference uses for both cases.
    if (action === "CLEAR") {
      setSelected(new Set([check.id]));
      setBatchMode("CLEAR");
      return;
    }
    setActiveCheck(check);
    setActiveAction(action);
  }

  function openCheckById(checkId: number) {
    void loadDetail(checkId).then((detail) => {
      if (!detail) return;
      setActiveCheck(detail.check);
      setActiveAction("VIEW");
    });
  }

  const accountOptions = [
    { value: "ALL", label: "All accounts" },
    ...accounts.map((account) => ({ value: String(account.bankId), label: account.label })),
  ];

  const bankOptions = [
    { value: "ALL", label: "All banks" },
    ...[...new Set(accounts.map((account) => account.bankName))].filter(Boolean).map((name) => ({ value: name, label: name })),
  ];

  // Only the selected rows the chosen batch action can actually run on reach the dialog.
  const batchChecks = checks.filter((check) => {
    if (!selected.has(check.id)) return false;
    if (batchMode === "CLEAR") return check.status === "IN_CLEARING";
    if (batchMode === "RELEASE") return check.status === "PENDING" && check.direction === "ISSUED";
    return check.status === "RECEIVED" && !check.isPdc;
  });

  const registerTotal =
    counts.PENDING + counts.RECEIVED + counts.IN_CLEARING + counts.CLEARED + counts.RETURNED + counts.CANCELLED;
  const isFiltered =
    Boolean(filters.q) ||
    (filters.direction ?? "ALL") !== "ALL" ||
    (filters.status ?? "ALL") !== "ALL" ||
    (filters.flag ?? "ALL") !== "ALL" ||
    filters.accountId !== undefined ||
    filters.bank !== undefined ||
    filters.from !== undefined ||
    filters.to !== undefined;

  const tiles = [
    {
      key: "OPEN",
      label: "Pending / received",
      count: counts.PENDING + counts.RECEIVED,
      icon: FileClock,
      tone: "info" as const,
    },
    { key: "IN_CLEARING", label: "In clearing", count: counts.IN_CLEARING, icon: LoaderCircle, tone: "warning" as const },
    { key: "CLEARED", label: "Cleared", count: counts.CLEARED, icon: CheckCheck, tone: "success" as const },
    { key: "RETURNED", label: "Returned", count: counts.RETURNED, icon: Undo2, tone: "danger" as const },
    { key: "CANCELLED", label: "Cancelled", count: counts.CANCELLED, icon: Ban, tone: "neutral" as const },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <ScrollText className="size-5" />
            </div>
            <h1 className="text-xl font-semibold sm:text-2xl">Check &amp; Clearing Management</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Track issued and received checks from release to clearing, returns and replacements.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setSeriesOpen(true)}>
            Checkbook series
          </Button>
          <Button onClick={() => setNewOpen(true)} disabled={accounts.length === 0}>
            <Plus className="mr-2 h-4 w-4" />
            Add check
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load the register</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-words">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert>
          <AlertTitle>Check register not available yet</AlertTitle>
          <AlertDescription className="break-words">{notice}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {tiles.map((tile) => (
            <Card
              key={tile.key}
              className={cn(
                "overflow-hidden border-border/50 border-l-[3px] bg-gradient-to-br to-transparent shadow-none",
                accentClass(tile.tone),
              )}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tile.label}</p>
                  <span className={cn("shrink-0 rounded-lg border p-1.5", toneClass(tile.tone))} aria-hidden="true">
                    <tile.icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatNumber(tile.count)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Totals cover the whole register, not the filtered view.</p>
      </div>

      <CheckFlow />

      <ChecksTable
        filters={
          <CheckFilters
            accountOptions={accountOptions}
            bankOptions={bankOptions}
            filters={filters}
            onChange={setFilters}
          />
        }
        checks={checks}
        total={total > 0 ? total : registerTotal}
      pageSize={pageSize}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
      }}
        filtered={isFiltered}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
        onAction={handleAction}
        selected={selected}
        onSelectionChange={setSelected}
        onBatchAction={(mode) => setBatchMode(mode)}
      />

      <BatchActionDialog
        mode={batchMode ?? "CLEAR"}
        checks={batchChecks}
        open={batchMode !== null}
        isSaving={isSaving}
        onOpenChange={(open) => {
          if (!open) setBatchMode(null);
        }}
        onSubmit={async (entries) => {
          const result =
            batchMode === "RELEASE"
              ? await batchRelease(entries)
              : batchMode === "DEPOSIT"
                ? await batchDeposit(entries)
                : await bulkClear(entries.map((entry) => ({ checkId: entry.checkId, clearedDate: entry.date })));
          if (result) setSelected(new Set());
          return result;
        }}
      />

      <NewCheckDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        accounts={accounts}
        isSaving={isSaving}
        onIssue={issue}
        onReceive={receive}
      />

      <CheckbookDialog
        open={seriesOpen}
        onOpenChange={setSeriesOpen}
        accounts={accounts}
        isSaving={isSaving}
        loadSeries={loadSeries}
        onRegister={addSeries}
      />

      <CheckActionDialog
        check={activeCheck}
        action={activeAction}
        open={activeCheck !== null && activeAction !== null}
        isSaving={isSaving}
        onOpenChange={(open) => {
          if (!open) {
            setActiveCheck(null);
            setActiveAction(null);
          }
        }}
        onSubmit={act}
        loadDetail={loadDetail}
        onSelectAction={setActiveAction}
        onOpenCheck={openCheckById}
      />
    </div>
  );
}
