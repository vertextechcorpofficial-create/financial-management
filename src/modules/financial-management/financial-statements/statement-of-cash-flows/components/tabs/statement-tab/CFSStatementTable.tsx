"use client";

import React, { useState } from "react";
import { useCashFlowStudio } from "../../../providers/CashFlowStudioProvider";
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
import { ChevronDown, ChevronRight, FileSpreadsheet, Copy, Check } from "lucide-react";
import { CFSConsolidationWorksheet } from "./CFSConsolidationWorksheet";
import { CFSPolicyNote } from "./CFSPolicyNote";

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
    });
  };

  const handleCopyExcel = () => {
    setCopiedExcel(true);
    setTimeout(() => setCopiedExcel(false), 2000);
  };

  const isComparisonOn = filters.compare;
  const showChangeCols = isComparisonOn && filters.showChangeColumns;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Statement Controls Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
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

      {/* DRAFT Watermark Alert & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-amber-500">DRAFT</span>
          <span className="text-muted-foreground">
            Not finalised. Figures update whenever the system data changes.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
            onClick={() => alert("Finalise dialog opens with approver sign-off.")}
          >
            Finalise...
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => alert("Downloading Statement Excel...")}
          >
            Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => window.print()}
          >
            PDF / Print
          </Button>
        </div>
      </div>

      {/* Main Printed Formal Heading Container */}
      <div className="rounded-xl border bg-card p-6 shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center text-center pb-6 border-b border-muted">
          <h2 className="text-base font-bold uppercase tracking-tight text-foreground">
            {data.entity.name}
          </h2>
          <h3 className="text-sm font-semibold tracking-wide text-foreground mt-0.5">
            Statement of Cash Flows
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            For the ten months ended 31 October 2026 · PFRS (PAS 7) · in Philippine pesos
          </p>
        </div>

        {/* Dynamic Data Table with Conditional Comparison Columns */}
        <div className="overflow-x-auto mt-4">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/80 hover:bg-transparent">
                <TableHead className="w-[50%] min-w-[320px] text-xs font-bold uppercase text-muted-foreground">
                  Particulars
                </TableHead>

                {/* CURRENT PERIOD COLUMN (ALWAYS VISIBLE) */}
                <TableHead className="text-right text-xs font-bold uppercase text-foreground">
                  {filters.periodLabel}
                </TableHead>

                {/* CONDITIONAL COMPARISON PERIOD COLUMN */}
                {isComparisonOn && (
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground animate-in fade-in duration-200">
                    {filters.comparePeriodLabel.replace(/Previous\s\w+\s\((.*)\)/, "$1")}
                  </TableHead>
                )}

                {/* CONDITIONAL CHANGE AMOUNT COLUMN */}
                {showChangeCols && (
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground animate-in fade-in duration-200">
                    Change (₱)
                  </TableHead>
                )}

                {/* CONDITIONAL CHANGE PERCENT COLUMN */}
                {showChangeCols && (
                  <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground animate-in fade-in duration-200">
                    Change (%)
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {data.statementLines.map((line) => {
                const isSecHeader = line.type === "section_header";
                const isSubHeader = line.type === "subsection_header";
                const isSubtotal = line.type === "subtotal";
                const isTotal = line.type === "total";
                const secKey = line.sectionKey || "";

                // Collapse handling
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
                      className="border-t border-muted/80 bg-muted/20 font-bold hover:bg-muted/30 cursor-pointer"
                      onClick={() => toggleSection(secKey)}
                    >
                      <TableCell colSpan={isComparisonOn ? (showChangeCols ? 5 : 3) : 2} className="py-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-foreground tracking-wide">{line.label}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                if (isSubHeader) {
                  return (
                    <TableRow key={line.id} id={line.id} className="border-0 hover:bg-transparent">
                      <TableCell
                        colSpan={isComparisonOn ? (showChangeCols ? 5 : 3) : 2}
                        className="py-1 text-xs italic text-muted-foreground"
                      >
                        {line.label}
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow
                    key={line.id}
                    id={line.id}
                    onClick={() => line.hasAuditTrail && openAuditTrail(line)}
                    className={`border-b border-border/40 text-xs transition-colors ${
                      line.hasAuditTrail ? "cursor-pointer hover:bg-muted/40" : "hover:bg-transparent"
                    } ${isTotal ? "font-bold bg-muted/10 border-t-2 border-b-2 border-border" : ""} ${
                      isSubtotal ? "font-semibold bg-muted/5 border-t border-b border-border/80" : ""
                    }`}
                  >
                    {/* Line Description */}
                    <TableCell
                      className={`py-2 ${
                        line.indent === 1 ? "pl-6" : line.indent === 2 ? "pl-10" : "pl-2"
                      }`}
                    >
                      <span className={line.isBold ? "font-bold text-foreground" : "text-foreground"}>
                        {line.label}
                      </span>
                    </TableCell>

                    {/* Current Period Amount */}
                    <TableCell className="py-2 text-right font-mono font-medium">
                      {formatPHP(line.currentAmount)}
                    </TableCell>

                    {/* Conditional Comparison Amount */}
                    {isComparisonOn && (
                      <TableCell className="py-2 text-right font-mono text-muted-foreground">
                        {formatPHP(line.comparisonAmount)}
                      </TableCell>
                    )}

                    {/* Conditional Change Amount */}
                    {showChangeCols && (
                      <TableCell className="py-2 text-right font-mono text-muted-foreground">
                        {formatPHP(line.changeAmount)}
                      </TableCell>
                    )}

                    {/* Conditional Change Percentage */}
                    {showChangeCols && (
                      <TableCell className="py-2 text-right font-mono text-muted-foreground">
                        {formatPercent(line.changePercent)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Change Columns Toggle & Export Action Links */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-4 border-t border-muted">
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
              Click any line for its full audit trail
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => alert("Exporting 3-sheet audit trail workbook...")}
              className="h-8 text-xs font-medium gap-1.5"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export audit trail
            </Button>
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

        {/* Supplementary Section: Non-cash activities */}
        <div className="mt-8 pt-4 border-t border-muted">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            NON-CASH INVESTING AND FINANCING ACTIVITIES
          </h4>
          <Table>
            <TableBody>
              {data.nonCashLines.map((nc) => (
                <TableRow key={nc.id} className="border-b border-border/40 text-xs hover:bg-transparent">
                  <TableCell className="py-1.5 pl-2">{nc.label}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono font-medium w-[180px]">
                    {formatPHP(nc.currentAmount)}
                  </TableCell>
                  {isComparisonOn && (
                    <TableCell className="py-1.5 text-right font-mono text-muted-foreground w-[180px]">
                      {formatPHP(nc.comparisonAmount)}
                    </TableCell>
                  )}
                  {showChangeCols && (
                    <>
                      <TableCell className="py-1.5 text-right font-mono text-muted-foreground w-[140px]">
                        {formatPHP(nc.changeAmount)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-muted-foreground w-[100px]">
                        {formatPercent(nc.changePercent)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Supplementary Section: Components of Cash and Cash Equivalents */}
        <div className="mt-6 pt-4 border-t border-muted">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            COMPONENTS OF CASH AND CASH EQUIVALENTS (CLOSING BALANCE SHEET)
          </h4>
          <Table>
            <TableBody>
              {data.componentsOfCashLines.map((c) => (
                <TableRow
                  key={c.id}
                  className={`border-b border-border/40 text-xs hover:bg-transparent ${
                    c.isBold ? "font-bold border-t-2 border-b-2 border-border" : ""
                  }`}
                >
                  <TableCell className="py-1.5 pl-2">{c.label}</TableCell>
                  <TableCell className="py-1.5 text-right font-mono font-medium w-[180px]">
                    {c.isBold ? `₱${formatPHP(c.currentAmount)}` : formatPHP(c.currentAmount)}
                  </TableCell>
                  {isComparisonOn && (
                    <TableCell className="py-1.5 text-right font-mono text-muted-foreground w-[180px]">
                      {c.isBold ? `₱${formatPHP(c.comparisonAmount)}` : formatPHP(c.comparisonAmount)}
                    </TableCell>
                  )}
                  {showChangeCols && (
                    <>
                      <TableCell className="py-1.5 text-right font-mono text-muted-foreground w-[140px]">
                        {formatPHP(c.changeAmount)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-muted-foreground w-[100px]">
                        {formatPercent(c.changePercent)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Consolidation Worksheet (Only rendered when Entity is Consolidated Group) */}
      {data.entity.isConsolidated && (
        <CFSConsolidationWorksheet />
      )}

      {/* Generated Accounting Policy Note */}
      <CFSPolicyNote />
    </div>
  );
}
