"use client";

import React, { useState } from "react";
import { useCashFlowStudio } from "../../../providers/CashFlowStudioProvider";
import { CFSStatementLine } from "../../../types";
import { formatPHP, formatPercent } from "../../../utils/cfs-format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, FileSpreadsheet, Printer, Copy, Check, FileDown } from "lucide-react";
import * as XLSX from "xlsx";

export function CFSStatementTable() {
  const {
    data,
    filters,
    setShowChangeColumns,
    openAuditTrail,
  } = useCashFlowStudio();

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [copiedExcel, setCopiedExcel] = useState(false);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => setCollapsedSections({});
  const collapseAll = () => {
    setCollapsedSections({
      operating: true,
      investing: true,
      financing: true,
      unclassified: true,
    });
  };

  const handleCopyExcel = () => {
    setCopiedExcel(true);
    setTimeout(() => setCopiedExcel(false), 2000);
  };

  const isComparisonOn = filters.compare;
  const showChangeCols = isComparisonOn && filters.showChangeColumns;

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    const rows = data.statementLines.map((l) => ({
      "Particulars / Statement Line": l.label,
      [filters.periodLabel]: l.currentAmount ?? 0,
      ...(isComparisonOn ? { [filters.comparePeriodLabel]: l.comparisonAmount ?? 0 } : {}),
      ...(showChangeCols ? { "Change (PHP)": l.changeAmount ?? 0, "Change (%)": l.changePercent ? `${l.changePercent.toFixed(1)}%` : "0%" } : {}),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Statement of Cash Flows");
    XLSX.writeFile(wb, `Cash_Flow_Statement_${filters.startDate}_to_${filters.endDate}.xlsx`);
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      "Particulars",
      filters.periodLabel,
      ...(isComparisonOn ? [filters.comparePeriodLabel] : []),
      ...(showChangeCols ? ["Change (PHP)", "Change (%)"] : []),
    ];

    const lines = [
      headers.join(","),
      ...data.statementLines.map((l) => {
        const row = [
          `"${l.label.replace(/"/g, '""')}"`,
          l.currentAmount ?? 0,
          ...(isComparisonOn ? [l.comparisonAmount ?? 0] : []),
          ...(showChangeCols ? [l.changeAmount ?? 0, l.changePercent ? `${l.changePercent.toFixed(1)}%` : "0%"] : []),
        ];
        return row.join(",");
      }),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Cash_Flow_Statement_${filters.startDate}_to_${filters.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── PRINT ONLY FORMAL HEADER (Philippine Standard) ── */}
      <div className="hidden print:block border-b-2 border-black pb-4 mb-4 text-black text-center">
        <div className="text-sm font-bold uppercase tracking-wider text-black">
          {data.entity.name}
        </div>
        <h1 className="text-xl font-black uppercase tracking-tight text-black mt-1">
          {filters.viewBy === "Annually" ? "STATEMENT OF CASH FLOWS" : "INTERIM STATEMENT OF CASH FLOWS"}
        </h1>
        {filters.viewBy !== "Annually" && (
          <div className="text-xs font-semibold italic text-neutral-800 mt-0.5">(Unaudited)</div>
        )}
        <div className="text-xs font-medium text-black mt-1">
          For the period {filters.startDate} to {filters.endDate}
        </div>
        <div className="text-[11px] font-medium text-neutral-800 mt-0.5">
          (Amounts in Philippine Pesos)
        </div>
      </div>

      {/* Top Statement Controls Banner (Hidden on print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">Statement of cash flows</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Amounts in Philippine Peso (₱)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={expandAll}
            className="h-8 text-xs font-medium"
          >
            Expand all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={collapseAll}
            className="h-8 text-xs font-medium"
          >
            Collapse all
          </Button>
        </div>
      </div>

      {/* Action Bar (Replaced Finalise with direct exports and live metadata) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-4 py-3 print:hidden">
        <div className="text-xs text-muted-foreground">
          Reflects live posted ledger figures for period <span className="font-semibold text-foreground">{filters.startDate} to {filters.endDate}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium gap-1.5"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Excel (.xlsx)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium gap-1.5"
            onClick={handleExportCsv}
          >
            <FileDown className="h-3.5 w-3.5 text-blue-600" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium gap-1.5"
            onClick={() => window.print()}
          >
            <Printer className="h-3.5 w-3.5" />
            PDF / Print
          </Button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-xl border bg-card p-6 shadow-sm overflow-hidden print:border-none print:p-0 print:shadow-none">
        {/* Screen Title (Hidden on print) */}
        <div className="flex flex-col items-center justify-center text-center pb-6 border-b border-muted print:hidden">
          <h2 className="text-base font-bold uppercase tracking-tight text-foreground">
            {data.entity.name}
          </h2>
          <h3 className="text-sm font-semibold tracking-wide text-foreground mt-0.5">
            Statement of Cash Flows (PAS 7 Direct Method)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            For the period {filters.startDate} to {filters.endDate} · in Philippine pesos
          </p>
        </div>

        {/* Dynamic Data Table with Conditional Comparison Columns */}
        <div className="overflow-x-auto mt-4">
          <Table className="print:text-black">
            <TableHeader>
              <TableRow className="border-b border-border/80 hover:bg-transparent print:border-black">
                <TableHead className="w-[50%] min-w-[320px] text-xs font-bold uppercase text-muted-foreground print:text-black">
                  Particulars / Account Title
                </TableHead>

                {/* CURRENT PERIOD COLUMN (ALWAYS VISIBLE) */}
                <TableHead className="text-right text-xs font-bold uppercase text-foreground print:text-black">
                  {filters.periodLabel}
                </TableHead>

                {/* CONDITIONAL COMPARISON PERIOD COLUMN */}
                {isComparisonOn && (
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground print:text-black animate-in fade-in duration-200">
                    {filters.comparePeriodLabel}
                  </TableHead>
                )}

                {/* CONDITIONAL CHANGE AMOUNT COLUMN */}
                {showChangeCols && (
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground print:text-black animate-in fade-in duration-200">
                    Change (₱)
                  </TableHead>
                )}

                {/* CONDITIONAL CHANGE PERCENT COLUMN */}
                {showChangeCols && (
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground print:text-black animate-in fade-in duration-200">
                    Change (%)
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {data.statementLines.map((line) => {
                const isSecHeader = line.type === "section_header";
                const isSubtotal = line.type === "subtotal";
                const isTotal = line.type === "total";
                const secKey = line.sectionKey || "";

                if (
                  line.sectionKey &&
                  collapsedSections[line.sectionKey] &&
                  !isSecHeader &&
                  !isTotal
                ) {
                  return null;
                }

                if (isSecHeader) {
                  const isCollapsed = collapsedSections[secKey];
                  return (
                    <TableRow
                      key={line.id}
                      id={line.id}
                      className="border-t border-muted/80 bg-muted/20 font-bold hover:bg-muted/30 cursor-pointer print:bg-neutral-100 print:border-black"
                      onClick={() => toggleSection(secKey)}
                    >
                      <TableCell colSpan={isComparisonOn ? (showChangeCols ? 5 : 3) : 2} className="py-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="print:hidden">
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </span>
                          <span className="text-foreground tracking-wide print:text-black">{line.label}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow
                    key={line.id}
                    id={line.id}
                    onClick={() => line.hasAuditTrail && openAuditTrail(line)}
                    className={`border-b border-border/40 text-xs transition-colors print:border-neutral-300 ${line.hasAuditTrail ? "cursor-pointer hover:bg-muted/40 print:cursor-default" : "hover:bg-transparent"
                      } ${isTotal ? "font-bold bg-muted/10 border-t-2 border-b-2 border-border print:border-black print:bg-neutral-50" : ""} ${isSubtotal ? "font-semibold bg-muted/5 border-t border-b border-border/80 print:border-black" : ""
                      }`}
                  >
                    {/* Line Description */}
                    <TableCell
                      className={`py-2 ${line.indent === 1 ? "pl-6" : line.indent === 2 ? "pl-10" : "pl-2"
                        }`}
                    >
                      <span className={line.isBold ? "font-bold text-foreground print:text-black" : "text-foreground print:text-black"}>
                        {line.glCode ? `${line.glCode} - ` : ""}
                        {line.label}
                      </span>
                    </TableCell>

                    {/* Current Period Amount */}
                    <TableCell className="py-2 text-right font-mono font-medium print:text-black">
                      {formatPHP(line.currentAmount)}
                    </TableCell>

                    {/* Conditional Comparison Amount */}
                    {isComparisonOn && (
                      <TableCell className="py-2 text-right font-mono text-muted-foreground print:text-black">
                        {formatPHP(line.comparisonAmount)}
                      </TableCell>
                    )}

                    {/* Conditional Change Amount */}
                    {showChangeCols && (
                      <TableCell className="py-2 text-right font-mono text-muted-foreground print:text-black">
                        {formatPHP(line.changeAmount)}
                      </TableCell>
                    )}

                    {/* Conditional Change Percentage */}
                    {showChangeCols && (
                      <TableCell className="py-2 text-right font-mono text-muted-foreground print:text-black">
                        {formatPercent(line.changePercent)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Change Columns Toggle & Export Links (Hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-4 border-t border-muted print:hidden">
          <div className="flex items-center gap-4">
            {isComparisonOn && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-change-cols"
                  checked={filters.showChangeColumns}
                  onCheckedChange={(checked) => setShowChangeColumns(Boolean(checked))}
                />
                <Label htmlFor="show-change-cols" className="text-xs font-semibold cursor-pointer">
                  Show change columns
                </Label>
              </div>
            )}
            <span className="text-xs text-muted-foreground italic">
              Click any line for its full audit trail and voucher drill-down
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyExcel}
              className="h-8 text-xs font-medium gap-1.5"
            >
              {copiedExcel ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedExcel ? "Copied!" : "Copy for Excel"}
            </Button>
          </div>
        </div>

        {/* ── PRINT ONLY CORPORATE GOVERNANCE SIGNATURE BLOCK ── */}
        <div className="hidden print:grid grid-cols-2 gap-12 mt-16 pt-6 text-black text-xs">
          <div className="border-t border-black pt-2">
            <div className="font-bold uppercase">Prepared by:</div>
            <div className="text-neutral-700 mt-6">Accounting & Treasury Specialist</div>
          </div>
          <div className="border-t border-black pt-2">
            <div className="font-bold uppercase">Approved by:</div>
            <div className="text-neutral-700 mt-6">Chief Financial Officer / Controller</div>
          </div>
        </div>
      </div>
    </div>
  );
}
