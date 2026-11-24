"use client";

import { Fragment, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accounts, balance, fiscalDates, journalCsv, peso, type Entry } from "./ledger";
import type { LedgerRegisters } from "./server/registers";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "./workspaces";
import { type CashAction } from "./cash-commands";
import { submitLedger } from "./ledger-api";
import type { ReconciliationRecord } from "./server/reconciliation-access";
import type { DonationDocument } from "./server/donation-documents";
import { TradeForm } from "./TradeForm";
import { CapitalActions } from "./CapitalActions";
import { stockReports, taxReports, filingReviewPack } from "./reporting";
import { pooledBalance } from "./donations";
import { AnnualReviewForm } from "./AnnualReviewForm";
import type { ReviewEvent } from "./annual-review";
import { planDeployment } from "./deployment";
import { reconciliationLines } from "./reconciliation";

const cashCodes = ["1000", "1010", "1020"];
const lineLabels: Record<string, string> = {
  subscribe: "Share subscription", transfer: "Cash transfer", debt: "Borrowing", buy: "Purchase",
  issue: "Certificate issued", accrual: "Month-end interest accrual", taxpay: "Tax payment",
  debtpay: "Loan payment", accrue: "Income accrued", receive: "Income received",
  subcollect: "Subscription payment", donation: "Donation", sell: "Sale", expaccrue: "Fee accrued",
  exppay: "Accrued fee paid", closing: "Year-end closing", fee: "Fee paid", reversal: "Reversal",
};

function Grid({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <Table><TableHeader><TableRow>{headers.map(title => <TableHead key={title}>{title}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.length ? rows.map((row, i) => <TableRow key={i}>{row.map((cell, j) =>
      <TableCell key={j}>{cell}</TableCell>)}</TableRow>) :
      <TableRow><TableCell colSpan={headers.length} className="text-muted-foreground">No records in this view.</TableCell></TableRow>}</TableBody></Table>;
}

function Journal({ rows, onReverse }: { rows: Entry[]; onReverse?: (entry: Entry) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return <Table><TableHeader><TableRow>{["Journal", "Date", "Type", "Description", "Debit total"].map(label =>
    <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
    {rows.map(entry => <Fragment key={entry.id}><TableRow>
      <TableCell><Button variant="ghost" size="sm" aria-expanded={open === entry.id}
        onClick={() => setOpen(open === entry.id ? null : entry.id)}>JE-{String(entry.no).padStart(4, "0")}</Button></TableCell>
      <TableCell>{entry.date}</TableCell><TableCell>{lineLabels[entry.type] ?? entry.type}</TableCell>
      <TableCell className="whitespace-normal">{entry.memo}</TableCell>
      <TableCell>{peso(entry.lines.reduce((sum, line) => sum + line.dr, 0))}</TableCell>
    </TableRow>{open === entry.id && <TableRow><TableCell colSpan={5}>
      <Grid headers={["Account", "Debit", "Credit", "Register tag"]}
        rows={entry.lines.map(line => [`${line.acct} · ${accounts[line.acct]}`, peso(line.dr), peso(line.cr), line.tag || "—"])} />
      {onReverse && Boolean(entry.data.cashCommand || entry.data.giftCommand) && entry.type !== "reversal" && entry.type !== "closing" && !entry.reversedBy &&
        <Button variant="outline" onClick={() => onReverse(entry)}>Reverse JE-{entry.no}</Button>}
      {entry.reversedBy && <p className="text-sm text-muted-foreground">Reversed</p>}
    </TableCell></TableRow>}</Fragment>)}
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

export default function InvestmentDonationsModule({ workspace, canPost, canReverse, journal, registers, reconciliations, reconciliationRole, actor, donationDocuments, annualReviews }: {
  workspace: WorkspaceKey; canPost: boolean; canReverse: boolean; journal: Entry[]; registers: LedgerRegisters;
  reconciliations: ReconciliationRecord[] | null; reconciliationRole: "none" | "view" | "prepare" | "approve"; actor: number;
  donationDocuments: Record<string, DonationDocument> | null;
  annualReviews: ReviewEvent[] | null;
}) {
  const router = useRouter();
  const section = INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === workspace)!.title;
  const entries = [...journal].sort((a, b) => b.date.localeCompare(a.date) || b.no - a.no);
  const { policy } = registers;
  const asOf = [new Date().toISOString().slice(0, 10), entries[0]?.date ?? ""].sort().at(-1)!;
  const fy = fiscalDates(asOf, policy.fyStart);
  const securities = Object.values(registers.securities);
  const holdings = registers.lots.filter(lot => lot.openQty > 0).flatMap(lot => {
    const security = securities.find(item => item.sym === lot.sym);
    return security ? [{ ...lot, security, cost: lot.openCost ?? lot.cost * lot.openQty / lot.qty, market: security.price * lot.openQty }] : [];
  });
  const market = holdings.reduce((sum, lot) => sum + lot.market, 0);
  const cost = ["1100", "1110", "1120", "1130", "1140"].reduce((sum, code) => sum + balance(entries, code), 0);
  const gifts = entries.filter(entry => entry.type === "donation" && !entry.reversedBy);
  const giving = gifts.filter(entry => entry.date >= fy.from && entry.date <= fy.to).reduce((sum, entry) => sum + Number(entry.data.amount), 0);
  const givingTarget = policy.netIncome * policy.givePct / 100;
  const allocation = registers.classes.map(group => {
    const value = holdings.filter(lot => lot.security.cls === group.id).reduce((sum, lot) => sum + lot.market, 0);
    return { ...group, value, actual: market ? value * 100 / market : 0 };
  });
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
  const fiscalEntries = entries.filter(entry => !entry.reversedBy && entry.date >= fy.from && entry.date <= fy.to);
  const raised = ["subcollect", "subscribe", "contribution"].map(type => cashCodes.reduce((sum, code) =>
    sum + balance(fiscalEntries.filter(entry => entry.type === type), code), 0));
  const periodRows = Object.entries(registers.periods);
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
  const [saving, setSaving] = useState(false);
  const [reversal, setReversal] = useState<Entry | null>(null);
  const [action, setAction] = useState<CashAction | "cashDonation" | "borrow" | "repay">(workspace === "portfolio-rebalancing" ? "fee" :
    workspace === "tax-compliance" ? "taxpay" : workspace === "charitable-giving" ? "cashDonation" : "transfer");
  const [documentGift, setDocumentGift] = useState<Entry | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const availableActions = workspace === "inflows-investing" ? [["transfer", "Cash transfer"], ["interest", "Receive bank interest"],
    ["accrueDividend", "Accrue investment dividend"], ["accrueInterest", "Accrue investment interest"],
    ["borrow", "Record loan proceeds"], ...(registers.debts.length ? [["repay", "Repay loan"]] : []),
    ...(unpaidSubscriptions.length ? [["subcollect", "Record subscription installment"]] : []),
    ...(receivables.length ? [["collectIncome", "Collect accrued income"]] : [])]
    : workspace === "portfolio-rebalancing" ? [["fee", "Pay investment fee"], ["expaccrue", "Accrue investment fee"],
      ...(fees.length ? [["exppay", "Settle accrued fee"]] : [])]
      : workspace === "tax-compliance" ? [["taxpay", "Pay tax to BIR"]]
        : workspace === "charitable-giving" ? [["cashDonation", "Record cash donation"]] : [];
  async function postEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await submitLedger("cash", {
        type: action, date: String(fields.get("date")), amount: Number(fields.get("amount")),
        account: String(fields.get("account") ?? "1000"), target: String(fields.get("target") ?? ""), memo: String(fields.get("memo") ?? ""),
        payDate: String(fields.get("payDate") ?? "") || undefined,
        name: fields.has("name") ? String(fields.get("name")) : undefined,
        rate: fields.has("rate") ? Number(fields.get("rate")) : undefined,
      });
      if (!result.ok) {
        setFeedback({ error: true, text: result.message });
        return;
      }
      setShowForm(false);
      setFeedback({ error: false, text: `JE-${result.number} posted.` });
      router.refresh();
    } catch {
      setFeedback({ error: true, text: "The entry could not be saved." });
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
      const result = await submitLedger("donation-document", { id: documentGift.id, reference: fields.get("reference") });
      setFeedback({ error: !result.ok, text: result.ok ? "Document reference saved." : result.message });
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
      setFeedback({ error: !result.ok, text: result.ok ? `Reversal JE-${result.number} posted.` : result.message });
      if (result.ok) {
        setReversal(null);
        router.refresh();
      }
    } catch {
      setFeedback({ error: true, text: "The reversal could not be posted." });
    } finally {
      setSaving(false);
    }
  }
  const transactionYear = fiscalDates(entries[0]?.date > asOf ? entries[0].date : asOf, policy.fyStart);
  const [reviewStart, setReviewStart] = useState(fy.from);
  const reportYear = fiscalDates(reviewStart, policy.fyStart);
  const reportEntries = workspace === "annual-review" ? entries.filter(row => row.date >= reportYear.from &&
    row.date <= reportYear.to && row.type !== "closing" &&
    !(row.type === "reversal" && (row.data.periodClose || entries.some(entry => entry.id === row.data.reverses && entry.type === "closing")))) : [];
  const reviewYears = workspace === "annual-review" ? Array.from(new Set([fy.from,
    ...entries.map(row => fiscalDates(row.date, policy.fyStart).from),
    ...(annualReviews ?? []).map(row => row.fiscal_start),
  ])).sort().reverse() : [];
  const [from, setFrom] = useState(transactionYear.from);
  const [to, setTo] = useState(transactionYear.to);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [ticker, setTicker] = useState("");
  const [includeReversed, setIncludeReversed] = useState(false);
  const [month, setMonth] = useState(asOf.slice(0, 7));
  const snapshot = Object.entries(registers.recons).find(([key]) => key === month)?.[1];
  const recon = reconciliations?.find(row => row.month_start.slice(0, 7) === month);
  const reconLines = workspace === "monthly-reconciliation" ? reconciliationLines(month, entries, registers.lots, recon?.payload ?? snapshot) : [];
  const reconSigned = Boolean(recon?.signed_at || (!recon && snapshot?.at));
  const reconChanged = reconLines.some(line => line.changed);
  const monthClosed = Boolean(Object.entries(registers.periods).find(([key]) => key === month)?.[1].closedAt);
  const reconEditable = reconciliations !== null && canPost && !reconSigned &&
    Boolean(month && !monthClosed);
  const calendarMonth = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  function monthStatus(key: string) {
    if (key > calendarMonth) return "Future";
    const saved = reconciliations?.find(row => row.month_start.slice(0, 7) === key);
    const historical = Object.entries(registers.recons).find(([value]) => value === key)?.[1];
    if (saved?.signed_at || (!saved && historical?.at)) {
      return reconciliationLines(key, entries, registers.lots, saved?.payload ?? historical)
        .some(line => line.changed) ? "Changed" : "Signed";
    }
    return saved ? "Draft" : key === calendarMonth ? "Current" : "Open";
  }
  const oldestOpen = workspace === "monthly-reconciliation" ? Object.entries(registers.periods)
    .filter(([key, period]) => key <= calendarMonth && !period.closedAt).map(([key]) => key).sort()[0] : undefined;
  function selectMonth(key: string) {
    setMonth(key);
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
      setFeedback({ error: !result.ok, text: result.ok ?
        ({ sign: "Reconciliation signed.", draft: "Draft saved.", reopen: "Reconciliation reopened as a draft." })[kind] : result.message });
      if (result.ok) router.refresh();
    } finally {
      setSaving(false);
    }
  }
  const [more, setMore] = useState(false);
  const filtered = entries.filter(entry => (!from || entry.date >= from) && (!to || entry.date <= to) &&
    (!type || entry.type === type) && (!ticker || entry.data.sym === ticker) &&
    (includeReversed || !entry.reversedBy) &&
    `${entry.memo} JE-${String(entry.no).padStart(4, "0")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const alerts: { text: string; href: string }[] = [
    ...allocation.filter(group => Math.abs(group.actual - group.target) > group.band).map(group => ({
      text: `${group.name} is outside its allocation band.`,
      href: `${INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === "portfolio-rebalancing")!.path}#allocation-${group.id}`,
    })),
    ...checks.filter(check => !check.ok).map(check => ({ text: `${check.name}: ${check.detail}`,
      href: `${INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === "inflows-investing")!.path}#pre-investment` })),
    ...receivables.filter(row => row.due && row.due < asOf).map(row => ({ text: `${row.memo} was due ${row.due}.`,
      href: `${INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === "inflows-investing")!.path}#receivable-${row.id}` })),
    ...registers.charities.filter(row => Object.values(row.checks).some(check => !check)).map(row => ({
      text: `${row.name} is awaiting vetting.`,
      href: `${INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === "charitable-giving")!.path}#organization-${row.id}`,
    })),
    ...gifts.filter(row => row.data.exempt && !donationDocuments?.[row.id] && !(row.data.receipt as { cert?: boolean })?.cert)
      .map(row => ({ text: `${organization(row.data.charityId)} is missing Form 2322.`,
        href: `${INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === "charitable-giving")!.path}#donation-${row.id}` })),
    ...(giving < givingTarget ? [{ text: `${peso(givingTarget - giving)} remains against the giving target.`,
      href: `${INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === "charitable-giving")!.path}#budget` }] : []),
  ];

  return <main className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
    <header className="space-y-2">
      <Badge variant="outline">Malaya sample company</Badge>
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Landmark size={24} /> Capital &amp; Giving Ledger</h1>
      <p className="text-sm text-muted-foreground">{registers.corp.name} · PHP · Accrual basis · As of {asOf}</p>
    </header>
      <section className="min-w-0 space-y-4" aria-label={section}>
        <h2 className="text-xl font-semibold">{section}</h2>
        {canPost && availableActions.length > 0 && !showForm && <div>
          <Button disabled={workspace === "tax-compliance" && !taxItems.length} onClick={() => {
            setFeedback(undefined);
            setShowForm(true);
          }}>{workspace === "tax-compliance" ? "Pay tax to BIR" : "+ New entry"}</Button>
          {workspace === "tax-compliance" && !taxItems.length && <p className="mt-2 text-sm text-muted-foreground">No outstanding sample BIR items.</p>}
        </div>}
        {canPost && showForm && <Card><CardHeader><CardTitle>Post entry</CardTitle></CardHeader><CardContent>
          <form onSubmit={postEntry} className="grid max-w-xl gap-3 text-sm sm:grid-cols-2">
            <label className="grid gap-1">Entry type
               <select className="h-9 rounded-md border bg-background px-2" value={action} onChange={event => setAction(event.target.value as typeof action)}>
                {availableActions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
             <label>Date<Input type="date" required name="date" defaultValue={asOf} /></label>
            <label>Amount (PHP)<Input type="number" name="amount" required min="0.01" step="0.01" /></label>
             {["accrueDividend", "accrueInterest"].includes(action) && <label>Expected payment date<Input type="date" name="payDate" /></label>}
             {!["accrueDividend", "accrueInterest", "expaccrue"].includes(action) &&
             <label className="grid gap-1">{["interest", "collectIncome", "subcollect", "borrow"].includes(action) ? "Receiving cash account" : "Paying cash account"}
              <select name="account" className="h-9 rounded-md border bg-background px-2">
                {cashCodes.map(code => <option key={code} value={code}>{accounts[code]}</option>)}
              </select>
             </label>}
             {action === "collectIncome" && <label className="grid gap-1">Income receivable
               <select name="target" required className="h-9 rounded-md border bg-background px-2">
                 {receivables.map(row => <option key={row.id} value={row.id}>{row.memo} · {peso(row.outstanding)}</option>)}
               </select>
             </label>}
             {action === "cashDonation" && <label className="grid gap-1">Organization
               <select name="target" required defaultValue="" className="h-9 rounded-md border bg-background px-2">
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
             </>}
             {action === "repay" && <label className="grid gap-1">Loan
               <select name="target" required className="h-9 rounded-md border bg-background px-2">
                 {registers.debts.map(row => <option key={row.id} value={row.id}>{row.name} · {peso(-balance(entries, "2000", row.id))} principal</option>)}
               </select>
             </label>}
            {action === "transfer" && <label className="grid gap-1">Destination cash account
              <select name="target" defaultValue="1010" className="h-9 rounded-md border bg-background px-2">
                {cashCodes.map(code => <option key={code} value={code}>{accounts[code]}</option>)}
              </select>
            </label>}
            {action === "exppay" && <label className="grid gap-1">Outstanding fee
              <select name="target" required className="h-9 rounded-md border bg-background px-2">
                {fees.map(fee => <option key={fee.tag} value={fee.tag}>{fee.label} · {peso(fee.outstanding)}</option>)}
              </select>
            </label>}
            {action === "taxpay" && <label className="grid gap-1">Outstanding BIR item
              <select name="target" required className="h-9 rounded-md border bg-background px-2">
                {taxItems.map(item => <option key={item.tag} value={item.tag}>{item.label} · {peso(item.outstanding)}</option>)}
              </select>
            </label>}
            <label>Memo<Input name="memo" maxLength={250} /></label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setFeedback(undefined); }}>Back</Button>
              <Button type="submit" disabled={saving}>{saving ? "Posting…" : "Post entry"}</Button>
            </div>
          </form>
         </CardContent></Card>}
         {feedback && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm"}>{feedback.text}</p>}
         {reversal && <Card><CardContent className="pt-6">
           <form onSubmit={postReversal} className="flex flex-wrap items-end gap-3 text-sm">
             <p className="w-full font-medium">Reverse JE-{reversal.no}</p>
             <label>Date<Input type="date" name="date" required defaultValue={entries[0]?.date} /></label>
             <label>Reason<Input name="reason" required maxLength={200} /></label>
             <Button type="button" variant="outline" disabled={saving} onClick={() => setReversal(null)}>Cancel</Button>
             <Button type="submit" disabled={saving}>Post reversal</Button>
           </form>
         </CardContent></Card>}
         {section === "Overview" && <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[["Portfolio market value", peso(market), `Cost ${peso(cost)} · unrealized ${peso(market - cost)}`],
              ["Cash across 3 accounts", peso(cash), "Operating and reserve accounts"],
              ["Giving this financial year", peso(giving), `Target ${peso(givingTarget)}`],
              ["Net worth at book value", peso(assets - liabilities), `Liabilities ${peso(liabilities)} · ${balance(entries) === 0 ? "Trial balance OK" : "Out of balance"}`]]
              .map(([label, value, note]) => <Card key={label}><CardHeader><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
                <CardContent><p className="text-lg font-semibold">{value}</p><p className="text-xs text-muted-foreground">{note}</p></CardContent></Card>)}
          </div>
          <Card><CardHeader><CardTitle>Needs attention</CardTitle></CardHeader><CardContent>
            <ul className="space-y-2 text-sm">{alerts.slice(0, more ? undefined : 4).map(alert => <li key={alert.text}>
              <Link className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 hover:bg-muted" href={alert.href}>
                <span>{alert.text}</span><span className="shrink-0 underline">Open</span>
              </Link>
            </li>)}</ul>
            {alerts.length > 4 && <Button variant="link" onClick={() => setMore(!more)}>{more ? "Show less" : "Show more"}</Button>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Allocation at market value</CardTitle></CardHeader><CardContent className="space-y-3">
            {allocation.map(group => <div key={group.id} className="grid gap-1 text-sm">
              <span>{group.name} · {group.actual.toFixed(1)}% / {group.target}% target</span>
              <progress aria-label={group.name} className="h-2 w-full" max={100} value={group.actual} />
            </div>)}
          </CardContent></Card>
           <Card><CardHeader><CardTitle>Latest six entries</CardTitle></CardHeader><CardContent>
             <Journal rows={entries.slice(0, 6)} onReverse={canReverse ? entry => { setReversal(entry); setFeedback(undefined); } : undefined} />
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
           <Journal rows={filtered.slice(0, 250)} onReverse={canReverse ? entry => { setReversal(entry); setFeedback(undefined); } : undefined} />
        </CardContent></Card>}
        {section === "Portfolio & rebalancing" && <>
           {canPost && <TradeForm securities={registers.securities} lots={registers.lots} defaultDate={asOf} />}
           <Card><CardHeader><CardTitle>Outstanding accrued fees</CardTitle></CardHeader><CardContent>
             <Grid headers={["Fee", "Outstanding"]} rows={fees.map(fee => [fee.label, peso(fee.outstanding)])} />
           </CardContent></Card>
          <Card><CardHeader><CardTitle>Allocation</CardTitle></CardHeader><CardContent>
            <Grid headers={["Asset class", "Market value", "Actual", "Target", "Band", "To target"]}
              rows={allocation.map(row => [<span id={`allocation-${row.id}`} key={row.id}>{row.name}</span>, peso(row.value), `${row.actual.toFixed(1)}%`, `${row.target}%`, `±${row.band}%`, peso(market * row.target / 100 - row.value)])} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Open lots</CardTitle></CardHeader><CardContent>
            <Grid headers={["Security", "Account", "Acquired", "Units", "Avg. cost", "Price as of", "Market value", "Unrealized"]}
              rows={holdings.map(row => [row.sym, row.acctType, row.date, row.openQty, peso(row.cost / row.openQty),
                `${peso(row.security.price)} · ${row.security.priceDate}`, peso(row.market), peso(row.market - row.cost)])} />
          </CardContent></Card>
        </>}
        {section === "Charitable giving" && <>
           {canPost && <TradeForm securities={registers.securities} lots={registers.lots} defaultDate={asOf} charities={registers.charities} />}
           {documentGift && <Card><CardContent className="pt-6">
             <form onSubmit={postDonationDocument} className="flex flex-wrap items-end gap-3">
               <label>Form {documentGift.data.exempt ? "2322" : "1800"} reference for JE-{documentGift.no}
                 <Input key={documentGift.id} name="reference" required maxLength={200} defaultValue={donationDocuments?.[documentGift.id]?.reference} />
               </label>
               <Button type="submit" disabled={saving}>Save reference</Button>
               <Button type="button" variant="outline" onClick={() => setDocumentGift(null)}>Cancel</Button>
             </form>
           </CardContent></Card>}
           <Card id="budget"><CardHeader><CardTitle>Budget &amp; donations</CardTitle></CardHeader><CardContent>
            <p className="mb-3 text-sm">{peso(giving)} given · {peso(Math.max(0, givingTarget - giving))} remaining</p>
             <Grid headers={["Date", "Donee", "Vehicle", "Fair value", "Deduction basis", "Donor’s tax", "Documents"]}
              rows={gifts.map(row => [<span id={`donation-${row.id}`} key={row.id}>{row.date}</span>, organization(row.data.charityId), row.data.vehicle === "DAF" ? "Pooled fund" : String(row.data.vehicle),
                 peso(Number(row.data.amount)), peso(Number(row.data.deductBasis)),
                 row.data.exempt ? "Exempt" : peso(Number(row.data.donorTax ?? 0)),
                 <div className="space-y-1" key={row.id}>
                   <div>{donationDocuments?.[row.id] ? `Form ${donationDocuments[row.id].form}: ${donationDocuments[row.id].reference}` :
                     row.data.exempt ? ((row.data.receipt as { cert?: boolean })?.cert ? "Form 2322 recorded" : "Form 2322 missing") :
                       ((row.data.receipt as { f1800?: boolean })?.f1800 ? "Form 1800 recorded" : "Form 1800 missing")}</div>
                   {canPost && reconciliationRole === "approve" && donationDocuments !== null && typeof row.data.exempt === "boolean" &&
                     <Button size="sm" variant="outline" onClick={() => { setDocumentGift(row); setFeedback(undefined); }}>Update reference</Button>}
                 </div>])} />
          </CardContent></Card>
           <Card><CardHeader><CardTitle>Organizations &amp; grants</CardTitle></CardHeader><CardContent>
             <Grid headers={["Pooled fund", "Available balance"]}
               rows={registers.charities.filter(row => row.isDAF).map(row => [row.name, peso(pooledBalance(entries, registers.grants, row.id, asOf))])} />
             {canPost && registers.charities.some(row => row.isDAF) && <form className="my-4 flex flex-wrap items-end gap-3" onSubmit={async event => {
               event.preventDefault();
               if (saving) return;
               const form = event.currentTarget;
               const fields = new FormData(form);
               setSaving(true);
               try {
                 const result = await submitLedger("giving", { type: "grant", date: fields.get("date"),
                   fund: fields.get("fund"), recipient: fields.get("recipient"), amount: Number(fields.get("amount")) });
                 setFeedback({ error: !result.ok, text: result.ok ? "Pooled-fund grant recorded." : result.message });
                 if (result.ok) { form.reset(); router.refresh(); }
               } finally { setSaving(false); }
             }}>
               <label>Date<Input type="date" name="date" defaultValue={asOf} required /></label>
               <label className="grid gap-1">Fund<select className="h-9 rounded-md border bg-background px-2" name="fund" required>
                 {registers.charities.filter(row => row.isDAF).map(row => <option value={row.id} key={row.id}>{row.name}</option>)}
               </select></label>
               <label className="grid gap-1">Recipient<select className="h-9 rounded-md border bg-background px-2" name="recipient" required>
                 {registers.charities.filter(row => !row.isDAF).map(row => <option value={row.id} key={row.id}>{row.name}</option>)}
               </select></label>
               <label>Grant amount<Input name="amount" type="number" min="0.01" step="0.01" required /></label>
               <Button type="submit" disabled={saving}>Record grant</Button>
             </form>}
            <Grid headers={["Organization", "Focus area", "Donee status", "Accreditation until", "Vetting"]}
              rows={registers.charities.map(row => [<span id={`organization-${row.id}`} key={row.id}>{row.name}</span>, row.focus, row.donee, row.accredUntil || "—",
                Object.values(row.checks).every(Boolean) ? "Complete" : "Incomplete"])} />
            <Grid headers={["Date", "Pooled fund", "Recipient", "Amount"]}
              rows={registers.grants.map(row => [row.date, organization(row.dafId), organization(row.toId), peso(row.amount)])} />
          </CardContent></Card>
        </>}
        {section === "Inflows & investing" && <>
          <Card><CardHeader><CardTitle>Capital raised</CardTitle></CardHeader><CardContent>
            <Grid headers={["Financial-year metric", "Amount"]} rows={[
              ["Subscription collections", peso(raised[0])], ["Cash from new subscriptions", peso(raised[1])],
              ["Deposits and advances", peso(raised[2])], ["Total raised", peso(raised.reduce((sum, amount) => sum + amount, 0))],
              ["Capital-raising target", peso(policy.savingsTarget)],
            ]} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Income receivable</CardTitle></CardHeader><CardContent>
            <Grid headers={["Source", "Expected payment", "Gross outstanding", "Estimated final tax"]}
              rows={receivables.map(row => [<span key={row.id} id={`receivable-${row.id}`}>{row.memo}</span>,
                row.due || "—", peso(row.outstanding), peso(row.tax)])} />
          </CardContent></Card>
          <Card id="pre-investment"><CardHeader><CardTitle>Pre-investment checks</CardTitle></CardHeader><CardContent>
            <Grid headers={["Requirement", "Status", "Evidence"]}
              rows={checks.map(check => [check.name, check.ok ? "Pass" : "Needs attention", check.detail])} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Deployment planner</CardTitle></CardHeader><CardContent className="space-y-3">
            <p className="text-sm">Amounts above {peso(policy.lumpThreshold)} are split into up to {policy.tranches} monthly tranches. Underweight classes receive priority.</p>
            {checks.some(check => !check.ok) && <p className="text-sm text-destructive">Hold deployment until the pre-investment checks pass.</p>}
            <label className="block max-w-xs text-sm">Amount (PHP)
              <Input type="number" min="0.01" step="0.01" value={deploymentAmount} onChange={event => setDeploymentAmount(event.target.value)} />
            </label>
            {plan.length > 0 && <Grid headers={["Month", "Total", ...allocation.map(row => row.name)]}
              rows={plan.map((row, i) => [i + 1, peso(row.amount), ...row.split.map(peso)])} />}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Cash reserves</CardTitle></CardHeader><CardContent>
            <Grid headers={["Account", "Balance", "Minimum"]}
              rows={cashCodes.map((code, i) => [accounts[code], peso(balance(entries, code)),
                i === 1 ? peso(policy.reserveMonths * policy.monthlyExpenses) : i === 2 ? peso(policy.liquidityNeed) : "—"])} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Loan balances</CardTitle></CardHeader><CardContent>
            <Grid headers={["Loan", "Rate", "Principal", "Accrued interest", "Payoff scheduled"]}
              rows={registers.debts.map(row => [row.name, `${row.rate}%`, peso(-balance(entries, "2000", row.id)),
                peso(-balance(entries, "2100", row.id)), row.scheduled ? "Yes" : "No"])} />
          </CardContent></Card>
        </>}
        {section === "Capital stock" && <>
           <div className="flex flex-wrap gap-2">
             <Button variant="outline" onClick={() => downloadCsv("stock-and-transfer-book.csv", stockReports(entries, registers, asOf).book)}>
               <Download /> Stock and transfer book
             </Button>
             <Button variant="outline" onClick={() => downloadCsv("gis-stockholders-workpaper.csv", stockReports(entries, registers, asOf).gis)}>
               <Download /> GIS stockholders workpaper
             </Button>
           </div>
           {canPost && reconciliationRole === "approve" && <CapitalActions registers={registers} defaultDate={asOf} />}
           <Card><CardHeader><CardTitle>Dividend register</CardTitle></CardHeader><CardContent>
             <Grid headers={["Declared", "Payment date", "Gross", "Status"]} rows={registers.dividends.map(row =>
               [row.date, row.payDate, peso(row.gross), row.cancelled ? "Cancelled" : row.paidAt ? `Paid · ${row.paidAt}` : "Unpaid"])} />
           </CardContent></Card>
           {canPost && registers.holders.length > 0 && <Card><CardHeader><CardTitle>New share subscription</CardTitle></CardHeader><CardContent>
             <form className="grid max-w-xl gap-3 sm:grid-cols-2" onSubmit={async event => {
               event.preventDefault();
               if (saving) return;
               const form = event.currentTarget;
               const fields = new FormData(form);
               setSaving(true);
               try {
                 const result = await submitLedger("subscribe", { date: fields.get("date"), holderId: fields.get("holderId"),
                   account: fields.get("account"), shares: Number(fields.get("shares")), price: Number(fields.get("price")), paid: Number(fields.get("paid")) });
                 setFeedback({ error: !result.ok, text: result.ok ? `Subscription posted as JE-${result.number}.` : result.message });
                 if (result.ok) { form.reset(); router.refresh(); }
               } finally { setSaving(false); }
             }}>
               <label className="grid gap-1">Stockholder<select name="holderId" required className="h-9 rounded-md border bg-background px-2">
                 {registers.holders.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
               </select></label>
               <label>Date<Input name="date" type="date" required defaultValue={asOf} /></label>
               <label>Shares<Input name="shares" type="number" required min="1" step="1" /></label>
               <label>Price per share<Input name="price" type="number" required min="0.01" step="0.01" defaultValue={registers.corp.par} /></label>
               <label>Paid now<Input name="paid" type="number" required min="0" step="0.01" defaultValue="0" /></label>
               <label className="grid gap-1">Receiving cash account<select name="account" className="h-9 rounded-md border bg-background px-2">
                 {cashCodes.map(code => <option key={code} value={code}>{accounts[code]}</option>)}
               </select></label>
               <Button type="submit" disabled={saving}>Post subscription</Button>
             </form>
           </CardContent></Card>}
           {canPost && reconciliationRole === "approve" && issuableSubscriptions.length > 0 &&
             <Card><CardHeader><CardTitle>Issue a stock certificate</CardTitle></CardHeader><CardContent>
               <form className="flex flex-wrap items-end gap-3" onSubmit={async event => {
                 event.preventDefault();
                 if (saving) return;
                 const form = event.currentTarget;
                 const fields = new FormData(form);
                 setSaving(true);
                 try {
                   const result = await submitLedger("issue-certificate", {
                     target: fields.get("target"), date: fields.get("date"), certNo: fields.get("certNo"),
                   });
                   setFeedback({ error: !result.ok, text: result.ok ? `Certificate issued in JE-${result.number}.` : result.message });
                   if (result.ok) { form.reset(); router.refresh(); }
                 } finally { setSaving(false); }
               }}>
                 <label className="grid gap-1">Fully paid subscription
                   <select name="target" required className="h-9 rounded-md border bg-background px-2">
                     {issuableSubscriptions.map(row => <option key={row.id} value={row.id}>{holder(row.holderId)} · {row.shares.toLocaleString()} shares</option>)}
                   </select>
                 </label>
                 <label>Issue date<Input name="date" type="date" required defaultValue={asOf} /></label>
                 <label>Certificate number<Input name="certNo" required maxLength={40} pattern="[A-Za-z0-9\\-]+" /></label>
                 <Button type="submit" disabled={saving}>Issue certificate</Button>
               </form>
             </CardContent></Card>}
          <Card><CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader><CardContent>
            <p className="mb-3 text-sm">Authorized: {registers.corp.authorized.toLocaleString()} shares at {peso(registers.corp.par)} par</p>
            <Grid headers={["Stockholder", "Shares", "Subscribed", "Paid", "Unpaid", "Call due", "Certificate"]}
              rows={registers.subs.map(row => {
                const unpaid = balance(entries, "3020", row.id);
                return [holder(row.holderId), row.shares.toLocaleString(), peso(row.shares * row.price),
                  peso(row.shares * row.price - unpaid), peso(unpaid), row.callDue || "—", row.certNo || "—"];
              })} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Stock &amp; transfer book</CardTitle></CardHeader><CardContent>
            <Grid headers={["Date", "From", "To", "Shares", "eCAR", "New certificates"]}
              rows={registers.transfers.map(row => [row.date, holder(row.fromId), holder(row.toId), row.shares.toLocaleString(), row.carRef, row.newCerts.join(", ")])} />
          </CardContent></Card>
        </>}
        {section === "Tax compliance" && <Card><CardHeader><CardTitle>BIR items</CardTitle></CardHeader><CardContent className="space-y-4">
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
          <Grid headers={["Booked", "Form", "Due date", "Booked amount", "Outstanding"]}
            rows={entries.flatMap(entry => entry.lines.filter(line => line.acct === "2200" && line.cr > 0).map(line =>
              [entry.date, String(entry.data.taxForm ?? "—"), String(entry.data.taxDue ?? "—"), peso(line.cr), peso(-balance(entries, "2200", line.tag))]))} />
          {canPost && reconciliationRole === "approve" && <form className="flex flex-wrap items-end gap-3" onSubmit={async event => {
            event.preventDefault();
            if (saving) return;
            const fields = new FormData(event.currentTarget);
            setSaving(true);
            try {
              const result = await submitLedger("cgt-reconcile", { date: fields.get("date"), fiscalStart: fields.get("fiscalStart") });
              setFeedback({ error: !result.ok, text: result.ok ? `CGT adjustment posted as JE-${result.number}.` : result.message });
              if (result.ok) router.refresh();
            } finally { setSaving(false); }
          }}>
            <label>Fiscal year start<Input name="fiscalStart" type="date" required /></label>
            <label>Adjustment date<Input name="date" type="date" defaultValue={asOf} required /></label>
            <Button type="submit" disabled={saving}>Post 1707-A adjustment</Button>
          </form>}
          <Grid headers={["CGT entry", "Return", "Due date", "Filing reference"]} rows={entries
            .filter(entry => ["1707", "1707-A"].includes(String(entry.data.taxForm)))
            .map(entry => [`JE-${entry.no}`, String(entry.data.taxForm), String(entry.data.taxDue ?? "—"),
              canPost && reconciliationRole === "approve" ? <form className="grid min-w-72 gap-2" key={entry.id} onSubmit={async event => {
                event.preventDefault();
                if (saving) return;
                const fields = new FormData(event.currentTarget);
                setSaving(true);
                try {
                  const status = fields.get("status");
                  const result = await submitLedger("cgt-filing", { id: entry.id, reference: fields.get("reference"), status,
                    filedOn: status === "filed-manually" ? fields.get("filedOn") : undefined,
                    receiptReference: status === "filed-manually" ? fields.get("receiptReference") : undefined,
                    evidenceReference: status === "filed-manually" ? fields.get("evidenceReference") : undefined });
                  setFeedback({ error: !result.ok, text: result.ok ? "Filing reference saved." : result.message });
                  if (result.ok) router.refresh();
                } finally { setSaving(false); }
              }}>
                <Input name="reference" aria-label={`Filing reference for JE-${entry.no}`} defaultValue={donationDocuments?.[entry.id]?.reference} required maxLength={200} />
                <label>Status<select name="status" defaultValue={donationDocuments?.[entry.id]?.status ?? "reference-only"}>
                  <option value="reference-only">Reference only</option><option value="filed-manually">Filed manually</option>
                </select></label>
                <label>External filing date<Input name="filedOn" type="date" defaultValue={donationDocuments?.[entry.id]?.filedOn ?? ""} /></label>
                <Input name="receiptReference" aria-label="Receipt reference" placeholder="Receipt reference" maxLength={200} defaultValue={donationDocuments?.[entry.id]?.receiptReference ?? ""} />
                <Input name="evidenceReference" aria-label="Evidence reference" placeholder="Evidence reference" maxLength={200} defaultValue={donationDocuments?.[entry.id]?.evidenceReference ?? ""} />
                <Button type="submit" disabled={saving}>Save</Button>
              </form> : donationDocuments?.[entry.id]?.reference ?? "Not recorded"])} />
        </CardContent></Card>}
          {section === "Monthly reconciliation" && <Card><CardHeader><CardTitle>Monthly reconciliation</CardTitle></CardHeader><CardContent className="space-y-3">
           <label className="block max-w-48 text-sm">Month<Input type="month" value={month} onChange={e => selectMonth(e.target.value)} /></label>
           {oldestOpen && <Button variant="outline" onClick={() => selectMonth(oldestOpen)}>Oldest open month ({oldestOpen})</Button>}
           {month && <nav aria-label="Reconciliation month status" className="flex flex-wrap gap-2">
             {Array.from({ length: 12 }, (_, index) => `${month.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`).map(key =>
               <Button key={key} size="sm" variant={key === month ? "default" : "outline"} aria-current={key === month ? "date" : undefined}
                 onClick={() => selectMonth(key)}>{key.slice(5)} · {monthStatus(key)}</Button>)}
           </nav>}
           {reconciliations === null && <p className="text-sm text-muted-foreground">Reconciliation is read-only: draft storage is unavailable.</p>}
           {recon ? <p className="text-sm">{recon.signed_at ? `Signed by user ${recon.approved_by} on ${recon.signed_at.slice(0, 10)}` :
             `Draft prepared by user ${recon.prepared_by}`}</p> : snapshot?.at ? <p className="text-sm">Signed by {snapshot.by} on {snapshot.at.slice(0, 10)}</p>
             : <p className="text-sm text-muted-foreground">No signed statement snapshot for this month.</p>}
           {reconChanged && (recon || reconSigned) && <p role="status" className="text-sm text-destructive">
             {reconSigned ? "Ledger changed after sign-off." : "Ledger changed after draft save. Save a fresh draft before signing."}
           </p>}
           <form key={`${month}:${recon?.revision ?? 0}`} onSubmit={submitReconciliation} className="space-y-3">
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
           {reconEditable && <Button type="submit" disabled={saving}>Save draft</Button>}
           </form>
           {reconEditable && recon && reconciliationRole === "approve" && actor !== recon.prepared_by && (
             <form onSubmit={submitReconciliation}>
               <Button type="submit" value="sign" disabled={saving || reconChanged}>Sign off saved draft</Button>
             </form>
           )}
           {recon?.signed_at && !monthClosed && reconciliationRole === "approve" && (
             <form key={`reopen:${month}:${recon.revision}`} onSubmit={submitReconciliation} className="space-y-2">
               <label className="block max-w-md text-sm">Reason for reopening<Input name="reason" required maxLength={500} /></label>
               <Button type="submit" value="reopen" variant="outline" disabled={saving}>Reopen reconciliation</Button>
             </form>
           )}
        </CardContent></Card>}
        {section === "Period close" && <Card><CardHeader><CardTitle>Period close</CardTitle></CardHeader><CardContent>
          {canPost && <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={async event => {
            event.preventDefault();
            if (saving) return;
            const type = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
            if (!type) return;
            const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
            setSaving(true);
            try {
              const result = await submitLedger("period", { month, type, reason });
              setFeedback({ error: !result.ok, text: result.ok ? "Period updated." : result.message });
              if (result.ok) router.refresh();
            } finally { setSaving(false); }
          }}>
            <label>Month<Input type="month" required value={month} onChange={event => selectMonth(event.target.value)} /></label>
            {monthClosed ? reconciliationRole === "approve" && <>
              <label>Reopen reason<Input name="reason" required maxLength={500} /></label>
              <Button value="reopen" type="submit" disabled={saving}>Reopen month</Button>
            </> : <>
              <Button value="accrue" type="submit" disabled={saving}>Post loan interest</Button>
              {reconciliationRole === "approve" && <Button value="close" type="submit" disabled={saving}>Close month</Button>}
            </>}
          </form>}
          <Grid headers={["Month", "Accrual status", "Closed on", "Closed by"]}
            rows={periodRows.map(([key, row]) => [key, row.accruedAt ? "Recorded" : "Pending", row.closedAt?.slice(0, 10) ?? "Open", row.closedBy ?? "—"])} />
        </CardContent></Card>}
        {section === "Annual review" && <Card><CardHeader><CardTitle>Annual review evidence · {reportYear.from} to {reportYear.to}</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">Financial year starts
              <select className="h-9 rounded-md border bg-background px-2" value={reviewStart} onChange={event => setReviewStart(event.target.value)}>
                {reviewYears.map(start => <option key={start}>{start}</option>)}
              </select>
            </label>
            <Button variant="outline" disabled={!reportEntries.length} onClick={() => downloadJournal(reportEntries)}><Download /> Export annual activity</Button>
          </div>
          <Grid headers={["Review item", "Ledger evidence"]} rows={[
            ["Capital raised and reconciliations", `${peso(cashCodes.reduce((sum, code) => sum + balance(reportEntries.filter(row =>
              ["subcollect", "subscribe", "contribution"].includes(row.type) && !row.reversedBy), code), 0))} from subscriptions and contributions`],
            ["Performance and fees", `${peso(-balance(reportEntries, "4100"))} realized gain/loss; ${peso(balance(reportEntries, "5100"))} investment fees`],
            ["Gifting candidates", `${holdings.filter(row => row.acctType === "Taxable" && row.market > row.cost).length} currently held taxable lots with gains`],
            ["Giving target and documents", `${peso(gifts.filter(row => row.date >= reportYear.from && row.date <= reportYear.to)
              .reduce((sum, row) => sum + Number(row.data.amount), 0))} given; ${peso(givingTarget)} current policy target`],
            ["Targets reviewed", `Policy effective ${policy.effectiveDate}`],
          ]} />
          {annualReviews === null && <p className="text-sm text-muted-foreground">Review storage is unavailable. Evidence is read-only.</p>}
          <AnnualReviewForm key={reviewStart} fiscalStart={reviewStart} actor={actor}
            record={annualReviews?.find(row => row.fiscal_start === reviewStart)} canPrepare={canPost && annualReviews !== null}
            canApprove={canPost && annualReviews !== null && reconciliationRole === "approve"} />
        </CardContent></Card>}
        {section === "Policy & targets" && <Card><CardHeader><CardTitle>Sample policy and corporation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={() => downloadJournal(entries)}><Download /> Export full journal</Button>
            <Grid headers={["Setting", "Value"]} rows={[
              ["Corporation", registers.corp.name], ["SEC registration", registers.corp.secReg],
              ["Policy owner", policy.owner], ["Document version", policy.docVersion], ["Financial year starts in month", policy.fyStart],
              ["Cost-basis method", policy.costMethod], ["Day count", policy.dayCount], ["Donor’s tax rate", `${policy.donorRate}%`],
              ["Donor’s tax exemption", peso(policy.donorExempt)], ["Capital-raising target", peso(policy.savingsTarget)],
              ["Giving target", `${policy.givePct}% of net income`],
            ]} />
          </CardContent></Card>}
      </section>
  </main>;
}
