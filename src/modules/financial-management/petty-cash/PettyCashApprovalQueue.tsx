"use client";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFundRead } from "./hooks/useFunds";
import { UpdatedAgo } from "./components/UpdatedAgo";
import { PettyCashPageHeader } from "./components/PettyCashPageHeader";
import type { ApprovalRow } from "./master-types";
import type { Page } from "./onboarding-types";
import { ApprovalFilterBar } from "./components/ApprovalFilterBar";
import { MasterError, MasterTable } from "./components/MasterCommon";
import { FundStatusBadge } from "./components/FundStatusBadge";
import { TableSkeleton } from "./components/PettyCashSkeletons";
import { FundChangeReview } from "./components/FundChangeReview";
import { approvalFilterParams, approvalFiltersActive, EMPTY_APPROVAL_FILTERS, type ApprovalFilterState } from "./utils/approvalFilters";
import { dateTime, dateOnly } from "./utils/dateTime";

const PENDING_HEADERS = ["Request", "Type", "Fund", "Detail", "Requested by", "Date", "Status", ""];
const DECIDED_HEADERS = ["Request", "Type", "Fund", "Requested by", "Decided by", "Status", "Entry"];

export default function PettyCashApprovalQueue({ actorName, canDecide, renderFund }: { actorName: string; canDecide: boolean; renderFund: (id: string, close: () => void, changed: (message?: string) => void) => ReactNode }) {
  const [selected, setSelected] = useState<ApprovalRow | null>(null), [pendingPage, setPendingPage] = useState(1), [decidedPage, setDecidedPage] = useState(1);
  const [pendingFilters, setPendingFilters] = useState<ApprovalFilterState>({ ...EMPTY_APPROVAL_FILTERS.pending }), [decidedFilters, setDecidedFilters] = useState<ApprovalFilterState>({ ...EMPTY_APPROVAL_FILTERS.decided });
  const pending = useFundRead<Page<ApprovalRow>>(`onboarding-approval/requests?${approvalFilterParams({ queue: "pending", page: pendingPage, filters: pendingFilters })}`, 250);
  const decided = useFundRead<Page<ApprovalRow>>(`onboarding-approval/requests?${approvalFilterParams({ queue: "decided", page: decidedPage, filters: decidedFilters })}`, 250);
  function updatePending(patch: Partial<ApprovalFilterState>) { setPendingFilters(filters => ({ ...filters, ...patch })); setPendingPage(1); }
  function updateDecided(patch: Partial<ApprovalFilterState>) { setDecidedFilters(filters => ({ ...filters, ...patch })); setDecidedPage(1); }
  function clearPending() { setPendingFilters({ ...EMPTY_APPROVAL_FILTERS.pending }); setPendingPage(1); }
  function clearDecided() { setDecidedFilters({ ...EMPTY_APPROVAL_FILTERS.decided }); setDecidedPage(1); }
  function changed(message?: string) {
    toast.success(message || (selected ? `${selected.docNo} decided. The request was moved to Decided.` : "Decision saved."));
    setSelected(null);
    if (pendingPage > 1 && pending.data?.items.length === 1) setPendingPage(page => page - 1);
    setDecidedPage(1); pending.refresh(); decided.refresh();
  }
  return <section className="space-y-5"><PettyCashPageHeader title="Onboarding Approval" description="Approve or reject new funds and changes to existing funds. Select a request to review its details and posting." />
    {([
      { name: "Awaiting approval", queue: "pending" as const, read: pending, page: pendingPage, setPage: setPendingPage, isPending: true, filters: pendingFilters, update: updatePending, clear: clearPending },
      { name: "Decided requests", queue: "decided" as const, read: decided, page: decidedPage, setPage: setDecidedPage, isPending: false, filters: decidedFilters, update: updateDecided, clear: clearDecided },
    ]).map(({ name, queue, read, page, setPage, isPending, filters, update, clear }) => {
      const active = approvalFiltersActive(filters, queue);
      const empty = isPending ? (active ? "No pending requests match these filters." : "Nothing waiting. New fund requests and Master List changes appear here.") : (active ? "No decided requests match these filters." : "None yet.");
      return <section key={name} className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{isPending ? `Awaiting approval${read.data ? ` (${read.data.total})` : ""}` : `Decided${read.data ? ` (${read.data.total})` : ""}`}</h2>{isPending && <UpdatedAgo at={read.updatedAt} />}</div>
        <ApprovalFilterBar queue={queue} filters={filters} onChange={update} onClear={clear} />
        <MasterError error={read.error} retry={read.refresh} title={isPending ? "Could not load approval queue" : "Could not load decided requests"} />
        {read.loading && <TableSkeleton label={isPending ? "Loading pending approval requests" : "Loading decided requests"} rows={5} columns={(isPending ? PENDING_HEADERS : DECIDED_HEADERS).length} />}
        {read.refreshing && <p role="status" className="text-sm text-muted-foreground">Updating requests...</p>}
        {read.data && <>
          <div className="hidden md:block"><MasterTable label={name} headers={isPending ? PENDING_HEADERS : DECIDED_HEADERS}>
            {read.data.items.map(r => <tr key={`${r.kind}:${r.id}`} className="cursor-pointer align-top hover:bg-muted/30" tabIndex={0} onClick={() => setSelected(r)} onKeyDown={e => { if (e.target === e.currentTarget && e.key === "Enter") setSelected(r); }}>
              <td><button className="font-semibold" aria-label={`Review ${r.docNo}`} onClick={e => { e.stopPropagation(); setSelected(r); }}>{r.docNo}</button></td>
              <td>{r.type}</td>
              <td>{r.fund}</td>
              {isPending && <td>{r.detail}</td>}
              <td>{r.requestedBy}</td>
              <td>{isPending ? dateOnly(r.requestedAt) : <>{r.decidedBy}<small className="block text-muted-foreground">{dateTime(r.decidedAt)}</small></>}</td>
              <td><FundStatusBadge status={r.state} />{r.state === "REJECTED" && <small className="block">{r.remarks}</small>}</td>
              <td>{isPending ? <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setSelected(r); }}>Review</Button> : r.journal || "—"}</td>
            </tr>)}
            {!read.data.items.length && <tr><td colSpan={isPending ? 8 : 7}>{empty}</td></tr>}
          </MasterTable></div>
          <div className="space-y-3 md:hidden">
            {read.data.items.map(r => <article key={`${r.kind}:${r.id}`} tabIndex={0} className="space-y-2 rounded-lg border p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setSelected(r)} onKeyDown={event => { if (event.target === event.currentTarget && event.key === "Enter") setSelected(r); }}>
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{r.docNo}</p><p className="text-muted-foreground">{r.type} · {r.fund}</p></div><FundStatusBadge status={r.state} /></div>
              {isPending ? <p>{r.detail}</p> : r.remarks ? <p className="whitespace-pre-wrap text-muted-foreground">{r.remarks}</p> : null}
              <p className="text-muted-foreground">{isPending ? `${r.requestedBy} · ${dateOnly(r.requestedAt)}` : `${r.decidedBy} · ${dateTime(r.decidedAt)}`}</p>
              {!isPending && r.journal && <p>Entry {r.journal}</p>}
              <div className="flex justify-end"><Button size="sm" variant="outline" aria-label={`${isPending ? "Review" : "View"} ${r.docNo}`} onClick={event => { event.stopPropagation(); setSelected(r); }}>{isPending ? "Review" : "View"}</Button></div>
            </article>)}
            {!read.data.items.length && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{empty}</p>}
          </div>
          {read.data.total > 25 && <div className="flex items-center justify-end gap-3"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page => page - 1)}>Previous</Button><span className="text-sm">Page {page}</span><Button variant="outline" size="sm" disabled={page * 25 >= read.data.total} onClick={() => setPage(page => page + 1)}>Next</Button></div>}
        </>}
      </section>;
    })}
    <section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="text-lg font-semibold">Entries posted on approval</h2><MasterTable label="Entries posted on approval" headers={["Event", "Debit", "Credit"]}>{[["New fund / Increase imprest", "Fund account (GL)", "Selected cash / bank"], ["Decrease imprest", "Selected cash / bank", "Fund account (GL)"], ["Close fund", "Cash / bank (counted), Cash Over/Short if short", "Fund account (GL), Cash Over/Short if over"], ["Change custodian", "No entry", "No entry"]].map(([event, dr, cr]) => <tr key={event}><td>{event}</td><td>{dr}</td><td>{cr}</td></tr>)}</MasterTable></section>
    {selected && (selected.kind === "FUND" ? renderFund(selected.id, () => setSelected(null), changed) : <FundChangeReview key={selected.id} id={selected.id} actorName={actorName} canDecide={canDecide} onClose={() => setSelected(null)} onChanged={changed} />)}
  </section>;
}
