"use client";

import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReportFilters, ReportViewData } from "../report-types";
import { exportTime } from "../services/reconcileExport";
import { filterAging, filterJournal } from "../services/reportSelection";
import { postingStatus, POSTING_TOTAL_NOTE } from "../services/postingExport";
import { JOURNAL_STATUSES } from "../utils/journalFilters";
import { transactionMoney } from "../utils/transactionDisplay";

type Data<K extends ReportViewData["report"]> = Extract<ReportViewData, { report: K }>;
type FilterProps = { actions: ReactNode; filters: ReportFilters; changeFilters: (filters: ReportFilters) => void };
const selectClass = "block h-9 max-w-full rounded-md border bg-background px-3 text-sm";

function accounting(currency: string) {
  return (value: string | null | undefined) => value == null ? "Unavailable" : value.startsWith("-")
    ? `(${transactionMoney(value.slice(1), currency)})` : transactionMoney(value, currency);
}

export function StatementReport({ data, actions }: { data: Data<"statement">; actions: ReactNode }) {
  const money = accounting(data.period.currency);
  return <section id="r-statement" aria-labelledby="statement-title" className="min-w-0 space-y-4 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="statement-title" className="text-lg font-semibold">Reconciliation statement</h2><div className="flex flex-wrap items-center gap-2">{actions}<span className={`rounded-full px-3 py-1 text-sm ${data.reconciliation.status === "RECONCILED" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>{data.reconciliation.statusLabel}</span></div></div>
    <div className="grid gap-4 xl:grid-cols-2">{data.statement.map(side => <section key={side.part} aria-label={side.title} className="min-w-0 rounded-lg border"><div className="border-b p-3"><p className="text-xs text-muted-foreground">{side.part}</p><h3 className="font-semibold">{side.title}</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[500px] text-sm"><thead className="sr-only"><tr><th>Reference</th><th>Description</th><th>Item amount</th><th>Total</th></tr></thead><tbody>
      <tr className="border-b font-medium"><td colSpan={3} className="p-3">{side.openingLabel}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(side.openingBalance)}</td></tr>
      {side.groups.map(group => <Fragment key={group.label}><tr className="bg-muted/40 font-medium"><td colSpan={3} className="p-3">{group.label}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(group.total)}</td></tr>{group.items.length ? group.items.map((item, index) => <tr key={index} className="align-top"><td className="max-w-40 break-words p-3">{item.reference}</td><td className="min-w-36 break-words p-3">{item.description}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(item.amount)}</td><td /></tr>) : <tr><td /><td className="p-3 text-muted-foreground">None</td><td colSpan={2} /></tr>}</Fragment>)}
    </tbody><tfoot><tr className="border-t font-semibold"><td colSpan={3} className="p-3">{side.adjustedLabel}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(side.adjustedBalance)}</td></tr></tfoot></table></div></section>)}</div>
    <div className="flex flex-wrap justify-between gap-3 rounded-md bg-muted/40 p-3 text-sm"><p>Difference: <strong aria-label="Report difference">{money(data.reconciliation.difference)}</strong></p><p>{data.reconciliation.unpostedCount} adjustments to post</p></div>
  </section>;
}

export function AgingReport({ data, actions, filters, changeFilters }: FilterProps & { data: Data<"aging"> }) {
  const money = accounting(data.period.currency);
  const aging = filterAging(data.aging, filters), filtered = aging !== data.aging;
  return <section id="r-aging" aria-labelledby="aging-title" className="min-w-0 space-y-4 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="aging-title" className="text-lg font-semibold">Outstanding items aging</h2>{actions}</div>
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Aging filters">
      <div className="space-y-2 text-sm"><label htmlFor="aging-item-type" className="block font-medium">Item type</label><select id="aging-item-type" className={selectClass} value={filters.itemType ?? ""} onChange={e => changeFilters({ ...filters, itemType: e.target.value })}><option value="">All item types</option><option value="DIT">Deposits in transit</option><option value="OC">Outstanding checks</option></select></div>
      <div className="space-y-2 text-sm"><label htmlFor="aging-bucket" className="block font-medium">Aging bucket</label><select id="aging-bucket" className={selectClass} value={filters.bucket ?? ""} disabled={!aging.available} onChange={e => changeFilters({ ...filters, bucket: e.target.value })}><option value="">All buckets</option>{aging.buckets.map((bucket, index) => <option key={bucket} value={String(index)}>{bucket}</option>)}</select></div>
      <Button type="button" variant="outline" disabled={!filtered} onClick={() => changeFilters({})}>Clear aging filters</Button>
    </div>
    <p className="text-sm text-muted-foreground">Open ledger items as of {data.period.periodEnd || "period end"}. {filtered ? `${aging.count} of ${data.aging.count} items match` : `${aging.count} items`}, net {money(aging.net)}. Follow up items past 90 days. Review stale checks before deciding on reversal.</p>
    {!aging.available && <p className="text-sm text-amber-700 dark:text-amber-400">Set the period end in Reconcile to calculate aging and stale-check flags.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Type</th><th className="p-2">Date</th><th className="p-2">Ref</th><th className="p-2">Description</th><th className="p-2 text-right">Days</th>{aging.buckets.map(bucket => <th key={bucket} className="p-2 text-right">{bucket}</th>)}</tr></thead><tbody>{aging.items.length ? aging.items.map(item => <tr key={item.id} className="border-b align-top"><td className="p-2">{item.type}{item.stale && <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-400">Stale, over 6 months</span>}</td><td className="whitespace-nowrap p-2">{item.date}</td><td className="max-w-40 break-words p-2">{item.reference}</td><td className="min-w-48 max-w-80 break-words p-2">{item.description}</td><td className="p-2 text-right tabular-nums">{item.days ?? "Unavailable"}</td>{aging.buckets.map((bucket, index) => <td key={bucket} className="whitespace-nowrap p-2 text-right tabular-nums">{item.bucket === index ? money(item.amount) : ""}</td>)}</tr>) : <tr><td colSpan={9} className="p-4 text-muted-foreground">{filtered ? "No outstanding items match these filters." : "No outstanding items."}</td></tr>}</tbody><tfoot><tr className="border-t font-semibold"><td colSpan={5} className="p-2">{filtered ? "Matching items total" : "Total"}</td>{aging.totals.map((total, index) => <td key={index} className="whitespace-nowrap p-2 text-right tabular-nums">{money(total)}</td>)}</tr></tfoot></table></div>
  </section>;
}

export function JournalReport({ data, actions, filters, changeFilters }: FilterProps & { data: Data<"journal"> }) {
  const money = accounting(data.period.currency);
  const journal = filterJournal(data.journal, filters), filtered = journal !== data.journal;
  return <section id="r-journal" aria-labelledby="journal-title" className="min-w-0 space-y-4 rounded-lg border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="journal-title" className="text-lg font-semibold">Adjusting entries journal</h2>{actions}</div>
    {journal.postingDate.message && <p className="text-sm text-amber-700 dark:text-amber-400">{journal.postingDate.message}</p>}
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Journal filters">
      <div className="min-w-40 flex-1 space-y-2"><label htmlFor="reports-journal-search" className="text-sm font-medium">Search journal</label><Input id="reports-journal-search" type="search" maxLength={200} value={filters.search ?? ""} placeholder="JE, GL journal, import reference, source, or explanation" onChange={e => changeFilters({ ...filters, search: e.target.value })} /></div>
      <div className="space-y-2 text-sm"><label htmlFor="reports-journal-status" className="block font-medium">Journal status</label><select id="reports-journal-status" className={selectClass} value={filters.status ?? ""} onChange={e => changeFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option>{JOURNAL_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
      <Button type="button" variant="outline" disabled={!filtered} onClick={() => changeFilters({})}>Clear journal filters</Button>
    </div>
    <p className="text-sm text-muted-foreground">{filtered ? `${journal.entries.length} of ${data.journal.entries.length} entries match.` : `${journal.entries.length} entries.`} Whole-period balances. Ledger after posting {money(journal.summary.ledgerAfter)}. Confirmed net cash effect {money(journal.summary.postedCashEffect)}. Still to post {money(journal.summary.stillToPost)}.</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">JE #</th><th className="p-2">Date</th><th className="p-2">Account</th><th className="p-2 text-right">Debit</th><th className="p-2 text-right">Credit</th><th className="p-2">Explanation / source</th><th className="p-2">Status</th></tr></thead><tbody>{journal.entries.length ? journal.entries.map(entry => <Fragment key={entry.key}>{entry.lines.map((line, index) => <tr key={index} className={`align-top ${index === entry.lines.length - 1 ? "border-b" : ""}`}>
      {index === 0 && <><td rowSpan={entry.lines.length} className="whitespace-nowrap p-2">{entry.workbenchNumber || entry.journalNumber || "Draft"}{entry.workbenchNumber && entry.journalNumber && <p className="mt-1 text-xs text-muted-foreground">GL: {entry.journalNumber}</p>}</td><td rowSpan={entry.lines.length} className="whitespace-nowrap p-2">{entry.date || "Not set"}</td></>}
      <td className="min-w-44 max-w-72 break-words p-2">{line.account ? `${line.account.code} · ${line.account.name}` : <span className="text-destructive">No account</span>}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{line.debit === "0.00" ? "" : money(line.debit)}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{line.credit === "0.00" ? "" : money(line.credit)}</td>
      {index === 0 && <><td rowSpan={entry.lines.length} className="min-w-64 max-w-xl break-words p-2"><p>{entry.explanation}</p><p className="mt-1 text-xs text-muted-foreground">Source: {entry.sourceLabel}</p>{entry.importReference && <p className="mt-1 text-xs text-muted-foreground">Import reference: {entry.importReference}</p>}{entry.postedBy && <p className="mt-1 text-xs text-muted-foreground">Posted by {entry.postedBy}{entry.postedAt ? ` · ${exportTime(entry.postedAt)}` : ""}</p>}{entry.reversesNumber && <p className="mt-1 text-xs">Reverses {entry.reversesNumber}</p>}{entry.reversedByNumber && <p className="mt-1 text-xs">Reversed by {entry.reversedByNumber}</p>}{[entry.lastError, ...entry.issues].filter(Boolean).map(issue => <p key={issue} className="mt-1 text-xs text-destructive">{issue}</p>)}</td><td rowSpan={entry.lines.length} className="p-2">{postingStatus(entry)}</td></>}
    </tr>)}</Fragment>) : <tr><td colSpan={7} className="p-4 text-muted-foreground">{filtered ? "No adjusting entries match these filters." : "No adjusting entries this period."}</td></tr>}</tbody><tfoot><tr className="border-t font-semibold"><td colSpan={3} className="p-2">{filtered ? "Matching entries totals" : "Totals"}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{money(journal.totals.debit)}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{money(journal.totals.credit)}</td><td colSpan={2} /></tr></tfoot></table></div>
    <p className="text-xs text-muted-foreground">{filtered ? "Totals include all debit and credit lines from matching entries." : POSTING_TOTAL_NOTE}</p>
  </section>;
}
