"use client";

import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BarChart3, Check, Download, HeartHandshake, Landmark, LockKeyhole, RefreshCcw, ReceiptText, Save, ShieldCheck, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accounts, balance, fiscalDates, journalCsv, journalDebitTotal, peso, type Entry } from "./ledger";
import type { LedgerRegisters } from "./server/registers";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "./workspaces";
import { type CashAction } from "./cash-commands";
import { submitLedger } from "./ledger-api";
import type { ReconciliationRecord } from "./server/reconciliation-access";
import type { DonationDocument } from "./server/donation-documents";
import { TradeForm, DonationPreview } from "./TradeForm";
import { CapitalActions, type CapitalOperation } from "./CapitalActions";
import { EntryLauncher, type EntryOption } from "./EntryLauncher";
import { MasterData } from "./MasterData";
import { Price } from "./Price";
import { Policy } from "./Policy";
import { DataTools } from "./DataTools";
import { PendingCommands } from "./PendingCommands";
import { TaxFilingForm } from "./TaxFilingForm";
import { LedgerDialog } from "./LedgerDialog";
import { mutationError, mutationToast } from "./mutation-toast";

function donationDeductionBasis(data: Entry["data"]) {
  if (Number.isFinite(Number(data.deductBasis))) return Number(data.deductBasis);
  if (Array.isArray(data.consumed)) return data.consumed.reduce((sum: number, item: { cost?: number }) => sum + Number(item.cost ?? 0), 0);
  return Number(data.amount ?? 0);
}
import { executeLedgerCommand } from "./ledger-api";
import { stockReports, taxReports, filingReviewPack } from "./reporting";
import { pooledBalance } from "./donations";
import { AnnualReviewForm } from "./AnnualReviewForm";
import type { ReviewEvent } from "./annual-review";
import { planDeployment } from "./deployment";
import { reconciliationLines, reconciliationApprovalError } from "./reconciliation";
import { capitalSummary, charitableDeduction, donorYear, fiscalActivity, giftCandidates, givingTarget as calculateGivingTarget, periodChecklist, requiredDonationDocs } from "./analytics";
import { certificateActiveAt } from "./certificates";
import { loanInterest } from "./loans";

const cashCodes = ["1000", "1010", "1020"];
const lineLabels: Record<string, string> = {
  subscribe: "Share subscription", transfer: "Cash transfer", debt: "Borrowing", buy: "Purchase",
  issue: "Certificate issued", accrual: "Month-end interest accrual", taxpay: "Record BIR Tax Payment",
  debtpay: "Loan payment", accrue: "Income accrued", receive: "Income received",
  subcollect: "Subscription payment", donation: "Donation", sell: "Sale", expaccrue: "Fee accrued",
  exppay: "Accrued fee paid", closing: "Year-end closing", fee: "Fee paid", reversal: "Reversal",
  contribution: "Deposit / stockholder advance", divdeclare: "Dividend declared", divpay: "Dividend paid", taxadj: "Tax true-up",
};

const workspaceTabs: Partial<Record<WorkspaceKey, string[]>> = {
  "inflows-investing": ["Capital raised", "Income receivable", "Pre-investment checks", "Deployment planner"],
  "capital-stock": ["Summary", "Stockholders", "Stock & transfer book", "Subscriptions", "Dividends"],
  "portfolio-rebalancing": ["Allocation", "Holdings", "Gift or sell", "Securities"],
  "charitable-giving": ["Budget & donations", "Organizations"],
  "tax-compliance": ["Payable to BIR", "Donations", "Investments & capital"],
};

const friendlyActions: Record<string, string> = {
  accrue: "Interest posted", close: "Month closed", reopen: "Month reopened",
  draft: "Draft saved", sign: "Reconciliation signed", buy: "Purchase", sell: "Sale",
  donation: "Donation", reversal: "Reversal", taxpay: "Record BIR Tax Payment",
};

function StatusBadge({ status, tone }: { status: string; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  const colors = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    danger: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
    info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
    neutral: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
  };
  return <Badge variant="outline" className={colors[tone ?? "neutral"]}>{status}</Badge>;
}

const allocationStyles = {
  within: { label: "Within range", tone: "success", bar: "bg-emerald-600 dark:bg-emerald-400" },
  near: { label: "Near edge", tone: "warning", bar: "bg-amber-600 dark:bg-amber-400" },
  outside: { label: "Outside range", tone: "danger", bar: "bg-red-600 dark:bg-red-400" },
} as const;

function friendlyDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function actorLabel(actor: unknown, currentActor: number, currentName: string) {
  if (Number(actor) === currentActor && currentName) return `${currentName} (you)`;
  if (typeof actor === "string" && actor.trim() && !/^\d+$/.test(actor)) return actor;
  return "Finance team member";
}

function friendlyTaxClass(value: string) {
  return ({ listed: "Listed security", fund: "Investment fund", govsec: "Government security" } as Record<string, string>)[value] ?? value;
}

function tabIcon(label: string) {
  if (label.includes("Capital") || label.includes("Stockholders") || label.includes("Subscriptions") || label.includes("Dividends")) return <WalletCards aria-hidden="true" />;
  if (label.includes("Portfolio") || label.includes("Allocation") || label.includes("Holdings") || label.includes("Securities")) return <BarChart3 aria-hidden="true" />;
  if (label.includes("donation") || label.includes("Organizations")) return <HeartHandshake aria-hidden="true" />;
  if (label.includes("Tax") || label.includes("BIR")) return <ReceiptText aria-hidden="true" />;
  return <ShieldCheck aria-hidden="true" />;
}

function Panel({ active, children }: { active: boolean; children: ReactNode }) {
  return <div hidden={!active} className="space-y-4" role="tabpanel">{children}</div>;
}

export function IncomeEntryFields({ securities }: { securities: LedgerRegisters["securities"][string][] }) {
  return <>
    <label className="grid gap-1">Income security (optional)<select name="sym" defaultValue="" className="h-9 rounded-md border bg-background px-2">
      <option value="">Bank income / other</option>{securities.map(row => <option key={row.sym} value={row.sym}>{row.sym} · {row.name}</option>)}
    </select></label>
    <label>Final tax withheld (%)<Input name="fwtRate" type="number" min="0" max="100" step="0.000001" placeholder="Blank uses the policy default" /></label>
  </>;
}

function MonthNavigation({ value, first, onChange }: { value: string; first: string; onChange: (value: string) => void }) {
  const year = Number(value.slice(0, 4));
  return <div className="flex flex-wrap items-end gap-2 text-sm">
     <label>Year<select className="ml-2 h-9 rounded-md border bg-background px-2" aria-label="Year" value={year} onChange={event => onChange(`${event.target.value}-${value.slice(5)}`)}>
      {Array.from({ length: Math.max(3, year + 2 - Number(first.slice(0, 4))) }, (_, i) => Number(first.slice(0, 4)) + i).map(item => <option key={item}>{item}</option>)}
    </select></label>
    <label>Month<select className="ml-2 h-9 rounded-md border bg-background px-2" aria-label="Month" value={value.slice(5)} onChange={event => onChange(`${year}-${event.target.value}`)}>
       {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(item => <option key={item} value={item}>{new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(Date.UTC(2020, Number(item) - 1, 1)))}</option>)}
     </select></label>
   </div>;
}

function Grid({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <Table><TableHeader><TableRow>{headers.map(title => <TableHead key={title}>{title}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.length ? rows.map((row, i) => <TableRow key={i}>{row.map((cell, j) =>
      <TableCell key={j}>{cell}</TableCell>)}</TableRow>) :
      <TableRow><TableCell colSpan={headers.length} className="text-muted-foreground">No records in this view.</TableCell></TableRow>}</TableBody></Table>;
}

function Journal({ rows, onReverse, reverseAllowed = true }: { rows: Entry[]; onReverse?: (entry: Entry) => void; reverseAllowed?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return <Table><TableHeader><TableRow>{["Journal", "Date", "Type", "Description", "Debit total", "Actions"].map(label =>
    <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
    {rows.map(entry => { const alreadyReversed = Boolean(entry.reversedBy) || rows.some(candidate => candidate.type === "reversal" && candidate.data?.reverses === entry.id); return <Fragment key={entry.id}><TableRow>
      <TableCell><Button variant="ghost" size="sm" disabled={!entry.lines.length} title={!entry.lines.length ? "Transaction detail is restricted to its authorized workspace." : undefined} aria-expanded={open === entry.id}
        onClick={() => setOpen(open === entry.id ? null : entry.id)}>JE-{String(entry.no).padStart(4, "0")}</Button></TableCell>
      <TableCell>{entry.date}</TableCell><TableCell>{lineLabels[entry.type] ?? entry.type}</TableCell>
      <TableCell className="whitespace-normal">{entry.memo}</TableCell>
      <TableCell>{journalDebitTotal(entry) === null ? "Restricted" : peso(journalDebitTotal(entry)!)}</TableCell>
      <TableCell>{!["reversal", "closing", "taxadj", "summary"].includes(entry.type) &&
        <Button variant="outline" size="sm" disabled={alreadyReversed || !reverseAllowed || !onReverse}
          title={alreadyReversed ? "This journal entry has already been reversed." : !reverseAllowed ? "Transactions approval and the posting source are required." : undefined}
          onClick={() => onReverse?.(entry)}>{alreadyReversed ? "Already reversed" : "Reverse"}</Button>}</TableCell>
    </TableRow>{open === entry.id && <TableRow><TableCell colSpan={6}>
      <Grid headers={["Account", "Debit", "Credit", "Register tag"]}
        rows={entry.lines.map(line => [`${line.acct} · ${accounts[line.acct]}`, peso(line.dr), peso(line.cr), line.tag || "—"])} />
      {entry.reversedBy && <p className="text-sm text-muted-foreground">Reversed</p>}
     </TableCell></TableRow>}</Fragment>; })}
    {!rows.length && <TableRow><TableCell colSpan={5}>No entries match the filters.</TableCell></TableRow>}
  </TableBody></Table>;
}

function downloadJournal(rows: Entry[]) {
  downloadCsv("capital-and-giving-journal.csv", journalCsv(rows));
}

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InvestmentDonationsModule({ workspace, canPost, canReverse, journal, registers, reconciliations, reconciliationRole, actor, actorName = "", donationDocuments, annualReviews, annualHistory, recentEntries, projectionNotice, annualEvidence, attention, evaluatedAt }: {
  workspace: WorkspaceKey; canPost: boolean; canReverse: boolean; journal: Entry[]; registers: LedgerRegisters;
  reconciliations: ReconciliationRecord[] | null; reconciliationRole: "none" | "view" | "prepare" | "approve"; actor: number; actorName?: string;
  donationDocuments: Record<string, DonationDocument> | null;
  annualReviews: ReviewEvent[] | null;
  annualHistory?: ReviewEvent[] | null;
  recentEntries?: Entry[]; projectionNotice?: string;
  annualEvidence?: Record<string, string[]>;
  attention?: import("./attention").AttentionPayload; evaluatedAt?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === workspace)!.title;
  const [selectedTab, setSelectedTab] = useState({ workspace, index: Math.max(0, Math.min((workspaceTabs[workspace]?.length ?? 1) - 1, Number(searchParams.get("tab")) || 0)) });
  const activeTab = selectedTab.workspace === workspace ? selectedTab.index : 0;
  const tabs = workspaceTabs[workspace];
  const entries = [...journal].sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const { policy } = registers;
  const asOf = (evaluatedAt ?? new Date().toISOString()).slice(0, 10);
  const fy = fiscalDates(asOf, policy.fyStart);
  const securities = Object.values(registers.securities);
  const holdings = registers.lots.filter(lot => lot.openQty > 0).flatMap(lot => {
    const security = securities.find(item => item.sym === lot.sym);
    return security ? [{ ...lot, security, cost: lot.openCost ?? lot.cost * lot.openQty / lot.qty, market: security.price * lot.openQty }] : [];
  });
  const market = holdings.reduce((sum, lot) => sum + lot.market, 0);
  const cost = ["1100", "1110", "1120", "1130", "1140"].reduce((sum, code) => sum + balance(entries, code), 0);
  const gifts = entries.filter(entry => entry.type === "donation" && !entry.reversedBy);
  const giving = balance(fiscalActivity(entries, asOf, policy.fyStart), "5000");
  const givingTarget = calculateGivingTarget(policy, entries, fy.from, fy.to);
  const capital = capitalSummary(entries, registers, asOf);
  const candidates = giftCandidates(registers, asOf);
  const deduction = charitableDeduction(entries, registers, fy.from, fy.to);
  const allocation = registers.classes.map(group => {
    const value = holdings.filter(lot => lot.security.cls === group.id).reduce((sum, lot) => sum + lot.market, 0);
    return { ...group, value, actual: market ? value * 100 / market : 0 };
  });
  const [attentionExpanded, setAttentionExpanded] = useState(false);
  const [deploymentAmount, setDeploymentAmount] = useState("");
  const plan = planDeployment(Number(deploymentAmount), policy.lumpThreshold, policy.tranches, allocation);
  const reserveNeed = policy.reserveMonths * policy.monthlyExpenses;
  const highInterest = registers.debts.filter(debt => debt.rate > policy.debtThreshold &&
    !debt.scheduled && balance(entries, "2000", debt.id) < 0);
  const checks = [
    { name: "Emergency and operating reserve", ok: balance(entries, "1010") >= reserveNeed,
      detail: `${peso(balance(entries, "1010"))} held; ${peso(reserveNeed)} required` },
    { name: "High-interest debt", ok: highInterest.length === 0,
      detail: highInterest.length ? highInterest.map(debt => debt.name).join(", ") : "No outstanding high-interest debt without a scheduled payoff" },
    { name: "Short-term liquidity", ok: balance(entries, "1020") >= policy.liquidityNeed,
      detail: `${peso(balance(entries, "1020"))} held; ${peso(policy.liquidityNeed)} required` },
  ];
  const receivables = entries.flatMap(entry => entry.lines.flatMap(line => {
    if (entry.type !== "accrue" || !["1200", "1210"].includes(line.acct) || !line.tag || line.dr <= 0) return [];
    const outstanding = balance(entries, line.acct, line.tag);
    if (outstanding <= 0) return [];
    const due = typeof entry.data.payDate === "string" ? entry.data.payDate : "";
    return [{ id: line.tag, memo: entry.memo, due, outstanding,
      tax: outstanding * (line.acct === "1210" ? policy.intFwt : policy.divFwt) / 100 }];
  }));
  const fiscalEntries = fiscalActivity(entries, asOf, policy.fyStart);
  const sourceEntries = new Map(entries.map(entry => [entry.id, entry]));
  const raised = ["subcollect", "subscribe", "contribution"].map(type => cashCodes.reduce((sum, code) =>
    sum + balance(fiscalEntries.filter(entry => (entry.type === "reversal" ? sourceEntries.get(String(entry.data.reverses))?.type ?? entry.data.sourceType : entry.type) === type), code), 0));
  const organization = (id: unknown) => registers.charities.find(row => row.id === id)?.name ?? "—";
  const holder = (id: string) => registers.holders.find(row => row.id === id)?.name ?? "—";
  const unpaidSubscriptions = registers.subs.filter(row => !row.issuedAt)
    .map(row => ({ ...row, unpaid: balance(entries, "3020", row.id) })).filter(row => row.unpaid > 0);
  const issuableSubscriptions = registers.subs.filter(row => !row.issuedAt &&
    balance(entries, "3020", row.id) === 0 && !registers.certs.some(cert => "subId" in cert && cert.subId === row.id));
  const cash = cashCodes.reduce((sum, code) => sum + balance(entries, code), 0);
  const liabilities = -Object.keys(accounts).filter(code => code.startsWith("2")).reduce((sum, code) => sum + balance(entries, code), 0);
  const assets = Object.keys(accounts).filter(code => code.startsWith("1")).reduce((sum, code) => sum + balance(entries, code), 0);
  const taxItems = entries.flatMap(entry => entry.lines.filter(line => line.acct === "2200" && line.cr > 0).map(line => ({
    tag: line.tag, label: `${String(entry.data.taxForm ?? "BIR item")} · JE-${entry.no}`,
    outstanding: -balance(entries, "2200", line.tag),
  }))).filter(item => item.outstanding > 0);
  const fees = entries.flatMap(entry => entry.lines.filter(line => line.acct === "2110" && line.cr > 0 && line.tag)
    .map(line => ({ tag: line.tag, label: entry.memo, outstanding: -balance(entries, "2110", line.tag) })))
    .filter((row, index, all) => row.outstanding > 0 && all.findIndex(item => item.tag === row.tag) === index);
  const [showForm, setShowForm] = useState(false);
  const [entrySelection, setEntrySelection] = useState<string | null>(workspace === "charitable-giving" && searchParams.get("giftLot") ? "trade:gift" : null);
  const [giftLot, setGiftLot] = useState<string | undefined>(searchParams.get("giftLot") ?? undefined);
  const [rowTarget, setRowTarget] = useState<string>();
  const [cashPreview, setCashPreview] = useState({ date: asOf, amount: 0, target: "" });
  const [saving, setSaving] = useState(false);
  const [reversal, setReversal] = useState<Entry | null>(null);
  const [action, setAction] = useState<CashAction | "cashDonation" | "borrow" | "repay">(workspace === "portfolio-rebalancing" ? "fee" :
    workspace === "tax-compliance" ? "taxpay" : workspace === "charitable-giving" ? "cashDonation" : "transfer");
  const [documentGift, setDocumentGift] = useState<Entry | null>(null);
  const [filingEntry, setFilingEntry] = useState<Entry | null>(null);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [reconciliationSignoffOpen, setReconciliationSignoffOpen] = useState(false);
  const [annualReviewOpen, setAnnualReviewOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const availableActions = workspace === "inflows-investing" ? [["transfer", "Cash transfer"], ["interest", "Receive bank interest"], ["dividend", "Receive domestic dividend"],
    ["accrueDividend", "Accrue investment dividend"], ["accrueInterest", "Accrue investment interest"],
    ["borrow", "Record loan proceeds"], ...(registers.debts.length ? [["repay", "Repay loan"]] : []),
    ...(unpaidSubscriptions.length ? [["subcollect", "Record subscription installment"]] : []),
    ...(receivables.length ? [["collectIncome", "Collect accrued income"]] : [])]
    : workspace === "portfolio-rebalancing" ? [["fee", "Pay investment fee"], ["expaccrue", "Accrue investment fee"],
      ...(fees.length ? [["exppay", "Settle accrued fee"]] : [])]
      : workspace === "tax-compliance" ? [["taxpay", "Record BIR Tax Payment"]]
        : workspace === "charitable-giving" ? [["cashDonation", "Record cash donation"]] : [];
  const approved = reconciliationRole === "approve";
  const restriction = ["prepare", "approve"].includes(reconciliationRole) ?
    "The transactional posting service is unavailable. Entry controls remain disabled until the Directus extension is ready." :
    "View-only access. Prepare or Approve permission is required to record entries.";
  const grantRecipients = registers.charities.filter(row => !row.isDAF && !row.inactive && row.active !== false &&
    Object.values(row.checks).length === 3 && Object.values(row.checks).every(date => typeof date === "string" && date.length > 0 && date <= asOf));
  const taxableGiftLots = registers.lots.filter(row => row.acctType === "Taxable" && row.openQty > 0 && row.date <= asOf && registers.securities[row.sym]);
  const prerequisite = (id: string, label: string, reason?: string): EntryOption => ({ id, label, disabled: Boolean(reason), description: reason });
  const approveOnly = approved ? undefined : "Approve permission is required.";
  const entryOptions: EntryOption[] = workspace === "inflows-investing" ? [
    prerequisite("capital:subcollect", "Subscription payment", unpaidSubscriptions.length ? undefined : "No unpaid subscriptions."),
    prerequisite("capital:contribution", "Deposit / stockholder advance"),
    prerequisite("cash:accrueDividend", "Accrue dividend income"), prerequisite("cash:accrueInterest", "Accrue interest income"),
    prerequisite("cash:collectIncome", "Receive accrued income", receivables.length ? undefined : "No income awaiting collection."),
    prerequisite("cash:interest", "Receive bank interest"), prerequisite("cash:dividend", "Receive domestic dividend"),
    prerequisite("cash:transfer", "Transfer cash"), prerequisite("cash:borrow", "Record debt"),
    prerequisite("cash:repay", "Loan payment", registers.debts.length ? undefined : "No loans recorded."),
  ] : workspace === "capital-stock" ? [
    prerequisite("capital:subscribe", "Share subscription", registers.holders.length ? undefined : "Add a stockholder first."),
    prerequisite("capital:issueCertificate", "Issue certificate", approveOnly ?? (issuableSubscriptions.length ? undefined : "No fully paid subscriptions awaiting certificates.")),
    prerequisite("capital:shareTransfer", "Share transfer", approveOnly ?? (registers.certs.some(row => certificateActiveAt(row, asOf)) ? undefined : "No active certificates.")),
    prerequisite("master:holder", "Add stockholder", approveOnly), prerequisite("capital:capitalIncrease", "Capital increase", approveOnly),
    prerequisite("capital:declareDividend", "Declare dividend", approveOnly),
    prerequisite("capital:payDividend", "Pay dividend", approveOnly ?? (registers.dividends.some(row => !row.paidAt && !row.cancelled) ? undefined : "No dividends awaiting payment.")),
  ] : workspace === "portfolio-rebalancing" ? [
    prerequisite("trade:buy", "Purchase", securities.some(row => !row.inactive && row.active !== false) ? undefined : "Add an active security first."),
    prerequisite("trade:sell", "Sale", holdings.length ? undefined : "No holdings available to sell."),
    prerequisite("prices", "Update prices", securities.length ? undefined : "Add a security first."), prerequisite("cash:fee", "Investment fee"), prerequisite("cash:expaccrue", "Accrue investment fee"),
    prerequisite("cash:exppay", "Pay accrued expense", fees.length ? undefined : "No accrued expenses awaiting payment."),
    prerequisite("master:security", "Add security", approveOnly),
  ] : workspace === "charitable-giving" ? [
    prerequisite("cash:cashDonation", "Cash donation", registers.charities.length ? undefined : "Add and vet a recipient first."),
    prerequisite("trade:gift", "Donate securities", taxableGiftLots.length ? undefined : "No taxable-account lots are available to give."),
    prerequisite("master:organization", "Add organization", approveOnly),
    prerequisite("grant", "Pooled-fund grant", !registers.charities.some(row => row.isDAF) ? "No pooled fund recorded." : grantRecipients.length ? undefined : "Add and vet a non-pooled-fund recipient first."),
  ] : [];
  function chooseEntry(id: string) {
    setFeedback(undefined); setEntrySelection(id); setGiftLot(undefined); setRowTarget(undefined);
    setShowForm(id.startsWith("cash:"));
    if (id.startsWith("cash:")) setAction(id.slice(5) as typeof action);
    if (id === "grant") setSelectedTab({ workspace, index: 1 });
  }
  const closeEntry = () => { setEntrySelection(null); setShowForm(false); };
  function rowEntry(type: string, target: string) { chooseEntry(type); setRowTarget(target); }
  async function postEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    try {
      let evidenceFileId: string | undefined;
      if (action === "taxpay") {
        const { uploadFilingEvidence } = await import("./server/filing-evidence");
        const upload = new FormData();
        upload.set("purpose", "payment");
        const file = fields.get("paymentEvidence");
        if (!(file instanceof File) || !file.size) { mutationError("Upload payment evidence before recording the payment."); return; }
        upload.set("file", file);
        const result = await uploadFilingEvidence(upload);
        if (!result.ok) { mutationError(result.message); return; }
        evidenceFileId = result.file.id;
      }
      const result = await submitLedger("cash", {
        type: action, date: String(fields.get("date")), amount: Number(fields.get("amount")),
        account: String(fields.get("account") ?? "1000"), target: String(fields.get("target") ?? ""), memo: String(fields.get("memo") ?? ""),
        payDate: String(fields.get("payDate") ?? "") || undefined,
        ...(action === "taxpay" ? { paymentChannel: String(fields.get("paymentChannel") ?? ""), transactionReference: String(fields.get("transactionReference") ?? ""), evidenceFileId } : {}),
         name: fields.has("name") ? String(fields.get("name")) : undefined,
         rate: fields.has("rate") ? Number(fields.get("rate")) : undefined,
         proceeds: fields.get("proceeds") ?? undefined, scheduled: fields.has("scheduled"),
         principal: String(fields.get("principal") ?? "").trim() ? Number(fields.get("principal")) : undefined,
         interest: String(fields.get("interest") ?? "").trim() ? Number(fields.get("interest")) : undefined,
         fwtRate: String(fields.get("fwtRate") ?? "").trim() ? Number(fields.get("fwtRate")) : undefined,
         sym: String(fields.get("sym") ?? "") || undefined,
      });
      if (!result.ok) {
         mutationError(result.message); setFeedback(undefined);
        return;
      }
      setShowForm(false);
      setEntrySelection(null);
       mutationToast(true, `JE-${result.number} posted.`); setFeedback(undefined);
      router.refresh();
    } catch {
       mutationError("The entry could not be saved."); setFeedback(undefined);
    } finally {
      setSaving(false);
    }
  }
  async function postDonationDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documentGift || saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await submitLedger("donation-document", { id: documentGift.id, reference: fields.get("reference"),
        documents: Object.fromEntries(requiredDonationDocs(documentGift).map(row => [row.key, fields.has(row.key)])) });
      mutationToast(result.ok, result.ok ? "Document reference saved." : result.message); setFeedback(undefined);
      if (result.ok) {
        setDocumentGift(null);
        router.refresh();
      }
    } finally { setSaving(false); }
  }
  async function postReversal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reversal || saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await submitLedger("reverse", { id: reversal.id, date: fields.get("date"), reason: fields.get("reason") });
      mutationToast(result.ok, result.ok ? `Reversal JE-${result.number} posted.` : result.message); setFeedback(undefined);
      if (result.ok) {
        setReversal(null);
        router.refresh();
      }
    } catch {
      mutationError("The reversal could not be posted."); setFeedback(undefined);
    } finally {
      setSaving(false);
    }
  }
  const transactionYear = fiscalDates(entries[0]?.date > asOf ? entries[0].date : asOf, policy.fyStart);
  const [reviewStart, setReviewStart] = useState(/^\d{4}-\d{2}-01$/.test(searchParams.get("fiscalStart") ?? "") ? searchParams.get("fiscalStart")! : fy.from);
  const reportYear = fiscalDates(reviewStart, policy.fyStart);
  const isAnnualReview = workspace === "annual-review-preparer" || workspace === "annual-review-approver";
  const reportEntries = isAnnualReview ? fiscalActivity(entries, reviewStart, policy.fyStart) : [];
  const reviewYears = isAnnualReview ? Array.from(new Set([fy.from,
    ...entries.map(row => fiscalDates(row.date, policy.fyStart).from),
    ...(annualReviews ?? []).map(row => row.fiscal_start),
  ])).sort().reverse() : [];
  const [from, setFrom] = useState(transactionYear.from);
  const [to, setTo] = useState(transactionYear.to);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [ticker, setTicker] = useState("");
  const [includeReversed, setIncludeReversed] = useState(false);
  const [month, setMonth] = useState(/^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.get("month") ?? "") ? searchParams.get("month")! : asOf.slice(0, 7));
  const snapshot = Object.entries(registers.recons).find(([key]) => key === month)?.[1];
  const recon = reconciliations?.find(row => row.month_start.slice(0, 7) === month);
  const isReconciliation = workspace.startsWith("monthly-reconciliation-");
  const reconLines = isReconciliation ? reconciliationLines(month, entries, registers.lots, recon?.payload ?? snapshot) : [];
  const reconSigned = Boolean(recon?.signed_at || (!recon && snapshot?.at));
  const reconChanged = reconLines.some(line => line.changed);
  const reconApprovalIssue = isReconciliation ? reconciliationApprovalError(month, entries, registers.lots, recon?.payload) : null;
  const monthClosed = Boolean(Object.entries(registers.periods).find(([key]) => key === month)?.[1].closedAt);
  const reconEditable = reconciliations !== null && canPost && !reconSigned &&
    Boolean(month && !monthClosed) && ["prepare", "approve"].includes(reconciliationRole);
  const reconReview = workspace === "monthly-reconciliation-approver";
  const calendarMonth = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  function monthStatus(key: string) {
    if (key > calendarMonth) return "Future";
    const saved = reconciliations?.find(row => row.month_start.slice(0, 7) === key);
    const historical = Object.entries(registers.recons).find(([value]) => value === key)?.[1];
    if (saved?.signed_at || (!saved && historical?.at)) {
      return reconciliationLines(key, entries, registers.lots, saved?.payload ?? historical)
        .some(line => line.changed) ? "Changed" : "Signed";
    }
    return saved ? "Draft" : key === calendarMonth ? "Now" : "Open";
  }
  const firstMonth = entries.map(row => row.date.slice(0, 7)).sort()[0] ?? calendarMonth;
  const allMonths: string[] = [];
  for (let date = new Date(`${firstMonth}-01T00:00:00Z`); date.toISOString().slice(0, 7) <= calendarMonth; date.setUTCMonth(date.getUTCMonth() + 1)) {
    allMonths.push(date.toISOString().slice(0, 7));
  }
  const periodRows = Array.from(new Set([...allMonths, ...Object.keys(registers.periods)])).sort().reverse()
    .map(key => [key, registers.periods[key] ?? { closedAt: null }] as const);
  const reconciledMonths = allMonths.filter(key => monthStatus(key) === "Signed").length;
  const completedMonthTotal = allMonths.filter(key => key <= calendarMonth).length;
  const statementDate = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) , 0)).toISOString().slice(0, 10) : asOf;
  const closeChecklist = periodChecklist(month, entries, registers, asOf, recon?.signed_at ? recon.payload : undefined);
  function selectMonth(key: string) {
    setMonth(key);
    setReconciliationOpen(false);
    setReconciliationSignoffOpen(false);
    setFeedback(undefined);
  }
  async function submitReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const value = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    const kind = value === "sign" || value === "reopen" ? value : "draft";
    const fields = new FormData(event.currentTarget);
    const statement = { cash: {} as Record<string, number | null>, units: {} as Record<string, number | null>,
      notes: {} as Record<string, string> };
    if (kind === "draft") for (const [index, line] of reconLines.entries()) {
      const value = String(fields.get(`statement-${index}`) ?? "").trim();
      statement[line.isCash ? "cash" : "units"][line.key] = value === "" ? null : Number(value);
      statement.notes[line.key] = String(fields.get(`note-${index}`) ?? "");
    }
    setSaving(true);
    try {
      const result = await submitLedger("reconciliation", { month, revision: recon?.revision ?? 0,
        type: kind, ...(kind === "draft" ? { statement } : kind === "reopen" ? { reason: fields.get("reason") } : {}) });
      mutationToast(result.ok, result.ok ? ({ sign: "Reconciliation signed.", draft: "Draft saved.", reopen: "Reconciliation reopened as a draft." })[kind] : result.message); setFeedback(undefined);
      if (result.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }
  const filtered = entries.filter(entry => (!from || entry.date >= from) && (!to || entry.date <= to) &&
    (!type || entry.type === type) && (!ticker || entry.data.sym === ticker) &&
    (includeReversed || !entry.reversedBy) &&
    `${entry.memo} JE-${String(entry.no).padStart(4, "0")}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <main className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
    <header className="space-y-2">
      <Badge variant="outline">Capital &amp; Giving</Badge>
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Landmark size={24} /> Capital &amp; Giving Ledger</h1>
      <p className="text-sm text-muted-foreground">{registers.corp.name} · PHP · Accrual basis · As of {asOf}</p>
    </header>
      <section className="min-w-0 space-y-4" aria-label={section}>
         <h2 className="text-xl font-semibold">{section}</h2>
         <PendingCommands key={actor} actor={actor} />
         {projectionNotice && <p className="text-sm text-muted-foreground">{projectionNotice}</p>}
         {tabs && <nav aria-label={`${section} views`} className="flex gap-2 overflow-x-auto border-b pb-2" role="tablist">
            {tabs.map((label, index) => <Button key={label} role="tab" aria-selected={activeTab === index} variant="ghost"
              className={activeTab === index ? "border-b-2 border-primary bg-muted font-semibold text-foreground shadow-none" : "text-muted-foreground"}
              onClick={() => setSelectedTab({ workspace, index })}>{tabIcon(label)} {label}</Button>)}
         </nav>}
         {entryOptions.length > 0 && !entrySelection && <EntryLauncher options={entryOptions} onSelect={chooseEntry} disabled={!canPost} disabledReason={!canPost ? restriction : undefined} />}
         {entrySelection?.startsWith("trade:") || entrySelection?.startsWith("capital:") || entrySelection?.startsWith("master:") || entrySelection === "prices" ? <LedgerDialog open onOpenChange={open => { if (!open) closeEntry(); }}
           title={entrySelection === "prices" ? "Update security prices" : entrySelection?.startsWith("master:") ? "Manage master data" : entrySelection?.startsWith("capital:") ? "Capital stock action" : "Investment action"} wide>
         {canPost && entrySelection?.startsWith("trade:") && <TradeForm key={`${entrySelection}:${giftLot ?? ""}`}
            securities={registers.securities} lots={registers.lots} defaultDate={asOf} charities={workspace === "charitable-giving" ? registers.charities : undefined}
            policy={policy} registers={approved ? registers : undefined} entries={entries} hideLauncher initialType={entrySelection.slice(6) as "buy" | "sell" | "gift"} initialLotId={giftLot} onClose={closeEntry} />}
          {entrySelection === "trade:gift" && !canPost && <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Gift shares is ready to open, but posting is locked until the transactional posting service is available and you have prepare permission.</p></CardContent></Card>}
         {canPost && entrySelection?.startsWith("capital:") && <CapitalActions key={`${entrySelection}:${rowTarget ?? ""}`} registers={registers} defaultDate={asOf}
           entries={entries} hideLauncher initialType={entrySelection.slice(8) as CapitalOperation} initialTarget={rowTarget} onClose={closeEntry} />}
         {entrySelection?.startsWith("master:") && <MasterData key={entrySelection} registers={registers}
           kind={entrySelection.slice(7) as "security" | "organization" | "holder"} hideLauncher initialOpen formOnly canEdit={canPost && approved} onClose={closeEntry} />}
         {entrySelection === "prices" && <Price registers={registers} defaultDate={asOf} hideLauncher initialOpen canEdit={canPost} onClose={closeEntry} />}
         </LedgerDialog> : null}
         {workspace === "tax-compliance" && !showForm && <div>
           <Button disabled={!canPost || !taxItems.length} onClick={() => {
            setFeedback(undefined);
            setShowForm(true);
           }}>Record BIR Tax Payment</Button>
           {!canPost && <p className="mt-2 text-sm text-muted-foreground">{restriction}</p>}
           {!taxItems.length && <p className="mt-2 text-sm text-muted-foreground">No outstanding BIR items.</p>}
        </div>}
         {canPost && showForm && <LedgerDialog open onOpenChange={open => { if (!open) closeEntry(); }} title="New ledger entry" description="Complete the validated transaction form; posting creates one immutable source record.">
           <form key={`${action}:${rowTarget ?? ""}`} onSubmit={postEntry} className="grid max-w-xl gap-3 text-sm sm:grid-cols-2">
            <label className="grid gap-1">Entry type
               <select className="h-9 rounded-md border bg-background px-2" value={action} onChange={event => setAction(event.target.value as typeof action)}>
                {availableActions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
             <label>Date<Input type="date" required name="date" defaultValue={asOf} onChange={event => setCashPreview({ ...cashPreview, date: event.target.value })} /></label>
            <label>Amount (PHP)<Input type="number" name="amount" required min="0.01" step="0.01"
              defaultValue={action === "taxpay" ? taxItems.find(row => row.tag === rowTarget)?.outstanding : action === "collectIncome" ? receivables.find(row => row.id === rowTarget)?.outstanding : undefined}
              onChange={event => setCashPreview({ ...cashPreview, amount: Number(event.target.value) })} /></label>
             {["accrueDividend", "accrueInterest"].includes(action) && <label>Expected payment date<Input type="date" name="payDate" /></label>}
             {!["accrueDividend", "accrueInterest", "expaccrue"].includes(action) &&
              <label className="grid gap-1">{["interest", "dividend", "collectIncome", "subcollect", "borrow"].includes(action) ? "Receiving cash account" : "Paying cash account"}
              <select name="account" className="h-9 rounded-md border bg-background px-2">
                {cashCodes.map(code => <option key={code} value={code}>{accounts[code]}</option>)}
              </select>
             </label>}
             {action === "collectIncome" && <label className="grid gap-1">Income receivable
                <select name="target" required defaultValue={rowTarget} className="h-9 rounded-md border bg-background px-2">
                 {receivables.map(row => <option key={row.id} value={row.id}>{row.memo} · {peso(row.outstanding)}</option>)}
               </select>
             </label>}
             {action === "cashDonation" && <label className="grid gap-1">Organization
                <select name="target" required defaultValue="" className="h-9 rounded-md border bg-background px-2" onChange={event => setCashPreview({ ...cashPreview, target: event.target.value })}>
                 <option value="" disabled>Select an organization</option>
                 {registers.charities.map(row => <option key={row.id} value={row.id}>{row.name}{row.isDAF ? " · pooled fund" : ""}</option>)}
               </select>
               <span className="text-xs text-muted-foreground">Tax and eligibility are checked at posting.</span>
             </label>}
             {action === "subcollect" && <label className="grid gap-1">Subscription
               <select name="target" required className="h-9 rounded-md border bg-background px-2">
                 {unpaidSubscriptions.map(row => <option key={row.id} value={row.id}>{holder(row.holderId)} · {row.date} · {peso(row.unpaid)} unpaid</option>)}
               </select>
             </label>}
              {action === "borrow" && <>
                <label>Lender or loan name<Input name="name" required maxLength={120} /></label>
                <label>Annual interest (%)<Input name="rate" type="number" min="0" max="100" step="0.000001" required /></label>
                <label>Nature<select name="proceeds" className="h-9 w-full rounded-md border bg-background px-2"><option value="cash">New cash borrowing</option><option value="existing">Existing opening debt (no cash receipt)</option></select></label>
                <label className="flex items-center gap-2"><input name="scheduled" type="checkbox" />Payoff is scheduled</label>
             </>}
             {action === "repay" && <label className="grid gap-1">Loan
               <select name="target" required className="h-9 rounded-md border bg-background px-2">
                 {registers.debts.map(row => <option key={row.id} value={row.id}>{row.name} · {peso(-balance(entries, "2000", row.id))} principal</option>)}
               </select>
              </label>}
              {action === "repay" && <>
                <label>Principal (optional split)<Input name="principal" type="number" min="0" step="0.01" /></label>
                <label>Interest (optional split)<Input name="interest" type="number" min="0" step="0.01" /></label>
                <p className="text-xs text-muted-foreground sm:col-span-2">Leave both blank to apply the server&apos;s daily-interest calculation. If entered, principal plus interest must equal the payment.</p>
              </>}
            {action === "transfer" && <label className="grid gap-1">Destination cash account
              <select name="target" defaultValue="1010" className="h-9 rounded-md border bg-background px-2">
                {cashCodes.map(code => <option key={code} value={code}>{accounts[code]}</option>)}
              </select>
            </label>}
             {action === "exppay" && <label className="grid gap-1">Outstanding fee
               <select name="target" required defaultValue={rowTarget} className="h-9 rounded-md border bg-background px-2">
                {fees.map(fee => <option key={fee.tag} value={fee.tag}>{fee.label} · {peso(fee.outstanding)}</option>)}
              </select>
            </label>}
              {action === "taxpay" && <label className="grid gap-1">Outstanding BIR item
               <select name="target" required defaultValue={rowTarget} className="h-9 rounded-md border bg-background px-2">
                {taxItems.map(item => <option key={item.tag} value={item.tag}>{item.label} · {peso(item.outstanding)}</option>)}
              </select>
             </label>}
             {action === "taxpay" && <>
               <p className="text-xs text-muted-foreground sm:col-span-2">Record an authorized BIR payment already completed outside this application. This action does not send money or mark a return filed.</p>
               <label>Payment channel<Input name="paymentChannel" required maxLength={100} /></label>
               <label>Transaction reference<Input name="transactionReference" required maxLength={200} /></label>
               <label className="sm:col-span-2">Uploaded payment evidence (PDF, JPEG or PNG, up to 1 MB)<Input name="paymentEvidence" type="file" required accept="application/pdf,image/jpeg,image/png" /></label>
             </>}
             {["interest", "dividend", "accrueInterest", "accrueDividend", "collectIncome"].includes(action) && <IncomeEntryFields securities={securities} />}
              {action === "cashDonation" && <div className="sm:col-span-2"><DonationPreview {...cashPreview} charity={registers.charities.find(row => row.id === cashPreview.target)} policy={policy} entries={entries} /></div>}
             <label>Memo<Input name="memo" maxLength={250} /></label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => { closeEntry(); setFeedback(undefined); }}>Back</Button>
               <Button type="submit" disabled={saving}>{saving ? "Posting…" : action === "taxpay" ? "Record BIR Tax Payment" : "Post entry"}</Button>
            </div>
           </form>
          </LedgerDialog>}
         {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm"}>{feedback.text}</p>}
          {reversal && <LedgerDialog open onOpenChange={open => { if (!open) setReversal(null); }} title={`Reverse JE-${reversal.no}`} description="This creates a new reversing journal entry; the original entry remains immutable.">
             <form onSubmit={postReversal} className="flex flex-wrap items-end gap-3 text-sm">
               <label>Date<Input type="date" name="date" required defaultValue={asOf} /></label>
             <label>Reason<Input name="reason" required maxLength={200} /></label>
             <Button type="button" variant="outline" disabled={saving} onClick={() => setReversal(null)}>Cancel</Button>
              <Button type="submit" disabled={saving || !canReverse} title={!canReverse ? "Transactions approval permission or the posting source is unavailable." : undefined}>Post reversal</Button>
              {feedback && <p role={feedback.error ? "alert" : "status"} className="w-full text-sm">{feedback.text}</p>}
             </form></LedgerDialog>}
          {searchParams.get("record") && <Card><CardHeader><CardTitle>Linked record</CardTitle></CardHeader><CardContent>
            {entries.some(row => row.id === searchParams.get("record")) ? <Journal rows={entries.filter(row => row.id === searchParams.get("record"))} reverseAllowed={false} onReverse={() => {}} /> :
              <p className="text-sm">{registers.charities.find(row => row.id === searchParams.get("record"))?.name ??
                (registers.subs.some(row => row.id === searchParams.get("record")) ? `Subscription ${searchParams.get("record")}` : "This record is unavailable in this workspace.")}</p>}
          </CardContent></Card>}
          {section === "Overview" && <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[["Portfolio market value", peso(market), `Cost ${peso(cost)} · unrealized ${peso(market - cost)}`],
              ["Cash across 3 accounts", peso(cash), "Operating and reserve accounts"],
              ["Giving this financial year", peso(giving), `Target ${peso(givingTarget)}`],
               ["Net worth at book value", peso(assets - liabilities), <>Liabilities {peso(liabilities)} · <StatusBadge status={balance(entries) === 0 ? "Books balanced" : "Check balances"} tone={balance(entries) === 0 ? "success" : "danger"} /></>]]
              .map(([label, value, note]) => <Card key={String(label)}><CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
                <CardContent><p className="text-lg font-semibold">{value}</p><p className="text-xs text-muted-foreground">{note}</p></CardContent></Card>)}
          </div>
           <div className="grid items-start gap-4 lg:grid-cols-2">
             <Card><CardHeader><CardTitle>Needs Attention <span className="text-muted-foreground">({attention?.alerts.length ?? 0})</span></CardTitle></CardHeader>
               <CardContent className="space-y-3">
                 {!attention && <p role="status">Attention evaluation unavailable.</p>}
                 {attention?.unavailable.map(message => <p key={message} role="status" className="text-sm text-muted-foreground">{message}</p>)}
                 {attention && !attention.alerts.length && <p className="text-sm text-muted-foreground">No items need attention in your authorized workspaces.</p>}
                  <div id="overview-attention-alerts" className="space-y-2">
                  {attention?.alerts.slice(0, attentionExpanded ? undefined : 3).map(alert => <article key={alert.id} className={`rounded-md border border-l-4 p-3 ${alert.severity === "critical" ? "border-l-red-600 dark:border-l-red-400" : alert.severity === "warning" ? "border-l-amber-600 dark:border-l-amber-400" : "border-l-sky-600 dark:border-l-sky-400"}`}>
                    <div className="flex items-start justify-between gap-3"><div className="min-w-0 space-y-1"><h3 className="break-words text-sm font-semibold">{alert.title}</h3><StatusBadge status={alert.severity} tone={alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "info"} /></div>
                    <a className="shrink-0 text-sm font-medium text-primary underline underline-offset-4" href={alert.link}>Open<span className="sr-only"> {alert.title}</span></a></div>
                   <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                   <details className="mt-2 text-xs"><summary className="cursor-pointer">Rule details</summary><dl className="mt-2 space-y-1">
                     {Object.entries({ rule: alert.policyReference, evaluatedAt: alert.evaluatedAt, ...alert.details }).map(([key, value]) => <div key={key}><dt className="inline font-medium">{key}: </dt><dd className="inline">{String(value)}</dd></div>)}
                   </dl></details>
                  </article>)}
                  </div>
                  {attention && attention.alerts.length > 3 && <Button type="button" variant="outline" size="sm" aria-expanded={attentionExpanded} aria-controls="overview-attention-alerts" onClick={() => setAttentionExpanded(value => !value)}>
                    {attentionExpanded ? "Show less" : `Show more (${attention.alerts.length - 3} more)`}
                  </Button>}
               </CardContent></Card>
             <Card><CardHeader><CardTitle>Allocation Against Target</CardTitle></CardHeader><CardContent className="space-y-5">
               {!attention?.allocation.length && <p className="text-sm text-muted-foreground">Allocation is unavailable without portfolio viewing access or configured asset classes.</p>}
                <div className="flex flex-wrap gap-2" aria-label="Allocation status legend">{Object.values(allocationStyles).map(style => <StatusBadge key={style.label} status={style.label} tone={style.tone} />)}</div>
                {attention?.allocation.map(group => <div key={group.id} className="space-y-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><span>{group.name}</span><span>{group.actual.toFixed(1)}% / {group.target}% target</span></div>
                  <StatusBadge status={allocationStyles[group.status].label} tone={allocationStyles[group.status].tone} />
                  <div className="relative h-4 overflow-hidden rounded bg-muted" role="img" aria-label={`${group.name}: ${allocationStyles[group.status].label}, actual ${group.actual.toFixed(1)}%, target ${group.target}%, permitted range ${group.minimum} to ${group.maximum}%`}>
                    <span className="absolute inset-y-0 bg-primary/20" style={{ left: `${group.minimum}%`, width: `${group.maximum - group.minimum}%` }} />
                    <span className={`absolute inset-y-1 left-0 ${allocationStyles[group.status].bar}`} style={{ width: `${Math.min(100, Math.max(0, group.actual))}%` }} />
                   <span className="absolute inset-y-0 border-l-2 border-foreground" style={{ left: `${group.target}%` }} />
                  </div><p className="text-xs text-muted-foreground">Allowed range {group.minimum}% to {group.maximum}%</p>
               </div>)}
                <p className="text-xs text-muted-foreground">Solid bar: actual · Shaded band: permitted range · Vertical line: target. Near edge: outer 20% of the permitted range on either side; exact bounds are permitted.</p>
             </CardContent></Card>
           </div>
           <Card><CardHeader><CardTitle>Latest six entries</CardTitle></CardHeader><CardContent>
               <Journal rows={(recentEntries ?? entries).slice(0, 6)} reverseAllowed={canReverse} onReverse={entry => { setReversal(entry); setFeedback(undefined); }} />
           </CardContent></Card>
        </>}
        {section === "Transactions" && <Card><CardContent className="space-y-4">
           <div className="flex flex-wrap items-end gap-3 text-sm">
            <label>From<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label>To<Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
            <label>Search<Input placeholder="Description or JE number" value={query} onChange={e => setQuery(e.target.value)} /></label>
            <label className="grid gap-1">Entry type<select className="h-9 rounded-md border bg-background px-2" value={type} onChange={e => setType(e.target.value)}>
              <option value="">All types</option>{Object.entries(lineLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
            </select></label>
            <label className="grid gap-1">Security<select className="h-9 rounded-md border bg-background px-2" value={ticker} onChange={e => setTicker(e.target.value)}>
              <option value="">All securities</option>{securities.map(row => <option key={row.sym}>{row.sym}</option>)}
            </select></label>
            <label className="flex h-9 items-center gap-2"><input type="checkbox" checked={includeReversed} onChange={e => setIncludeReversed(e.target.checked)} /> Include reversed</label>
            <Button variant="outline" onClick={() => downloadJournal(filtered)} disabled={!filtered.length}><Download /> Export filtered CSV</Button>
          </div>
          <p className="text-sm text-muted-foreground">Showing {Math.min(250, filtered.length)} of {filtered.length} entries</p>
           <Journal rows={filtered.slice(0, 250)} reverseAllowed={canReverse} onReverse={entry => { setReversal(entry); setFeedback(undefined); }} />
        </CardContent></Card>}
         {section === "Portfolio & rebalancing" && <>
            <Panel active={activeTab === 1}>
            <Card><CardHeader><CardTitle>Outstanding accrued fees</CardTitle></CardHeader><CardContent>
             <Grid headers={["Fee", "Outstanding"]} rows={fees.map(fee => [fee.label, peso(fee.outstanding)])} />
           </CardContent></Card>
           </Panel><Panel active={activeTab === 0}>
           <Card><CardHeader><CardTitle>Allocation</CardTitle></CardHeader><CardContent>
            <Grid headers={["Asset class", "Market value", "Actual", "Target", "Band", "To target"]}
              rows={allocation.map(row => [<span id={`allocation-${row.id}`} key={row.id}>{row.name}</span>, peso(row.value), `${row.actual.toFixed(1)}%`, `${row.target}%`, `±${row.band}%`, peso(market * row.target / 100 - row.value)])} />
          </CardContent></Card>
           </Panel><Panel active={activeTab === 1}>
           <Card><CardHeader><CardTitle>Open lots</CardTitle></CardHeader><CardContent>
            <Grid headers={["Security", "Account", "Acquired", "Units", "Avg. cost", "Price as of", "Market value", "Unrealized"]}
              rows={holdings.map(row => [row.sym, row.acctType, row.date, row.openQty, peso(row.cost / row.openQty),
                 `${peso(row.security.price)} · ${row.security.priceDate}`, peso(row.market), peso(row.market - row.cost)])} />
           </CardContent></Card>
           </Panel><Panel active={activeTab === 2}>
             <Card><CardHeader><CardTitle>Gift or sell appreciated securities</CardTitle></CardHeader><CardContent className="space-y-3">
               <p className="text-sm text-muted-foreground">Property deductions use acquisition cost, not market value. Figures below exclude broker costs and are estimates for review.</p>
              <Grid headers={["Lot", "Units", "Cost / gift deduction", "Fair value", "Unrealized gain", "Tax if sold", "Cash gift deduction", "Action"]}
                 rows={candidates.map(row => [row.lot.sym, row.lot.openQty, peso(row.cost), peso(row.fairValue), peso(row.gain), peso(row.tax), peso(row.cashDeduction),
                   <Link key={row.lot.id} href={`${INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === "charitable-giving")!.path}?giftLot=${encodeURIComponent(row.lot.id)}`} className="underline">Gift shares</Link>])} />
             </CardContent></Card>
           </Panel><Panel active={activeTab === 3}>
             <Card><CardHeader><CardTitle>Securities and price history</CardTitle></CardHeader><CardContent>
               <Grid headers={["Ticker", "Name", "Class", "Tax class", "Latest price", "Date", "Status"]} rows={securities.map(row => [row.sym, row.name,
                  registers.classes.find(group => group.id === row.cls)?.name ?? row.cls, friendlyTaxClass(row.taxClass), peso(row.price), friendlyDate(row.priceDate),
                  "inactive" in row && row.inactive ? <StatusBadge status="Inactive" tone="neutral" /> : <StatusBadge status="Active" tone="success" />])} />
               {securities.map(row => <details key={row.sym} className="my-2 rounded-md border p-3"><summary>{row.sym} price history</summary>
                 <Grid headers={["Date", "Price", "Source"]} rows={(registers.priceHist[row.sym] ?? []).map(price => [price.date, peso(price.price), price.source])} />
               </details>)}
               <Price registers={registers} defaultDate={asOf} canEdit={canPost} />
               <MasterData kind="security" registers={registers} hideLauncher canEdit={canPost && approved} />
             </CardContent></Card>
           </Panel>
         </>}
         {section === "Charitable giving" && <>
            {documentGift && <LedgerDialog open onOpenChange={open => { if (!open) setDocumentGift(null); }} title={`Update documents for JE-${documentGift.no}`}>
             <form onSubmit={postDonationDocument} className="flex flex-wrap items-end gap-3">
               <label>Form {documentGift.data.exempt ? "2322" : "1800"} reference for JE-{documentGift.no}
                 <Input key={documentGift.id} name="reference" required maxLength={200} defaultValue={donationDocuments?.[documentGift.id]?.reference} />
                </label>
                {requiredDonationDocs(documentGift, donationDocuments?.[documentGift.id]).map(row => <label key={`${documentGift.id}:${row.key}`} className="flex items-center gap-2">
                  <input type="checkbox" name={row.key} defaultChecked={row.ok} />{row.label}
                </label>)}
                <Button type="submit" disabled={saving}>Save reference</Button>
               <Button type="button" variant="outline" onClick={() => setDocumentGift(null)}>Cancel</Button>
             </form>
            </LedgerDialog>}
            <Panel active={activeTab === 0}><Card id="budget"><CardHeader><CardTitle>Budget &amp; donations</CardTitle></CardHeader><CardContent>
            <p className="mb-3 text-sm">{peso(giving)} given · {peso(Math.max(0, givingTarget - giving))} remaining</p>
             <Grid headers={["Date", "Donee", "Vehicle", "Fair value", "Deduction basis", "Donor’s tax", "Documents"]}
              rows={gifts.map(row => [<span id={`donation-${row.id}`} key={row.id}>{row.date}</span>, organization(row.data.charityId), row.data.vehicle === "DAF" ? "Pooled fund" : String(row.data.vehicle),
                  peso(Number(row.data.amount ?? row.data.fmv ?? 0)),
                  peso(donationDeductionBasis(row.data)),
                  row.data.exempt ? "Exempt" : peso(Number(row.data.donorTax ?? 0)),
                   <div className="space-y-1" key={row.id}>
                     {requiredDonationDocs(row, donationDocuments?.[row.id]).map(doc => <div key={doc.key}>{doc.label}: <StatusBadge status={doc.ok ? "Recorded" : "Missing"} tone={doc.ok ? "success" : "warning"} /></div>)}
                    {donationDocuments?.[row.id] && <div>Reference: {donationDocuments[row.id].reference}</div>}
                    {typeof row.data.exempt === "boolean" && <Button size="sm" variant="outline" disabled={!canPost || reconciliationRole !== "approve"}
                      title={!canPost ? "Transactional posting service is unavailable." : reconciliationRole !== "approve" ? "Charitable-giving approval permission is required." : undefined}
                      onClick={() => { setDocumentGift(row); setFeedback(undefined); }}>Update documents</Button>}
                 </div>])} />
          </CardContent></Card>
            </Panel><Panel active={activeTab === 1}>
            <Card><CardHeader><CardTitle>Organizations &amp; grants</CardTitle></CardHeader><CardContent>
             <Grid headers={["Pooled fund", "Available balance"]}
               rows={registers.charities.filter(row => row.isDAF).map(row => [row.name, peso(pooledBalance(entries, registers.grants, row.id, asOf))])} />
               {canPost && entrySelection === "grant" && registers.charities.some(row => row.isDAF) && <LedgerDialog open onOpenChange={open => { if (!open) closeEntry(); }} title="Record pooled-fund grant">
                 <form className="flex flex-wrap items-end gap-3" onSubmit={async event => {
               event.preventDefault();
               if (saving) return;
               const form = event.currentTarget;
               const fields = new FormData(form);
               setSaving(true);
               try {
                 const result = await submitLedger("giving", { type: "grant", date: fields.get("date"),
                   fund: fields.get("fund"), recipient: fields.get("recipient"), amount: Number(fields.get("amount")) });
                  mutationToast(result.ok, result.ok ? "Pooled-fund grant recorded." : result.message); setFeedback(undefined);
                  if (result.ok) { form.reset(); closeEntry(); router.refresh(); }
               } finally { setSaving(false); }
             }}>
               <label>Date<Input type="date" name="date" defaultValue={asOf} required /></label>
               <label className="grid gap-1">Fund<select className="h-9 rounded-md border bg-background px-2" name="fund" required>
                 {registers.charities.filter(row => row.isDAF).map(row => <option value={row.id} key={row.id}>{row.name}</option>)}
               </select></label>
               <label className="grid gap-1">Recipient<select className="h-9 rounded-md border bg-background px-2" name="recipient" required>
                  {grantRecipients.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}
               </select></label>
               <label>Grant amount<Input name="amount" type="number" min="0.01" step="0.01" required /></label>
                <Button type="submit" disabled={saving}>Record grant</Button>
                <Button type="button" variant="outline" onClick={closeEntry}>Back</Button>
              </form>
              </LedgerDialog>}
            <Grid headers={["Organization", "Focus area", "Donee status", "Accreditation until", "Vetting"]}
              rows={registers.charities.map(row => [<span id={`organization-${row.id}`} key={row.id}>{row.name}</span>, row.focus, row.donee, row.accredUntil || "—",
                Object.values(row.checks).every(Boolean) ? "Complete" : "Incomplete"])} />
            <Grid headers={["Date", "Pooled fund", "Recipient", "Amount"]}
              rows={registers.grants.map(row => [row.date, organization(row.dafId), organization(row.toId), peso(row.amount)])} />
            {canPost && approved && <MasterData kind="organization" registers={registers} hideLauncher />}
           </CardContent></Card>
           </Panel>
        </>}
         {section === "Inflows & investing" && <>
           <Panel active={activeTab === 0}>
           <Card><CardHeader><CardTitle>Capital raised</CardTitle></CardHeader><CardContent>
            <Grid headers={["Financial-year metric", "Amount"]} rows={[
              ["Subscription collections", peso(raised[0])], ["Cash from new subscriptions", peso(raised[1])],
              ["Deposits and advances", peso(raised[2])], ["Total raised", peso(raised.reduce((sum, amount) => sum + amount, 0))],
               ["Capital-raising target", peso(policy.savingsTarget)],
               ["Income earned, gross", peso(-balance(fiscalEntries.filter(row => row.type !== "closing"), "4000") - balance(fiscalEntries.filter(row => row.type !== "closing"), "4010"))],
               ["Final tax on investment income", peso(balance(fiscalEntries.filter(row => row.type !== "closing"), "5300"))],
             ]} />
             <progress className="mt-3 w-full" aria-label="Capital raising progress" max={Math.max(1, policy.savingsTarget)} value={raised.reduce((sum, amount) => sum + amount, 0)} />
           </CardContent></Card>
           </Panel><Panel active={activeTab === 1}>
           <Card><CardHeader><CardTitle>Income receivable</CardTitle></CardHeader><CardContent>
             <Grid headers={["Source", "Expected payment", "Gross outstanding", "Estimated final tax", "Action"]}
              rows={receivables.map(row => [<span key={row.id} id={`receivable-${row.id}`}>{row.memo}</span>,
                 row.due || "—", peso(row.outstanding), peso(row.tax), canPost ? <Button size="sm" variant="outline" key={row.id}
                   onClick={() => rowEntry("cash:collectIncome", row.id)}>Receive</Button> : "View only"])} />
          </CardContent></Card>
           </Panel><Panel active={activeTab === 2}>
           <Card id="pre-investment"><CardHeader><CardTitle>Pre-investment checks</CardTitle></CardHeader><CardContent>
            <Grid headers={["Requirement", "Status", "Evidence"]}
                rows={checks.map(check => [check.name, <StatusBadge key={check.name} status={check.ok ? "Ready" : "Needs attention"} tone={check.ok ? "success" : "warning"} />, check.detail])} />
          </CardContent></Card>
           </Panel><Panel active={activeTab === 3}>
           <Card><CardHeader><CardTitle>Deployment planner</CardTitle></CardHeader><CardContent className="space-y-3">
            <p className="text-sm">Amounts above {peso(policy.lumpThreshold)} are split into up to {policy.tranches} monthly tranches. Underweight classes receive priority.</p>
            {checks.some(check => !check.ok) && <p className="text-sm text-destructive">Hold deployment until the pre-investment checks pass.</p>}
            <label className="block max-w-xs text-sm">Amount (PHP)
              <Input type="number" min="0.01" step="0.01" value={deploymentAmount} onChange={event => setDeploymentAmount(event.target.value)} />
            </label>
            {plan.length > 0 && <Grid headers={["Month", "Total", ...allocation.map(row => row.name)]}
              rows={plan.map((row, i) => [i + 1, peso(row.amount), ...row.split.map(peso)])} />}
          </CardContent></Card>
           </Panel><Panel active={activeTab === 2}>
           <Card><CardHeader><CardTitle>Cash reserves</CardTitle></CardHeader><CardContent>
            <Grid headers={["Account", "Balance", "Minimum"]}
              rows={cashCodes.map((code, i) => [accounts[code], peso(balance(entries, code)),
                i === 1 ? peso(policy.reserveMonths * policy.monthlyExpenses) : i === 2 ? peso(policy.liquidityNeed) : "—"])} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Loan balances</CardTitle></CardHeader><CardContent>
             <Grid headers={["Loan", "Rate", "Principal", "Accrued interest", "Current month interest", "Payoff scheduled"]}
              rows={registers.debts.map(row => [row.name, `${row.rate}%`, peso(-balance(entries, "2000", row.id)),
                 peso(-balance(entries, "2100", row.id)), peso(loanInterest(entries, row, asOf, policy.dayCount)), approved && canPost ?
                   <input key={row.id} type="checkbox" aria-label={`Payoff scheduled for ${row.name}`} checked={row.scheduled} disabled={saving} onChange={async event => {
                     const scheduled = event.currentTarget.checked; setSaving(true);
                     try {
                       const result = await executeLedgerCommand({ type: "master", entity: "debts", operation: "upsert", id: row.id,
                         revision: registers.masterRevisions?.debts ?? 0, value: { id: row.id, scheduled } });
                        mutationToast(result.ok, result.ok ? "Payoff schedule updated." : result.message); setFeedback(undefined);
                       if (result.ok) router.refresh();
                     } finally { setSaving(false); }
                   }} /> : row.scheduled ? "Yes" : "No"])} />
           </CardContent></Card>
           </Panel>
        </>}
         {section === "Capital stock" && <>
           <Panel active={activeTab === 0}>
             <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Authorized", capital.authorized], ["Subscribed", capital.subscribed],
               ["Paid-up (PHP)", capital.paid], ["Issued", capital.issued], ["Outstanding", capital.outstanding]].map(([label, value]) =>
               <Card key={String(label)}><CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent>{Number(value).toLocaleString()}</CardContent></Card>)}</div>
             <Card><CardHeader><CardTitle>SEC checks and equity</CardTitle></CardHeader><CardContent>
                 <Grid headers={["Check", "Status"]} rows={capital.checks.map(row => [row.label, <StatusBadge key={row.label} status={row.ok ? "Ready" : "Needs attention"} tone={row.ok ? "success" : "warning"} />])} />
               <Grid headers={["Equity account", "Balance"]} rows={Object.keys(accounts).filter(code => code.startsWith("3"))
                 .map(code => [accounts[code], peso(-balance(entries, code))])} />
             </CardContent></Card>
           </Panel><Panel active={activeTab === 1}>
             <Card><CardHeader><CardTitle>Stockholder register</CardTitle></CardHeader><CardContent>
               <Grid headers={["Name", "TIN", "Nationality", "Shares held", "Ownership", "Dividend withholding"]} rows={[...registers.holders].sort((a, b) => a.name.localeCompare(b.name)).map(row => {
                 const shares = registers.certs.filter(cert => cert.holderId === row.id && certificateActiveAt(cert, asOf)).reduce((sum, cert) => sum + cert.shares, 0) +
                   registers.subs.filter(sub => sub.holderId === row.id && !("cancelled" in sub && sub.cancelled) && (!sub.issuedAt || sub.issuedAt > asOf)).reduce((sum, sub) => sum + sub.shares, 0);
                 return [row.name, row.tin, row.nationality, shares, `${(capital.outstanding ? shares / capital.outstanding * 100 : 0).toFixed(2)}%`,
                   `${row.type === "domestic" ? 0 : row.type === "individual" ? policy.divWhtInd : policy.divWhtNr}%`];
               })} />
               {canPost && approved && <MasterData kind="holder" registers={registers} hideLauncher />}
             </CardContent></Card>
           </Panel>
           <div className="flex flex-wrap gap-2">
             <Button variant="outline" onClick={() => downloadCsv("stock-and-transfer-book.csv", stockReports(entries, registers, asOf).book)}>
               <Download /> Stock and transfer book
             </Button>
             <Button variant="outline" onClick={() => downloadCsv("gis-stockholders-workpaper.csv", stockReports(entries, registers, asOf).gis)}>
               <Download /> GIS stockholders workpaper
             </Button>
           </div>
            <Panel active={activeTab === 4}><Card><CardHeader><CardTitle>Dividend register</CardTitle></CardHeader><CardContent>
              <Grid headers={["Declared", "Payment date", "Gross", "Status", "Action"]} rows={registers.dividends.map(row =>
                 [row.date, row.payDate, peso(row.gross), row.cancelled ? <StatusBadge status="Cancelled" tone="neutral" /> : row.paidAt ? <StatusBadge status={`Paid · ${row.paidAt}`} tone="success" /> : <StatusBadge status="Awaiting payment" tone="warning" />,
                  canPost && approved && !row.cancelled && !row.paidAt ? <Button key={row.id} variant="outline" size="sm" onClick={() => rowEntry("capital:payDividend", row.id)}>Pay</Button> : !row.cancelled && !row.paidAt ? "Approve permission required" : ""])} />
           </CardContent></Card>
           </Panel><Panel active={activeTab === 3}><Card><CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader><CardContent>
            <p className="mb-3 text-sm">Authorized: {registers.corp.authorized.toLocaleString()} shares at {peso(registers.corp.par)} par</p>
             <Grid headers={["Stockholder", "Shares", "Subscribed", "Paid", "Unpaid", "Call due", "Certificate", "Actions"]}
              rows={registers.subs.map(row => {
                const unpaid = balance(entries, "3020", row.id);
                return [holder(row.holderId), row.shares.toLocaleString(), peso(row.shares * row.price),
                   peso(row.shares * row.price - unpaid), peso(unpaid), row.callDue || "—", row.certNo || "—", canPost ? <div className="flex flex-wrap gap-2" key={row.id}>
                     {unpaid > 0.004 ? <>
                       <Button size="sm" variant="outline" onClick={() => rowEntry("capital:subcollect", row.id)}>Record payment</Button>
                       {approved && <Button size="sm" variant="outline" onClick={() => rowEntry("capital:callSubscription", row.id)}>Record or change call</Button>}
                     </> : !row.issuedAt && approved ? <Button size="sm" variant="outline" onClick={() => rowEntry("capital:issueCertificate", row.id)}>Issue certificate</Button> : null}
                   </div> : "View only"];
              })} />
          </CardContent></Card>
           </Panel><Panel active={activeTab === 2}><Card><CardHeader><CardTitle>Stock &amp; transfer book</CardTitle></CardHeader><CardContent>
             <Grid headers={["Date", "From", "To", "Shares", "eCAR", "New certificates", "Action"]}
               rows={registers.transfers.map(row => [row.date, holder(row.fromId), holder(row.toId), row.shares.toLocaleString(), row.carRef, row.newCerts.join(", "),
                 row.voidedAt ? `Voided ${row.voidedAt}` : canPost && approved ? <Button size="sm" key={row.id} variant="outline" onClick={() => rowEntry("capital:voidTransfer", row.id)}>Void</Button> : ""])} />
             {[...registers.holders].sort((a, b) => a.name.localeCompare(b.name)).map(person => <details key={person.id} className="my-3 rounded-md border p-3">
               <summary className="cursor-pointer font-medium">{person.name}</summary>
               <Grid headers={["Subscription", "Date", "Shares", "Subscribed", "Paid", "Unpaid"]} rows={registers.subs.filter(sub => sub.holderId === person.id).map(sub => {
                 const unpaid = balance(entries, "3020", sub.id);
                 return [sub.id, sub.date, sub.shares, peso(sub.shares * sub.price), peso(sub.shares * sub.price - unpaid), peso(unpaid)];
               })} />
               <Grid headers={["Instalment date", "Journal", "Amount"]} rows={entries.flatMap(entry => entry.lines.filter(line => line.acct === "3020" && line.cr > 0 &&
                 registers.subs.some(sub => sub.id === line.tag && sub.holderId === person.id)).map(line => [entry.date, `JE-${entry.no}`, peso(line.cr)]))} />
               <Grid headers={["Certificate", "Issued", "Shares", "Status"]} rows={registers.certs.filter(cert => cert.holderId === person.id).map(cert => [cert.no, cert.date, cert.shares,
                 certificateActiveAt(cert, asOf) ? "Active" : cert.cancelledAt ? "Cancelled" : "Voided"])} />
             </details>)}
           </CardContent></Card>
           </Panel>
        </>}
         {section === "Tax compliance" && <><Panel active={activeTab === 0}><Card><CardHeader><CardTitle>BIR items</CardTitle></CardHeader><CardContent className="space-y-4">
          <p role="note" className="text-sm text-muted-foreground">Exports are supporting workpapers, not official SEC or BIR submissions.
            Filing references do not submit returns. “Filed manually” records an external filing supported by receipt and evidence references.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => {
              const pack = filingReviewPack(entries, registers, asOf, donationDocuments);
              const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }));
              const link = document.createElement("a"); link.href = url; link.download = "accountant-review-workpapers.json"; link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}><Download /> Accountant review pack</Button>
            {([["tax", "BIR liabilities"], ["giving", "Charitable contributions"], ["dividends", "Dividend withholding"]] as const).map(([key, label]) =>
              <Button key={key} variant="outline" onClick={() => downloadCsv(`${key}-workpaper.csv`, taxReports(entries, registers, donationDocuments)[key])}>
                <Download /> {label} CSV
              </Button>)}
          </div>
           <Grid headers={["Booked", "Form", "Due date", "Booked amount", "Outstanding", "Actions"]}
             rows={entries.flatMap(entry => entry.lines.filter(line => line.acct === "2200" && line.cr > 0 && -balance(entries, "2200", line.tag) > 0.004).map(line =>
               [entry.date, String(entry.data.taxForm ?? "—"), `${String(entry.data.taxDue ?? "—")}${entry.data.taxDue && String(entry.data.taxDue) < asOf ? " (overdue)" : ""}`,
                 peso(line.cr), peso(-balance(entries, "2200", line.tag)), canPost ? <div key={line.tag} className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => rowEntry("cash:taxpay", line.tag)}>Record BIR Tax Payment</Button>
                   {approved && <Button size="sm" variant="outline" onClick={() => setFilingEntry(entry)}>Record filing</Button>}
                 </div> : "View only"]))} />
            <h3 className="font-medium">Returns and certificates outstanding</h3>
           <Grid headers={["Journal", "Form", "Status", "Action"]} rows={entries.filter(entry => { const filing = donationDocuments?.[entry.id] ?? donationDocuments?.[`journal:${entry.no}`]; return entry.data.taxForm && !entry.reversedBy && filing?.status !== "filed-manually"; }).map(entry => { const filing = donationDocuments?.[entry.id] ?? donationDocuments?.[`journal:${entry.no}`]; return [`JE-${entry.no}`, String(entry.data.taxForm), filing?.reference ? "Reference recorded; filing not confirmed" : "Not recorded",
                 canPost && approved ? <Button key={entry.id} size="sm" variant="outline" onClick={() => setFilingEntry(entry)}>Mark filed / record certificate</Button> : "View only"];})} />
            <h3 className="font-medium">BIR payment history</h3>
             <Grid headers={["Journal", "Date", "BIR item", "Amount", "Channel", "Transaction reference", "Payment evidence", "Status"]} rows={entries.filter(entry => entry.type === "taxpay").map(entry => [
              `JE-${entry.no}`, entry.date, String(entry.data.taxId ?? entry.lines.find(line => line.acct === "2200")?.tag ?? ""),
               peso(entry.lines.filter(line => line.acct === "2200").reduce((sum, line) => sum + line.dr, 0)),
               String(entry.data.paymentChannel ?? "Not recorded"), String(entry.data.transactionReference ?? "Not recorded"),
               String((entry.data.paymentEvidence as { filename?: string } | undefined)?.filename ?? "Not recorded"),
              entry.reversedBy || entries.some(row => row.data.reverses === entry.id) ? "Reversed" : "Posted",
            ])} />
            <h3 className="font-medium">Filing register and completed history</h3>
            <Grid headers={["Journal", "Form", "Status", "Filing reference", "Filed on", "Receipt", "Evidence"]} rows={entries.filter(entry => entry.data.taxForm).map(entry => {
              const filing = donationDocuments?.[entry.id] ?? donationDocuments?.[`journal:${entry.no}`];
              return [`JE-${entry.no}`, String(entry.data.taxForm),
                entry.reversedBy || entries.some(row => row.data.reverses === entry.id) ? "Reversed source" : filing?.status === "filed-manually" ? "Filed manually (external)" : filing?.reference ? "Reference only; not confirmed filed" : "Not recorded",
                filing?.reference ?? "—", filing?.filedOn ?? "—", filing?.receiptReference ?? "—",
                filing?.evidenceFile?.filename ?? filing?.evidenceFileId ?? "—"];
            })} />
            </CardContent></Card></Panel><Panel active={activeTab === 1}>
             <Card><CardHeader><CardTitle>Donor&apos;s tax: calendar year {asOf.slice(0, 4)}</CardTitle></CardHeader><CardContent>
               <Grid headers={["Date", "Journal", "Taxable gift", "Cumulative gifts", "Incremental donor's tax"]}
                 rows={donorYear(entries, asOf.slice(0, 4), policy.donorRate, policy.donorExempt).map(row =>
                   [row.entry.date, `JE-${row.entry.no}`, peso(Number(row.entry.data.amount)), peso(row.cumulative), peso(row.tax)])} />
             </CardContent></Card>
             <Card><CardHeader><CardTitle>Charitable deduction (not booked)</CardTitle></CardHeader><CardContent>
               <p className="mb-3 text-sm">{deduction.itemized ? "Itemized deduction; property gifts use acquisition cost." : "Optional standard deduction: no additional charitable deduction."}</p>
               <Grid headers={["Measure", "Amount"]} rows={[["Fully deductible gifts", peso(deduction.full)], ["Gifts subject to cap", peso(deduction.limited)],
                 ["Policy deduction cap", peso(deduction.limit)], ["Allowed deduction", peso(deduction.deductible)], ["Estimated tax saving", peso(deduction.saving)]]} />
             </CardContent></Card>
           </Panel><Panel active={activeTab === 2}><Card><CardHeader><CardTitle>Investment and capital taxes</CardTitle></CardHeader><CardContent className="space-y-4">
             <Grid headers={["Tax", "Financial-year amount"]} rows={[["Final investment taxes", "5300"], ["Stock transaction tax", "5310"], ["Unlisted capital gains tax", "5320"]]
               .map(([label, code]) => [label, peso(balance(fiscalEntries.filter(row => row.type !== "closing"), code))])} />
          {canPost && reconciliationRole === "approve" && <form className="flex flex-wrap items-end gap-3" onSubmit={async event => {
            event.preventDefault();
            if (saving) return;
            const fields = new FormData(event.currentTarget);
            setSaving(true);
            try {
              const result = await submitLedger("cgt-reconcile", { date: fields.get("date"), fiscalStart: fields.get("fiscalStart") });
              mutationToast(result.ok, result.ok ? `CGT adjustment posted as JE-${result.number}.` : result.message); setFeedback(undefined);
              if (result.ok) router.refresh();
            } finally { setSaving(false); }
          }}>
            <label>Fiscal year start<Input name="fiscalStart" type="date" required /></label>
            <label>Adjustment date<Input name="date" type="date" defaultValue={asOf} required /></label>
            <Button type="submit" disabled={saving}>Post 1707-A adjustment</Button>
          </form>}
           <Grid headers={["Journal", "Return", "Due date", "Filing reference"]} rows={entries
             .filter(entry => Boolean(entry.data.taxForm))
             .map(entry => { const filing = donationDocuments?.[entry.id] ?? donationDocuments?.[`journal:${entry.no}`]; return [`JE-${entry.no}`, String(entry.data.taxForm), String(entry.data.taxDue ?? "—"),
                canPost && reconciliationRole === "approve" ? <div className="min-w-72" key={entry.id}>
                 <Button size="sm" variant="outline" onClick={() => setFilingEntry(entry)}>Mark filed / record certificate</Button>
               </div> : <div key={entry.id}><div>{filing?.reference ?? "Not recorded"}</div>
                 {filing?.evidenceFile && <p className="text-sm">Uploaded proof: {filing.evidenceFile.filename}</p>}
               </div>]})} />
            {filingEntry && <LedgerDialog open onOpenChange={open => { if (!open) setFilingEntry(null); }} title={`Record filing for JE-${filingEntry.no}`}>
              <TaxFilingForm entry={filingEntry} defaultDate={asOf} existing={donationDocuments?.[filingEntry.id] ?? donationDocuments?.[`journal:${filingEntry.no}`]} onFeedback={setFeedback} onSaved={() => setFilingEntry(null)} />
            </LedgerDialog>}
          </CardContent></Card></Panel></>}
           {isReconciliation && <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{section}</CardTitle>
             <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Each month, match the ledger to bank and broker statements. Every difference needs an explanation before the month can be signed off.</p></div>
              <StatusBadge status={`${reconciledMonths} of ${completedMonthTotal} months signed off`} tone={reconciledMonths === completedMonthTotal ? "success" : "warning"} /></div></CardHeader><CardContent className="space-y-3">
            <MonthNavigation value={month} first={firstMonth} onChange={selectMonth} />
           {month && <nav aria-label="Reconciliation month status" className="flex flex-wrap gap-2">
              {Array.from({ length: 12 }, (_, index) => `${month.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`).map(key => {
                const status = monthStatus(key);
                return <Button key={key} size="sm" variant={key === month ? "default" : "outline"} aria-current={key === month ? "date" : undefined}
                  onClick={() => selectMonth(key)}><span>{key.slice(5)} ·</span><StatusBadge status={status === "Signed" ? "Done" : status} tone={status === "Signed" ? "success" : status === "Changed" ? "danger" : status === "Draft" ? "warning" : status === "Future" ? "neutral" : "info"} /></Button>;
              })}
            </nav>}
             <h3 className="font-medium">{reconReview ? "Independent approval" : "Draft preparation"}</h3>
             <p className="text-sm text-muted-foreground">{reconReview ? "Review saved statement figures and explanations, then approve. Draft editing is separate in the reconciliator view." : "Enter bank and broker statement figures, explain differences, and save a draft."}</p>
            {reconciliations === null && <p className="text-sm text-muted-foreground">Reconciliation is read-only: draft storage is unavailable.</p>}
             {recon ? <p className="text-sm">{recon.signed_at ? <>Signed by <strong>{actorLabel(recon.approved_by, actor, actorName)}</strong> on {friendlyDate(recon.signed_at)}</> :
               <>Draft saved and ready for review</>}</p> : snapshot?.at ? <p className="text-sm">Signed by <strong>{actorLabel(snapshot.by, actor, actorName)}</strong> on {friendlyDate(snapshot.at)}</p>
               : <p className="text-sm text-muted-foreground">No signed statement snapshot for this month.</p>}
              {month && <div className="flex flex-wrap items-center justify-between rounded-md border px-3 py-2"><span className="font-medium">{month} · statement date {statementDate}</span><StatusBadge status={reconSigned ? "Reconciled" : recon ? "Draft saved" : "Open"} tone={reconSigned ? "success" : recon ? "warning" : "info"} /></div>}
            <div className="space-y-3"><h3 className="font-medium">Cash accounts and units held</h3>
              <Grid headers={["Account / Security", "Ledger balance", "Statement balance", "Difference", "Explanation"]}
                rows={reconLines.map(line => {
                  const format = (amount?: number | null) => amount == null ? "—" : line.isCash ? peso(amount) : amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
                  const label = accounts[line.key] ?? line.key.replace("|", " · ");
                  return [label, format(line.current), format(line.statement), format(line.difference), line.note || "—"];
                })} />
            </div>
            {reconChanged && (recon || reconSigned) && <p role="status" className="text-sm text-destructive">
             {reconSigned ? "Ledger changed after sign-off." : "Ledger changed after draft save. Save a fresh draft before signing."}
           </p>}
              {!reconReview && reconciliationOpen && <LedgerDialog open onOpenChange={setReconciliationOpen} title={`Reconcile ${month}`} wide><form key={`${month}:${recon?.revision ?? 0}`} onSubmit={submitReconciliation} className="space-y-3">
            {reconEditable && reconciliationRole === "approve" && <Button type="button" variant="outline" onClick={event => {
              if (!window.confirm("Only copy after checking the actual bank and broker statements. Fill blank statement fields from the ledger?")) return;
              const form = event.currentTarget.form;
              reconLines.forEach((line, index) => {
                const input = form?.elements.namedItem(`statement-${index}`);
                if (input instanceof HTMLInputElement && input.value === "") input.value = String(line.current);
              });
            }}>Copy ledger figures into blank fields</Button>}
           <Grid headers={["Account / Security", "Current ledger", "Signed ledger", "Statement", "Difference", "Explanation"]}
             rows={reconLines.map((line, index) => {
               const format = (amount?: number | null) => amount == null ? "—" :
                 line.isCash ? peso(amount) : amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
               const label = accounts[line.key] ?? line.key.replace("|", " · ");
               return [label, format(line.current), reconSigned ? format(line.signed) : "—",
                 reconEditable ? <Input aria-label={`${label} statement`} name={`statement-${index}`} type="number"
                   step={line.isCash ? "0.01" : "0.000001"} defaultValue={line.statement ?? ""} /> : format(line.statement),
                 format(line.difference),
                 reconEditable ? <Input aria-label={`${label} explanation`} name={`note-${index}`} maxLength={500}
                   defaultValue={line.note ?? ""} /> : line.note || "—"];
             })} />
             {reconEditable && <Button type="submit" value="draft" disabled={saving}><Save aria-hidden="true" /> Save draft</Button>}
             </form></LedgerDialog>}
              {!reconSigned && <div className="flex flex-wrap gap-2">
                 {reconReview && <Button type="button" onClick={() => setReconciliationSignoffOpen(true)}><Check aria-hidden="true" /> Review approval for {month}</Button>}
                 {!reconReview && reconEditable && <Button type="button" variant="outline" onClick={() => setReconciliationOpen(true)}><Landmark aria-hidden="true" /> Open reconciliation form</Button>}
              </div>}
              {reconReview && !reconSigned && <LedgerDialog open={reconciliationSignoffOpen} onOpenChange={setReconciliationSignoffOpen} title={`Sign off reconciliation: ${month}`}>
               <div className="space-y-3">
                 {!recon && <>
                   <p className="text-sm text-muted-foreground">Create and save a reconciliation draft before signing off this month.</p>
                    <p className="text-sm">The reconciliator must save a draft before it can be reviewed.</p>
                 </>}
                  {recon && <form onSubmit={submitReconciliation}>
                    <div className="mb-3 space-y-2 text-sm" role="status">
                      {reconciliationRole !== "approve" && <p>Your reconciliation access allows preparation, not approval. An authorized approver must sign the saved draft.</p>}
                      {reconApprovalIssue && <p>{reconApprovalIssue}</p>}
                      {!canPost && <p>The posting service is unavailable. Approval cannot be saved.</p>}
                      {monthClosed && <p>This month is closed. Reopen it through period close before changing its reconciliation.</p>}
                      {reconciliations === null && <p>Reconciliation storage is unavailable. Refresh before continuing.</p>}
                    </div>
                      <Button type="submit" value="sign" disabled={saving || !reconEditable || Boolean(reconApprovalIssue) || reconciliationRole !== "approve"}
                      title={!reconEditable ? "The reconciliation is not available for approval." : reconChanged ? "Save a fresh draft after the ledger changed." : reconciliationRole !== "approve" ? "Monthly-reconciliation approval permission is required." : undefined}><Check aria-hidden="true" /> Sign off saved draft</Button>
                 </form>}
               </div>
             </LedgerDialog>}
               {!reconReview && recon && !reconSigned && <p role="status" className="text-sm text-muted-foreground">Draft is ready for approval.</p>}
               {reconReview && !reconSigned && (!recon || reconChanged || !canPost) &&
               <p className="text-sm text-muted-foreground">Sign-off is locked: {!recon ? "save a draft first" : !canPost ? "transactional posting service unavailable" : reconciliationRole !== "approve" ? "approval permission required" : actor === recon.prepared_by ? "a different reviewer is required" : "save a fresh draft after the ledger changed"}.</p>}
            {recon?.signed_at && !monthClosed && reconReview && (
             <form key={`reopen:${month}:${recon.revision}`} onSubmit={submitReconciliation} className="space-y-2">
               <label className="block max-w-md text-sm">Reason for reopening<Input name="reason" required maxLength={500} /></label>
                 <Button type="submit" value="reopen" variant="outline" disabled={saving || !canPost || reconciliationRole !== "approve" || reconciliations === null}>Reopen reconciliation</Button>
             </form>
           )}
        </CardContent></Card>}
         {section === "Period close" && <Card><CardHeader><CardTitle>Period close</CardTitle></CardHeader><CardContent className="space-y-4">
           <MonthNavigation value={month} first={firstMonth} onChange={selectMonth} />
             <Grid headers={["Selected month checklist", "Requirement", "Status"]} rows={closeChecklist.map(row => [row.label,
                row.required ? "Required" : "Review only (does not block close)", <StatusBadge key={row.label} status={row.ok ? "Complete" : "Needs attention"} tone={row.ok ? "success" : "warning"} />])} />
              <form className="flex flex-wrap items-end gap-2" onSubmit={async event => {
            event.preventDefault();
            if (saving) return;
            const type = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
            if (!type) return;
            const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
            setSaving(true);
            try {
              const result = await submitLedger("period", { month, type, reason });
              mutationToast(result.ok, result.ok ? "Period updated." : result.message); setFeedback(undefined);
              if (result.ok) router.refresh();
            } finally { setSaving(false); }
          }}>
              {monthClosed ? <>
               <label>Reopen reason<Input name="reason" required maxLength={500} /></label>
                <Button value="reopen" type="submit" disabled={saving || !canPost || reconciliationRole !== "approve"} title={!canPost ? "Transactional posting service is unavailable." : reconciliationRole !== "approve" ? "Period-close approval permission is required." : undefined}><RefreshCcw aria-hidden="true" /> Reopen month</Button>
             </> : <>
                <Button value="accrue" type="submit" disabled={saving || !canPost} title={!canPost ? "Transactional posting service is unavailable." : undefined}><Save aria-hidden="true" /> Post loan interest</Button>
                <Button value="close" type="submit" disabled={saving || !canPost || reconciliationRole !== "approve" || closeChecklist.some(row => row.required && !row.ok)}
                   title={!canPost ? "Transactional posting service is unavailable." : reconciliationRole !== "approve" ? "Period-close approval permission is required." : undefined}><LockKeyhole aria-hidden="true" /> Close month</Button>
              </>}
              </form>
            {!canPost && <p className="text-sm text-muted-foreground">Period actions are locked: {reconciliationRole === "none" || reconciliationRole === "view" ? "period-close permission is required" : "the transactional posting service is unavailable"}.</p>}
            <Grid headers={["Month", "Accrual status", "Closed on", "Closed by"]}
              rows={periodRows.map(([key, row]) => [key, row.accruedAt ? <StatusBadge status="Recorded" tone="success" /> : <StatusBadge status="Pending" tone="warning" />, row.closedAt ? friendlyDate(row.closedAt) : <StatusBadge status="Open" tone="info" />, row.closedBy ? actorLabel(row.closedBy, actor, actorName) : "—"])} />
            <h3 className="font-medium">Close and reopen history</h3>
            <Grid headers={["Month", "Action", "When", "User", "Reason"]} rows={(registers.periodEvents ?? []).map(item =>
               [item.month, <StatusBadge key={`${item.month}:${item.occurredAt}`} status={friendlyActions[item.action] ?? "Period updated"} tone={item.action === "close" ? "success" : item.action === "reopen" ? "warning" : "info"} />, friendlyDate(item.occurredAt), actorLabel(item.actor, actor, actorName), item.reason ?? "—"])} />
        </CardContent></Card>}
        {isAnnualReview && <Card><CardHeader><CardTitle>Annual review evidence · {reportYear.from} to {reportYear.to}</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">Financial year starts
              <select className="h-9 rounded-md border bg-background px-2" value={reviewStart} onChange={event => setReviewStart(event.target.value)}>
                {reviewYears.map(start => <option key={start}>{start}</option>)}
              </select>
            </label>
            <Button variant="outline" disabled={!reportEntries.length} onClick={() => downloadJournal(reportEntries)}><Download /> Export annual activity</Button>
          </div>
           <Grid headers={["Review item", "Ledger evidence"]} rows={["Capital raised and reconciliations", "Performance and fees", "Gifting candidates", "Giving target and documents", "Targets reviewed"]
             .map((label, index) => [label, annualEvidence?.[reviewStart]?.[index] ?? "Evidence is unavailable; refresh the authenticated workspace."])} />
           {annualReviews === null && <p className="text-sm text-muted-foreground">Review storage is unavailable. Evidence is read-only.</p>}
           {annualHistory && <Card className="border-dashed"><CardHeader><CardTitle className="text-base">Review history</CardTitle></CardHeader><CardContent>
             {annualHistory.filter(row => row.fiscal_start === reviewStart).length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded for this financial year.</p> :
               <Grid headers={["Revision", "Change", "User", "When", "Reason (reopen only)"]} rows={annualHistory.filter(row => row.fiscal_start === reviewStart).map(row => [
                 row.revision, row.action === "sign" ? <StatusBadge key={`${row.revision}:action`} status="Approved" tone="success" /> : row.action === "reopen" ? <StatusBadge key={`${row.revision}:action`} status="Reopened" tone="warning" /> : <StatusBadge key={`${row.revision}:action`} status="Draft saved" tone="info" />,
                 actorLabel(row.actor, actor, actorName), friendlyDate(row.occurred_at), row.reason ?? "—"])} />}
           </CardContent></Card>}
           <Button type="button" variant="outline" onClick={() => setAnnualReviewOpen(true)}>Open annual-review actions</Button>
           {annualReviewOpen && <LedgerDialog open onOpenChange={setAnnualReviewOpen} title={`Annual review: ${reviewStart}`}>
               <AnnualReviewForm key={`${workspace}:${reviewStart}`} fiscalStart={reviewStart} actor={actor} actorName={actorName}
                mode={workspace === "annual-review-approver" ? "approve" : "prepare"}
                record={annualReviews?.find(row => row.fiscal_start === reviewStart)} canPrepare={canPost && annualReviews !== null && workspace === "annual-review-preparer"}
                canApprove={canPost && annualReviews !== null && workspace === "annual-review-approver" && reconciliationRole === "approve"}
                history={annualHistory?.filter(row => row.fiscal_start === reviewStart)} />
           </LedgerDialog>}
        </CardContent></Card>}
         {section === "Policy & targets" && <Policy registers={registers} entries={entries} canEdit={canPost && approved}
           dataTools={<DataTools maintenanceEnabled={registers.dataToolsEnabled} canExport={registers.canExportFullLedger} />} />}
      </section>
  </main>;
}
