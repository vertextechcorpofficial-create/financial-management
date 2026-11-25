"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date, dateTime, isCalendarDate, peso } from "@/modules/financial-management/cooperative/members/format";
import { useLifecycleCommand, useLifecycleRead } from "../../loans/lifecycle-client";
import type { listRemittanceDeductions, listRemittancePreparation, previewRemittancePreparation, readPreparedRemittance } from "../../server/remittance-preparation";
import { maxRemittanceProofBytes, maxRemittanceSelection, remittanceChannels, remittancePenalty, remittanceStatuses, remittanceTotals,
  type RemittanceChannel } from "./rules";

const endpoint = "/api/fm/government-loans/remittances/preparation";
type View = Awaited<ReturnType<typeof listRemittancePreparation>>;
type Item = View["items"][number];
type Preview = Awaited<ReturnType<typeof previewRemittancePreparation>>;
type Saved = Exclude<Awaited<ReturnType<typeof readPreparedRemittance>>, Response>;
const money = (value: string | null) => value === null ? "—" : peso(value);
const validAmount = /^(?:\d{1,13})(?:\.\d{1,2})?$/;

function IncludedDeductions({ url }: { url: string }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [refresh, reload] = useState(0);
  const loaded = useLifecycleRead<Awaited<ReturnType<typeof listRemittanceDeductions>>>(expanded ? url + "&page=" + page : null, refresh);
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="space-y-2 text-sm">
    <summary className="cursor-pointer">Included Payroll deductions</summary>
    {expanded && <>
      {!loaded?.data && <p role={loaded?.error ? "alert" : "status"}>{loaded?.error ?? "Loading deductions…"}
        {loaded?.error && <Button type="button" variant="outline" size="sm" onClick={() => reload(value => value + 1)}>Retry</Button>}</p>}
      {loaded?.data && <div className="rounded-md border"><Table>
        <TableHeader><TableRow>{["Employee", "Loan", "Result", "Withheld"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{loaded.data.items.map((row, index) => <TableRow key={row.loanId + ":" + row.status + ":" + index}>
          <TableCell>{row.employee}</TableCell><TableCell>{row.loanReference}</TableCell>
          <TableCell>{row.status === "X" ? "Final pay" : row.status === "P" ? "Partial" : "Full"}</TableCell>
          <TableCell>{peso(row.amount)}</TableCell>
        </TableRow>)}
          {!loaded.data.items.length && <TableRow><TableCell colSpan={4}>No withholding lines.</TableCell></TableRow>}
        </TableBody>
      </Table></div>}
      {(page > 1 || loaded?.data?.hasMore) && <nav aria-label="Deduction pages" className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
        <Button type="button" size="sm" variant="outline" disabled={!loaded?.data?.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
      </nav>}
    </>}
  </details>;
}

function SumCards({ totals }: { totals: ReturnType<typeof remittanceTotals> }) {
  return <dl className="grid gap-2 text-sm sm:grid-cols-3">
    {([["Withheld principal", totals.withheld], ["Penalties", totals.penalties], ["Total cash out", totals.cashOut]] as const).map(([label, value]) =>
      <div key={label} className="rounded-md border p-3">
        <dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{money(value)}</dd>
      </div>)}
  </dl>;
}

function PreparationDialog({ selected, openMonth, close, saved }: { selected: Item[]; openMonth: string; close: () => void; saved: () => void }) {
  const [paymentDate, setPaymentDate] = useState("");
  const [channel, setChannel] = useState<RemittanceChannel | "">("");
  const [sharedReference, setSharedReference] = useState("");
  const [references, setReferences] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [proof, setProof] = useState<File>();
  const [proofError, setProofError] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const command = useLifecycleCommand();
  const validDate = isCalendarDate(paymentDate);
  const dateClosed = validDate && paymentDate < openMonth + "-01";
  const validOverrides = Object.values(overrides).every(value => !value.trim() || validAmount.test(value.trim()));
  const ready = validDate && !dateClosed && !!channel && validOverrides && selected.every(row => references[row.key]?.trim());
  const input = { paymentDate: validDate ? paymentDate : null, channel: channel || null,
    items: selected.map(row => ({ agencyId: row.agencyId, month: row.month,
      reference: references[row.key]?.trim() ?? "", penaltyOverride: overrides[row.key]?.trim() || null,
    })) };
  const computed = selected.map(row => validDate ? remittancePenalty(row.withheld!, paymentDate, row.due, row.policy) : null);
  const computedTotals = remittanceTotals(selected.map((row, index) => ({
    withheld: row.withheld!, penalty: validOverrides && computed[index] ? overrides[row.key]?.trim() || computed[index].computedPenalty : null,
  })));

  function review() {
    setPreview(undefined);
    return command.run(endpoint + "?preview=1", input, async response => setPreview(await response.json() as Preview));
  }

  function submit() {
    if (!preview || !proof || !ready) return;
    const form = new FormData();
    form.set("payment", JSON.stringify({ ...input, token: preview.token }));
    form.set("proof", proof);
    return command.run(endpoint, form, saved);
  }

  return <Dialog open onOpenChange={open => { if (!open && !command.busy) close(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>Record remittance</DialogTitle>
        <DialogDescription>{selected.length} selected agency-month(s)</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto px-1">
        <SumCards totals={preview?.totals ?? computedTotals} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-sm">Payment date
            <Input type="date" min={openMonth + "-01"} value={paymentDate} disabled={command.busy} onChange={event => {
              setPaymentDate(event.target.value); setPreview(undefined);
            }} /></label>
          <label className="space-y-1 text-sm">Payment channel
            <NativeSelect value={channel} disabled={command.busy} onChange={event => {
              setChannel(event.target.value as RemittanceChannel | ""); setPreview(undefined);
            }}>
              <option value="">Choose payment channel</option>{Object.entries(remittanceChannels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect></label>
          <label className="space-y-1 text-sm">Proof of payment
            <Input type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={command.busy} onChange={event => {
              const file = event.target.files?.[0];
              const oversized = !!file && file.size > maxRemittanceProofBytes;
              setProof(oversized ? undefined : file);
              setProofError(oversized ? "Choose a PDF, JPG, or PNG up to 5 MB." : "");
            }} /></label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">Same reference for all (optional)
            <Input maxLength={200} value={sharedReference} disabled={command.busy} onChange={event => setSharedReference(event.target.value)} /></label>
          <Button type="button" variant="outline" disabled={!sharedReference.trim() || command.busy} onClick={() => {
            setReferences(Object.fromEntries(selected.map(row => [row.key, sharedReference]))); setPreview(undefined);
          }}>Apply to all rows</Button>
        </div>
        {selected.map((row, index) => {
          const server = preview?.rows.find(item => item.key === row.key);
          const penalty = server?.computedPenalty ?? computed[index]?.computedPenalty;
          const late = server?.daysLate ?? computed[index]?.daysLate;
          return <section key={row.key} className="space-y-2 rounded-md border p-3">
            <h3 className="font-medium">{row.agency} · {row.month}</h3>
            <p className="text-sm">Withheld {peso(server?.withheld ?? row.withheld)} · Deadline {date(server?.due ?? row.due)}
              {!!late && " · " + late + " day(s) late"}</p>
            {server?.source.partialCount ? <p className="text-sm text-muted-foreground">{server.source.partialCount} partial deduction(s) included</p> : null}
            {server?.source.missingBilling && <p className="text-sm text-amber-800">Agency billing is missing.</p>}
            {!!server?.source.discrepancies && <p className="text-sm text-amber-800">{server.source.discrepancies} billing difference(s) to review</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-sm">{row.referenceLabel} · {row.agencyCode} {row.month}
                <Input maxLength={200} value={references[row.key] ?? ""} disabled={command.busy} onChange={event => {
                  setReferences(values => ({ ...values, [row.key]: event.target.value })); setPreview(undefined);
                }} /></label>
              {validDate && <label className="space-y-1 text-sm">Penalty override · {row.agencyCode} {row.month}
                <Input inputMode="decimal" maxLength={16} placeholder={penalty ?? "0.00"} value={overrides[row.key] ?? ""}
                  disabled={command.busy || row.policy.penaltyBasis === "NONE"} onChange={event => {
                    setOverrides(values => ({ ...values, [row.key]: event.target.value })); setPreview(undefined);
                  }} />
                <span className="block text-xs text-muted-foreground">Computed {money(penalty ?? null)}</span>
              </label>}
            </div>
            <IncludedDeductions url={endpoint + "?" + new URLSearchParams({ deductions: "1", agencyId: String(row.agencyId), month: row.month })} />
          </section>;
        })}
        {dateClosed && <p role="alert" className="text-sm text-destructive">The payment date falls in a closed accounting period.</p>}
        {!validOverrides && <p role="alert" className="text-sm text-destructive">Enter penalties with at most two decimal places.</p>}
        {(proofError || command.error) && <p role="alert" className="text-sm text-destructive">{proofError || command.error}</p>}
        {preview && <p role="status" className="text-sm">Preview ready. Confirm the details and proof before submitting.</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" type="button" disabled={command.busy} onClick={close}>Cancel</Button>
        <Button variant="outline" type="button" disabled={command.busy || !ready} onClick={() => void review()}>Review totals</Button>
        <Button type="button" disabled={command.busy || !proof || !preview || !ready} onClick={() => void submit()}>Submit for approval</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function SavedRemittanceDialog({ id, close }: { id: string; close: () => void }) {
  const [refresh, reload] = useState(0);
  const result = useLifecycleRead<Saved>(endpoint + "/" + id, refresh);
  const saved = result?.data;
  return <Dialog open onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-3xl">
      <DialogHeader><DialogTitle>Remittance details</DialogTitle>
        <DialogDescription>{saved ? saved.payment.agency_name + " · " + saved.payment.payroll_month : "Review proof and Payroll deductions."}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto px-1 text-sm">
        {!saved && <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Loading remittance…"}
          {result?.error && <Button variant="outline" size="sm" onClick={() => reload(value => value + 1)}>Retry</Button>}</p>}
        {saved && <>
          <p>Payment {date(saved.batch.paymentDate)} · {remittanceChannels[saved.batch.channel]} · {saved.payment.payment_reference}</p>
          <p>Prepared by {saved.batch.preparedBy} · {dateTime(saved.batch.submittedAt)} PHT</p>
          <SumCards totals={remittanceTotals([{ withheld: saved.payment.withheld, penalty: saved.payment.entered_penalty }])} />
          <p>Computed penalty {peso(saved.payment.computed_penalty)}{saved.payment.penalty_overridden && " · Override recorded"}</p>
          {saved.payment.return_reason && <p>Return reason · {saved.payment.return_reason}</p>}
          {saved.payment.source_snapshot.missingBilling && <p>Agency billing was missing at preparation.</p>}
          {!!saved.payment.source_snapshot.discrepancies && <p>{saved.payment.source_snapshot.discrepancies} billing difference(s) at preparation</p>}
          <Button asChild variant="outline" size="sm"><a href={endpoint + "/" + id + "?proof=1"}>Download {saved.batch.proofName}</a></Button>
          <IncludedDeductions url={endpoint + "/" + id + "?deductions=1"} />
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}

export function RemittancePreparationModule() {
  const [month, setMonth] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Item[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [detailId, setDetailId] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const query = new URLSearchParams({ page: String(page), ...(month ? { month } : {}), ...(agencyId ? { agencyId } : {}), ...(status ? { status } : {}) });
  const result = useLifecycleRead<View>(endpoint + "?" + query, refresh);
  const data = result?.data;
  const reload = () => setRefresh(value => value + 1);
  function toggle(row: Item) {
    setSelection(items => items.some(item => item.key === row.key)
      ? items.filter(item => item.key !== row.key) : items.length < maxRemittanceSelection ? [...items, row] : items);
  }

  return <section className="space-y-3">
    <h2 className="text-lg font-semibold">To remit</h2>
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1 text-sm">Agency
        <NativeSelect value={agencyId} onChange={event => { setAgencyId(event.target.value); setPage(1); }}>
          <option value="">All agencies</option>{data?.agencies.map(agency => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
        </NativeSelect></label>
      <label className="space-y-1 text-sm">Payroll month
        <Input type="month" max={data?.openMonth} value={month} onChange={event => { setMonth(event.target.value); setPage(1); }} /></label>
      <label className="space-y-1 text-sm">Status
        <NativeSelect value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>{Object.entries(remittanceStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </NativeSelect></label>
      <Button variant="outline" onClick={reload}>Refresh</Button>
    </div>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {selection.length > 0 && <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm">{selection.length} selected</span>
      <Button size="sm" onClick={() => setPreparing(true)}>Record remittance</Button>
      <Button size="sm" variant="ghost" onClick={() => setSelection([])}>Clear selection</Button>
      {selection.length === maxRemittanceSelection && <span className="text-sm">Batch limit reached.</span>}
    </div>}
    {!data && <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Loading remittances…"}</p>}
    {data && <div className="rounded-md border"><Table>
      <TableHeader><TableRow>{["Select", "Agency", "Payroll month", "Withheld", "Due date", "Status", "Payment"].map(label =>
        <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{data.items.map(row => {
        const checked = selection.some(item => item.key === row.key);
        return <TableRow key={row.key}>
          <TableCell>{row.canSelect && <input type="checkbox" aria-label={"Select " + row.agency + " " + row.month}
            checked={checked} disabled={!checked && selection.length >= maxRemittanceSelection} onChange={() => toggle(row)} />}</TableCell>
          <TableCell>{row.agency}</TableCell><TableCell>{row.month}</TableCell><TableCell>{money(row.withheld)}</TableCell>
          <TableCell>{date(row.due)}</TableCell>
          <TableCell><Badge variant={row.status === "overdue" ? "destructive" : row.reminder ? "secondary" : "outline"}>{row.label}</Badge>
            {row.status === "returned" && row.deadlineLabel && <p className="text-xs">{row.deadlineLabel}</p>}</TableCell>
          <TableCell>{row.payment && <Button size="sm" variant="outline" onClick={() => setDetailId(row.payment?.id)}>View</Button>}</TableCell>
        </TableRow>;
      })}
        {!data.items.length && <TableRow><TableCell colSpan={7}>No agency-months match.</TableCell></TableRow>}
      </TableBody>
    </Table></div>}
    {(page > 1 || data?.hasMore) && <nav aria-label="Remittance pages" className="flex items-center gap-2">
      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</Button>
      <span className="text-sm">Page {page}</span>
      <Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage(value => value + 1)}>Next</Button>
    </nav>}
    {preparing && data && <PreparationDialog selected={selection} openMonth={data.openMonth} close={() => setPreparing(false)}
      saved={() => { setPreparing(false); setSelection([]); setNotice("Remittances submitted for approval."); reload(); }} />}
    {detailId && <SavedRemittanceDialog id={detailId} close={() => setDetailId(undefined)} />}
  </section>;
}
