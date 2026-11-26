"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { dateTime } from "@/modules/financial-management/cooperative/members/format";
import { disputeLabels, nextDisputeStatus, type DisputeStatus } from "./lifecycle";
import { loansApi, useLifecycleCommand, useLifecycleRead } from "./lifecycle-client";

type Dispute = { reference: string; employee: string; loanReference: string; month: string; description: string;
  attachmentName: string | null; author: string; recordedAt: string; status: DisputeStatus; revision: number; note?: string };
const ownEndpoint = "/api/fm/government-loans/my-loans/disputes";
const shortRef = (value: string) => "DS-" + value.slice(0, 8).toUpperCase();

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
  const result = useLifecycleRead<{ dispute: Dispute; history: Dispute[]; hasMore: boolean }>(endpoint + "?" + query, refresh);
  const reload = () => setRefresh(value => value + 1);
  if (!result?.data) return <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Loading dispute…"}
    {result?.error && <Button size="sm" variant="outline" onClick={reload}>Retry</Button>}</p>;
  const { dispute, history, hasMore } = result.data;
  const next = nextDisputeStatus[dispute.status];
  return <div className="space-y-3 rounded-md border p-4">
    <h3 className="font-semibold">{shortRef(reference)} · {disputeLabels[dispute.status]}</h3>
    <p className="text-sm">{dispute.employee} · {dispute.loanReference} · {dispute.month}</p>
    <p className="whitespace-pre-wrap">{dispute.description}</p>
    {dispute.attachmentName && <Button asChild variant="outline" size="sm">
      <a href={endpoint + "?" + new URLSearchParams({ reference, download: "1" })}>Download {dispute.attachmentName}</a>
    </Button>}
    <ol className="space-y-2 text-sm">{history.map(event => <li key={event.revision}>
      <p>{disputeLabels[event.status]} · {event.author} · {dateTime(event.recordedAt)}</p>
      {event.note && <p className="whitespace-pre-wrap text-muted-foreground">{event.note}</p>}
    </li>)}</ol>
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

export function PostingDisputesModule({ self = false }: { self?: boolean }) {
  const endpoint = self ? ownEndpoint : loansApi + "/disputes";
  const [filing, setFiling] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const result = useLifecycleRead<{ items: Dispute[]; hasMore: boolean }>(endpoint + "?page=" + page, refresh);
  const reload = () => setRefresh(value => value + 1);
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{self ? "My posting disputes" : "Posting disputes"}</h2>
      {self && <Button size="sm" variant="outline" onClick={() => setFiling(value => !value)}>{filing ? "Close form" : "Report a posting problem"}</Button>}
    </div>
    {filing && <Filing saved={reference => { setSelected(reference); setFiling(false); setPage(1); reload(); }} />}
    {!result?.data && <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Loading disputes…"}
      {result?.error && <Button variant="outline" size="sm" onClick={reload}>Retry</Button>}</p>}
    {result?.data && <div className="flex flex-wrap gap-2">
      {result.data.items.map(dispute => <div key={dispute.reference} className={self ? "w-full space-y-2 rounded-lg border p-3 text-sm" : undefined}>
        <Button size="sm" variant={selected === dispute.reference ? "default" : "outline"}
          onClick={() => setSelected(dispute.reference)}>{shortRef(dispute.reference)} · {dispute.loanReference} · {disputeLabels[dispute.status]}</Button>
        {self && <p className="text-muted-foreground">{dispute.month}{dispute.note && ` · ${dispute.note}`}</p>}
      </div>)}
      {!result.data.items.length && <p>No disputes filed.</p>}
    </div>}
    {(page > 1 || result?.data?.hasMore) && <nav className="flex gap-2" aria-label="Dispute pages">
      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
      <Button size="sm" variant="outline" disabled={!result?.data?.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
    </nav>}
    {selected && <DisputeReview key={selected} endpoint={endpoint} reference={selected} self={self} onSaved={reload} />}
  </section>;
}
