"use client";

import { useState, type FormEvent } from "react";
import { UserMinus, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { EmptyState, PersonAvatar, StatusChip } from "../components/ui";
import { centavos } from "../payroll-handoff/contract";
import { amountFromCentavos } from "./position";
import { loansApi, useLifecycleCommand, useLifecycleRead } from "./lifecycle-client";
import { registerStatusLabels, type RegisterStatus } from "./types";

type Person = { id: number; name: string; hiredOn: string | null; separationOn: string | null };
type RecordView = { actor_name: string; recorded_at: string; detail: { hasLoans?: boolean; note?: string } };
type Loan = { loanId: number; reference: string; agency: string; status: RegisterStatus; refundPending: boolean;
  blocked: boolean; finalPay: { expected: string; withheld: string } | null };
type PersonRow = Person & { status: string | null; hasLoans: boolean; loans: Loan[] };
type Page = { items: PersonRow[]; hasMore: boolean };
type Mode = "hires" | "exits";
const endpoint = loansApi + "/onboarding-exits";

function EmployeeReview({ mode, id, onSaved }: { mode: Mode; id: number; onSaved: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const loaded = useLifecycleRead<{ person: Person; record: RecordView | null; loans: Loan[] }>(
    endpoint + "?" + new URLSearchParams({ mode, employee: String(id) }), refresh);
  const command = useLifecycleCommand();
  const data = loaded?.data;
  const reload = () => setRefresh(value => value + 1);
  if (!data) return <div className="space-y-2" aria-busy="true">
    <p role={loaded?.error ? "alert" : "status"} className="text-sm text-muted-foreground">
      {loaded?.error ?? "Loading employee…"}
    </p>
    {loaded?.error && <Button variant="outline" size="sm" onClick={reload}>Retry</Button>}
    {!loaded?.error && <><Skeleton className="h-5 w-48" /><Skeleton className="h-20 w-full" /></>}
  </div>;
  const { person, record, loans } = data;
  const save = (body: object) => command.run(endpoint, body, () => { reload(); onSaved(); });

  function declare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return save({ kind: "DECLARE", employeeId: id, hasLoans: form.get("hasLoans") === "yes", note: form.get("note") });
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{person.name}</span>
      <span className="text-muted-foreground">{mode === "hires" ? "Hired " + date(person.hiredOn) : "Separating " + date(person.separationOn)}</span>
    </div>
    {command.error && <p role="alert" className="text-destructive">{command.error}</p>}
    {record && <p role="status" className="text-sm">{mode === "hires"
      ? record.detail.hasLoans ? "Existing loans declared" : "No existing loans declared"
      : "Loan clearance issued"} · {record.actor_name} · {dateTime(record.recorded_at)}</p>}
    {mode === "hires" ? record ? <>
      {record.detail.note && <p className="text-sm">{record.detail.note}</p>}
      {record.detail.hasLoans && <p className="text-sm text-muted-foreground">Enroll declared loans in Loan Applications → Enrollment.</p>}
    </> : <form onSubmit={event => void declare(event)} className="space-y-3">
      <label className="block text-sm">Existing payroll-deductible loans
        <NativeSelect name="hasLoans" required defaultValue=""><option value="">Choose a declaration</option>
          <option value="yes">Has existing loans</option><option value="no">No existing loans</option></NativeSelect>
      </label>
      <label className="block text-sm">Notes (optional)<Textarea name="note" maxLength={500} /></label>
      <Button disabled={command.busy}>Save declaration</Button>
    </form> : <>
      <ul className="space-y-2 text-sm">
        {loans.map(loan => <li key={loan.loanId} className="rounded-md border p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{loan.reference}</span>
            <StatusChip status={loan.status} label={registerStatusLabels[loan.status]} />
            {loan.refundPending && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Refund pending</Badge>}
          </div>
          <p className="mt-1 text-muted-foreground">{loan.agency}</p>
          {loan.finalPay && <p>Final pay withheld {peso(loan.finalPay.withheld)} · Unpaid agency balance {
            peso(amountFromCentavos(centavos(loan.finalPay.expected) - centavos(loan.finalPay.withheld)))}</p>}
        </li>)}
      </ul>
      {!loans.length && <p className="text-sm text-muted-foreground">No verified loans for this employee.</p>}
      {!record && <Button disabled={command.busy || loans.some(loan => loan.blocked)}
        onClick={() => void save({ kind: "CLEAR", employeeId: id })}>Issue loan clearance</Button>}
    </>}
  </div>;
}

function TableSkeleton({ columns }: { columns: number }) {
  return <>{Array.from({ length: 5 }, (_, row) => <TableRow key={row}>
    {Array.from({ length: columns }, (_, cell) => <TableCell key={cell}>
      <Skeleton className={cell === 0 ? "h-4 w-40" : "h-4 w-24"} />
    </TableCell>)}
  </TableRow>)}</>;
}

export function OnboardingExitsModule() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<{ mode: Mode; id: number; name: string }>();
  const command = useLifecycleCommand();
  const query = new URLSearchParams({ q: search.trim(), page: String(page) }).toString();
  const hires = useLifecycleRead<Page>(endpoint + "?mode=hires&" + query, refresh);
  const exits = useLifecycleRead<Page>(endpoint + "?mode=exits&" + query, refresh);
  const reload = () => setRefresh(value => value + 1);
  const hasMore = !!(hires?.data?.hasMore || exits?.data?.hasMore);

  function declare(person: PersonRow, hasLoans: boolean) {
    void command.run(endpoint, { kind: "DECLARE", employeeId: person.id, hasLoans }, () => {
      reload();
      if (hasLoans) setSelected({ mode: "hires", id: person.id, name: person.name });
    });
  }

  function clear(person: PersonRow) {
    void command.run(endpoint, { kind: "CLEAR", employeeId: person.id }, reload);
  }

  return <section className="space-y-4">
    <header>
      <h2 className="text-lg font-semibold">Onboarding &amp; exits</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Ask new hires about loans carried from a previous employer, and clear separating employees&apos; loans before their final pay.
      </p>
    </header>
    <div className="flex flex-wrap items-center gap-2">
      <Input className="w-full sm:max-w-xs" aria-label="Find employees" placeholder="Employee name or ID" maxLength={100}
        value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <span className="text-sm text-muted-foreground">{command.busy ? "Saving…" : "Employee movements come from the HR system."}</span>
    </div>
    {command.error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{command.error}</p>}

    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div>
          <h3 className="font-semibold">New hires — loan declaration</h3>
          <p className="text-sm text-muted-foreground">Declare whether the employee has an existing SSS or Pag-IBIG loan.</p>
        </div>
        {hires?.error && <Button type="button" size="sm" variant="outline" onClick={reload}>Retry</Button>}
      </div>
      {hires?.error && <p role="alert" className="p-3 text-sm text-destructive">{hires?.error}</p>}
      <Table>
        <TableHeader><TableRow>
          <TableHead>Employee</TableHead><TableHead>Hired</TableHead><TableHead>Declaration</TableHead><TableHead className="text-right">Action</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {!hires?.data && <TableSkeleton columns={4} />}
          {hires?.data?.items.map(person => <TableRow key={person.id}>
            <TableCell>
              <div className="flex min-w-0 items-center gap-2.5">
                <PersonAvatar name={person.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{person.name}</p>
                  <p className="text-xs text-muted-foreground">Employee #{person.id}</p>
                </div>
              </div>
            </TableCell>
            <TableCell>{date(person.hiredOn)}</TableCell>
            <TableCell>{person.status
              ? <Badge variant="outline" className={person.hasLoans ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"}>
                  {person.hasLoans ? "Has existing loans" : "No existing loans"}
                </Badge>
              : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">Not yet declared</Badge>}</TableCell>
            <TableCell>
              <div className="flex flex-wrap justify-end gap-1">
                {!person.status && <>
                  <Button type="button" size="sm" variant="outline" disabled={command.busy} onClick={() => declare(person, false)}>No existing loans</Button>
                  <Button type="button" size="sm" disabled={command.busy} onClick={() => declare(person, true)}>Has loans</Button>
                </>}
                <Button type="button" size="sm" variant="outline" onClick={() => setSelected({ mode: "hires", id: person.id, name: person.name })}>Review</Button>
              </div>
            </TableCell>
          </TableRow>)}
          {hires?.data && !hires?.data.items.length && <TableRow><TableCell colSpan={4} className="p-0">
            <EmptyState icon={UserRound} title="No recent hires" description="New employees appear here for the 150-day declaration window." />
          </TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>

    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div>
          <h3 className="font-semibold">Separations — loan clearance</h3>
          <p className="text-sm text-muted-foreground">Close or settle every loan before issuing the clearance and releasing final pay.</p>
        </div>
        {exits?.error && <Button type="button" size="sm" variant="outline" onClick={reload}>Retry</Button>}
      </div>
      {exits?.error && <p role="alert" className="p-3 text-sm text-destructive">{exits?.error}</p>}
      <Table>
        <TableHeader><TableRow>
          <TableHead>Employee</TableHead><TableHead>Separation</TableHead><TableHead>Loans</TableHead><TableHead>Clearance</TableHead><TableHead className="text-right">Action</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {!exits?.data && <TableSkeleton columns={5} />}
          {exits?.data?.items.map(person => {
            const open = person.loans.filter(loan => loan.blocked).length;
            const issued = person.status === "ISSUED";
            return <TableRow key={person.id}>
              <TableCell>
              <div className="flex min-w-0 items-center gap-2.5">
                <PersonAvatar name={person.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{person.name}</p>
                  <p className="text-xs text-muted-foreground">Employee #{person.id}</p>
                </div>
              </div>
            </TableCell>
              <TableCell>{date(person.separationOn)}</TableCell>
              <TableCell>
                {person.loans.length ? <div className="space-y-1">
                  {person.loans.map(loan => <div key={loan.loanId} className="flex flex-wrap items-center gap-1 text-xs">
                    <span className="font-mono">{loan.reference}</span>
                    <StatusChip status={loan.status} label={registerStatusLabels[loan.status]} />
                    {loan.refundPending && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Refund</Badge>}
                  </div>)}
                </div> : <span className="text-sm text-muted-foreground">No verified loans</span>}
              </TableCell>
              <TableCell>{issued ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">Cleared</Badge>
                : open ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">{open} open</Badge>
                : <Badge variant="outline">Ready</Badge>}</TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1">
                  {!issued && !open && <Button type="button" size="sm" disabled={command.busy} onClick={() => clear(person)}>Issue clearance</Button>}
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelected({ mode: "exits", id: person.id, name: person.name })}>Review</Button>
                </div>
              </TableCell>
            </TableRow>;
          })}
          {exits?.data && !exits?.data.items.length && <TableRow><TableCell colSpan={5} className="p-0">
            <EmptyState icon={UserMinus} title="No separations" description="Employees with a separation date appear here for loan clearance." />
          </TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>

    {(page > 1 || hasMore) && <nav aria-label="Onboarding and exits pages" className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">Page {page}</span>
      <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <Button type="button" variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage(page + 1)}>Next</Button>
    </nav>}

    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{selected ? selected.name : "Employee"}</DialogTitle>
          <DialogDescription>{selected?.mode === "hires" ? "Loan declaration for a recent hire" : "Loan clearance for a separating employee"}</DialogDescription>
        </DialogHeader>
        {selected && <EmployeeReview mode={selected.mode} id={selected.id} onSaved={reload} />}
      </DialogContent>
    </Dialog>
  </section>;
}
