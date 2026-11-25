"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { centavos } from "../payroll-handoff/contract";
import { amountFromCentavos } from "./position";
import { loansApi, useLifecycleCommand, useLifecycleRead } from "./lifecycle-client";
import { registerStatusLabels, type RegisterStatus } from "./types";

type Person = { id: number; name: string; hiredOn: string | null; separationOn: string | null };
type RecordView = { actor_name: string; recorded_at: string; detail: { hasLoans?: boolean; note?: string } };
type Loan = { loanId: number; reference: string; agency: string; status: RegisterStatus; refundPending: boolean;
  blocked: boolean; finalPay: { expected: string; withheld: string } | null };
type Mode = "hires" | "exits";
const endpoint = loansApi + "/onboarding-exits";

function EmployeeReview({ mode, id, onSaved }: { mode: Mode; id: number; onSaved: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const loaded = useLifecycleRead<{ person: Person; record: RecordView | null; loans: Loan[] }>(
    endpoint + "?" + new URLSearchParams({ mode, employee: String(id) }), refresh);
  const command = useLifecycleCommand();
  const data = loaded?.data;
  const reload = () => setRefresh(value => value + 1);
  if (!data) return <p role={loaded?.error ? "alert" : "status"}>{loaded?.error ?? "Loading employee…"}
    {loaded?.error && <Button variant="outline" size="sm" onClick={reload}>Retry</Button>}</p>;
  const { person, record, loans } = data;
  const save = (body: object) => command.run(endpoint, body, () => { reload(); onSaved(); });

  function declare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return save({ kind: "DECLARE", employeeId: id, hasLoans: form.get("hasLoans") === "yes", note: form.get("note") });
  }

  return <div className="space-y-3 rounded-md border p-4">
    <h3 className="font-semibold">{person.name}</h3>
    <p className="text-sm">{mode === "hires" ? "Hired " + date(person.hiredOn) : "Separating " + date(person.separationOn)}</p>
    {command.error && <p role="alert" className="text-destructive">{command.error}</p>}
    {record && <p role="status" className="text-sm">{mode === "hires"
      ? record.detail.hasLoans ? "Existing loans declared" : "No existing loans declared"
      : "Loan clearance issued"} · {record.actor_name} · {dateTime(record.recorded_at)}</p>}
    {mode === "hires" ? record ? <>
      {record.detail.note && <p className="text-sm">{record.detail.note}</p>}
      {record.detail.hasLoans && <Button asChild><a href={"/fm/government-loans/loan-applications?transferEmployee=" + id}>Enroll transferred loan</a></Button>}
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
          <p>{loan.reference} · {loan.agency} · {registerStatusLabels[loan.status]}</p>
          {loan.refundPending && <p>Awaiting Payroll refund payout</p>}
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

export function OnboardingExitsModule() {
  const [mode, setMode] = useState<Mode>("hires");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [employee, setEmployee] = useState<number>();
  const [refresh, setRefresh] = useState(0);
  const result = useLifecycleRead<{ items: (Person & { status: string | null })[]; hasMore: boolean }>(
    endpoint + "?" + new URLSearchParams({ mode, q: search, page: String(page) }), refresh);
  const reload = () => setRefresh(value => value + 1);
  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">Onboarding &amp; exits</h2>
    <div className="flex flex-wrap gap-2">
      <NativeSelect aria-label="Employee group" value={mode} onChange={event => {
        setMode(event.target.value as Mode); setPage(1); setEmployee(undefined);
      }}><option value="hires">Recent hires</option><option value="exits">Separating employees</option></NativeSelect>
      <Input className="max-w-xs" aria-label="Find employees" placeholder="Employee name or ID" maxLength={100} value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }} />
    </div>
    {!result?.data && <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Loading employees…"}
      {result?.error && <Button variant="outline" size="sm" onClick={reload}>Retry</Button>}</p>}
    {result?.data && <div className="flex flex-wrap gap-2">{result.data.items.map(person => <Button key={person.id} size="sm"
      variant={employee === person.id ? "default" : "outline"} onClick={() => setEmployee(person.id)}>
      {person.name}{person.status ? mode === "hires" ? " · Declared" : " · Cleared" : ""}
    </Button>)}{!result.data.items.length && <p>No employees match.</p>}</div>}
    {(page > 1 || result?.data?.hasMore) && <nav className="flex gap-2" aria-label="Employee pages">
      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
      <Button size="sm" variant="outline" disabled={!result?.data?.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
    </nav>}
    {employee && <EmployeeReview key={mode + ":" + employee} mode={mode} id={employee} onSaved={reload} />}
  </section>;
}
