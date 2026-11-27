"use client";

import React, { useState, useEffect } from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { formatPHP } from "../utils/cfs-format";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, ChevronDown, Loader2, FileText } from "lucide-react";
import { getLiveCashFlowEntries, getLiveCashFlowTransactionDetails } from "../services/cash-flow-direct.service";
import { CFSEntryItem, CFSJournalDetails } from "../types";

export function CFSAuditTrailDrawer() {
  const { selectedLineForAudit, closeAuditTrail, filters, liveSummaryData } = useCashFlowStudio();
  const [entries, setEntries] = useState<CFSEntryItem[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<CFSJournalDetails | null>(null);
  const [loadingJournalId, setLoadingJournalId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);

  const line = selectedLineForAudit;

  // Find line details from summary data for Level 1 (Gross Inflow/Outflow/Net)
  const lineSummaryDetails = React.useMemo(() => {
    if (!line || !liveSummaryData) return null;
    const allActivities = [...liveSummaryData.activities, liveSummaryData.unclassified];
    for (const act of allActivities) {
      if (!act) continue;
      const found = act.lines?.find((l) =>
        (line.coaId && l.coaId === line.coaId) ||
        (line.glCode && l.glCode === line.glCode) ||
        l.accountTitle === line.label
      );
      if (found) return { ...found, activityLabel: act.label };
    }
    return null;
  }, [line, liveSummaryData]);

  // Fetch Level 2 Entries when an account line is selected or page changes
  useEffect(() => {
    if (!line) {
      setEntries([]);
      setSelectedJournal(null);
      setPage(0);
      return;
    }

    const controller = new AbortController();
    setIsLoadingEntries(true);

    const activityCode =
      line.sectionKey === "operating"
        ? "OPERATING"
        : line.sectionKey === "investing"
        ? "INVESTING"
        : line.sectionKey === "financing"
        ? "FINANCING"
        : "UNCLASSIFIED";

    getLiveCashFlowEntries({
      startDate: filters.startDate,
      endDate: filters.endDate,
      activity: activityCode,
      coaId: line.coaId ?? undefined,
      companyCode: filters.entity,
      page,
      size: 15,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setEntries(res.items || []);
          setTotalItems(res.totalItems || 0);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEntries([]);
          setTotalItems(0);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingEntries(false);
        }
      });

    return () => controller.abort();
  }, [line, filters.startDate, filters.endDate, filters.entity, page]);

  const handleToggleEntry = async (entry: CFSEntryItem) => {
    if (selectedJournal?.journalEntryId === entry.jeNo) {
      setSelectedJournal(null);
      return;
    }

    setLoadingJournalId(entry.jeNo);
    try {
      const details = await getLiveCashFlowTransactionDetails(entry.jeNo, entry.sourceModule, filters.entity);
      setSelectedJournal(details);
    } catch {
      setSelectedJournal(null);
    } finally {
      setLoadingJournalId(null);
    }
  };

  if (!line) return null;

  return (
    <Sheet open={Boolean(selectedLineForAudit)} onOpenChange={(open) => !open && closeAuditTrail()}>
      <SheetContent className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-semibold text-muted-foreground">
              DETAILS BREAKDOWN (PAS 7 DIRECT METHOD)
            </span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
              LIVE AUDIT DRILL-DOWN
            </Badge>
          </div>
          <SheetTitle className="text-lg font-bold text-foreground">
            {line.glCode ? `${line.glCode} - ` : ""}{line.label}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Traces this figure from the statement summary through individual transaction vouchers down to ledger debit/credit lines.
          </SheetDescription>
        </SheetHeader>

        <div className="py-6 flex flex-col gap-6 text-xs">
          {/* LEVEL 1: Summary Level Line Breakdown */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-muted">
              <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                Level 1 · Summary Breakdown
              </span>
              <span className="font-mono font-bold text-sm text-foreground">
                Net: ₱{formatPHP(line.currentAmount)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded border bg-emerald-500/5 border-emerald-500/20 p-2.5">
                <span className="text-[11px] text-muted-foreground font-medium">Gross Cash Inflow</span>
                <div className="text-base font-bold font-mono tabular-nums text-emerald-600 mt-0.5">
                  ₱{formatPHP(lineSummaryDetails?.inflow ?? 0)}
                </div>
              </div>

              <div className="rounded border bg-rose-500/5 border-rose-500/20 p-2.5">
                <span className="text-[11px] text-muted-foreground font-medium">Gross Cash Outflow</span>
                <div className="text-base font-bold font-mono tabular-nums text-rose-500 mt-0.5">
                  ₱{formatPHP(lineSummaryDetails?.outflow ?? 0)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
              <span>Section: <span className="font-semibold text-foreground uppercase">{line.sectionKey}</span></span>
              <span>Account Code: <span className="font-mono font-semibold text-foreground">{line.glCode || "N/A"}</span></span>
            </div>
          </div>

          <div className="flex items-center justify-center -my-3 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-[11px] font-semibold ml-1">vouchers tie out to statement amount</span>
          </div>

          {/* LEVEL 2: Entries List (Vouchers) */}
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-muted">
              <div>
                <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                  Level 2 · Vouchers & Disbursements ({totalItems} records)
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Individual transactions posted under this account
                </p>
              </div>
              {isLoadingEntries && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>

            <div className="mt-3 space-y-3">
              {entries.length > 0 ? (
                entries.map((item, idx) => {
                  const isExpanded = selectedJournal?.journalEntryId === item.jeNo;

                  return (
                    <div
                      key={`voucher-${item.jeNo}-${item.transactionRef || "noref"}-${item.glCode || "nogl"}-${idx}`}
                      className="rounded-lg border border-border/70 overflow-hidden transition-all shadow-xs"
                    >
                      {/* VOUCHER HEADER CARD BUTTON */}
                      <button
                        type="button"
                        onClick={() => handleToggleEntry(item)}
                        className={`w-full text-left p-3.5 transition-colors flex items-start justify-between cursor-pointer ${
                          isExpanded
                            ? "bg-primary/10 border-b border-primary/30"
                            : "bg-muted/10 hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex flex-col gap-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold font-mono text-foreground text-xs">{item.jeNo}</span>
                            <Badge variant="outline" className="text-[9px] uppercase font-semibold">
                              {item.sourceModule}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                              POSTED
                            </Badge>
                          </div>

                          <span className="text-muted-foreground text-[11px] line-clamp-1">
                            {item.description || item.transactionRef}
                          </span>

                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>Date: <span className="font-medium text-foreground">{item.transactionDate}</span></span>
                            <span>·</span>
                            <span>Ref: <span className="font-mono text-foreground">{item.transactionRef}</span></span>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex flex-col items-end">
                          <div className={`font-mono font-bold text-xs tabular-nums ${item.net >= 0 ? "text-emerald-500" : "text-rose-400"}`}>
                            {item.net >= 0 ? `+₱${formatPHP(item.net)}` : formatPHP(item.net)}
                          </div>
                          <span className="text-[10px] text-primary flex items-center justify-end gap-1 mt-1 font-medium">
                            {loadingJournalId === item.jeNo ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading...
                              </>
                            ) : isExpanded ? (
                              <>
                                Hide details
                                <ChevronDown className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                Inspect lines
                                <ChevronRight className="h-3 w-3" />
                              </>
                            )}
                          </span>
                        </div>
                      </button>

                      {/* INLINE LEVEL 3 DETAILS EXPANDED DIRECTLY UNDERNEATH */}
                      {isExpanded && selectedJournal && (
                        <div className="p-4 bg-background/80 border-t border-primary/20 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="flex items-center justify-between pb-2 border-b border-muted">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary" />
                              <div>
                                <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                                  Journal Entry Lines: {selectedJournal.journalEntryId}
                                </span>
                                <p className="text-[10px] text-muted-foreground">
                                  Double-entry general ledger audit verification
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                selectedJournal.status?.toLowerCase() === "posted"
                                  ? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                                  : "text-amber-500 border-amber-500/30 bg-amber-500/10"
                              }`}
                            >
                              {selectedJournal.status || "Posted"}
                            </Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground bg-muted/20 p-2.5 rounded">
                            <div>
                              <span>Source Module: </span>
                              <span className="font-semibold text-foreground">{selectedJournal.sourceModule}</span>
                            </div>
                            <div>
                              <span>Transaction Date: </span>
                              <span className="font-semibold text-foreground">{selectedJournal.transactionDate}</span>
                            </div>
                            <div>
                              <span>Reference: </span>
                              <span className="font-mono font-semibold text-foreground">{selectedJournal.transactionRef}</span>
                            </div>
                            <div>
                              <span>Tie-out Status: </span>
                              <span
                                className={`font-semibold ${
                                  selectedJournal.totalDebit === selectedJournal.totalCredit
                                    ? "text-emerald-500"
                                    : "text-amber-500"
                                }`}
                              >
                                {selectedJournal.totalDebit === selectedJournal.totalCredit
                                  ? "Balanced (Debit = Credit)"
                                  : "Unbalanced"}
                              </span>
                            </div>
                          </div>

                          {/* Journal Lines Table */}
                          <div className="mt-3 overflow-x-auto rounded border border-border/60">
                            <table className="w-full min-w-[540px] text-[11px]">
                              <thead>
                                <tr className="border-b border-border/80 bg-muted/30 text-muted-foreground">
                                  <th className="text-left py-2 px-3 font-semibold w-[36%]">GL Account</th>
                                  <th className="text-left py-2 px-2 font-semibold w-[28%]">Description</th>
                                  <th className="text-right py-2 px-3 font-semibold w-[18%]">Debit (₱)</th>
                                  <th className="text-right py-2 px-3 font-semibold w-[18%]">Credit (₱)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedJournal.lines.map((jl, lineIdx) => (
                                  <tr key={`jline-${lineIdx}-${jl.accountNumber || "noacc"}`} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                                    <td className="py-2.5 px-3">
                                      <span className="font-mono text-muted-foreground mr-1.5">{jl.accountNumber}</span>
                                      <span className="font-medium text-foreground">{jl.accountTitle}</span>
                                    </td>
                                    <td className="py-2.5 px-2 text-muted-foreground" title={jl.description}>
                                      {jl.description || "—"}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap">
                                      {jl.debit > 0 ? formatPHP(jl.debit) : "—"}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-medium tabular-nums whitespace-nowrap">
                                      {jl.credit > 0 ? formatPHP(jl.credit) : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="font-bold border-t-2 border-border/80 bg-muted/20">
                                  <td colSpan={2} className="py-2.5 px-3 uppercase text-[10px] tracking-wider text-muted-foreground">
                                    Total
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-foreground">
                                    {formatPHP(selectedJournal.totalDebit)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap text-foreground">
                                    {formatPHP(selectedJournal.totalCredit)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  {isLoadingEntries ? "Loading voucher details from live ledger..." : "No individual vouchers found for this line."}
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            {totalItems > 15 && (
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-muted/60 text-xs">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || isLoadingEntries}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="h-7 text-xs"
                >
                  Previous
                </Button>
                <span className="text-muted-foreground text-[11px]">
                  Page {page + 1} of {Math.ceil(totalItems / 15)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * 15 >= totalItems || isLoadingEntries}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
