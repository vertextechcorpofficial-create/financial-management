"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AssetSummaryGroupRow } from "../types";
import type { AssetTableData } from "../../registration/types";

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `₱${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getConditionBadgeClass = (condition?: string | null) => {
  const cond = condition?.toLowerCase() || "";
  if (cond.includes("new")) {
    return "bg-emerald-600 text-white hover:bg-emerald-700";
  }
  if (cond.includes("good")) {
    return "bg-blue-600 text-white hover:bg-blue-700";
  }
  if (cond.includes("fair")) {
    return "bg-amber-500 text-white hover:bg-amber-600";
  }
  if (cond.includes("poor") || cond.includes("damage") || cond.includes("repair")) {
    return "bg-red-500 text-white hover:bg-red-600";
  }
  return "bg-muted text-muted-foreground";
};

interface AssetSummaryTableProps {
  groups: AssetSummaryGroupRow[];
  totalInUse: number;
  totalOut: number;
  totalCost: number;
  totalAccumDep: number;
  totalProjectedValue: number;
}

export default function AssetSummaryTable({
  groups,
  totalInUse,
  totalOut,
  totalCost,
  totalAccumDep,
  totalProjectedValue,
}: AssetSummaryTableProps) {
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="bg-card border rounded-xl shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b font-semibold text-muted-foreground bg-muted/40">
            <tr>
              <th className="py-3 px-3">Item name</th>
              <th className="py-3 px-3">Item type</th>
              <th className="py-3 px-3">Classification</th>
              <th className="py-3 px-2 text-center">In use</th>
              <th className="py-3 px-2 text-center">Out</th>
              <th className="py-3 px-3">By department</th>
              <th className="py-3 px-3">By condition</th>
              <th className="py-3 px-3 text-right">Total cost</th>
              <th className="py-3 px-3 text-right">Accum. dep. & imp.</th>
              <th className="py-3 px-3 text-right">Projected value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {groups.length > 0 ? (
              groups.map((group) => {
                const isExpanded = !!expandedKeys[group.groupKey];

                return (
                  <React.Fragment key={group.groupKey}>
                    {/* Parent Group Row */}
                    <tr
                      onClick={() => toggleExpand(group.groupKey)}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-3 font-semibold text-foreground">
                        <div className="flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span>{group.itemName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">{group.itemType}</td>
                      <td className="py-3 px-3 text-muted-foreground">{group.classification}</td>
                      <td className="py-3 px-2 text-center font-bold text-blue-600">
                        {group.inUseCount > 0 ? (
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-50 text-blue-700 text-[11px]">
                            {group.inUseCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center text-muted-foreground">
                        {group.outCount > 0 ? group.outCount : "—"}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-[11px]">
                        {group.byDepartmentText}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-[11px]">
                        {group.byConditionText}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-foreground font-medium">
                        {formatCurrency(group.totalCost)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(group.accumDepAndImp)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-blue-600 font-bold">
                        {formatCurrency(group.projectedValue)}
                      </td>
                    </tr>

                    {/* Expanded 1:1 Child RFID Units */}
                    {isExpanded &&
                      group.units.map((unit: AssetTableData) => {
                        const unitCost = Number(unit.cost_per_item || unit.acquisition_cost || 0);
                        const unitVal = Number(unit.projected_value || unitCost);
                        const unitAccum = Math.max(0, unitCost - unitVal);

                        return (
                          <tr
                            key={unit.id}
                            className="bg-muted/15 border-l-4 border-l-[#1b4332] hover:bg-muted/30 transition-colors"
                          >
                            <td className="py-2.5 px-3 pl-8">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-md bg-muted/70 flex items-center justify-center shrink-0">
                                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div>
                                  <Link
                                    href={`/fm/asset-management/registration/${unit.id}`}
                                    className="font-mono font-semibold text-emerald-800 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {unit.asset_tag}
                                  </Link>
                                  <span className="text-muted-foreground mx-1">·</span>
                                  <span className="text-foreground text-[11px]">{unit.item_name}</span>
                                  <div className="text-[10px] font-mono text-muted-foreground">
                                    RFID {unit.rfid_code || "—"} · S/N {unit.serial || "—"}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground text-[11px]">—</td>
                            <td className="py-2.5 px-3 text-muted-foreground text-[11px]">—</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-medium">
                                In use
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center text-muted-foreground">—</td>
                            <td className="py-2.5 px-3 text-[11px]">
                              <div className="font-medium text-foreground">{unit.department_name}</div>
                              <div className="text-muted-foreground text-[10px]">
                                {unit.assigned_to_name || "Unassigned"}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge
                                className={`text-[10px] px-2 py-0.5 font-medium border-0 ${getConditionBadgeClass(
                                  unit.condition
                                )}`}
                              >
                                {unit.condition || "Good"}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-foreground font-medium">
                              {formatCurrency(unitCost)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                              {formatCurrency(unitAccum)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-blue-600 font-bold">
                              {formatCurrency(unitVal)}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="py-12 text-center text-muted-foreground italic">
                  No assets found in summary.
                </td>
              </tr>
            )}
          </tbody>

          {/* Table Footer with Totals */}
          <tfoot className="border-t-2 bg-muted/30 font-semibold text-xs">
            <tr>
              <td className="py-3 px-3 text-foreground font-bold">Total</td>
              <td className="py-3 px-3"></td>
              <td className="py-3 px-3"></td>
              <td className="py-3 px-2 text-center font-bold text-foreground">{totalInUse}</td>
              <td className="py-3 px-2 text-center font-bold text-foreground">{totalOut}</td>
              <td className="py-3 px-3"></td>
              <td className="py-3 px-3"></td>
              <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                {formatCurrency(totalCost)}
              </td>
              <td className="py-3 px-3 text-right font-mono font-bold text-muted-foreground">
                {formatCurrency(totalAccumDep)}
              </td>
              <td className="py-3 px-3 text-right font-mono font-bold text-blue-600">
                {formatCurrency(totalProjectedValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="p-3 bg-muted/20 border-t text-[11px] text-muted-foreground">
        Units disposed or held for sale are shown as &quot;Out&quot; and excluded from cost and value totals. Expand a row to see each unit&apos;s tag, RFID, holder and condition.
      </div>
    </div>
  );
}
