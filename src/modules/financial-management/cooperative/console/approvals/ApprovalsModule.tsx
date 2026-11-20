"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConsole, documentStatus } from "../provider";
import {
  ConsoleDialog, ConsoleShell, DocumentPanel, EmptyState, FilterBar, FilterField, Kv,
  Panel, StatusChip,
} from "../components/ui";
import { formatDate, money, round2 } from "../format";
import { loanRoom, loanTotals, memberHeadroom, memberName } from "../calculations";
import {
  MODE_LABEL,
} from "../types";

type RequestKind = "LOAN" | "WITHDRAWAL";
type Request = {
  kind: RequestKind;
  id: string;
  memberId: string;
  reference: string;
  title: string;
  amount: number;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RELEASED" | "CANCELLED";
};

const kindLabel: Record<RequestKind, string> = {
  LOAN: "Loan",
  WITHDRAWAL: "Withdrawal",
};

export default function ApprovalsModule() {
  const { state } = useConsole();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [selected, setSelected] = useState<Request | null>(null);

  const requests = useMemo<Request[]>(() => {
    const rows: Request[] = [];
    for (const loan of state.loans) {
      if (!["PENDING", "APPROVED", "REJECTED"].includes(loan.status)) continue;
      rows.push({
        kind: "LOAN",
        id: loan.id,
        memberId: loan.memberId,
        reference: loan.code,
        title: state.products.find(product => product.code === loan.productCode)?.label ?? "Loan",
        amount: loan.principal,
        date: loan.issueDate,
        status: loan.status === "PENDING" ? "PENDING" : loan.status === "APPROVED" ? "APPROVED" : "REJECTED",
      });
    }
    for (const withdrawal of state.withdrawals) {
      if (!["PENDING", "RELEASED", "REJECTED"].includes(withdrawal.status)) continue;
      rows.push({
        kind: "WITHDRAWAL",
        id: withdrawal.id,
        memberId: withdrawal.memberId,
        reference: withdrawal.code,
        title: "Savings withdrawal",
        amount: withdrawal.amount,
        date: withdrawal.date,
        status: withdrawal.status === "PENDING" ? "PENDING" : withdrawal.status === "RELEASED" ? "RELEASED" : "REJECTED",
      });
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [state]);

  const filtered = requests.filter(request => {
    const member = state.members.find(entry => entry.id === request.memberId);
    const text = `${request.reference} ${request.title} ${member ? memberName(member) : ""} ${member?.employeeNumber ?? ""}`.toLowerCase();
    return (!search.trim() || text.includes(search.trim().toLowerCase()))
      && (!kind || request.kind === kind)
      && (!status || request.status === status);
  });

  const pending = requests.filter(request => request.status === "PENDING");
  const count = (requestKind: RequestKind) => pending.filter(request => request.kind === requestKind).length;

  return (
    <ConsoleShell
      title="Approvals"
      subtitle="Loan and withdrawal requests in one queue. Membership decisions stay in the live Members workspace."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className={`rounded-lg border bg-card p-3 text-left ${kind === "LOAN" ? "border-emerald-500" : ""}`} onClick={() => setKind(kind === "LOAN" ? "" : "LOAN")}>
          <p className="text-xs text-muted-foreground">Loans</p><p className="font-mono text-xl font-semibold">{count("LOAN")}</p><p className="text-xs text-muted-foreground">waiting for a decision</p>
        </button>
        <button type="button" className={`rounded-lg border bg-card p-3 text-left ${kind === "WITHDRAWAL" ? "border-emerald-500" : ""}`} onClick={() => setKind(kind === "WITHDRAWAL" ? "" : "WITHDRAWAL")}>
          <p className="text-xs text-muted-foreground">Withdrawals</p><p className="font-mono text-xl font-semibold">{count("WITHDRAWAL")}</p><p className="text-xs text-muted-foreground">pending releases</p>
        </button>
      </div>

      <Panel title="Request queue" description={`${pending.length} pending request${pending.length === 1 ? "" : "s"} in the sample state.`}>
        <FilterBar count={filtered.length} noun="requests">
          <FilterField label="Search"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Member or reference" className="h-8 w-64" /></FilterField>
          <FilterField label="Type">
            <NativeSelect value={kind} onChange={event => setKind(event.target.value)} className="h-8">
              <option value="">All types</option><option value="LOAN">Loan</option><option value="WITHDRAWAL">Withdrawal</option>
            </NativeSelect>
          </FilterField>
          <FilterField label="Status">
            <NativeSelect value={status} onChange={event => setStatus(event.target.value)} className="h-8">
              <option value="">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="RELEASED">Released</option><option value="REJECTED">Rejected</option>
            </NativeSelect>
          </FilterField>
        </FilterBar>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Filed</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Member</TableHead><TableHead>Documents</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {!filtered.length && <TableRow><TableCell colSpan={8}><EmptyState>No requests match these filters.</EmptyState></TableCell></TableRow>}
              {filtered.map(request => {
                const member = state.members.find(entry => entry.id === request.memberId);
                const docs = request.kind === "LOAN"
                  ? documentStatus(state, "loan", request.id, state.products.find(product => product.code === state.loans.find(loan => loan.id === request.id)?.productCode)?.documents ?? [])
                  : null;
                return (
                  <TableRow key={`${request.kind}-${request.id}`} className="cursor-pointer" onClick={() => setSelected(request)}>
                    <TableCell>{formatDate(request.date)}</TableCell>
                    <TableCell>{kindLabel[request.kind]}<span className="block text-xs text-muted-foreground">{request.title}</span></TableCell>
                    <TableCell className="font-mono text-xs">{request.reference}</TableCell>
                    <TableCell className="whitespace-normal">{member ? memberName(member) : "Member"}<span className="block text-xs text-muted-foreground">{member?.employeeNumber}</span></TableCell>
                    <TableCell>{docs ? (docs.missing.length ? <StatusChip status="PARTIAL" label={`${docs.done}/${docs.required.length}`} /> : <StatusChip status="ACTIVE" label="Complete" />) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{request.amount ? money(request.amount) : "—"}</TableCell>
                    <TableCell><StatusChip status={request.status} /></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">Review ›</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {selected && <RequestDialog request={selected} onClose={() => setSelected(null)} />}
    </ConsoleShell>
  );
}

function RequestDialog({ request, onClose }: { request: Request; onClose: () => void }) {
  const { state, actions } = useConsole();
  const member = state.members.find(entry => entry.id === request.memberId);
  if (!member) return null;
  const loan = request.kind === "LOAN" ? state.loans.find(entry => entry.id === request.id) : undefined;
  const withdrawal = request.kind === "WITHDRAWAL" ? state.withdrawals.find(entry => entry.id === request.id) : undefined;
  const product = loan ? state.products.find(entry => entry.code === loan.productCode) : undefined;
  const totals = loan ? loanTotals(loan) : null;
  const savingsAfter = withdrawal ? round2(member.savings - withdrawal.amount) : 0;

  const footer = request.status === "PENDING" ? (
    request.kind === "LOAN" && loan ? (
      <>
        <Button variant="outline" onClick={() => { actions.decideLoan(loan.id, "reject"); onClose(); }}>Reject</Button>
        <Button variant="outline" onClick={() => { actions.decideLoan(loan.id, "approve"); onClose(); }}>Approve</Button>
        <Button onClick={() => { actions.decideLoan(loan.id, "approve-release"); onClose(); }}>Approve & release</Button>
      </>
    ) : withdrawal ? (
      <>
        <Button variant="outline" onClick={() => { actions.decideWithdrawal(withdrawal.id, false); onClose(); }}>Reject</Button>
        <Button onClick={() => { actions.decideWithdrawal(withdrawal.id, true); onClose(); }}>Approve & release {money(withdrawal.amount)}</Button>
      </>
    ) : undefined
  ) : undefined;

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open) onClose(); }}
      title={`${kindLabel[request.kind]} request`}
      description={`${memberName(member)} · ${member.employeeNumber} · ${request.reference}`}
      wide
      footer={footer}
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Request details">
          <Kv rows={request.kind === "LOAN" && loan ? [
            ["Loan", <span key="loan-code" className="font-mono">{loan.code}</span>],
            ["Product", product?.label ?? ""],
            ["Principal", money(loan.principal)],
            ["Terms", `${loan.months} months · ${MODE_LABEL[loan.mode]}`],
            ["Per payment", money(loan.schedule[0]?.total ?? 0)],
            ["Balance", money(totals?.remaining ?? 0), "total"],
          ] : withdrawal ? [
            ["Request", <span key="withdrawal-code" className="font-mono">{withdrawal.code}</span>],
            ["Filed", formatDate(withdrawal.date)],
            ["Release to", withdrawal.method === "payroll" ? "Payroll bank account" : "Cash at coop office"],
            ["Savings now", money(member.savings)],
            ["After release", money(savingsAfter)],
            ["Amount", money(withdrawal.amount), "total"],
          ] : []} />
          {request.kind === "LOAN" && loan && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">Checks</h3>
              <Check ok={member.status === "ACTIVE"} text="Active member" />
              <Check ok={product ? loan.principal <= loanRoom(state, member, product, loan.id) + 0.005 : false} text="Within product limit" />
              <Check ok={loan.mode === "otc" || (loan.schedule[0]?.total ?? 0) <= Math.max(0, memberHeadroom(state, member)) + 0.005} text="Fits the take-home pay floor" />
              <Check ok={!documentStatus(state, "loan", loan.id, product?.documents ?? []).missing.length} text="Required documents on file" />
            </div>
          )}
          {request.kind === "WITHDRAWAL" && withdrawal && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold">Checks</h3>
              <Check ok={savingsAfter >= state.settings.maintainingBalance} text="Keeps the maintaining balance" />
              <Check ok={state.loans.filter(loan => loan.memberId === member.id && loan.status === "ACTIVE").every(loan => loanTotals(loan).pastDue === 0)} text="No past-due loans" />
              <Check ok={state.withdrawals.filter(item => item.memberId === member.id && item.status === "PENDING").length <= state.settings.withdrawalsPerYear} text="Within yearly withdrawal limit" />
            </div>
          )}
        </Panel>
        <Panel title="Documents">
          {request.kind === "LOAN" && loan ? (
            <DocumentPanel ownerType="loan" ownerId={loan.id} required={product?.documents ?? []} canEdit={request.status === "PENDING"} />
          ) : <p className="text-sm text-muted-foreground">No document requirement for this withdrawal request.</p>}
        </Panel>
      </div>
    </ConsoleDialog>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return <p className={`flex items-center gap-2 text-sm ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}><span className={`grid size-4 place-items-center rounded-full text-[10px] font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-muted"}`}>{ok ? "✓" : "•"}</span>{text}</p>;
}
