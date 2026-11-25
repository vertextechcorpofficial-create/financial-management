"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accounts, balance, peso, type Entry } from "./ledger";
import { submitLedger } from "./ledger-api";
import { executeLedgerCommand } from "./ledger-api";
import type { LedgerRegisters } from "./server/registers";
import { certificateActiveAt } from "./certificates";
import { MasterData } from "./MasterData";

export type CapitalOperation = "shareTransfer" | "voidTransfer" | "declareDividend" | "payDividend" |
  "subscribe" | "subcollect" | "issueCertificate" | "callSubscription" | "capitalIncrease" | "contribution";
const selectClass = "h-9 w-full rounded-md border bg-background px-2";
const cashOptions = ["1000", "1010", "1020"].map(code => <option key={code} value={code}>{accounts[code]}</option>);

export function CapitalActions({ registers, defaultDate, entries, revision = 0, hideLauncher = false, initialType, initialTarget, onClose }: {
  registers: LedgerRegisters; defaultDate: string; entries?: readonly Entry[]; revision?: number;
  hideLauncher?: boolean; initialType?: CapitalOperation; initialTarget?: string; onClose?: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<CapitalOperation | null>(initialType ?? null);
  const [date, setDate] = useState(defaultDate);
  const [source, setSource] = useState("deposit");
  const [kind, setKind] = useState("unissued");
  const [seller, setSeller] = useState(registers.certs.find(row => row.id === initialTarget && certificateActiveAt(row, defaultDate))?.holderId ??
    registers.certs.find(row => certificateActiveAt(row, defaultDate))?.holderId ?? "");
  const [buyer, setBuyer] = useState("");
  const [newHolderOpen, setNewHolderOpen] = useState(false);
  const [callTarget, setCallTarget] = useState(initialTarget ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const active = registers.certs.filter(row => certificateActiveAt(row, date));
  const sellers = registers.holders.filter(row => row.active !== false && !row.inactive && active.some(cert => cert.holderId === row.id));
  const reversible = registers.transfers.filter(row => !row.voidedAt);
  const payable = registers.dividends.filter(row => !row.paidAt && !row.cancelled);
  const subscriptions = registers.subs.filter(row => !("cancelled" in row && row.cancelled) && row.date <= date);
  const outstanding = subscriptions.filter(row => !entries || balance(entries, "3020", row.id, date) > 0.004);
  const ready = subscriptions.filter(row => !row.issuedAt && (!entries || balance(entries, "3020", row.id, date) <= 0.004));
  const holder = (id: string) => registers.holders.find(row => row.id === id)?.name ?? id;
  const increases = registers.corp.increases as { id: string; date: string; secRef: string }[];
  const calledSub = registers.subs.find(row => row.id === callTarget);
  const options: [CapitalOperation, string, boolean][] = [
    ["contribution", "Deposit / advance / opening balance", true],
    ["subscribe", "Record subscription", registers.holders.length > 0],
    ["subcollect", "Subscription payment", outstanding.length > 0],
    ["callSubscription", "Call subscription payment", outstanding.length > 0],
    ["issueCertificate", "Issue stock certificate", ready.length > 0],
    ["capitalIncrease", "Record capital increase", true],
    ["shareTransfer", "Transfer shares", active.length > 0 && registers.holders.length > 1],
    ["voidTransfer", "Void a transfer", reversible.length > 0],
    ["declareDividend", "Declare dividend", true],
    ["payDividend", "Pay dividend", payable.length > 0],
  ];
  const close = () => { setType(null); onClose?.(); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type || saving) return;
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const number = (key: string) => Number(form.get(key));
    setSaving(true);
    try {
      let result;
      if (type === "callSubscription" || type === "capitalIncrease") {
        const entity = type === "callSubscription" ? "calls" : "capitalIncreases";
        const revisions = (registers as LedgerRegisters & { masterRevisions?: Record<string, number> }).masterRevisions;
        result = await executeLedgerCommand({ type: "master", entity,
          operation: "upsert", revision: revisions?.[entity] ?? revision, value: type === "callSubscription" ? {
            subId: text("target"), date, dueDate: text("dueDate"), boardRef: text("boardRef"),
          } : { date, to: number("to"), secRef: text("secRef") } });
      } else if (type === "subscribe") {
        result = await submitLedger("subscribe", { date, holderId: text("holderId"), shares: number("shares"), price: number("price"),
          paid: number("paid"), account: text("account"), kind, incId: kind === "increase" ? text("incId") : "",
          fromDeposits: number("fromDeposits"), callDue: text("callDue") || undefined });
      } else if (type === "issueCertificate") {
        result = await submitLedger("issue-certificate", { date, target: text("target"), certNo: text("certNo") });
      } else if (type === "subcollect" || type === "contribution") {
        const target = text("target");
        result = await submitLedger("cash", { type, date, account: text("account"), target,
          amount: text("amount") ? number("amount") : entries && target ? balance(entries, "3020", target, date) : 0,
          memo: text("memo"), source, secCriteriaMet: form.has("secCriteriaMet"),
          secApplicationRef: text("secApplicationRef"), requestedShares: number("requestedShares") });
      } else {
        const input = type === "shareTransfer" ? {
          targets: form.getAll("targets"), toId: text("toId"), shares: number("shares"), price: text("price") ? number("price") : undefined,
          carRef: text("carRef"), deedRef: text("deedRef") || undefined, buyerNo: text("buyerNo"), balanceNo: text("balanceNo") || undefined,
        } : type === "voidTransfer" ? { target: text("target"), reason: text("reason"),
          evidenceRef: text("evidenceRef") || undefined, confirmHistorical: form.has("confirmHistorical") }
          : type === "declareDividend" ? { perShare: number("perShare"), payDate: text("payDate"), recordDate: text("recordDate"),
            boardRef: text("boardRef"), confirmUnrestricted: form.has("confirmUnrestricted") }
          : { target: text("target"), account: text("account") };
        result = await submitLedger("capital", { ...input, type, date });
      }
      setFeedback({ ok: result.ok, text: result.ok ? "number" in result && result.number ? `JE-${result.number} posted.` : "Capital register updated." : result.message });
      if (result.ok) { close(); router.refresh(); }
    } catch { setFeedback({ ok: false, text: "Save could not be confirmed. Refresh before retrying." }); }
    finally { setSaving(false); }
  }
  if (hideLauncher && !type && !feedback) return null;
  return <Card>
    <CardHeader><CardTitle>{type ? options.find(row => row[0] === type)?.[1] : "Capital actions"}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {!type && !hideLauncher && <div className="flex flex-wrap gap-2">{options.map(([value, label, enabled]) =>
        <Button key={value} variant="outline" disabled={!enabled} onClick={() => { setType(value); setFeedback(undefined); }}>{label}</Button>)}</div>}
      {newHolderOpen && <MasterData registers={registers} kind="holder" hideLauncher initialOpen formOnly
        onClose={() => setNewHolderOpen(false)} onSaved={id => setBuyer(id)} />}
      {type && <form hidden={newHolderOpen} onSubmit={submit} className={newHolderOpen ? "hidden" : "grid gap-3 sm:grid-cols-2"}>
        <label>{type === "declareDividend" ? "Declaration date" : "Date"}<Input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
        {type === "contribution" && <>
          <label className="grid gap-1">Nature<select className={selectClass} value={source} onChange={event => setSource(event.target.value)}>
            <option value="deposit">Deposit for future stock subscription</option><option value="advance">Advance from stockholder</option><option value="opening">Opening balance</option>
          </select></label>
          <label>Amount<Input name="amount" type="number" min="0.01" step="0.01" required /></label>
          <label className="grid gap-1">Deposit to<select name="account" className={selectClass}>{cashOptions}</select></label>
          <label className="sm:col-span-2">Stockholder and reference<Input name="memo" required maxLength={250} /></label>
          {source === "deposit" && <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2"><legend>SEC equity classification criteria</legend>
            <label>Shares requested<Input name="requestedShares" type="number" min="1" step="1" required /></label>
            <label>Filed / approved SEC increase application reference<Input name="secApplicationRef" required maxLength={200} /></label>
            <label className="flex items-center gap-2 sm:col-span-2"><input name="secCriteriaMet" type="checkbox" required />Unissued authorized shares are insufficient and an application for increase is filed or approved.</label>
            <p className="text-sm text-muted-foreground sm:col-span-2">The server verifies these criteria. Otherwise record a stockholder advance, a liability, not equity.</p>
          </fieldset>}
        </>}
        {type === "subscribe" && <>
          <label className="grid gap-1">Subscriber<select name="holderId" required className={selectClass}><option value="">Choose stockholder</option>{registers.holders.map(row => <option key={row.id} value={row.id} disabled={row.active === false || row.inactive}>{row.name}{row.active === false || row.inactive ? " (inactive)" : ""}</option>)}</select></label>
          <label>Number of shares<Input name="shares" type="number" min="1" step="1" required /></label>
          <label>Price per share<Input name="price" type="number" min={registers.corp.par} step="0.000001" defaultValue={registers.corp.par} required /></label>
          <label className="grid gap-1">Source of shares<select className={selectClass} value={kind} onChange={event => setKind(event.target.value)}>
            <option value="unissued">Unissued authorized shares</option><option value="increase">Approved capital increase</option><option value="incorporation">At incorporation</option>
          </select></label>
          {kind === "increase" && <label className="grid gap-1">Approved capital increase<select name="incId" required className={selectClass}>
            <option value="">Choose SEC approval</option>{increases.map(row => <option key={row.id} value={row.id}>{row.date} · {row.secRef}</option>)}</select></label>}
          <label>Cash paid now<Input name="paid" type="number" min="0" step="0.01" defaultValue="0" required /></label>
          <label className="grid gap-1">Deposit to<select name="account" className={selectClass}>{cashOptions}</select></label>
          <label>Applied from deposits for future subscription<Input name="fromDeposits" type="number" min="0" step="0.01" defaultValue="0" required /></label>
          <label>Contract balance due date<Input name="callDue" type="date" /></label>
          <p className="text-sm text-muted-foreground sm:col-span-2">Par {peso(registers.corp.par)}; any premium is additional paid-in capital. Original-issue DST attaches to all subscribed shares, including unpaid shares. At incorporation the Form 2000 deadline follows the SEC registration month.</p>
        </>}
        {(type === "subcollect" || type === "callSubscription" || type === "issueCertificate") && <>
          <label className="grid gap-1">{type === "issueCertificate" ? "Fully paid subscription" : "Unpaid subscription"}<select name="target" required className={selectClass} defaultValue={initialTarget ?? ""} onChange={event => setCallTarget(event.target.value)}>
            <option value="">Choose subscription</option>{(type === "issueCertificate" ? ready : outstanding).map(row => <option key={row.id} value={row.id}>
              {holder(row.holderId)} · {row.date} · {row.shares} shares{entries ? ` · balance ${peso(balance(entries, "3020", row.id, date))}` : ""}</option>)}
          </select></label>
          {type === "subcollect" && <><label>Amount (blank = full balance)<Input name="amount" type="number" min="0.01" step="0.01" required={!entries} /></label>
            <label className="grid gap-1">Deposit to<select name="account" className={selectClass}>{cashOptions}</select></label><label>Memo<Input name="memo" maxLength={250} /></label></>}
          {type === "issueCertificate" && <label>Certificate number<Input name="certNo" required maxLength={40} pattern="[A-Za-z0-9-]+" /></label>}
          {type === "callSubscription" && <><label>Payment due date<Input key={`${callTarget}:due`} name="dueDate" type="date" min={date} defaultValue={calledSub?.callDue} required /></label>
            <label>Board resolution reference<Input key={`${callTarget}:ref`} name="boardRef" required maxLength={200} defaultValue={calledSub && "callRef" in calledSub ? String(calledSub.callRef) : ""} /></label>
            <p className="text-sm text-muted-foreground sm:col-span-2">Unpaid subscriptions become delinquent 30 days after the due date. The server retains the call history.</p></>}
        </>}
        {type === "capitalIncrease" && <>
          <label>New total authorized shares<Input name="to" type="number" min={registers.corp.authorized + 1} step="1" defaultValue={registers.corp.authorized * 2} required /></label>
          <label>SEC approval reference<Input name="secRef" required maxLength={200} /></label>
          <p className="text-sm text-muted-foreground sm:col-span-2">Record only after SEC approval of amended articles. The 25% subscribed / 25% paid tests are shown in the capital workpapers; this does not file an SEC application.</p>
        </>}
        {type === "shareTransfer" && <>
          <label className="grid gap-1">Transferor (seller)<select className={selectClass} value={seller} onChange={event => setSeller(event.target.value)} required>
            <option value="">Choose seller</option>{sellers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <fieldset key={`${seller}:${date}`} className="space-y-2 sm:col-span-2"><legend>Surrendered certificates</legend>
            {active.filter(row => row.holderId === seller).map(row => <label key={row.id} className="flex items-center gap-2"><input name="targets" type="checkbox" value={row.id} defaultChecked={row.id === initialTarget} />{row.no} · {row.shares} shares · issued {row.date}</label>)}
          </fieldset>
          <label className="grid gap-1">Receiving stockholder<select name="toId" required className={selectClass} value={buyer}
            onChange={event => { if (event.target.value === "__new") setNewHolderOpen(true); else setBuyer(event.target.value); }}>
            <option value="">Choose transferee</option>{registers.holders.filter(row => row.id !== seller).map(row => <option key={row.id} value={row.id} disabled={row.active === false || row.inactive}>{row.name}{row.active === false || row.inactive ? " (inactive)" : ""}</option>)}
            <option value="__new">New stockholder...</option>
          </select></label>
          <label>Shares transferred<Input name="shares" type="number" min="1" step="1" required /></label>
          <label>Price per share (optional)<Input name="price" type="number" min="0" step="0.01" /></label>
          <label>BIR eCAR reference<Input name="carRef" maxLength={120} required /></label>
          <label>Deed reference (optional)<Input name="deedRef" maxLength={200} /></label>
          <label>Buyer certificate no.<Input name="buyerNo" maxLength={40} required /></label>
          <label>Seller balance certificate no. (if shares remain)<Input name="balanceNo" maxLength={40} /></label>
          <p className="text-sm text-muted-foreground sm:col-span-2">Only fully paid, certificated shares may be transferred. Seller&apos;s DST is a reference amount, not an expense of the corporation.</p>
        </>}
        {type === "voidTransfer" && <>
          <label className="grid gap-1">Transfer<select name="target" required className={selectClass} defaultValue={initialTarget}>{reversible.map(row => <option key={row.id} value={row.id}>{row.date} · {row.carRef}</option>)}</select></label>
          <label>Reason<Input name="reason" maxLength={500} required /></label>
          <label>Historical correction evidence reference<Input name="evidenceRef" maxLength={200} /></label>
          <label className="flex items-center gap-2 sm:col-span-2"><input name="confirmHistorical" type="checkbox" />For an imported transfer, I verified source documents and the certificate chain. Subsequent transfers and dividend dependencies still block correction.</label>
        </>}
        {type === "declareDividend" && <>
          <label>Record date<Input name="recordDate" type="date" min={date} required defaultValue={defaultDate} /></label>
          <label>Cash dividend per share<Input name="perShare" type="number" min="0.000001" step="0.000001" required /></label>
          <label>Scheduled payment date<Input name="payDate" type="date" min={date} required defaultValue={defaultDate} /></label>
          <label>Board resolution reference<Input name="boardRef" maxLength={200} required /></label>
          <label className="flex items-center gap-2 sm:col-span-2"><input name="confirmUnrestricted" type="checkbox" required />I confirmed earnings available for this dividend are unrestricted.</label>
        </>}
        {type === "payDividend" && <>
          <label className="grid gap-1">Declaration<select name="target" required className={selectClass} defaultValue={initialTarget}>{payable.map(row => <option value={row.id} key={row.id}>{row.date} · {peso(row.gross)}</option>)}</select></label>
          <label className="grid gap-1">Paying cash account<select name="account" required className={selectClass}>{cashOptions}</select></label>
          <p className="text-sm text-muted-foreground sm:col-span-2">Withholding follows stockholder type. Cash dividends on delinquent subscriptions first settle the unpaid subscription balance.</p>
        </>}
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Saving..." : options.find(row => row[0] === type)?.[1]}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button></div>
      </form>}
      {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
    </CardContent>
  </Card>;
}
