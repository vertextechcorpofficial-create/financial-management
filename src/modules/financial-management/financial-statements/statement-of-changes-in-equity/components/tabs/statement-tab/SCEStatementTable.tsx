"use client";

import React, { useState } from "react";
import { useStatementOfChangesInEquity } from "../../../hooks/useStatementOfChangesInEquity";
import { EQUITY_COLUMNS } from "../../../constants/components";
import { SCEStatementRow, EquityComponentKey } from "../../../types";
import { formatCurrency } from "../../../utils/format";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown } from "lucide-react";

export function SCEStatementTable() {
  const { data, filters, openCellDrillDown } = useStatementOfChangesInEquity();
  const rows = data?.statementRows || [];
  const accounts = data?.accounts || [];

  // Collapsed group headers state (expanded by default)
  const [collapsedRows, setCollapsedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (id: string) => {
    setCollapsedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => setCollapsedRows({});
  const collapseAll = () => {
    const map: Record<string, boolean> = {
      "group-beg": true,
      "row-ppa": true,
      "group-chg": true,
      "row-profit": true,
      "row-oci": true,
      "group-end": true,
    };
    setCollapsedRows(map);
  };

  // Helper to open cell breakdown
  const handleCellClick = (
    colKey: EquityComponentKey,
    colTitle: string,
    row: SCEStatementRow,
    amount: number
  ) => {
    if (amount === 0) return;

    // Find the equity column configuration
    const colDef = EQUITY_COLUMNS.find((c) => c.key === colKey);
    const targetGlCodes = colDef?.glCodes || [];

    // Determine if this row represents in-period movement vs cumulative balances
    const isMovementRow =
      row.tag === "net_income" ||
      row.tag === "total_changes" ||
      row.tag === "total_comprehensive_income" ||
      row.tag === "share_issuance" ||
      row.tag === "dividends_cash" ||
      row.tag === "dividends_stock" ||
      row.tag === "appropriation_transfer" ||
      row.tag === "treasury_acquisition" ||
      row.tag === "treasury_reissuance" ||
      row.tag === "oci_revaluation" ||
      row.tag === "oci_translation" ||
      row.tag === "oci_fvoci" ||
      row.tag === "prior_period_adjustment";

    // Filter contributing GL accounts
    const contributingAccounts = accounts
      .filter((acc) => {
        if (colKey === "totalEquity") {
          return isMovementRow
            ? acc.netMovement !== 0
            : row.tag === "beginning_balance" || row.tag === "balance_restated"
            ? acc.beginningBalance !== 0
            : acc.endingBalance !== 0;
        }
        return targetGlCodes.includes(acc.glCode);
      })
      .map((acc) => {
        // Calculate appropriate amount depending on row category
        let accAmount = acc.endingBalance;
        if (row.tag === "beginning_balance" || row.tag === "balance_restated") {
          accAmount = acc.beginningBalance;
        } else if (isMovementRow) {
          accAmount = acc.netMovement;
        }

        return {
          glCode: acc.glCode,
          accountTitle: acc.accountTitle,
          category: acc.category,
          amount: accAmount,
        };
      })
      .filter((a) => a.amount !== 0);

    openCellDrillDown({
      columnKey: colKey,
      columnTitle: colTitle,
      rowLabel: row.label,
      totalAmount: amount,
      periodLabel: filters.periodLabel,
      contributingAccounts,
    });
  };

  const renderRow = (row: SCEStatementRow, isChild = false) => {
    const isGroup = row.isGroupHeader;
    const isSubtotal = row.isSubtotal;
    const isEnding = row.isEnding;

    // Filter children to omit nil / 0 lines per spec (Page 11: "nil child lines omitted")
    const visibleChildren = (row.children || []).filter((child) => {
      const hasAnyNonZero =
        child.amounts.shareCapital !== 0 ||
        child.amounts.apic !== 0 ||
        child.amounts.reRetainedEarnings !== 0 ||
        child.amounts.reAppropriated !== 0 ||
        child.amounts.oci !== 0 ||
        child.amounts.treasuryShares !== 0 ||
        child.amounts.totalEquity !== 0;
      return hasAnyNonZero;
    });

    const hasChildren = visibleChildren.length > 0 || (row.hasChildren && visibleChildren.length > 0);
    const isCollapsed = collapsedRows[row.id];

    // Summary / aggregate rows and unclosed child rows do not have drill-down
    const isSummaryRow =
      Boolean(row.isGroupHeader) ||
      Boolean(row.isSubtotal) ||
      Boolean(row.isEnding) ||
      isChild ||
      row.id === "group-beg" ||
      row.id === "row-res" ||
      row.id === "group-chg" ||
      row.id === "row-tci" ||
      row.id === "row-total-changes" ||
      row.id === "group-ending" ||
      row.id === "row-ending-balance" ||
      row.id === "row-rev-unc" ||
      row.id === "row-exp-unc";

    const renderCell = (colKey: EquityComponentKey, colTitle: string, amount: number, isTotalCol = false) => {
      if (isSummaryRow || amount === 0) {
        return (
          <span className={amount !== 0 && isTotalCol ? "font-bold text-foreground" : ""}>
            {formatCurrency(amount)}
          </span>
        );
      }

      return (
        <button
          type="button"
          onClick={() => handleCellClick(colKey, colTitle, row, amount)}
          className="hover:underline text-primary cursor-pointer"
        >
          {formatCurrency(amount)}
        </button>
      );
    };

    return (
      <React.Fragment key={row.id}>
        <tr
          className={`transition-colors hover:bg-muted/30 ${
            isGroup
              ? "bg-muted/20 font-semibold"
              : isSubtotal
              ? "bg-muted/10 font-medium"
              : isEnding
              ? "bg-muted/30 font-bold border-t-2 border-b-2"
              : isChild
              ? "bg-muted/5 text-muted-foreground"
              : ""
          }`}
        >
          {/* Row Label & Chevron */}
          <td
            className={`py-2 px-3 sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r flex items-center gap-1.5 ${
              row.indent === 2 ? "pl-11" : row.indent === 1 ? "pl-7" : ""
            }`}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleRow(row.id)}
                className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-4.5" />
            )}

            <span className="truncate">{row.label}</span>

            {row.itemCount !== undefined && visibleChildren.length > 0 && (
              <span className="text-muted-foreground font-normal text-[11px] ml-0.5">
                ({visibleChildren.length})
              </span>
            )}

            {row.standardRef && (
              <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground shrink-0 font-normal">
                {row.standardRef}
              </span>
            )}
          </td>

          {/* Amounts across 7 columns */}
          <td className="py-2 px-3 text-right font-mono">
            {renderCell("shareCapital", "Share Capital", row.amounts.shareCapital)}
          </td>

          <td className="py-2 px-3 text-right font-mono">
            {renderCell("apic", "Additional Paid-In Capital", row.amounts.apic)}
          </td>

          <td className="py-2 px-3 text-right font-mono">
            {renderCell(
              "reRetainedEarnings",
              "Retained Earnings (Unappropriated)",
              row.amounts.reRetainedEarnings
            )}
          </td>

          <td className="py-2 px-3 text-right font-mono">
            {renderCell(
              "reAppropriated",
              "Retained Earnings (Appropriated)",
              row.amounts.reAppropriated
            )}
          </td>

          <td className="py-2 px-3 text-right font-mono">
            {renderCell("oci", "Other Comprehensive Income", row.amounts.oci)}
          </td>

          <td className="py-2 px-3 text-right font-mono">
            {renderCell("treasuryShares", "Treasury Shares", row.amounts.treasuryShares)}
          </td>

          {/* Total Equity Column */}
          <td className="py-2 px-3 text-right font-mono font-bold bg-muted/20 border-l">
            {renderCell("totalEquity", "Total Corporate Equity", row.amounts.totalEquity, true)}
          </td>
        </tr>

        {/* Render visible child rows if expanded */}
        {!isCollapsed &&
          visibleChildren.map((child: SCEStatementRow) => renderRow(child, true))}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm sm:p-4 print:border-none print:shadow-none print:p-0">
      {/* Table Top Controls (Hidden on print) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm text-foreground">
            Corporate equity roll-forward
          </span>
          <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium">
            Internal management view
          </span>
          <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground font-medium">
            Amounts in Philippine Peso (₱)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={expandAll}
          >
            Expand all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={collapseAll}
          >
            Collapse all
          </Button>
        </div>
      </div>

      {/* Responsive Matrix Table Container */}
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[1000px] print:min-w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b bg-muted/30 print:bg-transparent print:border-b-2 print:border-black">
              <th className="py-3 px-3 font-semibold text-muted-foreground uppercase tracking-wider w-[280px] sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r print:static print:bg-transparent print:text-black print:border-r">
                MOVEMENT / DESCRIPTION
              </th>
              {EQUITY_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-3 text-right font-semibold text-muted-foreground uppercase tracking-wider print:text-black ${
                    col.key === "totalEquity"
                      ? "bg-muted/40 font-bold text-foreground border-l print:bg-transparent print:border-l print:border-black"
                      : ""
                  }`}
                >
                  <div>{col.header}</div>
                  {col.subHeader && (
                    <div className="text-[10px] font-normal normal-case text-muted-foreground print:text-black/70 truncate max-w-[140px] ml-auto">
                      {col.subHeader}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border print:divide-black/20">
            {rows.map((row: SCEStatementRow) => renderRow(row))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
