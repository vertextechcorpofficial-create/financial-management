"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConsole } from "../provider";
import {
  ConsoleDialog, ConsoleShell, EmptyState, FilterBar, FilterField, Kv, MemberSelect, Panel, Tile,
} from "../components/ui";
import { formatDate, money, round2 } from "../format";
import { loanTotals, memberName } from "../calculations";
import {
  CHANNEL_LABEL, CONSOLE_TODAY, JOURNAL_KIND_LABEL, type JournalKind, type Loan,
} from "../types";

const OUTGOING: JournalKind[] = ["WITHDRAWAL", "DISBURSEMENT", "OFFSET"];

export default function TransactionsModule() {
  const { state } = useConsole();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [channel, setChannel] = useState("");
  const [month, setMonth] = useState("");
  const [depositOpen, setDepositOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const months = useMemo(() => [...new Set(state.journal.map(entry => entry.date.slice(0, 7)))].sort().reverse(), [state.journal]);
  const rows = useMemo(() => state.journal
    .filter(entry => {
      const member = state.members.find(item => item.id === entry.memberId);
      const text = `${member ? memberName(member) : ""} ${member?.employeeNumber ?? ""} ${entry.reference}`.toLowerCase();
      return (!search.trim() || text.includes(search.trim().toLowerCase()))
        && (!kind || entry.kind === kind)
        && (!channel || entry.channel === channel)
        && (!month || entry.date.startsWith(month));
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [state, search, kind, channel, month]);

  const inflow = round2(rows.filter(entry => ["DEPOSIT", "LOAN_PAYMENT", "FEE"].includes(entry.kind)).reduce((sum, entry) => sum + entry.amount, 0));
  const outflow = round2(rows.filter(entry => ["WITHDRAWAL", "DISBURSEMENT"].includes(entry.kind)).reduce((sum, entry) => sum + entry.amount, 0));

  return (
    <ConsoleShell
      title="Transactions"
      subtitle="Every peso in and out of the cooperative. Post savings deposits and loan payments as they arrive."
      actions={(
        <>
          <Button size="sm" variant="outline" onClick={() => setDepositOpen(true)}>Savings deposit</Button>
          <Button size="sm" onClick={() => setPaymentOpen(true)}>Loan payment</Button>
        </>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Money in (filtered)" value={money(inflow)} detail="Deposits, loan payments and fees" />
        <Tile label="Money out (filtered)" value={money(outflow)} detail="Withdrawals and loan releases" />
        <Tile label="Net" value={`${inflow - outflow < 0 ? "−" : ""}${money(Math.abs(inflow - outflow))}`} detail={`${rows.length} entries`} />
      </div>

      <Panel title="Unified journal" description="Filter the sample journal, then post a deposit or loan payment.">
        <FilterBar count={rows.length} noun="entries">
          <FilterField label="Search"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Member or reference" className="h-8 w-64" /></FilterField>
          <FilterField label="Type">
            <NativeSelect value={kind} onChange={event => setKind(event.target.value)} className="h-8">
              <option value="">All types</option>
              {Object.entries(JOURNAL_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Channel">
            <NativeSelect value={channel} onChange={event => setChannel(event.target.value)} className="h-8">
              <option value="">All channels</option><option value="payroll">Payroll remittance</option><option value="otc">Over the counter</option><option value="system">System</option>
            </NativeSelect>
          </FilterField>
          <FilterField label="Month">
            <NativeSelect value={month} onChange={event => setMonth(event.target.value)} className="h-8">
              <option value="">All months</option>
              {months.map(item => <option key={item} value={item}>{item}</option>)}
            </NativeSelect>
          </FilterField>
        </FilterBar>
        <div className="max-h-[65dvh] overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Type</TableHead><TableHead>Channel</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {!rows.length && <TableRow><TableCell colSpan={6}><EmptyState>No entries match these filters.</EmptyState></TableCell></TableRow>}
              {rows.slice(0, 100).map(entry => {
                const member = state.members.find(item => item.id === entry.memberId);
                return (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.date)}</TableCell>
                    <TableCell className="whitespace-normal">{member ? memberName(member) : "Member"}<span className="block text-xs text-muted-foreground">{member?.employeeNumber}</span></TableCell>
                    <TableCell>{JOURNAL_KIND_LABEL[entry.kind]}{entry.penaltyPart ? <span className="block text-xs text-muted-foreground">incl. {money(entry.penaltyPart)} penalty</span> : null}</TableCell>
                    <TableCell>{CHANNEL_LABEL[entry.channel]}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.reference}</TableCell>
                    <TableCell className={`text-right font-mono ${OUTGOING.includes(entry.kind) ? "text-rose-600" : ""}`}>{OUTGOING.includes(entry.kind) ? "−" : "+"}{money(entry.amount)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {rows.length > 100 && <p className="mt-2 text-xs text-muted-foreground">Showing the latest 100 entries. Narrow the filters to see older entries.</p>}
      </Panel>

      {depositOpen && <DepositDialog onClose={() => setDepositOpen(false)} />}
      {paymentOpen && <PaymentDialog onClose={() => setPaymentOpen(false)} />}
    </ConsoleShell>
  );
}

function DepositDialog({ onClose }: { onClose: () => void }) {
  const { state, actions } = useConsole();
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState(1_000);
  const [channel, setChannel] = useState<"payroll" | "otc">("otc");
  const [date, setDate] = useState(CONSOLE_TODAY);
  const [reference, setReference] = useState("");
  const member = state.members.find(entry => entry.id === memberId);

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title="Savings deposit"
      description="Record money received for a member’s savings."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!member || amount <= 0} onClick={() => { actions.postDeposit({ memberId, amount, channel, date, reference }); onClose(); }}>Post deposit</Button></>}
    >
      <div className="space-y-4">
        <MemberSelect members={state.members} value={memberId} onChange={setMemberId} include="active" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Amount<Input type="number" min={0} step={100} value={amount} onChange={event => setAmount(Number(event.target.value))} /></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Received through
            <NativeSelect value={channel} onChange={event => setChannel(event.target.value as "payroll" | "otc")}><option value="otc">Over the counter</option><option value="payroll">Payroll remittance</option></NativeSelect>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Date<Input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Reference<Input value={reference} onChange={event => setReference(event.target.value)} placeholder="OR or payroll batch no." /></label>
        </div>
        {member && <Kv rows={[["Current balance", money(member.savings)], ["After deposit", money(member.savings + amount), "total"]]} />}
      </div>
    </ConsoleDialog>
  );
}

function dueNow(loan: Loan) {
  const totals = loanTotals(loan);
  return round2(totals.pastDue + totals.penalties + loan.schedule.filter(installment => installment.dueDate === CONSOLE_TODAY && installment.paid < installment.total).reduce((sum, installment) => sum + (installment.total - installment.paid), 0));
}

function PaymentDialog({ onClose }: { onClose: () => void }) {
  const { state, actions } = useConsole();
  const active = state.loans.filter(loan => loan.status === "ACTIVE");
  const [loanId, setLoanId] = useState(active[0]?.id ?? "");
  const [amount, setAmount] = useState(active[0] ? dueNow(active[0]) : 0);
  const [channel, setChannel] = useState<"payroll" | "otc">(active[0]?.mode === "otc" ? "otc" : "payroll");
  const [date, setDate] = useState(CONSOLE_TODAY);
  const [reference, setReference] = useState("");
  const loan = state.loans.find(entry => entry.id === loanId);
  const member = loan ? state.members.find(entry => entry.id === loan.memberId) : undefined;
  const totals = loan ? loanTotals(loan) : null;
  const max = totals ? round2(totals.remaining + totals.penalties) : 0;

  function pick(value: string) {
    setLoanId(value);
    const next = state.loans.find(entry => entry.id === value);
    if (next) {
      setAmount(dueNow(next));
      setChannel(next.mode === "otc" ? "otc" : "payroll");
    }
  }

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title="Loan payment"
      description="Record a payment received for a member’s loan."
      wide
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!loan || amount <= 0 || amount > max + 0.005} onClick={() => { actions.postPayment({ loanId, amount, channel, date, reference }); onClose(); }}>Post payment</Button></>}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Loan</label>
          <NativeSelect value={loanId} onChange={event => pick(event.target.value)}>
            <option value="">Choose an active loan</option>
            {active.map(item => {
              const memberItem = state.members.find(entry => entry.id === item.memberId);
              return <option key={item.id} value={item.id}>{item.code} · {memberItem ? memberName(memberItem) : ""} · {money(loanTotals(item).remaining)} balance</option>;
            })}
          </NativeSelect>
        </div>
        {loan && member && totals && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Kv rows={[
                ["Member", memberName(member)],
                ["Repayment", loan.mode === "payroll" ? "Salary deduction" : "Over the counter"],
                ["Due as of today", money(dueNow(loan))],
                ["Penalties due", money(totals.penalties)],
                ["Remaining balance", money(totals.remaining), "total"],
              ]} />
              <div className="space-y-3">
                <div className="space-y-1 text-xs font-medium text-muted-foreground">
                  <label htmlFor="payment-amount">Amount</label>
                  <Input id="payment-amount" type="number" min={0} step={0.01} value={amount} onChange={event => setAmount(Number(event.target.value))} />
                  <span className="flex gap-2 pt-1"><Button type="button" size="sm" variant="outline" onClick={() => setAmount(dueNow(loan))}>Amount due</Button><Button type="button" size="sm" variant="outline" onClick={() => setAmount(max)}>Full balance</Button></span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">Received through
                    <NativeSelect value={channel} onChange={event => setChannel(event.target.value as "payroll" | "otc")}><option value="payroll">Payroll remittance</option><option value="otc">Over the counter</option></NativeSelect>
                  </label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground">Date<Input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
                  <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2">Reference<Input value={reference} onChange={event => setReference(event.target.value)} placeholder="OR or payroll batch no." /></label>
                </div>
              </div>
            </div>
            {amount > max + 0.005 && <p className="text-sm text-rose-600">That is more than the {money(max)} owed.</p>}
            <p className="text-xs text-muted-foreground">Payments settle the oldest installment first{state.settings.penaltyFirst ? ", penalties before installments" : ""}.</p>
          </>
        )}
      </div>
    </ConsoleDialog>
  );
}
