"use client";

import React from "react";
import { formatPHP } from "../../../utils/cfs-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LiabilityRow {
  name: string;
  opening: number | null;
  financingCashFlows: number | null;
  newLeases: number | null;
  fx: number | null;
  closing: number | null;
  isTotal?: boolean;
}

export function CFSFinancingLiabilitiesTab() {
  // Current Period: Ended 30 September 2026
  const currentPeriodRows: LiabilityRow[] = [
    {
      name: "Borrowings",
      opening: 21939000,
      financingCashFlows: 466000,
      newLeases: null,
      fx: 8000,
      closing: 22413000,
    },
    {
      name: "Lease liabilities",
      opening: 3474000,
      financingCashFlows: -70000,
      newLeases: 172000,
      fx: null,
      closing: 3576000,
    },
    {
      name: "Dividends payable",
      opening: null,
      financingCashFlows: null,
      newLeases: null,
      fx: null,
      closing: null,
    },
    {
      name: "Total",
      opening: 25413000,
      financingCashFlows: 396000,
      newLeases: 172000,
      fx: 8000,
      closing: 25989000,
      isTotal: true,
    },
  ];

  // Comparative Period: 31 August 2026
  const comparativeRows: LiabilityRow[] = [
    {
      name: "Borrowings",
      opening: 21347000,
      financingCashFlows: 583000,
      newLeases: null,
      fx: 9000,
      closing: 21939000,
    },
    {
      name: "Lease liabilities",
      opening: 3362000,
      financingCashFlows: -87000,
      newLeases: 199000,
      fx: null,
      closing: 3474000,
    },
    {
      name: "Dividends payable",
      opening: null,
      financingCashFlows: null,
      newLeases: null,
      fx: null,
      closing: null,
    },
    {
      name: "Total",
      opening: 24709000,
      financingCashFlows: 496000,
      newLeases: 199000,
      fx: 9000,
      closing: 25413000,
      isTotal: true,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Reconciliation of liabilities arising from financing activities */}
      <div className="rounded-xl border border-border/80 bg-card p-6 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-muted">
          <h3 className="text-sm font-bold text-foreground">
            Reconciliation of liabilities arising from financing activities
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            PAS 7.44A–44E
          </span>
        </div>

        {/* Current Period Table */}
        <div className="mt-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            PERIOD ENDED 30 SEPTEMBER 2026
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/80">
                  <TableHead className="text-[11px] font-bold uppercase text-muted-foreground w-[220px]">
                    LIABILITY
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground">
                    OPENING
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground">
                    FINANCING CASH FLOWS
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground">
                    NEW LEASES
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground">
                    FX
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-foreground">
                    CLOSING
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPeriodRows.map((r) => (
                  <TableRow
                    key={r.name}
                    className={`border-b border-border/40 text-xs ${
                      r.isTotal ? "font-bold border-t-2 border-b-2 border-border bg-muted/10" : "hover:bg-muted/10"
                    }`}
                  >
                    <TableCell className="py-2.5 pl-2">{r.name}</TableCell>
                    <TableCell className="text-right font-mono py-2.5">
                      {formatPHP(r.opening)}
                    </TableCell>
                    <TableCell className="text-right font-mono py-2.5">
                      {formatPHP(r.financingCashFlows)}
                    </TableCell>
                    <TableCell className="text-right font-mono py-2.5">
                      {formatPHP(r.newLeases)}
                    </TableCell>
                    <TableCell className="text-right font-mono py-2.5">
                      {formatPHP(r.fx)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-foreground py-2.5">
                      {formatPHP(r.closing)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Comparative Period Table */}
        <div className="mt-8 pt-6 border-t border-muted/80">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            COMPARATIVE — 31 AUGUST 2026
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/80">
                  <TableHead className="text-[11px] font-bold uppercase text-muted-foreground w-[220px]">
                    LIABILITY
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground">
                    OPENING
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground">
                    FINANCING CASH FLOWS
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground">
                    NEW LEASES
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground">
                    FX
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold uppercase text-foreground">
                    CLOSING
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparativeRows.map((r) => (
                  <TableRow
                    key={r.name}
                    className={`border-b border-border/40 text-xs ${
                      r.isTotal ? "font-bold border-t-2 border-b-2 border-border bg-muted/10" : "hover:bg-muted/10"
                    }`}
                  >
                    <TableCell className="py-2.5 pl-2">{r.name}</TableCell>
                    <TableCell className="text-right font-mono py-2.5">
                      {formatPHP(r.opening)}
                    </TableCell>
                    <TableCell className="text-right font-mono py-2.5">
                      {formatPHP(r.financingCashFlows)}
                    </TableCell>
                    <TableCell className="text-right font-mono py-2.5">
                      {formatPHP(r.newLeases)}
                    </TableCell>
                    <TableCell className="text-right font-mono py-2.5">
                      {formatPHP(r.fx)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-foreground py-2.5">
                      {formatPHP(r.closing)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* 2. Supplier finance arrangements (PAS 7.44F-44H) */}
      <div className="rounded-xl border border-border/80 bg-card p-6 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-muted">
          <h3 className="text-sm font-bold text-foreground">
            Supplier finance arrangements
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            PAS 7.44F–44H
          </span>
        </div>

        <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
          LPM: Reverse factoring arrangement for steel and component suppliers. MRG: Supplier finance programme with a local bank: the bank pays participating suppliers early and the entity settles with the bank on the original due date plus an extension.
        </p>

        {/* Financial Liabilities Carrying Amounts Table */}
        <div className="overflow-x-auto mt-6">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/80">
                <TableHead className="text-[11px] font-bold uppercase text-muted-foreground">
                  ARRANGEMENT DETAILS
                </TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase text-muted-foreground w-[160px]">
                  OPENING
                </TableHead>
                <TableHead className="text-right text-[11px] font-bold uppercase text-foreground w-[160px]">
                  CLOSING
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-b border-border/40 text-xs">
                <TableCell className="py-2.5 pl-2 font-medium">
                  Carrying amount of financial liabilities under the arrangement (in Trade payables)
                </TableCell>
                <TableCell className="text-right font-mono py-2.5">
                  1,605,000.00
                </TableCell>
                <TableCell className="text-right font-mono font-semibold py-2.5 text-foreground">
                  1,738,000.00
                </TableCell>
              </TableRow>
              <TableRow className="border-b border-border/40 text-xs">
                <TableCell className="py-2.5 pl-4 text-muted-foreground">
                  — of which suppliers have already received payment from the finance provider
                </TableCell>
                <TableCell className="text-right font-mono py-2.5 text-muted-foreground">
                  1,252,000.00
                </TableCell>
                <TableCell className="text-right font-mono py-2.5 font-semibold text-foreground">
                  1,356,000.00
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Narrative & Due Date Terms */}
        <div className="mt-6 space-y-2 text-xs border-t border-muted/80 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground w-[240px] shrink-0">
              Payment due dates — under the arrangement
            </span>
            <span className="font-semibold text-foreground">
              LPM 75–105 days after invoice date; MRG 90–120 days after invoice date
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground w-[240px] shrink-0">
              Payment due dates — comparable trade payables
            </span>
            <span className="font-semibold text-foreground">
              30–60 days after invoice date
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="text-muted-foreground w-[240px] shrink-0">
              Non-cash changes
            </span>
            <span className="text-foreground">
              No material business combinations or exchange differences.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
