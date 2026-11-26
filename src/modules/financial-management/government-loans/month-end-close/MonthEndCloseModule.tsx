"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { date, dateTime } from "@/modules/financial-management/cooperative/members/format";
import { useLifecycleCommand, useLifecycleRead } from "../loans/lifecycle-client";
import { AgencyRollforward } from "./AgencyRollforward";
import type { closeGovernmentLoanMonth, viewMonthEndClose } from "../server/month-end-close";
import type { GovernmentLoansWorkspaceKey } from "../workspaces";

const endpoint = "/api/fm/government-loans/month-end-close";
type View = Awaited<ReturnType<typeof viewMonthEndClose>> & {
  workspaces: { key: GovernmentLoansWorkspaceKey; title: string; path: string }[];
};
type Snapshot = Awaited<ReturnType<typeof closeGovernmentLoanMonth>>;
type Checklist = Snapshot["checklist"];
const links = { remittance: "remittances", approval: "remittance-approval", loans: "loans", billing: "remittances", refund: "loans" } as const;

function ChecklistRows({ checklist, workspaces }: { checklist: Checklist; workspaces: View["workspaces"] }) {
  const payroll = workspaces.find(workspace => workspace.key === "loans");
  return <div className="space-y-2">
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3">
      <div><h3 className="font-medium">Payroll deductions received</h3><p className="text-sm text-muted-foreground">
        {checklist.payroll ? `Confirmed revision ${checklist.payroll.revision} · ${checklist.resultCount} result(s) · ${dateTime(checklist.payroll.receivedAt)} PHT`
          : "Confirm complete Payroll results before closing."}</p></div>
      <div className="flex items-center gap-2">
        {!checklist.payroll && payroll && <a className="text-sm underline" href={payroll.path}>Open Loans</a>}
        <Badge variant={checklist.payroll ? "outline" : "destructive"}>{checklist.payroll ? "Passed" : "Blocked"}</Badge>
      </div>
    </div>
    {checklist.groups.map(group => {
      const workspace = workspaces.find(workspace => workspace.key === links[group.key]);
      return <section className="rounded-md border p-3" key={group.key}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{group.label}</h3>
          <div className="flex items-center gap-2">
            {!!group.items.length && workspace && <a className="text-sm underline" href={workspace.path}>Open {workspace.title}</a>}
            <Badge variant={group.items.length ? "secondary" : "outline"}>
              {group.items.length ? `${group.items.length} open` : group.key === "billing" && !checklist.payroll ? "Awaiting Payroll" : "Passed"}
            </Badge>
          </div>
        </div>
        {!!group.items.length && <ul className="mt-2 max-h-60 divide-y overflow-y-auto text-sm">
          {group.items.map(entry => <li key={entry.key} className="break-words py-2">
            <div>{entry.label}</div><div className="text-muted-foreground">{entry.detail}</div>
          </li>)}
        </ul>}
      </section>;
    })}
    {!!checklist.finalPay.length && <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Reported final pay results ({checklist.finalPay.length})</summary>
      <ul className="mt-2 max-h-60 divide-y overflow-y-auto">{checklist.finalPay.map(entry => <li key={entry.key} className="break-words py-2">
        <div>{entry.label}</div><div className="text-muted-foreground">{entry.detail}</div></li>)}</ul>
    </details>}
  </div>;
}

function CloseDialog({ current, onClose, onSaved }: { current: NonNullable<View["current"]>; onClose: () => void; onSaved: (snapshot: Snapshot) => void }) {
  const [reason, setReason] = useState("");
  const command = useLifecycleCommand();
  const { checklist, token } = current;
  return <Dialog open onOpenChange={open => { if (!open && !command.busy) onClose(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Close {checklist.month}</DialogTitle>
        <DialogDescription>This locks the period through {date(checklist.endDate)} and opens {checklist.nextMonth}.</DialogDescription>
      </DialogHeader>
      {checklist.openItemCount > 0 && <label className="grid gap-2 text-sm">
        Reason for closing with {checklist.openItemCount} open item(s)
        <Textarea value={reason} maxLength={1000} disabled={command.busy} onChange={event => setReason(event.target.value)} />
      </label>}
      {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={command.busy} onClick={onClose}>Cancel</Button>
        <Button variant={checklist.openItemCount ? "destructive" : "default"}
          disabled={command.busy || (checklist.openItemCount > 0 && !reason.trim())}
          onClick={() => void command.run(endpoint, { month: checklist.month, token, reason: reason.trim() },
            async response => onSaved(await response.json()))}>{command.busy ? "Closing…" : "Confirm close"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function MonthEndCloseModule() {
  const [refresh, reload] = useState(0);
  const [review, setReview] = useState<View["current"]>(null);
  const [completed, setCompleted] = useState<Snapshot>();
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page) });
  if (month) params.set("month", month);
  const loaded = useLifecycleRead<View>(endpoint + "?" + params, refresh);
  const coverage = loaded?.data;
  const current = coverage?.current;
  const saved = coverage?.saved;
  const displayed = saved ?? current;
  const exportUrl = (format: string) => endpoint + "?" + new URLSearchParams({ format, month: displayed!.checklist.month });
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">{displayed ? "Close checklist · " + displayed.checklist.month : "Close checklist"}</h2>
      <div className="flex flex-wrap gap-2">
        {month && <Button variant="outline" onClick={() => setMonth("")}>Open month</Button>}
        <Button variant="outline" onClick={() => reload(value => value + 1)}>Refresh checklist</Button>
        {displayed && <>
          <Button variant="outline" asChild><a href={exportUrl("checklist-csv")}>Checklist CSV</a></Button>
          {displayed.rollforward
            ? <Button variant="outline" asChild><a href={exportUrl("rollforward-csv")}>Rollforward CSV</a></Button>
            : <Button variant="outline" disabled>Rollforward CSV</Button>}
        </>}
      </div>
    </div>
    {completed && <p role="status" className="text-sm">{completed.month} closed. {completed.nextMonth} is now open.</p>}
    {!coverage && <p role={loaded?.error ? "alert" : "status"} className="text-sm">{loaded?.error ?? "Loading close checklist…"}</p>}
    {coverage && !displayed && <p className="text-sm text-muted-foreground">Set the Government Loans open month to begin.</p>}
    {current && coverage && <section className="space-y-3">
      <ChecklistRows checklist={current.checklist} workspaces={coverage.workspaces} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-sm text-muted-foreground">Closing locks {current.checklist.month} and opens {current.checklist.nextMonth}.</p>
        <Button variant={current.checklist.openItemCount ? "destructive" : "default"}
          disabled={!current.checklist.payroll} onClick={() => setReview(current)}>
          {current.checklist.payroll && current.checklist.openItemCount
            ? `Close with ${current.checklist.openItemCount} open item(s)` : "Close " + current.checklist.month}
        </Button>
      </div>
    </section>}
    {saved && <section className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">Closed period · {saved.month}</h2>
        <Badge variant="outline">Closed</Badge></div>
      <p className="text-sm text-muted-foreground">Closed by {saved.actor} on {dateTime(saved.closedAt)} PHT</p>
      {saved.reason && <p className="whitespace-pre-wrap break-words text-sm">{saved.reason}</p>}
      <details className="space-y-2" open><summary className="cursor-pointer text-sm font-medium">Saved close checklist</summary>
        <ChecklistRows checklist={saved.checklist} workspaces={[]} /></details>
    </section>}
    {displayed && <AgencyRollforward rollforward={displayed.rollforward} onOpenMonth={setMonth} />}
    {coverage && <section className="space-y-2" aria-labelledby="history-close">
      <h2 id="history-close" className="font-semibold">Close history</h2>
      {!coverage.history.length && <p className="text-sm text-muted-foreground">No closed periods on this page.</p>}
      <ul className="divide-y rounded-md border">
        {coverage.history.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <div className="min-w-0"><p>{row.month} · {row.actor} · {dateTime(row.closedAt)} PHT</p>
            {row.reason && <p className="break-words text-muted-foreground">{row.reason}</p>}</div>
          <Button variant="outline" size="sm" aria-pressed={month === row.month} onClick={() => setMonth(row.month)}>View {row.month}</Button>
        </li>)}
      </ul>
      {(page > 1 || coverage.historyHasMore) && <nav aria-label="Close history pages" className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span className="text-sm">Page {page}</span>
        <Button size="sm" variant="outline" disabled={!coverage.historyHasMore} onClick={() => setPage(page + 1)}>Next</Button>
      </nav>}
    </section>}
    {review && <CloseDialog current={review} onClose={() => setReview(null)} onSaved={snapshot => {
      setCompleted(snapshot); setReview(null); setPage(1); reload(value => value + 1);
    }} />}
  </div>;
}
