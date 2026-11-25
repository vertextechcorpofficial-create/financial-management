"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date, peso } from "@/modules/financial-management/cooperative/members/format";
import { copyText } from "@/modules/financial-management/property-ledger/utils/clipboard";
import { copyRegisterCsv, listRegister, type RegisterTab } from "./api";
import { LoanRegisterDialog } from "./LoanRegisterDialog";
import { registerStatusLabels, registerViews, type LoanRegisterPage, type RegisterLoan, type RegisterView } from "./types";

const initialFilters = { q: "", agency: "", department: "", program: "", status: "", short: "", flagged: "", needsUpdate: "" };
const amount = (value: string | null) => value === null ? "—" : peso(value);
const emptyOptions: LoanRegisterPage["filters"] = { agencies: [], departments: [], programs: [] };

function StatementCell({ data }: { data: RegisterLoan["agencyBalance"] }) {
  if (!data.latest) return <Badge variant="outline">No statement</Badge>;
  return <div className="space-y-1">
    <p>{amount(data.latest.balance)}</p>
    <p className="whitespace-nowrap text-xs text-muted-foreground">{date(data.latest.date)} · {data.latest.source}</p>
    {data.stale && <Badge variant="destructive">Stale · {data.age} days</Badge>}
  </div>;
}

function RegisterRows({ items, balances, open }: {
  items: RegisterLoan[];
  balances: boolean;
  open: (id: number, record: boolean) => void;
}) {
  const heads = balances ? ["Loan", "Employee", "Agency / Program", "System estimate", "Adjusted agency balance", "Difference", "Latest statement", "Action"] :
    ["Loan", "Employee", "Agency / Program", "Loan amount", "Amortization", "Paid / total", "Estimated balance", "Latest statement", "Status"];
  return <div className="rounded-md border">
    <Table>
      <TableHeader><TableRow>{heads.map(head => <TableHead key={head}>{head}</TableHead>)}</TableRow></TableHeader>
      <TableBody>
        {items.map(loan => <TableRow key={loan.id}>
          <TableCell>
            <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => open(loan.id, false)}>{loan.reference}</Button>
            <p className="mt-1 text-xs text-muted-foreground">{loan.agencyReference}</p>
          </TableCell>
          <TableCell>{loan.employee}{loan.department && <p className="text-xs text-muted-foreground">{loan.department}</p>}</TableCell>
          <TableCell>{loan.agency}<p className="text-xs text-muted-foreground">{loan.program}</p></TableCell>
          {balances ? <>
            <TableCell>{amount(loan.estimate)}</TableCell>
            <TableCell>{amount(loan.agencyBalance.adjusted)}</TableCell>
            <TableCell>
              {amount(loan.agencyBalance.difference)}
              {loan.agencyBalance.flagged && <Badge variant="destructive" className="ml-1">Check</Badge>}
              {loan.awaitingPayroll && loan.agencyBalance.latest && <p className="text-xs text-muted-foreground">Awaiting Payroll results</p>}
            </TableCell>
            <TableCell><StatementCell data={loan.agencyBalance} /></TableCell>
            <TableCell><Button type="button" variant="outline" size="sm" onClick={() => open(loan.id, true)}>Record balance</Button></TableCell>
          </> : <>
            <TableCell>{peso(loan.principal)}</TableCell>
            <TableCell>{peso(loan.amortization)}</TableCell>
            <TableCell className="whitespace-nowrap">{loan.counted} / {loan.term}</TableCell>
            <TableCell>
              {amount(loan.estimate)}
              {loan.active && loan.awaitingPayroll && <p className="text-xs text-muted-foreground">Awaiting Payroll results</p>}
            </TableCell>
            <TableCell><StatementCell data={loan.agencyBalance} /></TableCell>
            <TableCell><Badge variant="outline">{registerStatusLabels[loan.status]}</Badge></TableCell>
          </>}
        </TableRow>)}
        {!items.length && <TableRow><TableCell colSpan={heads.length} className="py-8 text-center text-muted-foreground">No loans match these filters.</TableCell></TableRow>}
      </TableBody>
    </Table>
  </div>;
}

export function LoanRegisterModule({ tab }: { tab: RegisterTab }) {
  const balances = tab === "agency-balances";
  const [filters, setFilters] = useState(initialFilters);
  const [view, setView] = useState<RegisterView>("active");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copying, setCopying] = useState(false);
  const [selected, selectLoan] = useState<{ id: number; record: boolean } | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; data?: LoanRegisterPage; error?: string }>();
  const query = new URLSearchParams({
    view, page: String(page),
    ...Object.fromEntries(Object.entries(filters).flatMap(([key, value]) => value.trim() ? [[key, value.trim()]] : [])),
  }).toString();
  const key = tab + ":" + query + ":" + refresh;
  const ready = loaded?.key === key ? loaded : undefined;
  const options = loaded?.data?.filters ?? emptyOptions;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void listRegister(tab, query, controller.signal)
        .then(data => { if (!controller.signal.aborted) setLoaded({ key, data }); })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setLoaded({ key, error: error instanceof Error ? error.message : "Could not load loans." });
        });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tab, query, key]);

  const update = (name: keyof typeof filters, value: string) => {
    setFilters(previous => ({ ...previous, [name]: value }));
    setPage(1);
    setCopied("");
    setCopyError("");
  };
  const reload = () => setRefresh(value => value + 1);

  async function copy() {
    setCopying(true);
    setCopied("");
    setCopyError("");
    try {
      await copyText(await copyRegisterCsv(tab, query));
      setCopied("Filtered loans copied as CSV.");
    } catch (error) {
      setCopyError(error instanceof Error ? error.message : "Could not copy loans. Try again.");
    } finally {
      setCopying(false);
    }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{balances ? "Agency balances" : "Loan Register"}</h2>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void copy()} disabled={copying || !ready?.data?.total}>
          {copying ? "Copying…" : "Copy as CSV"}
        </Button>
        <Button type="button" variant="outline" onClick={reload}>Refresh</Button>
      </div>
    </div>
    {copied && <p role="status" className="text-sm">{copied}</p>}
    {copyError && <p role="alert" className="text-sm text-destructive">{copyError}</p>}

    {!balances && <div className="flex flex-wrap gap-1" role="group" aria-label="Loan register view">
      {(Object.keys(registerViews) as RegisterView[]).map(item => <Button key={item} type="button" size="sm"
        variant={item === view ? "default" : "outline"} aria-pressed={item === view}
        onClick={() => { setView(item); update("status", ""); }}>{registerViews[item]}</Button>)}
    </div>}

    {balances && ready?.data && <div className="grid gap-3 sm:grid-cols-3">
      {[
        ["Loans with an agency balance", ready.data.summary.withStatement + " / " + ready.data.summary.active],
        ["Estimate differs from agency", ready.data.summary.flagged],
        ["Statements needing an update", ready.data.summary.needsUpdate],
      ].map(([label, value]) => <div key={label} className="rounded-md border p-3">
        <p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p>
      </div>)}
    </div>}

    <div className="flex flex-wrap items-center gap-2">
      <Input className="w-full sm:max-w-xs" value={filters.q} maxLength={120} placeholder="Employee, loan, or agency reference"
        aria-label="Search loans" onChange={event => update("q", event.target.value)} />
      <NativeSelect aria-label="Filter by agency" value={filters.agency} onChange={event => update("agency", event.target.value)}>
        <option value="">All agencies</option>
        {options.agencies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      {!balances && <>
        <NativeSelect aria-label="Filter by program" value={filters.program} onChange={event => update("program", event.target.value)}>
          <option value="">All programs</option>
          {options.programs.map(item => <option key={item}>{item}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Filter by department" value={filters.department} onChange={event => update("department", event.target.value)}>
          <option value="">All departments</option>
          {options.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Filter by status" value={filters.status} onChange={event => update("status", event.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(registerStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </NativeSelect>
      </>}
      {(balances ? [["flagged", "Differs from agency"], ["needsUpdate", "Needs update"]] as const : [["short", "Last deduction short"]] as const)
        .map(([name, label]) => <label key={name} className="flex items-center gap-2 px-2 text-sm">
          <Checkbox checked={filters[name] === "1"} onCheckedChange={value => update(name, value === true ? "1" : "")} />{label}
        </label>)}
      <Button type="button" variant="ghost" size="sm" onClick={() => {
        setFilters(initialFilters); setPage(1); setCopied(""); setCopyError("");
      }}>Clear filters</Button>
    </div>

    {!ready && <p role="status" className="text-sm text-muted-foreground">Loading loans…</p>}
    {ready?.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{ready.error}
      <Button type="button" variant="outline" size="sm" onClick={reload}>Retry</Button>
    </div>}
    {ready?.data && <>
      <p className="text-sm text-muted-foreground">{ready.data.total} loan(s) match</p>
      <RegisterRows items={ready.data.items} balances={balances} open={(id, record) => selectLoan({ id, record })} />
      {(page > 1 || ready.data.hasMore) && <nav aria-label="Loan register pages" className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-sm">Page {page}</span>
        <Button type="button" variant="outline" size="sm" disabled={!ready.data.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
      </nav>}
    </>}
    {selected && <LoanRegisterDialog key={selected.id} id={selected.id} startRecording={selected.record}
      onClose={() => selectLoan(null)} onSaved={() => { setPage(1); reload(); }} />}
  </div>;
}
