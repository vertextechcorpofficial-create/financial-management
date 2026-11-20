"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConsole, documentStatus } from "../provider";
import { ConsoleShell, EmptyState, FilterBar, FilterField, Panel, StatusChip } from "../components/ui";
import { formatDate, money, round2 } from "../format";
import { memberName, memberOutstanding, memberPastDue, loanTotals, dividendModel } from "../calculations";
import {
  CHANNEL_LABEL, CONSOLE_TODAY, JOURNAL_KIND_LABEL, MEMBER_STATUS_LABEL, type JournalKind,
} from "../types";

const REPORTS = {
  soa: { label: "Statement of account", description: "A member’s savings and loan activity for any period." },
  portfolio: { label: "Loan portfolio", description: "Every loan with principal, balance and status." },
  aging: { label: "Loan aging", description: "Past-due installments by days late, with penalties." },
  collections: { label: "Collections", description: "Loan payments and deposits received in a period." },
  savings: { label: "Savings balances", description: "Each member’s savings, deposits and withdrawals in a period." },
  roster: { label: "Membership roster", description: "Members with agreement numbers and status." },
  docs: { label: "Document compliance", description: "Records still missing documents the policy requires." },
} as const;

type ReportKey = keyof typeof REPORTS;

type Column = { key: string; label: string; kind?: "money" | "date" | "status" | "number" | "text" };
type Row = Record<string, string | number>;

export default function ReportsModule() {
  const { state } = useConsole();
  const [report, setReport] = useState<ReportKey>("portfolio");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState(CONSOLE_TODAY);
  const [memberId, setMemberId] = useState("M1");
  const [copied, setCopied] = useState("");

  const departments = useMemo(() => [...new Set(state.members.map(member => member.department))].sort(), [state.members]);
  const reportData = useMemo(() => buildReport({ report, state, query, department, product, status, channel, from, to }), [report, state, query, department, product, status, channel, from, to]);

  function copy() {
    const text = reportData.rows.length
      ? [reportData.columns.map(column => column.label).join("\t"), ...reportData.rows.map(row => reportData.columns.map(column => {
          const value = row[column.key];
          if (column.kind === "money") return Number(value ?? 0).toFixed(2);
          if (column.kind === "date") return formatDate(String(value));
          return String(value ?? "").replaceAll("\t", " ");
        }).join("\t"))].join("\n")
      : "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied("Copied to clipboard.");
      window.setTimeout(() => setCopied(""), 2500);
    }).catch(() => setCopied("Copy was blocked by the browser."));
  }

  const showDepartment = ["portfolio", "aging", "collections", "savings", "roster", "docs"].includes(report);
  const showProduct = ["portfolio", "aging", "collections"].includes(report);
  const showStatus = ["portfolio", "roster"].includes(report);
  const showChannel = report === "collections";
  const showDates = ["portfolio", "collections", "savings", "soa"].includes(report);

  return (
    <ConsoleShell
      title="Reports"
      subtitle="Pick a report, narrow it with the filters, then copy it into Excel or Sheets."
      actions={<Button size="sm" variant="outline" onClick={copy} disabled={!reportData.rows.length}>Copy as spreadsheet</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Reports">
          {(Object.keys(REPORTS) as ReportKey[]).map(key => (
            <button
              key={key}
              type="button"
              className={`min-w-44 rounded-lg border p-3 text-left text-sm transition-colors lg:min-w-0 ${report === key ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30" : "bg-card hover:border-emerald-300"}`}
              onClick={() => { setReport(key); setQuery(""); setStatus(""); }}
            >
              <span className="block font-medium">{REPORTS[key].label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{REPORTS[key].description}</span>
            </button>
          ))}
        </nav>

        <Panel
          title={REPORTS[report].label}
          description={`${REPORTS[report].description} As of ${formatDate(CONSOLE_TODAY)}.`}
          actions={copied ? <span className="text-xs text-muted-foreground" role="status">{copied}</span> : undefined}
        >
          <FilterBar count={report === "soa" ? undefined : reportData.rows.length} noun="rows">
            {report === "soa" ? (
              <FilterField label="Member">
                <NativeSelect value={memberId} onChange={event => setMemberId(event.target.value)} className="h-8">
                  {state.members.filter(member => member.memberSince).map(member => <option key={member.id} value={member.id}>{memberName(member)} · {member.employeeNumber}</option>)}
                </NativeSelect>
              </FilterField>
            ) : (
              <FilterField label="Search"><Input value={query} onChange={event => setQuery(event.target.value)} placeholder={report === "docs" ? "Member or reference" : "Member"} className="h-8 w-56" /></FilterField>
            )}
            {showDepartment && (
              <FilterField label="Department">
                <NativeSelect value={department} onChange={event => setDepartment(event.target.value)} className="h-8">
                  <option value="">All departments</option>{departments.map(item => <option key={item} value={item}>{item}</option>)}
                </NativeSelect>
              </FilterField>
            )}
            {showProduct && (
              <FilterField label="Product">
                <NativeSelect value={product} onChange={event => setProduct(event.target.value)} className="h-8">
                  <option value="">All products</option>{state.products.map(item => <option key={item.code} value={item.code}>{item.short}</option>)}
                </NativeSelect>
              </FilterField>
            )}
            {showStatus && (
              <FilterField label="Status">
                <NativeSelect value={status} onChange={event => setStatus(event.target.value)} className="h-8">
                  <option value="">All</option>
                  {report === "portfolio" ? <><option value="ACTIVE">Active</option><option value="PENDING">For approval</option><option value="APPROVED">For release</option><option value="FULLY_PAID">Fully paid</option><option value="DEFAULTED">Defaulted</option><option value="REJECTED">Rejected</option></> : Object.entries(MEMBER_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </NativeSelect>
              </FilterField>
            )}
            {showChannel && (
              <FilterField label="Channel">
                <NativeSelect value={channel} onChange={event => setChannel(event.target.value)} className="h-8">
                  <option value="">All channels</option><option value="payroll">Payroll remittance</option><option value="otc">Over the counter</option><option value="system">System</option>
                </NativeSelect>
              </FilterField>
            )}
            {showDates && (
              <>
                <FilterField label={report === "portfolio" ? "Released from" : "From"}><Input type="date" value={from} onChange={event => setFrom(event.target.value)} className="h-8" /></FilterField>
                <FilterField label="To"><Input type="date" value={to} onChange={event => setTo(event.target.value)} className="h-8" /></FilterField>
              </>
            )}
          </FilterBar>

          {report === "soa" ? <SoaView memberId={memberId} from={from} to={to} /> : (
            <>
              <div className="max-h-[65dvh] overflow-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow>{reportData.columns.map(column => <TableHead key={column.key} className={column.kind === "money" || column.kind === "number" ? "text-right" : ""}>{column.label}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {!reportData.rows.length && <TableRow><TableCell colSpan={Math.max(1, reportData.columns.length)}><EmptyState>Nothing to report for these filters.</EmptyState></TableCell></TableRow>}
                    {reportData.rows.map((row, index) => (
                      <TableRow key={index}>
                        {reportData.columns.map(column => {
                          const value = row[column.key];
                          return (
                            <TableCell key={column.key} className={`${column.kind === "money" || column.kind === "number" ? "text-right font-mono" : ""} ${column.kind === "text" ? "whitespace-normal" : ""}`}>
                              {column.kind === "money" ? money(Number(value ?? 0)) : column.kind === "date" ? formatDate(String(value)) : column.kind === "status" ? <StatusChip status={String(value)} /> : String(value ?? "")}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                  {reportData.rows.length > 0 && reportData.columns.some(column => column.kind === "money") && (
                    <tfoot>
                      <TableRow>
                        {reportData.columns.map((column, index) => (
                          <TableCell key={column.key} className={column.kind === "money" ? "text-right font-mono font-semibold" : "font-semibold"}>
                            {index === 0 ? `Total · ${reportData.rows.length} rows` : column.kind === "money" ? money(reportData.rows.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0)) : ""}
                          </TableCell>
                        ))}
                      </TableRow>
                    </tfoot>
                  )}
                </Table>
              </div>
              {reportData.note && <p className="mt-2 text-xs text-muted-foreground">{reportData.note}</p>}
            </>
          )}
        </Panel>
      </div>
    </ConsoleShell>
  );
}

function SoaView({ memberId, from, to }: { memberId: string; from: string; to: string }) {
  const { state } = useConsole();
  const [copied, setCopied] = useState("");
  const member = state.members.find(entry => entry.id === memberId);
  if (!member) return <EmptyState>Choose a member.</EmptyState>;
  const savingsKinds: JournalKind[] = ["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "OFFSET", "FEE"];
  const entries = state.journal.filter(entry => entry.memberId === memberId && savingsKinds.includes(entry.kind)).sort((a, b) => a.date.localeCompare(b.date));
  const opening = entries.filter(entry => entry.date < from).reduce((sum, entry) => sum + (["WITHDRAWAL", "OFFSET", "FEE"].includes(entry.kind) ? -entry.amount : entry.amount), 0);
  const period = entries.filter(entry => entry.date >= from && entry.date <= to);
  const rows = period.reduce<Array<(typeof period)[number] & { balance: number }>>((result, entry) => {
    const previous = result.length ? result[result.length - 1].balance : opening;
    const direction = ["WITHDRAWAL", "OFFSET", "FEE"].includes(entry.kind) ? -1 : 1;
    return [...result, { ...entry, balance: round2(previous + direction * entry.amount) }];
  }, []);
  const loans = state.loans.filter(loan => loan.memberId === memberId);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Savings balance</p><p className="font-mono text-lg font-semibold">{money(member.savings)}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Loan balance</p><p className="font-mono text-lg font-semibold">{money(memberOutstanding(state, member.id))}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Past due</p><p className="font-mono text-lg font-semibold">{money(memberPastDue(state, member.id))}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Dividend estimate</p><p className="font-mono text-lg font-semibold">{money(dividendModel(state).rows.find(row => row.memberId === member.id)?.total ?? 0)}</p></div>
      </div>
      <div className="rounded-lg border">
        <div className="flex flex-wrap justify-between gap-2 border-b p-3 text-sm">
          <span><strong>{memberName(member)}</strong> · {member.employeeNumber} · {member.department}</span>
          <span className="flex items-center gap-3 text-muted-foreground">
            {formatDate(from)} – {formatDate(to)}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const lines = [
                  "Cooperative statement of account",
                  `${memberName(member)} (${member.employeeNumber})`,
                  `${from} to ${to}`,
                  "",
                  "Date\tEntry\tReference\tAmount\tBalance",
                  `${from}\tOpening balance\t\t\t${opening.toFixed(2)}`,
                  ...rows.map(entry => `${entry.date}\t${JOURNAL_KIND_LABEL[entry.kind]}\t${entry.reference}\t${entry.amount.toFixed(2)}\t${entry.balance.toFixed(2)}`),
                  `${to}\tClosing balance\t\t\t${(rows[rows.length - 1]?.balance ?? opening).toFixed(2)}`,
                ];
                navigator.clipboard.writeText(lines.join("\n")).then(() => {
                  setCopied("Statement copied.");
                  window.setTimeout(() => setCopied(""), 2500);
                }).catch(() => setCopied("Copy was blocked."));
              }}
            >
              Copy statement
            </Button>
            {copied && <span className="text-xs" role="status">{copied}</span>}
          </span>
        </div>
        <div className="max-h-[50dvh] overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Particulars</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell>{formatDate(from)}</TableCell><TableCell colSpan={3} className="text-muted-foreground">Opening balance</TableCell><TableCell className="text-right font-mono">{money(opening)}</TableCell></TableRow>
              {!rows.length && <TableRow><TableCell colSpan={5}><EmptyState>No savings activity in this period.</EmptyState></TableCell></TableRow>}
              {rows.map(entry => {
                const debit = ["WITHDRAWAL", "OFFSET", "FEE"].includes(entry.kind);
                return (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.date)}</TableCell>
                    <TableCell>{JOURNAL_KIND_LABEL[entry.kind]} · {CHANNEL_LABEL[entry.channel]}</TableCell>
                    <TableCell className="font-mono text-xs">{entry.reference}</TableCell>
                    <TableCell className={`text-right font-mono ${debit ? "text-rose-600" : ""}`}>{debit ? "−" : "+"}{money(entry.amount)}</TableCell>
                    <TableCell className="text-right font-mono">{money(entry.balance)}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow><TableCell>{formatDate(to)}</TableCell><TableCell colSpan={3} className="font-semibold">Closing balance</TableCell><TableCell className="text-right font-mono font-semibold">{money(rows[rows.length - 1]?.balance ?? opening)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="rounded-lg border p-3">
        <h3 className="text-sm font-semibold">Loans</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Loan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Balance</TableHead><TableHead className="text-right">Past due</TableHead></TableRow></TableHeader>
          <TableBody>
            {!loans.length && <TableRow><TableCell colSpan={4}><EmptyState>No loans.</EmptyState></TableCell></TableRow>}
            {loans.map(loan => { const totals = loanTotals(loan); return <TableRow key={loan.id}><TableCell className="font-mono">{loan.code}</TableCell><TableCell><StatusChip status={loan.status} /></TableCell><TableCell className="text-right font-mono">{money(totals.remaining)}</TableCell><TableCell className="text-right font-mono">{money(totals.pastDue)}</TableCell></TableRow>; })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function buildReport({ report, state, query, department, product, status, channel, from, to }: {
  report: ReportKey;
  state: ReturnType<typeof useConsole>["state"];
  query: string;
  department: string;
  product: string;
  status: string;
  channel: string;
  from: string;
  to: string;
}): { columns: Column[]; rows: Row[]; note?: string } {
  const memberMatch = (memberIdValue: string) => {
    const member = state.members.find(entry => entry.id === memberIdValue);
    if (!member) return false;
    const text = `${memberName(member)} ${member.employeeNumber}`.toLowerCase();
    return (!query.trim() || text.includes(query.trim().toLowerCase())) && (!department || member.department === department);
  };
  const loanMemberMatch = (memberIdValue: string) => memberMatch(memberIdValue);

  if (report === "portfolio") {
    const columns: Column[] = [
      { key: "loan", label: "Loan" }, { key: "member", label: "Member" }, { key: "department", label: "Department" },
      { key: "product", label: "Product" }, { key: "released", label: "Released", kind: "date" }, { key: "terms", label: "Terms" },
      { key: "status", label: "Status", kind: "status" }, { key: "principal", label: "Principal", kind: "money" },
      { key: "balance", label: "Balance", kind: "money" }, { key: "pastDue", label: "Past due", kind: "money" },
    ];
    const rows = state.loans.filter(loan => {
      const member = state.members.find(entry => entry.id === loan.memberId);
      if (!member || !loanMemberMatch(member.id)) return false;
      if (product && loan.productCode !== product) return false;
      if (status && loan.status !== status) return false;
      const released = loan.releaseDate ?? loan.issueDate;
      if (released < from || released > to) return false;
      return true;
    }).map(loan => {
      const member = state.members.find(entry => entry.id === loan.memberId)!;
      const totals = loanTotals(loan);
      return {
        loan: loan.code, member: memberName(member), department: member.department,
        product: state.products.find(entry => entry.code === loan.productCode)?.label ?? "",
        released: loan.releaseDate ?? loan.issueDate, terms: `${loan.months} mo · ${loan.frequency}`,
        status: loan.status, principal: loan.principal, balance: totals.remaining, pastDue: totals.pastDue,
      };
    });
    return { columns, rows, note: "Release date is used for the date filter." };
  }

  if (report === "aging") {
    const columns: Column[] = [
      { key: "loan", label: "Loan" }, { key: "member", label: "Member" }, { key: "department", label: "Department" },
      { key: "oldest", label: "Oldest due", kind: "date" }, { key: "days", label: "Days late" },
      { key: "b1", label: "1–30", kind: "money" }, { key: "b2", label: "31–60", kind: "money" },
      { key: "b3", label: "61–90", kind: "money" }, { key: "b4", label: "90+", kind: "money" },
      { key: "penalties", label: "Penalties", kind: "money" }, { key: "total", label: "Total past due", kind: "money" },
    ];
    const rows = state.loans.filter(loan => loan.status === "ACTIVE" && loanTotals(loan).pastDue > 0 && (!product || loan.productCode === product) && loanMemberMatch(loan.memberId))
      .map(loan => {
        const member = state.members.find(entry => entry.id === loan.memberId)!;
        const late = loan.schedule.filter(installment => installment.paid < installment.total && installment.dueDate < CONSOLE_TODAY);
        const oldest = late.reduce((value, installment) => installment.dueDate < value ? installment.dueDate : value, CONSOLE_TODAY);
        const buckets = [0, 0, 0, 0];
        for (const installment of late) {
          const days = Math.round((new Date(`${CONSOLE_TODAY}T00:00:00Z`).valueOf() - new Date(`${installment.dueDate}T00:00:00Z`).valueOf()) / 86_400_000);
          const index = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
          buckets[index] += installment.total - installment.paid;
        }
        const totals = loanTotals(loan);
        return {
          loan: loan.code, member: memberName(member), department: member.department, oldest,
          days: Math.round((new Date(`${CONSOLE_TODAY}T00:00:00Z`).valueOf() - new Date(`${oldest}T00:00:00Z`).valueOf()) / 86_400_000),
          b1: buckets[0], b2: buckets[1], b3: buckets[2], b4: buckets[3], penalties: totals.penalties, total: round2(totals.pastDue + totals.penalties),
        };
      }).sort((a, b) => Number(b.days) - Number(a.days));
    return { columns, rows };
  }

  if (report === "collections") {
    const columns: Column[] = [
      { key: "date", label: "Date", kind: "date" }, { key: "member", label: "Member" }, { key: "department", label: "Department" },
      { key: "type", label: "Type" }, { key: "channel", label: "Channel" }, { key: "reference", label: "Reference" },
      { key: "loan", label: "Loan payment", kind: "money" }, { key: "penalty", label: "Penalty", kind: "money" },
      { key: "savings", label: "Savings", kind: "money" }, { key: "fees", label: "Fees", kind: "money" }, { key: "total", label: "Total", kind: "money" },
    ];
    const rows = state.journal.filter(entry => ["DEPOSIT", "LOAN_PAYMENT", "FEE"].includes(entry.kind) && entry.date >= from && entry.date <= to && (!channel || entry.channel === channel) && memberMatch(entry.memberId) && (!product || (entry.loanId && state.loans.find(loan => loan.id === entry.loanId)?.productCode === product)))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(entry => {
        const member = state.members.find(item => item.id === entry.memberId)!;
        return {
          date: entry.date, member: memberName(member), department: member.department, type: JOURNAL_KIND_LABEL[entry.kind],
          channel: CHANNEL_LABEL[entry.channel], reference: entry.reference,
          loan: entry.kind === "LOAN_PAYMENT" ? entry.installmentPart ?? entry.amount : 0,
          penalty: entry.penaltyPart ?? 0, savings: entry.kind === "DEPOSIT" ? entry.amount : 0,
          fees: entry.kind === "FEE" ? entry.amount : 0, total: entry.amount,
        };
      });
    return { columns, rows };
  }

  if (report === "savings") {
    const columns: Column[] = [
      { key: "member", label: "Member" }, { key: "employee", label: "Employee no." }, { key: "department", label: "Department" },
      { key: "status", label: "Status", kind: "status" }, { key: "perCutoff", label: "Per cutoff", kind: "money" },
      { key: "opening", label: "Opening", kind: "money" }, { key: "deposits", label: "Deposits", kind: "money" },
      { key: "withdrawals", label: "Withdrawals", kind: "money" }, { key: "closing", label: "Closing", kind: "money" },
    ];
    const rows = state.members.filter(member => member.memberSince && memberMatch(member.id) && (!status || member.status === status)).map(member => {
      const savingsKinds: JournalKind[] = ["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "OFFSET", "FEE"];
      const entries = state.journal.filter(entry => entry.memberId === member.id && savingsKinds.includes(entry.kind));
      const opening = entries.filter(entry => entry.date < from).reduce((sum, entry) => sum + (["WITHDRAWAL", "OFFSET", "FEE"].includes(entry.kind) ? -entry.amount : entry.amount), 0);
      const periodEntries = entries.filter(entry => entry.date >= from && entry.date <= to);
      const deposits = periodEntries.filter(entry => ["DEPOSIT", "DIVIDEND"].includes(entry.kind)).reduce((sum, entry) => sum + entry.amount, 0);
      const withdrawals = periodEntries.filter(entry => ["WITHDRAWAL", "OFFSET", "FEE"].includes(entry.kind)).reduce((sum, entry) => sum + entry.amount, 0);
      return {
        member: memberName(member), employee: member.employeeNumber, department: member.department, status: member.status,
        perCutoff: member.savingsPerCutoff, opening, deposits, withdrawals, closing: round2(opening + deposits - withdrawals),
      };
    });
    return { columns, rows };
  }

  if (report === "roster") {
    const columns: Column[] = [
      { key: "member", label: "Member" }, { key: "employee", label: "Employee no." }, { key: "department", label: "Department" },
      { key: "status", label: "Status", kind: "status" }, { key: "agreement", label: "Agreement" }, { key: "since", label: "Member since", kind: "date" },
      { key: "documents", label: "Documents" }, { key: "savings", label: "Savings", kind: "money" }, { key: "loanBalance", label: "Loan balance", kind: "money" },
    ];
    const rows = state.members.filter(member => memberMatch(member.id) && (!status || member.status === status)).map(member => {
      const docs = documentStatus(state, "member", member.id, ["Valid ID", "Signed membership agreement"]);
      return {
        member: memberName(member), employee: member.employeeNumber, department: member.department, status: member.status,
        agreement: member.agreement?.no ?? "—", since: member.memberSince ?? "", documents: member.status === "NON_MEMBER" ? "—" : `${docs.done}/${docs.required.length}`,
        savings: member.savings, loanBalance: memberOutstanding(state, member.id),
      };
    });
    return { columns, rows };
  }

  if (report === "docs") {
    const columns: Column[] = [
      { key: "record", label: "Record" }, { key: "reference", label: "Reference" }, { key: "member", label: "Member" },
      { key: "department", label: "Department" }, { key: "onFile", label: "On file" }, { key: "missing", label: "Missing", kind: "text" },
    ];
    const rows: Row[] = [];
    for (const member of state.members.filter(entry => entry.status === "ACTIVE" || entry.status === "APPLIED")) {
      if (!memberMatch(member.id)) continue;
      const docs = documentStatus(state, "member", member.id, ["Valid ID", "Signed membership agreement"]);
      if (docs.missing.length) rows.push({ record: "Membership", reference: member.agreement?.no ?? "Application", member: memberName(member), department: member.department, onFile: `${docs.done} of ${docs.required.length}`, missing: docs.missing.join("; ") });
    }
    for (const loan of state.loans.filter(entry => ["PENDING", "APPROVED", "ACTIVE"].includes(entry.status))) {
      if (!memberMatch(loan.memberId)) continue;
      const member = state.members.find(entry => entry.id === loan.memberId)!;
      const docs = documentStatus(state, "loan", loan.id, state.products.find(productItem => productItem.code === loan.productCode)?.documents ?? []);
      if (docs.missing.length) rows.push({ record: "Loan", reference: loan.code, member: memberName(member), department: member.department, onFile: `${docs.done} of ${docs.required.length}`, missing: docs.missing.join("; ") });
    }
    for (const clearance of state.cases.filter(entry => entry.status === "DRAFT")) {
      if (!memberMatch(clearance.memberId)) continue;
      const member = state.members.find(entry => entry.id === clearance.memberId)!;
      const docs = documentStatus(state, "case", clearance.id, ["Resignation or separation letter", "HR clearance form"]);
      if (docs.missing.length) rows.push({ record: "Exit clearance", reference: clearance.code, member: memberName(member), department: member.department, onFile: `${docs.done} of ${docs.required.length}`, missing: docs.missing.join("; ") });
    }
    return { columns, rows };
  }

  return { columns: [], rows: [] };
}
