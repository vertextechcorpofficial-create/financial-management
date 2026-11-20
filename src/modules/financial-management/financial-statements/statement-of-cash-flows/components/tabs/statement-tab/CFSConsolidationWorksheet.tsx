"use client";

import React from "react";
import { useCashFlowStudio } from "../../../providers/CashFlowStudioProvider";
import { formatPHP } from "../../../utils/cfs-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CFSConsolidationWorksheet() {
  const { data } = useCashFlowStudio();

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-muted">
        <div>
          <h3 className="text-sm font-bold text-foreground">Consolidation worksheet</h3>
          <p className="text-xs text-muted-foreground">
            Members, eliminations and consolidated totals
          </p>
        </div>
      </div>

      <div className="overflow-x-auto mt-4">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border/80">
              <TableHead className="text-xs font-bold uppercase text-muted-foreground w-[260px]">
                LINE
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">
                STC
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">
                LPM
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">
                MRG
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-muted-foreground">
                ELIMINATIONS
              </TableHead>
              <TableHead className="text-right text-xs font-bold uppercase text-foreground">
                CONSOLIDATED
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.consolidationWorksheet.map((row) => (
              <TableRow key={row.lineLabel} className="border-b border-border/40 text-xs hover:bg-muted/20">
                <TableCell className="font-medium text-foreground py-2 pl-2">
                  {row.lineLabel}
                </TableCell>
                <TableCell className="text-right font-mono py-2">
                  {formatPHP(row.stc)}
                </TableCell>
                <TableCell className="text-right font-mono py-2">
                  {formatPHP(row.lpm)}
                </TableCell>
                <TableCell className="text-right font-mono py-2">
                  {formatPHP(row.mrg)}
                </TableCell>
                <TableCell className="text-right font-mono py-2">
                  {formatPHP(row.eliminations)}
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-foreground py-2">
                  {formatPHP(row.consolidated)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ELIMINATION ENTRIES */}
      <div className="mt-6 pt-4 border-t border-muted">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          ELIMINATION ENTRIES
        </h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60">
                <TableHead className="text-[11px] font-bold uppercase text-muted-foreground w-[180px]">
                  REF.
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-muted-foreground w-[260px]">
                  DESCRIPTION
                </TableHead>
                <TableHead className="text-[11px] font-bold uppercase text-muted-foreground">
                  LINES AFFECTED
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.eliminationEntries.map((el) => (
                <TableRow key={el.ref} className="border-b border-border/30 text-xs hover:bg-transparent">
                  <TableCell className="font-mono text-muted-foreground py-2 pl-2">
                    {el.ref}
                  </TableCell>
                  <TableCell className="font-medium text-foreground py-2">
                    {el.description}
                  </TableCell>
                  <TableCell className="text-muted-foreground py-2">
                    {el.linesAffected}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-[11px] italic text-muted-foreground mt-3">
          Unrealised profit in closing inventory from intercompany sales is assumed immaterial in the sample. Eliminations keep consolidated cash unchanged.
        </p>
      </div>
    </div>
  );
}
