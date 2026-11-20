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
import { recordCashEntry, reverseEntry } from "./server/actions";
import { planDeployment } from "./deployment";

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
      {onReverse && Boolean(entry.data.cashCommand) && entry.type !== "reversal" && entry.type !== "closing" && !entry.reversedBy &&
        <Button variant="outline" onClick={() => onReverse(entry)}>Reverse JE-{entry.no}</Button>}
      {entry.reversedBy && <p className="text-sm text-muted-foreground">Reversed</p>}
    </TableCell></TableRow>}</Fragment>)}
    {!rows.length && <TableRow><TableCell colSpan={5}>No entries match the filters.</TableCell></TableRow>}
  </TableBody></Table>;
}

function downloadJournal(rows: Entry[]) {
  const url = URL.createObjectURL(new Blob([journalCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "capital-and-giving-journal.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InvestmentDonationsModule({ workspace, canPost, journal, registers }: {
  workspace: WorkspaceKey; canPost: boolean; journal: Entry[]; registers: LedgerRegisters;
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
    return security ? [{ ...lot, security, cost: lot.cost * lot.openQty / lot.qty, market: security.price * lot.openQty }] : [];
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
  const cash = cashCodes.reduce((sum, code) => sum + balance(entries, code), 0);
  const liabilities = -Object.keys(accounts).filter(code => code.startsWith("2")).reduce((sum, code) => sum + balance(entries, code), 0);
  const assets = Object.keys(accounts).filter(code => code.startsWith("1")).reduce((sum, code) => sum + balance(entries, code), 0);
  const taxItems = entries.flatMap(entry => entry.lines.filter(line => line.acct === "2200" && line.cr > 0).map(line => ({
    tag: line.tag, label: `${String(entry.data.taxForm ?? "BIR item")} · JE-${entry.no}`,
    outstanding: -balance(entries, "2200", line.tag),
  }))).filter(item => item.outstanding > 0);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reversal, setReversal] = useState<Entry | null>(null);
  const [action, setAction] = useState<CashAction>(workspace === "portfolio-rebalancing" ? "fee" : workspace === "tax-compliance" ? "taxpay" : "transfer");
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const availableActions = workspace === "inflows-investing" ? [["transfer", "Cash transfer"], ["interest", "Receive bank interest"]]
    : workspace === "portfolio-rebalancing" ? [["fee", "Pay investment fee"]]
      : workspace === "tax-compliance" ? [["taxpay", "Pay tax to BIR"]] : [];
  async function postEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await recordCashEntry({
        type: action, date: String(fields.get("date")), amount: Number(fields.get("amount")),
        account: String(fields.get("account")), target: String(fields.get("target") ?? ""), memo: String(fields.get("memo") ?? ""),
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
  async function postReversal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reversal || saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await reverseEntry({ id: reversal.id, date: fields.get("date"), reason: fields.get("reason") });
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
  const [from, setFrom] = useState(transactionYear.from);
  const [to, setTo] = useState(transactionYear.to);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [ticker, setTicker] = useState("");
  const [includeReversed, setIncludeReversed] = useState(false);
  const [month, setMonth] = useState("2026-09");
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
    ...gifts.filter(row => row.data.exempt && !(row.data.receipt as { cert?: boolean })?.cert)
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
              <select className="h-9 rounded-md border bg-background px-2" value={action} onChange={event => setAction(event.target.value as CashAction)}>
                {availableActions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Date<Input type="date" required name="date" defaultValue={entries[0].date > asOf ? entries[0].date : asOf} /></label>
            <label>Amount (PHP)<Input type="number" name="amount" required min="0.01" step="0.01" /></label>
            <label className="grid gap-1">{action === "interest" ? "Receiving cash account" : "Paying cash account"}
              <select name="account" className="h-9 rounded-md border bg-background px-2">
                {cashCodes.map(code => <option key={code} value={code}>{accounts[code]}</option>)}
              </select>
            </label>
            {action === "transfer" && <label className="grid gap-1">Destination cash account
              <select name="target" defaultValue="1010" className="h-9 rounded-md border bg-background px-2">
                {cashCodes.map(code => <option key={code} value={code}>{accounts[code]}</option>)}
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
             <Journal rows={entries.slice(0, 6)} onReverse={canPost ? entry => { setReversal(entry); setFeedback(undefined); } : undefined} />
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
          <Journal rows={filtered.slice(0, 250)} onReverse={canPost ? entry => { setReversal(entry); setFeedback(undefined); } : undefined} />
        </CardContent></Card>}
        {section === "Portfolio & rebalancing" && <>
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
           <Card id="budget"><CardHeader><CardTitle>Budget &amp; donations</CardTitle></CardHeader><CardContent>
            <p className="mb-3 text-sm">{peso(giving)} given · {peso(Math.max(0, givingTarget - giving))} remaining</p>
            <Grid headers={["Date", "Donee", "Vehicle", "Fair value", "Deduction basis", "Documents"]}
              rows={gifts.map(row => [<span id={`donation-${row.id}`} key={row.id}>{row.date}</span>, organization(row.data.charityId), row.data.vehicle === "DAF" ? "Pooled fund" : String(row.data.vehicle),
                peso(Number(row.data.amount)), peso(Number(row.data.deductBasis)),
                row.data.exempt ? ((row.data.receipt as { cert?: boolean }).cert ? "Form 2322 recorded" : "Form 2322 missing") :
                  ((row.data.receipt as { f1800?: boolean }).f1800 ? "Form 1800 recorded" : "Form 1800 missing")])} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Organizations &amp; grants</CardTitle></CardHeader><CardContent>
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
        {section === "Tax compliance" && <Card><CardHeader><CardTitle>BIR items</CardTitle></CardHeader><CardContent>
          <Grid headers={["Booked", "Form", "Due date", "Booked amount", "Outstanding"]}
            rows={entries.flatMap(entry => entry.lines.filter(line => line.acct === "2200" && line.cr > 0).map(line =>
              [entry.date, String(entry.data.taxForm ?? "—"), String(entry.data.taxDue ?? "—"), peso(line.cr), peso(-balance(entries, "2200", line.tag))]))} />
        </CardContent></Card>}
        {section === "Monthly reconciliation" && <Card><CardHeader><CardTitle>Statement snapshots</CardTitle></CardHeader><CardContent className="space-y-3">
          <label className="block max-w-48 text-sm">Month<Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
          {Object.entries(registers.recons).filter(([key]) => key === month).map(([key, row]) => <div key={key} className="space-y-2">
            <p className="text-sm">Signed by {row.by} on {row.at.slice(0, 10)}</p>
            <Grid headers={["Account / Security", "Signed ledger figure", "Statement", "Difference"]}
              rows={Object.entries({ ...row.cash, ...row.units }).map(([code, value]) => {
                const ledger = Number(Object.entries(row.snap).find(([id]) => id === code)?.[1]);
                const format = cashCodes.includes(code) ? peso : (amount: number) => amount.toLocaleString();
                return [accounts[code] ?? code, format(ledger), format(Number(value)), format(Number(value) - ledger)];
              })} />
          </div>)}
          {!Object.hasOwn(registers.recons, month) && <p className="text-sm text-muted-foreground">No signed statement snapshot for this month.</p>}
        </CardContent></Card>}
        {section === "Period close" && <Card><CardHeader><CardTitle>Close history</CardTitle></CardHeader><CardContent>
          <Grid headers={["Month", "Accrual status", "Closed on", "Closed by"]}
            rows={periodRows.map(([key, row]) => [key, row.accruedAt ? "Recorded" : "Pending", row.closedAt?.slice(0, 10) ?? "Open", row.closedBy ?? "—"])} />
        </CardContent></Card>}
        {section === "Annual review" && <Card><CardHeader><CardTitle>Annual review evidence · {fy.from} to {fy.to}</CardTitle></CardHeader><CardContent>
          <Grid headers={["Review item", "Sample evidence"]} rows={[
            ["Capital raised and reconciliations", `${Object.keys(registers.recons).filter(key => key >= fy.from.slice(0, 7) && key <= fy.to.slice(0, 7)).length} signed months`],
            ["Performance, fees and drift", `${peso(market - cost)} unrealized gain`],
            ["Gifting candidates", `${holdings.filter(row => row.acctType === "Taxable" && row.market > row.cost).length} taxable lots with gains`],
            ["Giving target and documents", `${peso(giving)} of ${peso(givingTarget)}`],
            ["Targets reviewed", `Policy effective ${policy.effectiveDate}`],
          ]} />
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
