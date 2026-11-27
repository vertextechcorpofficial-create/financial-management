"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { History, SearchX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { EmptyState, DetailSkeleton, PersonAvatar, StatusChip, TableRowsSkeleton } from "../components/ui";
import type { getLoanChanges } from "../server/loan-changes";
import { changeLabels, type ChangeKind } from "./lifecycle";
import { loansApi, useLifecycleCommand, useLifecycleRead } from "./lifecycle-client";
import { monthAfter } from "./monthly-payroll";
import { registerPageSizes, registerStatusLabels, type LoanRegisterPage, type RegisterSort } from "./types";

type ChangeDetail = Awaited<ReturnType<typeof getLoanChanges>>;
const acknowledgementTemplate = "instruction_id,transmission_id,payroll_loan_id,effective_month,result,reference,date\r\n";
const pageSizeOptions = registerPageSizes;
const defaultFilters = { q: "", agency: "", department: "", short: "" };

const amount = (value: string | null) => value === null ? "—" : peso(value);
const maskedReference = (value: string) => value.length > 4 ? "••••" + value.slice(-4) : value;

function ChangeReview({ id, onSaved }: { id: number; onSaved: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const [selectedKind, setKind] = useState<ChangeKind>("AMORTIZATION");
  const [reversal, setReversal] = useState<number>();
  const command = useLifecycleCommand();
  const url = loansApi + "/changes/" + id;
  const loaded = useLifecycleRead<ChangeDetail>(url, refresh);
  const reload = () => setRefresh(value => value + 1);
  const data = loaded?.data;
  if (!data) return <div className="space-y-3" aria-busy="true">
    <p role={loaded?.error ? "alert" : "status"} className="text-sm text-muted-foreground">
      {loaded?.error ?? "Loading loan changes…"}
    </p>
    {loaded?.error && <Button variant="outline" size="sm" onClick={reload}>Retry</Button>}
    {!loaded?.error && <DetailSkeleton />}
  </div>;
  const { loan, history, statements, openMonth, businessDate } = data;
  const canChangeTerms = loan.active && loan.status !== "FINAL_PAY_REQUESTED";
  const kind = canChangeTerms ? selectedKind : "REFUND";
  const saved = () => { toast.success("Loan updated."); setReversal(undefined); reload(); onSaved(); };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    return command.run(url, { expectedRevision: data.loan.revision, note: fields.note,
      change: reversal ? { kind: "REVERSE", revision: reversal, reason: fields.reason } : { kind, ...fields } }, saved);
  }

  async function exportFile(instructionId: string) {
    await command.run(url + "?exchange=1", { kind: "EXPORT", expectedRevision: loan.revision, instructionId }, async response => {
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "loan-instruction-" + instructionId + ".csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      saved();
    });
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <StatusChip status={loan.status} label={registerStatusLabels[loan.status]} />
      <span>{loan.agency} · {loan.program}</span>
      <span className="text-muted-foreground">Monthly amortization {peso(loan.amortization)}</span>
    </div>
    {data.finalPay && <p className="text-sm">Final pay withheld {peso(data.finalPay.withheld)} · Unpaid agency balance {peso(data.finalPay.unpaid)}</p>}
    <form key={loan.revision + ":" + kind + ":" + reversal} onSubmit={event => void submit(event)} className="space-y-3 rounded-md border p-3">
      {reversal ? <label className="block text-sm">Reason for reversing change #{reversal}<Textarea name="reason" required maxLength={500} /></label> :
        <><div className="flex flex-wrap gap-3">
          <label className="space-y-1 text-sm">Change
            <NativeSelect value={kind} onChange={event => setKind(event.target.value as ChangeKind)}>
              {Object.entries(changeLabels).filter(([value]) => canChangeTerms || value === "REFUND")
                .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect></label>
          {(kind === "AMORTIZATION" || kind === "REFUND") && <label className="space-y-1 text-sm">Amount (₱)
            <Input name="amount" inputMode="decimal" pattern="[0-9]{1,13}([.][0-9]{1,2})?" required /></label>}
          {(kind === "AMORTIZATION" || kind === "SUSPENSION") && <label className="space-y-1 text-sm">Effective month
            <Input name="month" type="month" min={openMonth} max={kind === "AMORTIZATION" ? monthAfter(openMonth, 2) : undefined}
              defaultValue={openMonth} required /></label>}
          {kind === "SUSPENSION" && <label className="space-y-1 text-sm">Through month
            <Input name="throughMonth" type="month" min={openMonth} defaultValue={openMonth} required /></label>}
          {(kind === "PAID_DIRECTLY" || kind === "REFUND") && <label className="space-y-1 text-sm">{kind === "REFUND" ? "Agency refund reference" : "Receipt or clearance reference"}
            <Input name="reference" maxLength={200} required /></label>}
          {kind === "SEPARATION" && <>
            <label className="space-y-1 text-sm">Separation date <Input name="separationDate" type="date" defaultValue={businessDate} required /></label>
            <label className="space-y-1 text-sm">Latest agency statement
              <NativeSelect name="statementId" required>
                {statements.items[0] ? <option value={statements.items[0].id}>
                  {date(statements.items[0].date)} · {peso(statements.items[0].balance)}
                </option> : <option value="">Record a statement in Agency balances</option>}
              </NativeSelect></label>
          </>}
        </div><label className="block space-y-1 text-sm">Note (optional)<Textarea name="note" maxLength={500} /></label></>}
      <div className="flex gap-2">
        <Button type="submit" disabled={command.busy || (!reversal && kind === "SEPARATION" && !statements.items.length)}>
          {reversal ? "Confirm reversal" : "Save change"}</Button>
        {reversal && <Button type="button" variant="outline" onClick={() => setReversal(undefined)} disabled={command.busy}>Cancel</Button>}
      </div>
    </form>
    <section className="space-y-2">
      <h4 className="font-medium">Change history and Payroll instructions</h4>
      {!history.length && <EmptyState icon={History} title="No changes recorded"
        description="Amortization, suspension, separation, direct payment, and refund changes appear here." />}
      {loan.renewal && <p className="text-sm">Renewal effective {loan.renewal.month} · Replacement loan #{loan.renewal.replacementId}</p>}
      {history.map(event => {
        const row = data.instructions.find(instruction => instruction.id === event.after_values.instructionId);
        return <div key={event.revision} className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">#{event.revision} · {event.after_values.remarks}{event.reversed ? " · Reversed" : ""}</p>
          <p className="text-muted-foreground">{event.actor_name} · {dateTime(event.occurred_at)}</p>
          {row && <p>{row.state.replaceAll("_", " ")} · Effective {row.effective_month}
            {typeof row.details.amount === "string" && " · " + peso(row.details.amount)}
            {typeof row.details.balance === "string" && " · Final-pay cap " + peso(row.details.balance)}
            {typeof row.details.reference === "string" && " · " + row.details.reference}</p>}
          {row?.details.payout != null && <p>Payroll payout confirmed.</p>}
          <div className="flex flex-wrap items-center gap-2">
            {!event.reversed && event.action !== "LOAN_TERMS_CHANGE_REVERSED" && row?.state !== "PAID" &&
              !(row?.action === "SEPARATION" && data.finalPay) &&
              event.after_values.recordedMonth === openMonth && <Button size="sm" variant="outline"
                disabled={command.busy} onClick={() => setReversal(event.revision)}>Reverse</Button>}
            {row && ["QUEUED", "EXPORTED", "RETRYABLE"].includes(row.state) && <Button size="sm" variant="outline"
              disabled={command.busy || !row.payroll_loan_id} onClick={() => void exportFile(row.id)}>Download instruction</Button>}
            {row && (row.state === "EXPORTED" || row.state === "ACKNOWLEDGED" && row.action === "REFUND") && <>
              <Button asChild size="sm" variant="outline"><a download="loan-change-acknowledgement.csv"
                href={"data:text/csv;charset=utf-8," + encodeURIComponent(acknowledgementTemplate +
                  [row.id, row.details.transmissionId, row.payroll_loan_id, row.effective_month, "", "", ""].join(",") + "\r\n")}>Acknowledgement template</a></Button>
              <label className="text-xs">Import Payroll acknowledgement
                <Input type="file" accept=".csv,text/csv" disabled={command.busy} onChange={event => {
                  const file = event.target.files?.[0];
                  if (file && file.size <= 8192) void file.text().then(csv => command.run(url + "?exchange=1",
                    { kind: "IMPORT", expectedRevision: loan.revision, instructionId: row.id, csv }, saved));
                  else if (file) toast.error("Choose an acknowledgement CSV under 8 KB.");
                  event.target.value = "";
                }} /></label>
            </>}
          </div>
        </div>;
      })}
    </section>
  </div>;
}

function SortHeader({ label, sortKey, sort, direction, align, onSort }: {
  label: string; sortKey: RegisterSort; sort: RegisterSort; direction: "asc" | "desc"; align?: "right";
  onSort: (key: RegisterSort) => void;
}) {
  const active = sortKey === sort;
  return <TableHead className={cn(align === "right" && "text-right")}
    aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}>
    <button type="button" onClick={() => onSort(sortKey)}
      className={cn("inline-flex w-full items-center gap-1 whitespace-nowrap hover:text-foreground",
        align === "right" && "justify-end", active ? "text-foreground" : "text-muted-foreground")}>
      {label}<span className="text-[10px]">{active ? (direction === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  </TableHead>;
}

export function LoanChangesModule() {
  const [view, setView] = useState<"active" | "closed">("active");
  const [filters, setFilters] = useState(defaultFilters);
  const [sort, setSort] = useState<RegisterSort>("reference");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<{ id: number; reference: string; employee: string }>();
  const query = new URLSearchParams({
    view, page: String(page), sort, direction, size: String(size),
    ...Object.fromEntries(Object.entries(filters).flatMap(([name, value]) => value.trim() ? [[name, value.trim()]] : [])),
  }).toString();
  const url = loansApi + "/register?" + query;
  const result = useLifecycleRead<LoanRegisterPage>(url, refresh);
  const data = result?.data;
  const options = data?.filters ?? { agencies: [], departments: [], programs: [] };
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const start = total ? (page - 1) * size + 1 : 0;
  const end = Math.min(page * size, total);
  const reload = () => setRefresh(value => value + 1);
  const update = (name: keyof typeof filters, value: string) => {
    setFilters(previous => ({ ...previous, [name]: value }));
    setPage(1);
  };
  const toggleSort = (key: RegisterSort) => {
    if (key === sort) setDirection(value => value === "asc" ? "desc" : "asc");
    else { setSort(key); setDirection(key === "reference" ? "desc" : "asc"); }
    setPage(1);
  };

  return <section className="space-y-4">
    <header>
      <h2 className="text-lg font-semibold">Loan Changes</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Record separations, direct payments, amortization changes, suspensions, and agency refunds. Each change becomes an instruction to Payroll; changes made in the open period can be reversed.
      </p>
    </header>

    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Loan change scope">
      {([["active", "Active loans"], ["closed", "Closed loans (refunds)"]] as const).map(([value, label]) =>
        <Button key={value} type="button" size="sm" variant={view === value ? "default" : "outline"}
          aria-pressed={view === value} onClick={() => { setView(value); setPage(1); }}>{label}</Button>)}
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
      <Input className="w-full sm:max-w-xs" value={filters.q} maxLength={120} placeholder="Employee, loan, or agency reference"
        aria-label="Search loans for changes" onChange={event => update("q", event.target.value)} />
      <NativeSelect aria-label="Filter by agency" value={filters.agency} onChange={event => update("agency", event.target.value)}>
        <option value="">All agencies</option>
        {options.agencies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Filter by department" value={filters.department} onChange={event => update("department", event.target.value)}>
        <option value="">All departments</option>
        {options.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      <label className="flex items-center gap-2 px-2 text-sm">
        <input type="checkbox" className="size-4 accent-emerald-700" checked={filters.short === "1"}
          onChange={event => update("short", event.target.checked ? "1" : "")} />Last deduction short
      </label>
      <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-live="polite">{data ? (total ? `Showing ${start}–${end} of ${total}` : "No loans") : "Loading…"}</span>
        {(filters.q || filters.agency || filters.department || filters.short) &&
          <Button type="button" variant="ghost" size="sm" onClick={() => { setFilters(defaultFilters); setPage(1); }}>Clear</Button>}
      </div>
    </div>

    {result?.error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <span className="min-w-0 flex-1">{result.error}</span>
      <Button type="button" variant="outline" size="sm" onClick={reload}>Retry</Button>
    </div>}

    <div className="space-y-2">
      <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow>
            <SortHeader label="Loan" sortKey="reference" sort={sort} direction={direction} onSort={toggleSort} />
            <SortHeader label="Employee" sortKey="employee" sort={sort} direction={direction} onSort={toggleSort} />
            <SortHeader label="Agency" sortKey="agency" sort={sort} direction={direction} onSort={toggleSort} />
            <TableHead>Program</TableHead>
            <SortHeader label="Loan amount" sortKey="principal" sort={sort} direction={direction} align="right" onSort={toggleSort} />
            <SortHeader label="Amortization" sortKey="amortization" sort={sort} direction={direction} align="right" onSort={toggleSort} />
            <SortHeader label="Paid / total" sortKey="counted" sort={sort} direction={direction} align="right" onSort={toggleSort} />
            <SortHeader label="Remaining (est.)" sortKey="estimate" sort={sort} direction={direction} align="right" onSort={toggleSort} />
            <SortHeader label="Status" sortKey="status" sort={sort} direction={direction} onSort={toggleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {!data && <TableRowsSkeleton rows={8} columns={9} />}
            {data?.items.map(loan => <TableRow key={loan.id} className="cursor-pointer hover:bg-muted/50"
              onClick={() => setSelected({ id: loan.id, reference: loan.reference, employee: loan.employee })}>
              <TableCell>
                <span className="whitespace-nowrap text-xs font-medium">{loan.reference}</span>
                <p className="mt-1 max-w-36 truncate text-xs text-muted-foreground" title="Masked agency reference">{maskedReference(loan.agencyReference)}</p>
              </TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2.5">
                  <PersonAvatar name={loan.employee} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{loan.employee}</p>
                    {loan.department && <p className="truncate text-xs text-muted-foreground">{loan.department}</p>}
                  </div>
                </div>
              </TableCell>
              <TableCell>{loan.agency}</TableCell>
              <TableCell>{loan.program}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(loan.principal)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(loan.amortization)}</TableCell>
              <TableCell className="text-right tabular-nums">{loan.counted} / {loan.term}</TableCell>
              <TableCell className="text-right">
                <p className="tabular-nums">{amount(loan.agencyBalance.latest ? loan.agencyBalance.adjusted : loan.estimate)}</p>
                <p className="text-xs text-muted-foreground">{loan.agencyBalance.latest ? `per agency ${date(loan.agencyBalance.latest.date)}` : "estimate"}</p>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <StatusChip status={loan.status} label={registerStatusLabels[loan.status]} />
                  {loan.active && loan.lastDeductionShort && <Badge variant="destructive" title="Last deduction was short">Short</Badge>}
                </div>
              </TableCell>
            </TableRow>)}
            {data && !data.items.length && <TableRow><TableCell colSpan={9} className="p-0">
              <EmptyState icon={SearchX} title="No loans to change"
                description={view === "active" ? "No active loans match these filters." : "No closed loans match these filters."} />
            </TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      {total > 10 && <nav aria-label="Loan change pages" className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Rows per page
          <NativeSelect aria-label="Rows per page" className="h-8 w-20" value={String(size)}
            onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>
            {pageSizeOptions.map(value => <option key={value} value={value}>{value}</option>)}
          </NativeSelect>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </nav>}
    </div>

    <p className="text-sm text-muted-foreground">Need the full register view? <Link className="underline" href="/fm/government-loans/loans?tab=register">Open the Loan Register</Link>.</p>

    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{selected ? `${selected.reference} · ${selected.employee}` : "Loan change"}</DialogTitle>
          <DialogDescription>Record or reverse a change, then review the instruction sent to Payroll.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {selected && <ChangeReview id={selected.id} onSaved={() => { setPage(1); reload(); }} />}
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
