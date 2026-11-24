"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { centsToAmount } from "../../loans/loan-schedule";
import { PersonAvatar } from "../../members/components";
import { date, peso } from "../../members/format";
import { Panel, StatusChip } from "../components/ui";
import type { DividendPreview } from "./allocation";
import type { DividendBasis } from "./types";

const pageSize = 50;
const formatCredit = (value?: bigint) => value === undefined ? "—" : peso(centsToAmount(value));

export function DividendBasisPanel({ data, loading, error, onRefresh, preview, onEditAllocation }: {
  data?: DividendBasis;
  loading: boolean;
  error?: string;
  onRefresh?: () => void;
  preview?: DividendPreview;
  onEditAllocation?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [patronage, setPatronage] = useState("");
  const [page, setPage] = useState(1);
  const departments = [...new Set(data?.rows.flatMap(row => row.department ? [row.department] : []))].sort();
  const activeDepartment = departments.includes(department) ? department : "";
  const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = data?.rows.filter(row => {
    const match = `${row.name} ${row.employeeId}`.toLowerCase();
    return tokens.every(token => match.includes(token)) && (!activeDepartment || row.department === activeDepartment) &&
      (!patronage || row.patronageEligible === (patronage === "eligible"));
  }) ?? [];
  const hasFilters = Boolean(search.trim() || activeDepartment || patronage);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const first = filtered.length ? (current - 1) * pageSize + 1 : 0;
  const last = first ? first + rows.length - 1 : 0;
  let savingsSubtotal = 0n;
  let patronageSubtotal = 0n;
  if (preview) {
    for (const row of filtered) {
      const credit = preview.credits.get(row.membershipId)!;
      savingsSubtotal += credit.savingsCredit;
      patronageSubtotal += credit.patronageRefund;
    }
  }

  function clearFilters() {
    setSearch("");
    setDepartment("");
    setPatronage("");
    setPage(1);
  }

  return <Panel title="Member basis" description="Posted savings and cash-loan interest used for the annual allocation." actions={
    onRefresh && <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRefresh}>
      <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> {error ? "Retry basis" : "Refresh basis"}
    </Button>
  }>
    {loading ? <DividendBasisSkeleton /> : error ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">{error}</p>
      {onRefresh && <Button type="button" variant="outline" size="sm" onClick={onRefresh}>Retry</Button>}
    </div> : data && <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {data.provisional && <StatusChip status="DRAFT" label="Provisional" />}
        <span>{date(data.from)} through {date(data.through)} (Manila) · {data.days} days</span>
      </div>
      {!preview && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">Save a valid reviewed allocation to calculate member credits.</p>
        {onEditAllocation && <Button type="button" variant="outline" size="sm" onClick={onEditAllocation}>Open allocation</Button>}
      </div>}

      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Search member
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-8" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}
                placeholder="Name or employee ID" />
            </div>
          </label>
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Department
            <NativeSelect className="h-9 w-full" value={activeDepartment} onChange={event => { setDepartment(event.target.value); setPage(1); }}>
              <option value="">All departments</option>
              {departments.map(name => <option key={name}>{name}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Patronage
            <NativeSelect className="h-9 w-full" value={patronage} onChange={event => { setPatronage(event.target.value); setPage(1); }}>
              <option value="">Any</option>
              <option value="eligible">Eligible</option>
              <option value="ineligible">No eligible interest</option>
            </NativeSelect>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
          <p className="text-xs text-muted-foreground">{filtered.length} of {data.rows.length} members</p>
          {hasFilters && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>Clear filters</Button>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border" role="region" aria-label="Member distribution table" tabIndex={0}>
        <Table aria-label="Member distribution">
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead scope="col" className="min-w-52 lg:sticky lg:left-0 lg:z-20 border-r bg-muted">Member</TableHead>
            <TableHead scope="col">Department</TableHead>
            <TableHead scope="col" className="whitespace-nowrap text-right">Average savings</TableHead>
            <TableHead scope="col" className="whitespace-nowrap text-right">Net cash-loan interest</TableHead>
            <TableHead scope="col">Patronage</TableHead>
            <TableHead scope="col" className="whitespace-nowrap text-right">Savings credit</TableHead>
            <TableHead scope="col" className="whitespace-nowrap text-right">Patronage refund</TableHead>
            <TableHead scope="col" className="whitespace-nowrap text-right">Total credit</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!rows.length && <TableRow className="hover:bg-transparent"><TableCell colSpan={8}>
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
                <p className="text-sm font-medium">{data.rows.length ? "No members match these filters" : "No active members for this period"}</p>
                <p className="max-w-sm text-xs text-muted-foreground">{data.rows.length ? "Try a different name, department, or patronage status." : "The basis will populate when posted member activity is available."}</p>
                {hasFilters && <Button type="button" variant="outline" size="sm" className="mt-1" onClick={clearFilters}>Clear filters</Button>}
              </div>
            </TableCell></TableRow>}
            {rows.map(row => {
              const credit = preview?.credits.get(row.membershipId);
              return <TableRow key={row.membershipId} className="group">
                <TableCell className="whitespace-normal lg:sticky lg:left-0 lg:z-10 border-r bg-card group-hover:bg-muted/50">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PersonAvatar name={row.name} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.employeeId}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{row.department ?? "—"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(row.averageSavings)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{peso(row.netCashLoanInterest)}</TableCell>
                <TableCell>
                  <StatusChip status={row.patronageEligible ? "ACTIVE" : "CANCELLED"} label={row.patronageEligible ? "Eligible" : "No interest"} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatCredit(credit?.savingsCredit)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatCredit(credit?.patronageRefund)}</TableCell>
                <TableCell className="text-right font-mono font-medium tabular-nums">{formatCredit(credit?.total)}</TableCell>
              </TableRow>;
            })}
          </TableBody>
          {preview && filtered.length > 0 && <TableFooter><TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead scope="row" colSpan={5} className="lg:sticky lg:left-0 lg:z-10 border-r bg-muted/30">
              {filtered.length === data.rows.length ? "All member credits" : "Filtered member credits"}
            </TableHead>
            <TableCell className="text-right font-mono tabular-nums">{formatCredit(savingsSubtotal)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatCredit(patronageSubtotal)}</TableCell>
            <TableCell className="text-right font-mono font-semibold tabular-nums">{formatCredit(savingsSubtotal + patronageSubtotal)}</TableCell>
          </TableRow></TableFooter>}
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span>{first ? `Showing ${first}–${last} of ${filtered.length}` : "No rows"}</span>
        {pages > 1 && <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="size-3.5" /> Previous
          </Button>
          <span className="min-w-14 text-center font-medium text-foreground">Page {current} of {pages}</span>
          <Button type="button" variant="outline" size="sm" disabled={current === pages} onClick={() => setPage(current + 1)}>
            Next <ChevronRight className="size-3.5" />
          </Button>
        </div>}
      </div>
    </div>}
    {!loading && !error && !data && <p role="status" className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
      The member basis will appear after the draft loads.
    </p>}
  </Panel>;
}

function DividendBasisSkeleton() {
  return <div className="space-y-3" aria-busy="true">
    <div className="h-5 w-64 animate-pulse rounded bg-muted" />
    <div className="h-24 animate-pulse rounded-xl border bg-muted/30" />
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader><TableRow>{Array.from({ length: 8 }, (_, index) =>
          <TableHead key={index}><div className="h-3.5 w-20 animate-pulse rounded bg-muted" /></TableHead>)}</TableRow></TableHeader>
        <TableBody>{Array.from({ length: 8 }, (_, row) => <TableRow key={row} className="hover:bg-transparent">
          {Array.from({ length: 8 }, (_, cell) => <TableCell key={cell}>
            <div className={cn("h-3.5 animate-pulse rounded bg-muted", cell === 0 ? "w-32" : "w-16")} />
          </TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </div>;
}
