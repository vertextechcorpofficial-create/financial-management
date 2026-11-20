"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConsole, documentStatus } from "../provider";
import {
  ConsoleDialog, ConsoleShell, DocumentPanel, EmptyState, FilterBar, FilterField, Kv, MemberSelect,
  Panel, Progress, StatusChip, Tile, loanStatusChip,
} from "../components/ui";
import { buildSchedule, loanRoom, loanTotals, memberHeadroom, memberName } from "../calculations";
import { formatDate, money, round2 } from "../format";
import {
  CHANNEL_LABEL, CONSOLE_TODAY, FREQUENCY_LABEL, LOAN_STATUS_LABEL, METHOD_LABEL, MODE_LABEL,
  type ProductCode, type PayFrequency, type PayMode, type RepaymentMethod,
} from "../types";

export default function LoansModule() {
  const { state } = useConsole();
  const [search, setSearch] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  const rows = useMemo(() => state.loans.filter(loan => {
    const member = state.members.find(entry => entry.id === loan.memberId);
    const text = `${loan.code} ${member ? memberName(member) : ""} ${member?.employeeNumber ?? ""} ${loan.purpose} ${loan.item ?? ""} ${loan.agreementNo}`.toLowerCase();
    if (search.trim() && !text.includes(search.trim().toLowerCase())) return false;
    if (product && loan.productCode !== product) return false;
    if (mode && loan.mode !== mode) return false;
    const totals = loanTotals(loan);
    if (status === "PAST_DUE" && !(loan.status === "ACTIVE" && totals.pastDue > 0)) return false;
    if (status === "DOCS") {
      const required = state.products.find(item => item.code === loan.productCode)?.documents ?? [];
      if (!documentStatus(state, "loan", loan.id, required).missing.length) return false;
    }
    if (status && !["PAST_DUE", "DOCS"].includes(status) && loan.status !== status) return false;
    return true;
  }), [state, search, product, status, mode]);

  const active = state.loans.filter(loan => loan.status === "ACTIVE");
  const totals = active.map(loan => loanTotals(loan));
  const selected = selectedId ? state.loans.find(loan => loan.id === selectedId) : undefined;

  return (
    <ConsoleShell
      title="Loans"
      subtitle="Every loan agreement from application to full payment. Enroll a loan here when a member applies at the office."
      actions={<Button size="sm" onClick={() => setEnrolling(true)}>Enroll loan</Button>}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Active" value={active.length} detail={`${money(round2(totals.reduce((sum, item) => sum + item.remaining, 0)))} receivable`} />
        <Tile label="For approval" value={state.loans.filter(loan => loan.status === "PENDING").length} detail={`${money(state.loans.filter(loan => loan.status === "PENDING").reduce((sum, loan) => sum + loan.principal, 0))} requested`} />
        <Tile label="For release" value={state.loans.filter(loan => loan.status === "APPROVED").length} detail="Approved, not yet released" />
        <Tile label="Past due" value={active.filter(loan => loanTotals(loan).pastDue > 0).length} detail={`${money(round2(totals.reduce((sum, item) => sum + item.pastDue, 0)))} behind · ${money(round2(totals.reduce((sum, item) => sum + item.penalties, 0)))} penalties`} alert={active.some(loan => loanTotals(loan).pastDue > 0)} />
      </div>

      <Panel title="Loan register" description="Open a row for the agreement, schedule, payments and documents.">
        <FilterBar count={rows.length} noun="loans">
          <FilterField label="Search">
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Loan no., member, agreement or purpose" className="h-8 w-72" />
          </FilterField>
          <FilterField label="Product">
            <NativeSelect value={product} onChange={event => setProduct(event.target.value)} className="h-8">
              <option value="">All products</option>
              {state.products.map(item => <option key={item.code} value={item.code}>{item.short}</option>)}
            </NativeSelect>
          </FilterField>
          <FilterField label="Status">
            <NativeSelect value={status} onChange={event => setStatus(event.target.value)} className="h-8">
              <option value="">All statuses</option>
              {Object.entries(LOAN_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              <option value="PAST_DUE">Past due</option><option value="DOCS">Missing documents</option>
            </NativeSelect>
          </FilterField>
          <FilterField label="Repayment">
            <NativeSelect value={mode} onChange={event => setMode(event.target.value)} className="h-8">
              <option value="">Any</option><option value="payroll">Salary deduction</option><option value="otc">Over the counter</option>
            </NativeSelect>
          </FilterField>
        </FilterBar>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Loan</TableHead><TableHead>Member</TableHead><TableHead>Terms</TableHead><TableHead>Status</TableHead>
              <TableHead>Documents</TableHead><TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Past due</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!rows.length && <TableRow><TableCell colSpan={8}><EmptyState>No loans match these filters.</EmptyState></TableCell></TableRow>}
              {rows.map(loan => {
                const member = state.members.find(entry => entry.id === loan.memberId);
                const item = loanTotals(loan);
                const required = state.products.find(entry => entry.code === loan.productCode)?.documents ?? [];
                const docs = documentStatus(state, "loan", loan.id, required);
                return (
                  <TableRow key={loan.id} className="cursor-pointer" onClick={() => setSelectedId(loan.id)}>
                    <TableCell className="whitespace-normal">
                      <p className="font-mono text-sm font-medium">{loan.code}</p>
                      <p className="text-xs text-muted-foreground">{state.products.find(entry => entry.code === loan.productCode)?.label}</p>
                    </TableCell>
                    <TableCell className="whitespace-normal">{member ? memberName(member) : "Member"}<span className="block text-xs text-muted-foreground">{member?.employeeNumber}</span></TableCell>
                    <TableCell>{loan.months} months<span className="block text-xs text-muted-foreground">{FREQUENCY_LABEL[loan.frequency]} · {MODE_LABEL[loan.mode]}</span></TableCell>
                    <TableCell>{loanStatusChip(loan.status)}</TableCell>
                    <TableCell>{docs.missing.length ? <StatusChip status="PARTIAL" label={`${docs.done}/${docs.required.length}`} /> : <StatusChip status="ACTIVE" label="Complete" />}</TableCell>
                    <TableCell className="text-right font-mono">{money(loan.principal)}</TableCell>
                    <TableCell className="text-right font-mono">{loan.status === "ACTIVE" || loan.status === "DEFAULTED" ? money(item.remaining) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{loan.status === "ACTIVE" && item.pastDue ? money(item.pastDue) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {selected && <LoanDialog loanId={selected.id} onClose={() => setSelectedId(null)} />}
      {enrolling && <EnrollLoanDialog onClose={() => setEnrolling(false)} />}
    </ConsoleShell>
  );
}

function EnrollLoanDialog({ onClose }: { onClose: () => void }) {
  const { state, actions } = useConsole();
  const activeProducts = state.products.filter(product => product.active);
  const [memberId, setMemberId] = useState("");
  const [productCode, setProductCode] = useState<ProductCode>(activeProducts[0]?.code ?? "SALARY");
  const [amount, setAmount] = useState(20_000);
  const [rate, setRate] = useState(1.25);
  const [method, setMethod] = useState<RepaymentMethod>("diminishing");
  const [months, setMonths] = useState(12);
  const [frequency, setFrequency] = useState<PayFrequency>("cutoff");
  const [mode, setMode] = useState<PayMode>("payroll");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [releaseMethod, setReleaseMethod] = useState<"payroll" | "cash">("payroll");
  const [signed, setSigned] = useState(false);
  const [approveNow, setApproveNow] = useState(true);

  const product = state.products.find(entry => entry.code === productCode)!;
  const member = state.members.find(entry => entry.id === memberId);
  const item = product.items.find(entry => entry.id === itemId) ?? product.items[0];
  const principal = product.kind === "GOODS" ? round2((item?.price ?? 0) * Math.max(1, quantity)) : round2(amount);
  const schedule = buildSchedule({
    principal,
    rate,
    markup: product.markup,
    method: product.kind === "GOODS" ? "markup" : method,
    months,
    frequency,
    start: CONSOLE_TODAY,
  });
  const amort = schedule[0]?.total ?? 0;
  const room = member ? loanRoom(state, member, product) : 0;
  const headroom = member ? memberHeadroom(state, member) : 0;
  const totalPayable = round2(schedule.reduce((sum, row) => sum + row.total, 0));
  const valid = Boolean(member) && principal > 0 && signed && (product.kind === "GOODS" || (rate >= product.rateMin && rate <= product.rateMax))
    && (mode === "otc" || amort <= Math.max(0, headroom) + 0.005)
    && (product.limitType === "none" || principal <= room + 0.005);

  function selectProduct(code: ProductCode) {
    const next = state.products.find(entry => entry.code === code)!;
    setProductCode(code);
    setRate(next.defaultRate);
    setMethod(next.methods[0] === "markup" ? "flat" : next.methods[0]);
    setMonths(next.months[Math.min(2, next.months.length - 1)]);
    setFrequency(next.frequencies[0]);
    setMode(next.modes[0]);
    setItemId(next.items[0]?.id ?? "");
    setQuantity(1);
    if (next.limitType === "fixed") setAmount(next.fixedCeiling);
    else setAmount(20_000);
  }

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title="Enroll loan"
      description="Record a loan agreement for a member who applied at the office."
      wide
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() => {
              actions.enrollLoan({
                memberId, productCode, principal, rate, method: product.kind === "GOODS" ? "markup" : method,
                months, frequency, mode, purpose, item: product.kind === "GOODS" ? item?.id ?? null : null,
                quantity, releaseMethod, signed, approveNow,
              });
              onClose();
            }}
          >
            {approveNow ? "Enroll, approve & release" : "Enroll loan"}
          </Button>
        </>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <MemberSelect members={state.members} value={memberId} onChange={setMemberId} include="active" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Product
              <NativeSelect value={productCode} onChange={event => selectProduct(event.target.value as ProductCode)}>
                {activeProducts.map(entry => <option key={entry.code} value={entry.code}>{entry.label}</option>)}
              </NativeSelect>
            </label>
            {product.kind === "GOODS" ? (
              <>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">Item
                  <NativeSelect value={item?.id ?? ""} onChange={event => setItemId(event.target.value)}>
                    {product.items.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · {money(entry.price)}</option>)}
                  </NativeSelect>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">Quantity
                  <Input type="number" min={1} max={10} value={quantity} onChange={event => setQuantity(Number(event.target.value))} />
                </label>
              </>
            ) : (
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Amount
                <Input type="number" min={0} step={500} value={amount} onChange={event => setAmount(Number(event.target.value))} />
              </label>
            )}
            {product.kind === "CASH" && (
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Interest per month (%)
                <Input type="number" min={product.rateMin} max={product.rateMax} step={0.05} value={rate} onChange={event => setRate(Number(event.target.value))} />
              </label>
            )}
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Term
              <NativeSelect value={months} onChange={event => setMonths(Number(event.target.value))}>
                {product.months.map(term => <option key={term} value={term}>{term} months</option>)}
              </NativeSelect>
            </label>
            {product.kind === "CASH" && product.methods.length > 1 && (
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Interest method
                <NativeSelect value={method} onChange={event => setMethod(event.target.value as RepaymentMethod)}>
                  {product.methods.filter(entry => entry !== "markup").map(entry => <option key={entry} value={entry}>{METHOD_LABEL[entry]}</option>)}
                </NativeSelect>
              </label>
            )}
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Frequency
              <NativeSelect value={frequency} onChange={event => setFrequency(event.target.value as PayFrequency)}>
                {product.frequencies.map(entry => <option key={entry} value={entry}>{FREQUENCY_LABEL[entry]}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">How the member pays
              <NativeSelect value={mode} onChange={event => setMode(event.target.value as PayMode)}>
                {product.modes.map(entry => <option key={entry} value={entry}>{MODE_LABEL[entry]}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">Purpose
              <Input value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="e.g. Tuition" />
            </label>
            {product.kind === "CASH" && (
              <label className="space-y-1 text-xs font-medium text-muted-foreground">Release proceeds
                <NativeSelect value={releaseMethod} onChange={event => setReleaseMethod(event.target.value as "payroll" | "cash")}>
                  <option value="payroll">To payroll bank account</option><option value="cash">Cash at coop office</option>
                </NativeSelect>
              </label>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" checked={signed} onChange={event => setSigned(event.target.checked)} className="mt-1 accent-emerald-600" />
            The member signed the loan agreement and promissory note.
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={approveNow} onChange={event => setApproveNow(event.target.checked)} className="mt-1 accent-emerald-600" />
            Approve and release now; otherwise save it for approvals.
          </label>
        </div>
        <Panel title="Assessment" description={member ? memberName(member) : "Choose a member"}>
          <Kv rows={[
            [product.kind === "GOODS" ? "Invoice price" : "Principal", money(principal)],
            [product.kind === "GOODS" ? "Markup" : "Total interest", money(round2(schedule.reduce((sum, row) => sum + row.interest, 0)))],
            ["Total payable", money(totalPayable)],
            [`${schedule.length} payments of`, money(amort), "total"],
            ["Product room", product.limitType === "none" ? "No set limit" : money(room)],
            ["Take-home headroom", money(headroom)],
          ]} />
          <div className="mt-3 space-y-1.5 text-sm">
            <Check ok={Boolean(member)} text="Active member" />
            <Check ok={principal > 0} text="Amount or item selected" />
            <Check ok={product.limitType === "none" || principal <= room + 0.005} text="Within product limit" />
            <Check ok={mode === "otc" || amort <= Math.max(0, headroom) + 0.005} text="Fits the take-home pay floor" />
            <Check ok={signed} text="Signed agreement" />
          </div>
          {product.kind === "CASH" && <p className="mt-3 text-xs text-muted-foreground">Late payments: {product.penaltyPercent}% of the missed installment after {product.graceDays} days. {product.processingFee ? `Processing fee ${money(product.processingFee)} on release.` : ""}</p>}
        </Panel>
      </div>
    </ConsoleDialog>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return <p className={`flex items-center gap-2 ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}><span className={`grid size-4 place-items-center rounded-full text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-muted"}`}>{ok ? "✓" : "•"}</span>{text}</p>;
}

function LoanDialog({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const { state, actions } = useConsole();
  const loan = state.loans.find(entry => entry.id === loanId);
  const [tab, setTab] = useState("summary");
  if (!loan) return null;
  const member = state.members.find(entry => entry.id === loan.memberId);
  const product = state.products.find(entry => entry.code === loan.productCode);
  const totals = loanTotals(loan);
  const docs = documentStatus(state, "loan", loan.id, product?.documents ?? []);
  const paidCount = loan.schedule.filter(item => item.paid >= item.total - 0.005).length;
  const payments = state.journal.filter(entry => entry.loanId === loan.id && entry.kind === "LOAN_PAYMENT").sort((a, b) => b.date.localeCompare(a.date));

  const footer = loan.status === "PENDING" ? (
    <>
      <Button variant="outline" onClick={() => { actions.decideLoan(loan.id, "reject"); onClose(); }}>Reject</Button>
      <Button variant="outline" onClick={() => { actions.decideLoan(loan.id, "approve"); onClose(); }}>Approve</Button>
      <Button onClick={() => { actions.decideLoan(loan.id, "approve-release"); onClose(); }}>Approve & release</Button>
    </>
  ) : loan.status === "APPROVED" ? (
    <Button onClick={() => { actions.decideLoan(loan.id, "release"); onClose(); }}>Release {money(loan.principal)}</Button>
  ) : loan.status === "ACTIVE" ? (
    <Button asChild variant="outline"><Link href="/fm/cooperative/transactions">Post a payment</Link></Button>
  ) : undefined;

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{loan.code}</span>{loanStatusChip(loan.status)}</span>}
      description={`${member ? memberName(member) : "Member"} · ${member?.employeeNumber ?? ""} · ${product?.label ?? ""}`}
      wide
      footer={footer}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="agreement">Agreement</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="docs">Documents {docs.missing.length ? `(${docs.missing.length} missing)` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Principal" value={money(loan.principal)} />
            <Tile label={product?.kind === "GOODS" ? "Markup" : "Rate"} value={product?.kind === "GOODS" ? `${loan.markup}%` : `${loan.rate}% / mo`} />
            <Tile label="Term" value={`${loan.months} mo`} detail={`${FREQUENCY_LABEL[loan.frequency]} · ${MODE_LABEL[loan.mode]}`} />
            <Tile label="Balance" value={money(totals.remaining)} detail={totals.pastDue ? `${money(totals.pastDue)} past due` : "Current"} alert={totals.pastDue > 0} />
          </div>
          <Panel title="Progress">
            <Progress value={paidCount} max={loan.schedule.length || 1} />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{paidCount} of {loan.schedule.length} installments paid</span><span>{money(totals.penalties)} penalties due</span></div>
          </Panel>
          <Panel title="History"><ul className="space-y-1 text-sm text-muted-foreground">{loan.history.map((entry, index) => <li key={`${entry.date}-${index}`}>{formatDate(entry.date)}: {entry.text}</li>)}</ul></Panel>
        </TabsContent>
        <TabsContent value="agreement" className="mt-4">
          <div className="max-w-3xl space-y-3 rounded-lg border bg-muted/30 p-4 text-sm leading-6">
            <div className="flex flex-wrap justify-between gap-2 border-b pb-2 font-semibold"><span>Loan Agreement & Promissory Note</span><span className="font-mono">{loan.agreementNo}</span></div>
            <p>I, <strong>{member ? memberName(member) : "Member"}</strong> ({member?.employeeNumber}, {member?.department}), a member of the cooperative, borrow <strong>{money(loan.principal)}</strong> under the <strong>{product?.label}</strong> program{loan.item ? ` for ${loan.item}` : loan.purpose ? ` for ${loan.purpose.toLowerCase()}` : ""}.</p>
            <p>I promise to pay <strong>{money(loan.schedule.reduce((sum, item) => sum + item.total, 0))}</strong> in <strong>{loan.months} months</strong> by <strong>{MODE_LABEL[loan.mode].toLowerCase()}</strong>{loan.releaseDate ? `, starting ${formatDate(loan.schedule[0]?.dueDate ?? loan.releaseDate)}` : ", starting on the first due date after release"}.</p>
            <p>{product?.kind === "GOODS" ? `The price includes a ${loan.markup}% flat markup.` : `Interest is ${loan.rate}% per month on a ${loan.method} basis.`} {loan.penaltyPercent ? `A late charge of ${loan.penaltyPercent}% of a missed installment applies after ${loan.graceDays} days.` : ""}</p>
            <Kv rows={[["Date", formatDate(loan.issueDate)], ["Signed by member", loan.agreementSigned ? "Yes" : "Not yet"], ["Release", loan.releaseMethod === "payroll" ? "Payroll bank account" : "Cash at office"]]} />
          </div>
        </TabsContent>
        <TabsContent value="schedule" className="mt-4">
          <div className="max-h-[55dvh] overflow-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Principal</TableHead><TableHead className="text-right">Interest</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {loan.schedule.map(installment => {
                  const status = installment.offset ? "OFFSET" : installment.paid >= installment.total - 0.005 ? "PAID" : installment.dueDate < CONSOLE_TODAY ? "PAST_DUE" : "UNPAID";
                  return (
                    <TableRow key={installment.no}>
                      <TableCell className="font-mono">{installment.no}</TableCell><TableCell>{formatDate(installment.dueDate)}</TableCell>
                      <TableCell className="text-right font-mono">{money(installment.principal)}</TableCell>
                      <TableCell className="text-right font-mono">{money(installment.interest)}</TableCell>
                      <TableCell className="text-right font-mono">{money(installment.total)}</TableCell>
                      <TableCell className="text-right font-mono">{installment.paid ? money(installment.paid) : "—"}</TableCell>
                      <TableCell><StatusChip status={status} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Channel</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Installment</TableHead><TableHead className="text-right">Penalty</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {!payments.length && <TableRow><TableCell colSpan={6}><EmptyState>No payments yet.</EmptyState></TableCell></TableRow>}
              {payments.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDate(entry.date)}</TableCell><TableCell>{CHANNEL_LABEL[entry.channel]}</TableCell>
                  <TableCell className="font-mono text-xs">{entry.reference}</TableCell>
                  <TableCell className="text-right font-mono">{money(entry.installmentPart ?? entry.amount)}</TableCell>
                  <TableCell className="text-right font-mono">{entry.penaltyPart ? money(entry.penaltyPart) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{money(entry.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="docs" className="mt-4">
          <DocumentPanel ownerType="loan" ownerId={loan.id} required={product?.documents ?? []} canEdit={["PENDING", "APPROVED", "ACTIVE"].includes(loan.status)} />
        </TabsContent>
      </Tabs>
    </ConsoleDialog>
  );
}
