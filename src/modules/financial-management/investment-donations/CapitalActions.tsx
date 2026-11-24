"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accounts, peso } from "./ledger";
import { submitLedger } from "./ledger-api";
import type { LedgerRegisters } from "./server/registers";
import { certificateActiveAt } from "./certificates";

type Operation = "shareTransfer" | "voidTransfer" | "declareDividend" | "payDividend";

export function CapitalActions({ registers, defaultDate }: { registers: LedgerRegisters; defaultDate: string }) {
  const router = useRouter();
  const [type, setType] = useState<Operation | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const active = registers.certs.filter(row => certificateActiveAt(row, defaultDate));
  const reversible = registers.transfers.filter(row => !row.voidedAt);
  const payable = registers.dividends.filter(row => !row.paidAt && !row.cancelled);
  const holder = (id: string) => registers.holders.find(row => row.id === id)?.name ?? id;
  const selectClass = "h-9 rounded-md border bg-background px-2";
  const options: [Operation, string, boolean][] = [
    ["shareTransfer", "Transfer shares", active.length > 0 && registers.holders.length > 1],
    ["voidTransfer", "Void a transfer", reversible.length > 0],
    ["declareDividend", "Declare dividend", true],
    ["payDividend", "Pay dividend", payable.length > 0],
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type || saving) return;
    const form = new FormData(event.currentTarget);
    const input = type === "shareTransfer" ? {
      targets: form.getAll("targets"), toId: form.get("toId"), shares: Number(form.get("shares")),
      price: Number(form.get("price")), carRef: form.get("carRef"), deedRef: form.get("deedRef"),
      buyerNo: form.get("buyerNo"), balanceNo: String(form.get("balanceNo") ?? "").trim() || undefined,
    } : type === "voidTransfer" ? { target: form.get("target"), reason: form.get("reason"),
      evidenceRef: String(form.get("evidenceRef") ?? "").trim() || undefined, confirmHistorical: form.has("confirmHistorical") }
      : type === "declareDividend" ? { perShare: Number(form.get("perShare")),
        payDate: form.get("payDate"), confirmUnrestricted: form.has("confirmUnrestricted") }
      : { target: form.get("target"), account: form.get("account") };
    setSaving(true);
    try {
      const result = await submitLedger("capital", { ...input, type, date: form.get("date") });
      setFeedback({ ok: result.ok, text: result.ok ? result.number ? `JE-${result.number} posted.` : "Share register updated." : result.message });
      if (result.ok) { setType(null); router.refresh(); }
    } finally { setSaving(false); }
  }

  return <Card>
    <CardHeader><CardTitle>Transfers and dividends</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">Stock and GIS exports are supporting workpapers, not official SEC submissions.
        Imported-transfer corrections require source evidence and a consistent certificate chain.</p>
      {!type && <div className="flex flex-wrap gap-2">{options.map(([value, label, enabled]) =>
        <Button key={value} variant="outline" disabled={!enabled} onClick={() => { setType(value); setFeedback(undefined); }}>{label}</Button>)}</div>}
      {type && <form onSubmit={submit} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <label>{type === "declareDividend" ? "Declaration and record date" : "Date"}<Input name="date" type="date" required defaultValue={defaultDate} /></label>
        {type === "shareTransfer" && <>
          <label className="grid gap-1 sm:col-span-2">Surrendered certificates (one seller; select one or more)<select name="targets" multiple required className="min-h-32 rounded-md border bg-background p-2">
            {active.map(row => <option key={row.id} value={row.id}>{row.no} · {holder(row.holderId)} · {row.shares} shares</option>)}
          </select></label>
          <label className="grid gap-1">Receiving stockholder<select name="toId" required className={selectClass}>
            {registers.holders.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
          <label>Shares transferred<Input name="shares" type="number" min="1" step="1" required /></label>
          <label>Price per share<Input name="price" type="number" min="0" step="0.01" required /></label>
          <label>eCAR reference<Input name="carRef" maxLength={120} required /></label>
          <label>Deed reference<Input name="deedRef" maxLength={120} required /></label>
          <label>Buyer certificate no.<Input name="buyerNo" maxLength={40} required /></label>
          <label>Seller certificate no. (if shares remain)<Input name="balanceNo" maxLength={40} /></label>
        </>}
        {type === "voidTransfer" && <>
          <label className="grid gap-1">Transfer<select name="target" required className={selectClass}>
            {reversible.map(row => <option key={row.id} value={row.id}>{row.date} · {row.carRef}</option>)}
          </select></label>
          <label>Reason<Input name="reason" maxLength={500} required /></label>
          <label>Historical correction evidence reference<Input name="evidenceRef" maxLength={200} /></label>
          <label className="flex items-center gap-2 sm:col-span-2"><input name="confirmHistorical" type="checkbox" />
            For an imported transfer, I verified the source documents and certificate chain. Subsequent transfers and dividend dependencies still block correction.</label>
        </>}
        {type === "declareDividend" && <>
          <label>Cash dividend per share<Input name="perShare" type="number" min="0.000001" step="0.000001" required /></label>
          <label>Scheduled payment date<Input name="payDate" type="date" required defaultValue={defaultDate} /></label>
          <label className="flex items-center gap-2 sm:col-span-2"><input name="confirmUnrestricted" type="checkbox" required />
            I confirmed that earnings available for this dividend are unrestricted.</label>
        </>}
        {type === "payDividend" && <>
          <label className="grid gap-1">Declaration<select name="target" required className={selectClass}>
            {payable.map(row => <option value={row.id} key={row.id}>{row.date} · {peso(row.gross)}</option>)}
          </select></label>
          <label className="grid gap-1">Paying cash account<select name="account" required className={selectClass}>
            {["1000", "1010", "1020"].map(code => <option key={code} value={code}>{accounts[code]}</option>)}
          </select></label>
        </>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving}>{options.find(row => row[0] === type)?.[1]}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setType(null)}>Cancel</Button>
        </div>
      </form>}
      {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
    </CardContent>
  </Card>;
}
