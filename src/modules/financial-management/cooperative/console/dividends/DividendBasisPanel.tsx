"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { centsToAmount } from "../../loans/loan-schedule";
import { date, peso } from "../../members/format";
import { EmptyState, Panel, StatusChip } from "../components/ui";
import type { DividendPreview } from "./allocation";
import type { DividendBasis } from "./types";

const pageSize = 50;
const formatCredit = (value?: bigint) => value === undefined ? "—" : peso(centsToAmount(value));

export function DividendBasisPanel({ data, loading, error, onRefresh, preview, actions }: {
  data?: DividendBasis;
  loading: boolean;
  error?: string;
  onRefresh?: () => void;
  preview?: DividendPreview;
  actions?: ReactNode;
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
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize);
  let savingsSubtotal = 0n;
  let patronageSubtotal = 0n;
  if (preview) {
    for (const row of filtered) {
      const credit = preview.credits.get(row.membershipId)!;
      savingsSubtotal += credit.savingsCredit;
      patronageSubtotal += credit.patronageRefund;
    }
  }

  return <Panel title="Member distribution" actions={
    <div className="flex flex-wrap items-center gap-2">
      {onRefresh && <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRefresh}>
        {error ? "Retry basis" : "Refresh basis"}
      </Button>}
      {actions}
    </div>
  }>
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading posted member data…</p> :
      error ? <p role="alert" className="text-sm text-destructive">{error}</p> :
      data && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {data.provisional && <StatusChip status="DRAFT" label="Provisional" />}
          <span>{date(data.from)} through {date(data.through)} (Manila) · {data.days} days</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <label className="space-y-1 text-sm font-medium">
            <span className="block">Search member</span>
            <Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Name or employee ID" />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span className="block">Department</span>
            <NativeSelect className="w-full" value={activeDepartment}
              onChange={event => { setDepartment(event.target.value); setPage(1); }}>
              <option value="">All departments</option>
              {departments.map(name => <option key={name}>{name}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span className="block">Patronage</span>
            <NativeSelect className="w-full" value={patronage}
              onChange={event => { setPatronage(event.target.value); setPage(1); }}>
              <option value="">Any</option>
              <option value="eligible">Eligible</option>
              <option value="ineligible">No eligible interest</option>
            </NativeSelect>
          </label>
        </div>
        <div className="overflow-auto rounded-md border">
          <Table aria-label="Member distribution">
            <TableHeader><TableRow>
              <TableHead scope="col">Member</TableHead>
              <TableHead scope="col">Department</TableHead>
              <TableHead scope="col" className="text-right">Average savings</TableHead>
              <TableHead scope="col" className="text-right">Net cash-loan interest paid</TableHead>
              <TableHead scope="col">Patronage</TableHead>
              <TableHead scope="col" className="text-right">Savings credit</TableHead>
              <TableHead scope="col" className="text-right">Patronage refund</TableHead>
              <TableHead scope="col" className="text-right">Total credit</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!rows.length && <TableRow><TableCell colSpan={8}>
                <EmptyState>{data.rows.length ? "No members match these filters." : "No active members for this period."}</EmptyState>
              </TableCell></TableRow>}
              {rows.map(row => {
                const credit = preview?.credits.get(row.membershipId);
                return <TableRow key={row.membershipId}>
                  <TableCell className="whitespace-normal">
                    <span className="font-medium">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">{row.employeeId}</span>
                  </TableCell>
                  <TableCell>{row.department ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(row.averageSavings)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(row.netCashLoanInterest)}</TableCell>
                  <TableCell>{row.patronageEligible ? "Eligible" : "No eligible interest"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCredit(credit?.savingsCredit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCredit(credit?.patronageRefund)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCredit(credit?.total)}</TableCell>
                </TableRow>;
              })}
            </TableBody>
            {preview && filtered.length > 0 && <TableFooter>
              <TableRow>
                <TableHead scope="row" colSpan={5}>
                  {filtered.length === data.rows.length ? "All member credits" : "Filtered member credits"}
                </TableHead>
                <TableCell className="text-right tabular-nums">{formatCredit(savingsSubtotal)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCredit(patronageSubtotal)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCredit(savingsSubtotal + patronageSubtotal)}</TableCell>
              </TableRow>
            </TableFooter>}
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{filtered.length} of {data.rows.length} members</span>
          {pages > 1 && <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button>
            <span>Page {current} of {pages}</span>
            <Button type="button" variant="outline" size="sm" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button>
          </div>}
        </div>
      </div>}
  </Panel>;
}
