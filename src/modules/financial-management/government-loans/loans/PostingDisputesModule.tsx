"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { disputeLabels, nextDisputeStatus, type DisputeStatus } from "./lifecycle";
import { loansApi, useLifecycleCommand, useLifecycleRead } from "./lifecycle-client";

type DeductionStatus = "D" | "P" | "F" | "X";
type Evidence = {
  loanId: number; reference: string; agency: string; employee: string; month: string;
  deducted: { status: DeductionStatus; amount: string; expected: string } | null;
  remitted: { state: string; paidOn: string; reference: string } | null;
};
type Dispute = { reference: string; employee: string; loanId: number; loanReference: string; month: string; description: string;
  attachmentName: string | null; author: string; recordedAt: string; status: DisputeStatus; revision: number; note?: string };
const ownEndpoint = "/api/fm/government-loans/my-loans/disputes";
const shortRef = (value: string) => "DS-" + value.slice(0, 8).toUpperCase();
const deductionLabel: Record<DeductionStatus, string> = { D: "Deducted", P: "Partial", F: "Not deducted", X: "Final pay" };
const statusTone = (status: DisputeStatus) => status === "RESOLVED"
  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
  : status === "IN_PROGRESS" ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";

function Filing({ saved }: { saved: (reference: string) => void }) {
  const command = useLifecycleCommand();
  const [refresh, setRefresh] = useState(0);
  const loaded = useLifecycleRead<{ month: string; loans: { id: number; reference: string; agency: string }[] }>(ownEndpoint + "?filing=1", refresh);
  if (!loaded?.data) return <p role={loaded?.error ? "alert" : "status"}>{loaded?.error ?? "Loading your loans…"}
    {loaded?.error && <Button size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button>}</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await command.run(ownEndpoint, new FormData(event.currentTarget), async response => saved((await response.json() as Dispute).reference));
  }
  return <form className="space-y-2 rounded-md border p-3" onSubmit={event => void submit(event)}>
    <div className="flex flex-wrap gap-2">
      <label className="text-sm">Loan <NativeSelect name="loanId" defaultValue="" required><option value="">Choose your loan</option>
        {loaded.data.loans.map(loan => <option key={loan.id} value={loan.id}>{loan.reference} · {loan.agency}</option>)}</NativeSelect></label>
      <label className="text-sm">Deduction month <Input name="month" type="month" defaultValue={loaded.data.month} required /></label>
    </div>
    <label className="block text-sm">What happened?<Textarea name="description" required maxLength={1500} /></label>
    <label className="block text-sm">Evidence (optional)<Input name="attachment" type="file" accept=".pdf,.png,.jpg,.jpeg" /></label>
    {command.error && <p role="alert" className="text-destructive">{command.error}</p>}
    <Button disabled={command.busy || !loaded.data.loans.length}>File dispute</Button>
  </form>;
}

function DisputeReview({ endpoint, reference, self, onSaved }: { endpoint: string; reference: string; self: boolean; onSaved: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const [notesPage, setNotesPage] = useState(1);
  const command = useLifecycleCommand();
  const query = new URLSearchParams({ reference, notesPage: String(notesPage) });
  const result = useLifecycleRead<{ dispute: Dispute; history: Dispute[]; hasMore: boolean; evidence: Evidence | null }>(
    endpoint + "?" + query, refresh);
  const reload = () => setRefresh(value => value + 1);
  if (!result?.data) return <div className="space-y-2 rounded-md border p-4" aria-busy="true">
    <p role={result?.error ? "alert" : "status"} className="text-sm text-muted-foreground">
      {result?.error ?? "Loading dispute…"}
    </p>
    {result?.error && <Button size="sm" variant="outline" onClick={reload}>Retry</Button>}
    {!result?.error && <><Skeleton className="h-5 w-40" /><Skeleton className="h-24 w-full" /><Skeleton className="h-32 w-full" /></>}
  </div>;
  const { dispute, history, hasMore, evidence } = result.data;
  const next = nextDisputeStatus[dispute.status];
  return <div className="space-y-3 rounded-md border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{shortRef(reference)}</h3>
      <Badge variant="outline" className={statusTone(dispute.status)}>{disputeLabels[dispute.status]}</Badge>
    </div>
    <p className="text-sm text-muted-foreground">{dispute.employee} · {dispute.loanReference} · {dispute.month}</p>
    <p className="whitespace-pre-wrap text-sm">{dispute.description}</p>
    {dispute.attachmentName && <Button asChild variant="outline" size="sm">
      <a href={endpoint + "?" + new URLSearchParams({ reference, download: "1" })}>Download {dispute.attachmentName}</a>
    </Button>}

    <div className="rounded-md border bg-muted/20 p-3">
      <h4 className="text-sm font-semibold">Deduction and remittance evidence</h4>
      {evidence ? <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-muted-foreground">Agency</dt><dd className="font-medium">{evidence.agency}</dd></div>
        <div><dt className="text-muted-foreground">Payroll month</dt><dd className="font-medium">{evidence.month}</dd></div>
        <div><dt className="text-muted-foreground">Payroll deducted</dt><dd className="font-medium tabular-nums">
          {evidence.deducted ? `${deductionLabel[evidence.deducted.status]} · ${peso(evidence.deducted.amount)}` : "No payroll result"}
        </dd></div>
        <div><dt className="text-muted-foreground">Remitted</dt><dd className="font-medium">
          {evidence.remitted ? `${date(evidence.remitted.paidOn)} · ${evidence.remitted.reference}` : "Not yet remitted"}
        </dd></div>
      </dl> : <p className="mt-1 text-sm text-muted-foreground">No linked loan evidence for this dispute.</p>}
    </div>

    <div>
      <h4 className="text-sm font-semibold">Status history</h4>
      <ol className="mt-2 space-y-2 text-sm">{history.map(event => <li key={event.revision} className="border-l-2 border-muted pl-3">
        <p><span className="font-medium">{disputeLabels[event.status]}</span> · {event.author} · {dateTime(event.recordedAt)}</p>
        {event.note && <p className="whitespace-pre-wrap text-muted-foreground">{event.note}</p>}
      </li>)}</ol>
    </div>
    {(notesPage > 1 || hasMore) && <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={notesPage === 1} onClick={() => setNotesPage(value => value - 1)}>Newer notes</Button>
      <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setNotesPage(value => value + 1)}>Older notes</Button>
    </div>}
    {!self && next && <form key={dispute.revision} className="space-y-2" onSubmit={event => {
      event.preventDefault();
      const note = new FormData(event.currentTarget).get("note");
      void command.run(endpoint, { reference, revision: dispute.revision, status: next, note }, () => { reload(); onSaved(); });
    }}>
      <label className="block text-sm">Status note<Textarea name="note" required maxLength={1000} /></label>
      {command.error && <p role="alert" className="text-destructive">{command.error} <Button size="sm" variant="outline"
        type="button" onClick={reload}>Reload dispute</Button></p>}
      <Button disabled={command.busy}>{next === "IN_PROGRESS" ? "Start review" : "Resolve dispute"}</Button>
    </form>}
  </div>;
}

export function PostingDisputesModule({ self = false, initialFiling = false }: { self?: boolean; initialFiling?: boolean }) {
  const endpoint = self ? ownEndpoint : loansApi + "/disputes";
  const [filing, setFiling] = useState(initialFiling);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string>();
  const [serverPage, setServerPage] = useState(1);
  const [localPage, setLocalPage] = useState(1);
  const [size, setSize] = useState(10);
  const [refresh, setRefresh] = useState(0);
  const result = useLifecycleRead<{ items: Dispute[]; hasMore: boolean }>(
    endpoint + "?page=" + serverPage + "&size=100", refresh);
  const reload = () => setRefresh(value => value + 1);
  const rows = (result?.data?.items ?? []).filter(dispute => {
    if (status && dispute.status !== status) return false;
    if (!search.trim()) return true;
    const haystack = `${shortRef(dispute.reference)} ${dispute.employee} ${dispute.loanReference} ${dispute.month} ${dispute.description}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const visible = rows.slice((localPage - 1) * size, localPage * size);
  const start = rows.length ? (localPage - 1) * size + 1 : 0;
  const end = Math.min(localPage * size, rows.length);

  return <section className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{self ? "My posting disputes" : "Posting disputes"}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Employees report deductions that do not appear in their agency records. Use the deduction and remittance evidence to follow up and keep the employee updated.
        </p>
      </div>
      {self && <Button size="sm" variant="outline" onClick={() => setFiling(value => !value)}>{filing ? "Close form" : "Report a posting problem"}</Button>}
    </header>

    {filing && <Filing saved={reference => { setSelected(reference); setFiling(false); setServerPage(1); reload(); }} />}

    <div className="flex flex-wrap items-center gap-2">
      <Input className="w-full sm:max-w-xs" value={search} maxLength={120} placeholder="Employee, dispute, or loan…"
        aria-label="Search disputes" onChange={event => { setSearch(event.target.value); setLocalPage(1); }} />
      <NativeSelect aria-label="Filter disputes by status" value={status} onChange={event => { setStatus(event.target.value); setLocalPage(1); }}>
        <option value="">All statuses</option>
        {Object.entries(disputeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </NativeSelect>
      <Button type="button" variant="outline" size="sm" onClick={reload}>Refresh</Button>
      <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
        {result?.data ? (rows.length ? `Showing ${start}–${end} of ${rows.length}` : "No disputes") : "Loading…"}
      </span>
    </div>

    {result?.error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <span className="min-w-0 flex-1">{result.error}</span><Button size="sm" variant="outline" onClick={reload}>Retry</Button>
    </div>}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-2">
        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Dispute</TableHead><TableHead>Employee</TableHead><TableHead>Loan</TableHead>
              <TableHead>Month</TableHead><TableHead>Filed</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!result?.data && Array.from({ length: 6 }, (_, row) => <TableRow key={row}>
                {Array.from({ length: 6 }, (_, cell) => <TableCell key={cell}><Skeleton className={cell === 0 ? "h-4 w-24" : "h-4 w-20"} /></TableCell>)}
              </TableRow>)}
              {visible.map(dispute => <TableRow key={dispute.reference} className={cn("cursor-pointer", selected === dispute.reference && "bg-muted/60")}
                onClick={() => setSelected(dispute.reference)}>
                <TableCell className="font-mono text-xs">{shortRef(dispute.reference)}</TableCell>
                <TableCell>{dispute.employee}</TableCell>
                <TableCell className="font-mono text-xs">{dispute.loanReference}</TableCell>
                <TableCell>{dispute.month}</TableCell>
                <TableCell>{date(dispute.recordedAt)}</TableCell>
                <TableCell><Badge variant="outline" className={statusTone(dispute.status)}>{disputeLabels[dispute.status]}</Badge></TableCell>
              </TableRow>)}
              {result?.data && !visible.length && <TableRow><TableCell colSpan={6} className="p-0">
                <Empty className="border-0"><EmptyHeader><EmptyMedia variant="icon"><span>💬</span></EmptyMedia>
                  <EmptyTitle>No disputes match</EmptyTitle><EmptyDescription>Try a different search or status.</EmptyDescription>
                </EmptyHeader></Empty>
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {(rows.length > 10 || result?.data?.hasMore || serverPage > 1) && <nav aria-label="Dispute pages" className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">Rows per page
            <NativeSelect aria-label="Rows per page" className="h-8 w-20" value={String(size)}
              onChange={event => { setSize(Number(event.target.value)); setLocalPage(1); }}>
              {[10, 25, 50].map(value => <option key={value} value={value}>{value}</option>)}
            </NativeSelect>
          </label>
          <div className="flex items-center gap-2">
            {serverPage > 1 && <Button size="sm" variant="outline" onClick={() => { setServerPage(serverPage - 1); setLocalPage(1); }}>Newer batch</Button>}
            <Button size="sm" variant="outline" disabled={localPage === 1} onClick={() => setLocalPage(localPage - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {localPage} of {pages}</span>
            <Button size="sm" variant="outline" disabled={localPage >= pages} onClick={() => setLocalPage(localPage + 1)}>Next</Button>
            {result?.data?.hasMore && <Button size="sm" variant="outline" onClick={() => { setServerPage(serverPage + 1); setLocalPage(1); }}>Older batch</Button>}
          </div>
        </nav>}
      </div>
      <div className="min-w-0">
        {selected ? <DisputeReview key={selected} endpoint={endpoint} reference={selected} self={self} onSaved={reload} />
          : <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            Select a dispute to see the deduction and remittance evidence, status history, and follow-up notes.
          </div>}
      </div>
    </div>
  </section>;
}
