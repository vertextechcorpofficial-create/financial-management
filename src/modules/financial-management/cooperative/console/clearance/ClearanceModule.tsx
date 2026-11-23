"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConsole, documentStatus } from "../provider";
import {
  ConsoleDialog, ConsoleShell, DocumentPanel, EmptyState, FilterBar, FilterField, Kv, MemberSelect,
  Panel, StatusChip, Tile, caseStatusChip,
} from "../components/ui";
import { formatDate, money } from "../format";
import { memberName, memberOutstanding, settlementFor } from "../calculations";
import {
  CASE_STATUS_LABEL, CLEARANCE_REASONS, CONSOLE_TODAY, type Clearance,
} from "../types";

const REQUIRED_DOCS = ["Resignation or separation letter", "HR clearance form"];

export default function ClearanceModule() {
  const { state } = useConsole();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const rows = useMemo(() => state.cases.filter(clearance => {
    const member = state.members.find(entry => entry.id === clearance.memberId);
    const text = `${clearance.code} ${member ? memberName(member) : ""} ${member?.employeeNumber ?? ""}`.toLowerCase();
    return (!search.trim() || text.includes(search.trim().toLowerCase()))
      && (!status || clearance.status === status)
      && (!reason || clearance.reason === reason);
  }), [state, search, status, reason]);

  return (
    <ConsoleShell
      title="Exit clearance"
      subtitle="When a member leaves the company or the cooperative, review the settlement, apply savings and final pay, then close the membership."
      actions={<Button size="sm" onClick={() => setStarting(true)}>Start clearance</Button>}
    >
      <Panel title="How a clearance moves">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["1", "Start", "Pick the member, reason, separation date and final pay.", null],
            ["2", "Review settlement & documents", "Check unpaid loans against savings and final pay. Upload the separation papers.", state.cases.filter(clearance => clearance.status === "DRAFT").length],
            ["3", "Settle & close", "Loans are offset, the remaining savings go out with final pay, and the membership is closed.", state.cases.filter(clearance => clearance.status === "COMPLETED").length],
          ].map(([number, title, description, count]) => (
            <div key={String(number)} className="rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="grid size-6 place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white">{number}</span>
              <p className="mt-2 font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
              {count !== null && <p className="mt-2 font-mono text-sm">{count}</p>}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Settlement review" value={state.cases.filter(clearance => clearance.status === "DRAFT").length} detail="Draft clearances" />
        <Tile label="Settled & closed" value={state.cases.filter(clearance => clearance.status === "COMPLETED").length} detail="Memberships closed" />
        <Tile label="Members leaving" value={state.members.filter(member => member.status === "SEPARATED").length} detail="Separated members in the sample" />
      </div>

      <Panel title="Clearance register" description="Open a case to review the settlement and documents.">
        <FilterBar count={rows.length} noun="clearances">
          <FilterField label="Search"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Member or clearance no." className="h-8 w-64" /></FilterField>
          <FilterField label="Stage">
            <NativeSelect value={status} onChange={event => setStatus(event.target.value)} className="h-8">
              <option value="">All stages</option>{Object.entries(CASE_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Reason">
            <NativeSelect value={reason} onChange={event => setReason(event.target.value)} className="h-8">
              <option value="">All reasons</option>{Object.entries(CLEARANCE_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </FilterField>
        </FilterBar>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Clearance</TableHead><TableHead>Member</TableHead><TableHead>Reason</TableHead><TableHead>Separation</TableHead><TableHead>Documents</TableHead><TableHead className="text-right">Owed</TableHead><TableHead className="text-right">Savings</TableHead><TableHead>Stage</TableHead></TableRow></TableHeader>
            <TableBody>
              {!rows.length && <TableRow><TableCell colSpan={8}><EmptyState>No clearances match these filters.</EmptyState></TableCell></TableRow>}
              {rows.map(clearance => {
                const member = state.members.find(entry => entry.id === clearance.memberId);
                const docs = documentStatus(state, "case", clearance.id, REQUIRED_DOCS);
                const settlement = clearance.snapshot ?? settlementFor(state, clearance);
                return (
                  <TableRow key={clearance.id} className="cursor-pointer" onClick={() => setSelectedId(clearance.id)}>
                    <TableCell className="font-mono text-xs">{clearance.code}</TableCell>
                    <TableCell className="whitespace-normal">{member ? memberName(member) : "Member"}<span className="block text-xs text-muted-foreground">{member?.employeeNumber} · {member?.department}</span></TableCell>
                    <TableCell>{CLEARANCE_REASONS[clearance.reason]}</TableCell>
                    <TableCell>{formatDate(clearance.separationDate)}</TableCell>
                    <TableCell>{docs.missing.length ? <StatusChip status="PARTIAL" label={`${docs.done}/${docs.required.length}`} /> : <StatusChip status="ACTIVE" label="Complete" />}</TableCell>
                    <TableCell className="text-right font-mono">{money(settlement.debt)}</TableCell>
                    <TableCell className="text-right font-mono">{money(settlement.savings)}</TableCell>
                    <TableCell>{caseStatusChip(clearance.status)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {starting && <StartClearanceDialog onClose={() => setStarting(false)} />}
      {selectedId && <ClearanceDialog clearanceId={selectedId} onClose={() => setSelectedId(null)} />}
    </ConsoleShell>
  );
}

function StartClearanceDialog({ onClose }: { onClose: () => void }) {
  const { state, actions } = useConsole();
  const busy = new Set(state.cases.filter(clearance => clearance.status === "DRAFT").map(clearance => clearance.memberId));
  const [memberId, setMemberId] = useState("");
  const [reason, setReason] = useState<Clearance["reason"]>("RESIGNATION");
  const [separationDate, setSeparationDate] = useState("2026-11-30");
  const [finalPay, setFinalPay] = useState(0);
  const [notes, setNotes] = useState("");
  const member = state.members.find(entry => entry.id === memberId);
  const options = state.members.filter(item => item.status === "ACTIVE" && !busy.has(item.id));

  function pick(value: string) {
    setMemberId(value);
    const found = state.members.find(entry => entry.id === value);
    if (found) setFinalPay(found.grossPay);
  }

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title="Start exit clearance"
      description="Open a clearance for a member who is leaving."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!member || !separationDate} onClick={() => { actions.startClearance({ memberId, reason, separationDate, finalPay, notes }); onClose(); }}>Start clearance</Button></>}
    >
      <div className="space-y-4">
        <MemberSelect members={options} value={memberId} onChange={pick} include="active" label="Departing member" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Reason
            <NativeSelect value={reason} onChange={event => setReason(event.target.value as Clearance["reason"])}>
              {Object.entries(CLEARANCE_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Separation date<Input type="date" value={separationDate} onChange={event => setSeparationDate(event.target.value)} /></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Final pay available<Input type="number" min={0} step={500} value={finalPay} onChange={event => setFinalPay(Number(event.target.value))} /></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Notes<Input value={notes} onChange={event => setNotes(event.target.value)} placeholder="e.g. Resignation letter dated…" /></label>
        </div>
        {member && <div className="rounded-md border bg-muted/30 p-3 text-sm">{memberName(member)} has {money(member.savings)} in savings and {money(memberOutstanding(state, member.id))} in unpaid loans. Upload the separation papers in the next step.</div>}
      </div>
    </ConsoleDialog>
  );
}

function ClearanceDialog({ clearanceId, onClose }: { clearanceId: string; onClose: () => void }) {
  const { state, actions } = useConsole();
  const clearance = state.cases.find(entry => entry.id === clearanceId);
  const [tab, setTab] = useState("settlement");
  const [confirm, setConfirm] = useState(false);
  if (!clearance) return null;
  const member = state.members.find(entry => entry.id === clearance.memberId);
  if (!member) return null;
  const settlement = clearance.snapshot ?? settlementFor(state, clearance);
  const docs = documentStatus(state, "case", clearance.id, REQUIRED_DOCS);
  const completed = clearance.status === "COMPLETED";
  const cancelled = clearance.status === "CANCELLED";

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{clearance.code}</span>{caseStatusChip(clearance.status)}</span>}
      description={`${memberName(member)} · ${member.employeeNumber} · ${CLEARANCE_REASONS[clearance.reason]}`}
      wide
      footer={clearance.status === "DRAFT" ? (
        <>
          <Button variant="outline" onClick={() => { actions.cancelClearance(clearance.id); onClose(); }}>Cancel clearance</Button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} className="accent-emerald-600" />
            Settlement checked with the member and HR.
          </label>
          <Button disabled={!confirm} onClick={() => { actions.completeClearance(clearance.id); onClose(); }}>Settle & close membership</Button>
        </>
      ) : undefined}
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {[["Started", formatDate(clearance.history[0]?.date ?? CONSOLE_TODAY)], ["Settlement review", completed ? "Completed" : cancelled ? "Cancelled" : "Current"], ["Settled & closed", completed ? formatDate(clearance.history[clearance.history.length - 1]?.date) : "Waiting"]].map(([title, detail], index) => (
          <div key={title} className={`rounded-lg border p-3 text-sm ${completed || index === 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
            <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">{index + 1}</span>
            <p className="mt-1 font-semibold">{title}</p><p className="text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant={tab === "settlement" ? "default" : "outline"} onClick={() => setTab("settlement")}>Settlement</Button>
        <Button size="sm" variant={tab === "docs" ? "default" : "outline"} onClick={() => setTab("docs")}>Documents {docs.missing.length ? `(${docs.missing.length} missing)` : ""}</Button>
      </div>
      {clearance.status === "DRAFT" && tab === "settlement" && (
        <div className="mb-4 grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Reason
            <NativeSelect value={clearance.reason} onChange={event => actions.updateClearance(clearance.id, { reason: event.target.value as Clearance["reason"] })}>
              {Object.entries(CLEARANCE_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Separation date
            <Input type="date" value={clearance.separationDate} onChange={event => actions.updateClearance(clearance.id, { separationDate: event.target.value })} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Final pay for withholding
            <Input type="number" min={0} step={500} value={clearance.finalPay} onChange={event => actions.updateClearance(clearance.id, { finalPay: Number(event.target.value) })} />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Notes
            <Input value={clearance.notes} onChange={event => actions.updateClearance(clearance.id, { notes: event.target.value })} />
          </label>
        </div>
      )}
      {tab === "settlement" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Unpaid loans">
            {settlement.loans.length ? (
              <Table>
                <TableHeader><TableRow><TableHead>Loan</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Penalty</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{settlement.loans.map(loan => <TableRow key={loan.loanId}><TableCell className="font-mono">{loan.code}</TableCell><TableCell className="text-right font-mono">{money(loan.total - loan.penalty)}</TableCell><TableCell className="text-right font-mono">{money(loan.penalty)}</TableCell><TableCell className="text-right font-mono">{money(loan.total)}</TableCell></TableRow>)}</TableBody>
              </Table>
            ) : <EmptyState>No unpaid loans.</EmptyState>}
            <div className="mt-4"><Kv rows={[["Total owed", money(settlement.debt), "total"]]} /></div>
          </Panel>
          <Panel title="Settlement">
            <Kv rows={[
              ["Savings balance", money(settlement.savings)],
              ["Pro-rated dividend estimate", money(settlement.dividend)],
              ["Total member equity", money(settlement.equity), "total"],
              ["Applied to loans", money(settlement.fromEquity)],
              ["Withheld from final pay", money(settlement.fromFinalPay)],
              ["Refund with final pay", money(settlement.refund)],
              ["Unrecovered", money(settlement.unrecovered)],
            ]} />
            <div className={`mt-3 rounded-md p-3 text-sm font-semibold ${settlement.unrecovered > 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"}`}>
              {settlement.unrecovered > 0 ? `Endorse ${money(settlement.unrecovered)} for collection` : settlement.refund > 0 ? `Release ${money(settlement.refund)} with final pay` : "Loans fully settled from savings and final pay"}
            </div>
            <h3 className="mt-4 text-sm font-semibold">History</h3>
            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">{clearance.history.map((entry, index) => <li key={`${entry.date}-${index}`}>{formatDate(entry.date)}: {entry.text}</li>)}</ul>
          </Panel>
        </div>
      ) : (
        <DocumentPanel ownerType="case" ownerId={clearance.id} required={REQUIRED_DOCS} canEdit={clearance.status === "DRAFT"} />
      )}
    </ConsoleDialog>
  );
}
