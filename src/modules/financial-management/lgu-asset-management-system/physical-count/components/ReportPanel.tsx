"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CountReport } from "../../types";

interface ReportPanelProps {
  report: CountReport | null;
  busy: boolean;
  onLoad: (form: "rpcppe" | "rpcsp") => void;
}

function peso(value: number): string {
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ReportPanel({ report, busy, onLoad }: ReportPanelProps) {
  const form = report?.form ?? "rpcppe";
  const title = form === "rpcppe"
    ? "REPORT ON THE PHYSICAL COUNT OF PROPERTY, PLANT AND EQUIPMENT"
    : "REPORT ON THE PHYSICAL COUNT OF SEMI-EXPENDABLE PROPERTY";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Report</h2>
          <p className="text-sm text-muted-foreground">
            Same rows the count sheet shows, and the same numbers the export prints.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={form === "rpcppe" ? "default" : "outline"} disabled={busy} onClick={() => onLoad("rpcppe")}>
            RPCPPE, PPE
          </Button>
          <Button size="sm" variant={form === "rpcsp" ? "default" : "outline"} disabled={busy} onClick={() => onLoad("rpcsp")}>
            RPCSP, semi-expendable
          </Button>
          {report ? (
            <>
              <Button size="sm" variant="outline" asChild>
                <a href={"/api/fm/lgu-asset-management-system/physical-count/" + report.session.id + "/export?form=" + report.form + "&format=xlsx"}>
                  Excel
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={"/api/fm/lgu-asset-management-system/physical-count/" + report.session.id + "/export?form=" + report.form + "&format=pdf"}>
                  PDF
                </a>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {!report ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
          Choose a form above to build the report.
        </div>
      ) : (
        <>
          <div className="rounded-lg border p-4 text-sm">
            <p className="text-center font-semibold">{title}</p>
            <p className="text-center text-xs text-muted-foreground">(Types of Property, Plant and Equipment)</p>
            <p className="mt-2 text-center">As of {report.session.as_of_date ?? "unknown date"}</p>
            <p className="mt-2 text-xs">
              Municipality of Mapandan. For which the accountable officers listed below are answerable, having assumed
              such accountability on the dates shown.
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>Fund cluster: ___</span>
              <span>Counted by: {report.session.counted_by ?? "___"}</span>
              <span>Verified by: {report.session.verified_by ?? "___"}</span>
              <span>Witnessed by: {report.session.witnessed_by ?? "___"}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{report.summary.totalLines} lines</Badge>
            <Badge variant="secondary">{report.summary.found} found</Badge>
            <Badge variant="outline">{report.summary.moved} found elsewhere</Badge>
            <Badge variant="destructive">{report.summary.missing} missing</Badge>
            {report.summary.notCounted ? <Badge variant="outline">{report.summary.notCounted} not counted</Badge> : null}
            <Badge variant="outline">PHP {peso(report.summary.totalValue)} total</Badge>
            {report.summary.totalShortageValue ? (
              <Badge variant="destructive">PHP {peso(report.summary.totalShortageValue)} shortage</Badge>
            ) : null}
          </div>

          {report.groups.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              No assets on this form for this session.
            </div>
          ) : (
            report.groups.map((group) => (
              <div key={group.className} className="rounded-lg border">
                <div className="border-b bg-muted/40 px-4 py-2 text-sm font-medium">{group.className}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property No.</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Unit value</TableHead>
                      <TableHead>Date acquired</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead className="text-right">Shortage</TableHead>
                      <TableHead className="text-right">Shortage value</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.rows.map((row) => (
                      <TableRow key={row.propertyNo}>
                        <TableCell className="font-mono text-xs">{row.propertyNo}</TableCell>
                        <TableCell className="text-sm">{row.description}</TableCell>
                        <TableCell className="text-sm">{row.unit}</TableCell>
                        <TableCell className="text-right text-sm">{peso(row.unitValue)}</TableCell>
                        <TableCell className="text-sm">{row.dateAcquired ?? "-"}</TableCell>
                        <TableCell className="text-right text-sm">{row.balanceQty}</TableCell>
                        <TableCell className="text-right text-sm">{row.onHandQty}</TableCell>
                        <TableCell className="text-right text-sm">{row.shortageQty || ""}</TableCell>
                        <TableCell className="text-right text-sm">{row.shortageValue ? peso(row.shortageValue) : ""}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.remarks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm font-medium">Totals</TableCell>
                      <TableCell className="text-right text-sm">{group.totalQty}</TableCell>
                      <TableCell className="text-right text-sm">{group.totalQty}</TableCell>
                      <TableCell className="text-right text-sm">{group.totalShortageQty}</TableCell>
                      <TableCell className="text-right text-sm">{peso(group.totalShortageValue)}</TableCell>
                      <TableCell className="text-sm">PHP {peso(group.totalValue)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ))
          )}

          <div className="rounded-lg border p-4">
            <div className="grid gap-6 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Prepared by</p>
                <p className="mt-6 border-t pt-1">{report.session.counted_by ?? "____________"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Verified by</p>
                <p className="mt-6 border-t pt-1">{report.session.verified_by ?? "____________"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Witnessed by</p>
                <p className="mt-6 border-t pt-1">{report.session.witnessed_by ?? "____________"}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
