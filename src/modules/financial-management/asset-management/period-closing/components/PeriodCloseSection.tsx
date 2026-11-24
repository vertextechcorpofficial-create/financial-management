import React from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "./SearchableSelect";
import type { PeriodCloseData } from "../types";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatYm(ym: string): string {
  if (!ym || !ym.includes("-")) return ym;
  const [y, m] = ym.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[monthIdx] || m} ${y}`;
}

function getPreviousMonth(ym: string): string | null {
  if (!ym || !ym.includes("-")) return null;
  const [yStr, mStr] = ym.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  const res = `${y}-${String(m).padStart(2, "0")}`;
  if (res < "2025-12") return null;
  return res;
}

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  const formatted = absVal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isNegative ? `(${formatted})` : formatted;
};

interface PeriodCloseSectionProps {
  data: PeriodCloseData;
  selectedCloseTarget: string;
  onSelectCloseTarget: (target: string) => void;
  selectedPostingYm: string;
  selectedReopenYm: string;
  onSelectReopenYm: (ym: string) => void;
  onSelectMonth: (ym: string) => void;
  reopenReason: string;
  onReopenReasonChange: (reason: string) => void;
  yearEndConfirmed: boolean;
  onYearEndConfirmedChange: (confirmed: boolean) => void;
  isSubmitting: boolean;
  onClose: () => Promise<void>;
  onReopen: () => Promise<void>;
}

export default function PeriodCloseSection({
  data,
  selectedCloseTarget,
  onSelectCloseTarget,
  selectedPostingYm,
  selectedReopenYm,
  onSelectReopenYm,
  onSelectMonth,
  reopenReason,
  onReopenReasonChange,
  yearEndConfirmed,
  onYearEndConfirmedChange,
  isSubmitting,
  onClose,
  onReopen,
}: PeriodCloseSectionProps) {
  const currentMonth = data.months.find((m) => m.status === "Current") || data.months[0];
  const targetLabel =
    data.closeOptions.find((o) => o.value === selectedCloseTarget)?.label || selectedCloseTarget;

  // Options for closed months that can be reopened
  const closedMonths = data.months.filter((m) => m.status === "Closed");
  const closedMonthsOptions = closedMonths.map((m) => ({
    label: m.label,
    value: m.ym,
  }));

  const activeReopenYm =
    selectedReopenYm || (closedMonths.length > 0 ? closedMonths[0].ym : data.closedThrough || "");
  const targetReopenMonth = data.months.find((m) => m.ym === activeReopenYm);
  const reopenLabel = targetReopenMonth?.label || (activeReopenYm ? formatYm(activeReopenYm) : data.closedThroughLabel);
  const prevYm = activeReopenYm ? getPreviousMonth(activeReopenYm) : null;
  const prevMonthLabel = prevYm ? formatYm(prevYm) : "no closed periods";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Close Period Card */}
      <div className="lg:col-span-5 bg-card border rounded-xl p-5 shadow-2xs space-y-5">
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase block">
          CLOSE PERIOD
        </span>

        {/* When there are periods to close */}
        {data.targetToClose ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground font-medium shrink-0">Close through</span>
              <div className="w-36">
                <SearchableSelect
                  options={data.closeOptions}
                  value={selectedCloseTarget}
                  onChange={onSelectCloseTarget}
                  placeholder="Select month..."
                  searchPlaceholder="Search month..."
                  className="h-8"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Checklist items */}
            <ul className="space-y-2 text-xs pt-1">
              {data.checks.map((chk, idx) => (
                <li
                  key={idx}
                  className={`flex items-start gap-2 ${
                    chk.ok
                      ? "text-emerald-700 dark:text-emerald-400"
                      : chk.isSoftWarning
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-destructive font-medium"
                  }`}
                >
                  <span className="shrink-0 font-bold">
                    {chk.ok ? "✓" : chk.isSoftWarning ? "!" : "✕"}
                  </span>
                  <span>{chk.text}</span>
                </li>
              ))}
            </ul>

            {/* Year-End confirmation checkbox if applicable */}
            {data.isYearEnd && (
              <div className="flex items-start gap-2 pt-2 border-t text-xs">
                <Checkbox
                  id="yearEndConfirm"
                  checked={yearEndConfirmed}
                  onCheckedChange={(c) => onYearEndConfirmedChange(!!c)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="yearEndConfirm"
                  className="text-[11px] text-muted-foreground cursor-pointer leading-tight select-none"
                >
                  Year-end: I confirm useful lives, residual values and depreciation methods were
                  reviewed (PAS 16.51, 16.61) and impairment indicators assessed (IAS 36.9).
                </label>
              </div>
            )}

            {/* Action button */}
            <Button
              onClick={onClose}
              disabled={isSubmitting || !data.canClose || (data.isYearEnd && !yearEndConfirmed)}
              className="w-full sm:w-auto px-5 h-8 text-xs bg-[#1b4332] hover:bg-[#143326] text-white font-medium shadow-2xs"
            >
              Close through {targetLabel}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing to close: every month that has ended by the reporting date ({data.reportingDate})
            is closed. {currentMonth?.label || "Current month"} can be closed once it ends.
          </p>
        )}

        {/* Reopen section if there is at least one closed period */}
        {data.closedThrough && (
          <div className="pt-4 border-t space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-foreground">
                Reopen {reopenLabel}
              </h4>
              {closedMonthsOptions.length > 1 && (
                <div className="w-32">
                  <SearchableSelect
                    options={closedMonthsOptions}
                    value={activeReopenYm}
                    onChange={onSelectReopenYm}
                    placeholder="Select month..."
                    searchPlaceholder="Search..."
                    className="h-7 text-xs"
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Admin only. Reopens {reopenLabel} and rolls back closed periods to {prevMonthLabel}. The reason is logged.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="Reason for reopening (required)"
                value={reopenReason}
                onChange={(e) => onReopenReasonChange(e.target.value)}
                disabled={isSubmitting}
                className="h-8 text-xs bg-background flex-1"
              />
              <Button
                variant="outline"
                onClick={onReopen}
                disabled={isSubmitting || !reopenReason.trim()}
                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 shrink-0"
              >
                Reopen
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Months Summary Table */}
      <div className="lg:col-span-7 bg-card border rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b font-semibold text-muted-foreground bg-muted/40 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Month</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Depreciation</th>
                <th className="py-3 px-4 text-right">Impairment (Net)</th>
                <th className="py-3 px-4 text-right">Disposal Gain/(Loss)</th>
                <th className="py-3 px-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.months.map((m) => {
                const isSelected = m.ym === selectedPostingYm;

                return (
                  <tr
                    key={m.ym}
                    onClick={() => onSelectMonth(m.ym)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "bg-muted/50 font-medium" : "hover:bg-muted/20"
                    }`}
                  >
                    <td className="py-3 px-4 text-foreground font-medium">
                      {m.label}
                    </td>
                    <td className="py-3 px-3">
                      {m.status === "Closed" ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fef08a] text-[#854d0e] border border-[#fef08a]">
                            <Lock className="h-2.5 w-2.5" /> Closed
                          </span>
                          {m.closedBy && (
                            <span className="block text-[10px] text-muted-foreground mt-0.5 font-mono">
                              {m.closedBy}
                            </span>
                          )}
                        </div>
                      ) : m.status === "Current" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          Current
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                          Open
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-foreground">
                      {formatCurrency(m.depreciation)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-foreground">
                      {formatCurrency(m.impairmentNet)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-foreground">
                      {formatCurrency(m.disposalGainLoss)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMonth(m.ym);
                        }}
                        className={`text-xs hover:underline ${
                          isSelected
                            ? "font-bold text-emerald-800 dark:text-emerald-400"
                            : "text-blue-600 hover:text-blue-800"
                        }`}
                      >
                        Posting
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
