"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReportsResponse } from "../types";

function peso(value: number): string {
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Tab = "ledger" | "schedule";

export default function ReportsModule() {
  const [asOf, setAsOf] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = React.useState<ReportsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("ledger");
  const [q, setQ] = React.useState("");

  const load = React.useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fm/lgu-asset-management-system/reports?asOf=" + encodeURIComponent(date), { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "Could not build the reports");
      setData(body as ReportsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(asOf);
  }, [load, asOf]);

  const schedule = React.useMemo(() => {
    const rows = data?.schedule ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.asset.property_no, row.asset.description, row.asset.accountable_officer_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [data, q]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Property ledger and depreciation schedule. Straight line, 5 percent residual, from the date each asset became available for use.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
          <Button variant="outline" size="icon" onClick={() => void load(asOf)} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {data ? <Badge variant="secondary">PHP {peso(data.totals.bookValue)} book value</Badge> : null}
          {data && data.disposed.count > 0 ? (
            <Badge
              variant="outline"
              title={
                "Left the books through a PCV. Latest disposal " +
                (data.disposed.latestDate ?? "unknown") +
                ". Disposed assets are excluded from the figures above."
              }
            >
              {data.disposed.count} disposed, PHP {peso(data.disposed.writtenOff)} written off
            </Badge>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="flex gap-1 border-b pb-2">
        <Button size="sm" variant={tab === "ledger" ? "default" : "ghost"} onClick={() => setTab("ledger")}>
          Property ledger
        </Button>
        <Button size="sm" variant={tab === "schedule" ? "default" : "ghost"} onClick={() => setTab("schedule")}>
          Depreciation schedule
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border p-8 text-sm text-muted-foreground">Building the reports...</div>
      ) : !data ? (
        <div className="rounded-lg border p-8 text-sm text-muted-foreground">Nothing to report.</div>
      ) : tab === "ledger" ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset class</TableHead>
                <TableHead className="text-right">Assets</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Accumulated depreciation</TableHead>
                <TableHead className="text-right">Book value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ledger.map((row) => (
                <TableRow key={row.className}>
                  <TableCell className="text-sm font-medium">{row.className}</TableCell>
                  <TableCell className="text-right text-sm">{row.count}</TableCell>
                  <TableCell className="text-right text-sm">{peso(row.cost)}</TableCell>
                  <TableCell className="text-right text-sm">{peso(row.accumulated)}</TableCell>
                  <TableCell className="text-right text-sm">{peso(row.bookValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="text-sm font-medium">Totals</TableCell>
                <TableCell className="text-right text-sm">{data.totals.count}</TableCell>
                <TableCell className="text-right text-sm">{peso(data.totals.cost)}</TableCell>
                <TableCell className="text-right text-sm">{peso(data.totals.accumulated)}</TableCell>
                <TableCell className="text-right text-sm">{peso(data.totals.bookValue)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search property number, description, officer..."
              className="w-full max-w-sm"
            />
            <Badge variant="outline">{schedule.length} assets as of {data.asOf}</Badge>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property No.</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Months</TableHead>
                  <TableHead className="text-right">Accumulated</TableHead>
                  <TableHead className="text-right">Book value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.slice(0, 200).map((row) => (
                  <TableRow key={row.asset.id}>
                    <TableCell className="font-mono text-xs">{row.asset.property_no}</TableCell>
                    <TableCell className="text-sm">{row.asset.description}</TableCell>
                    <TableCell className="text-right text-sm">{peso(Number(row.asset.cost ?? 0))}</TableCell>
                    <TableCell className="text-right text-sm">{peso(row.monthly)}</TableCell>
                    <TableCell className="text-right text-sm">{row.monthsElapsed}</TableCell>
                    <TableCell className="text-right text-sm">{peso(row.accumulated)}</TableCell>
                    <TableCell className="text-right text-sm">{peso(row.bookValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {schedule.length > 200 ? (
              <div className="border-t p-3 text-xs text-muted-foreground">
                Showing the first 200 rows. Narrow the search to see others.
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
