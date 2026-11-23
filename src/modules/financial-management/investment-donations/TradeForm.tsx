"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accounts } from "./ledger";
import { submitLedger } from "./ledger-api";
import type { LedgerRegisters } from "./server/registers";

export function TradeForm({ securities, lots, defaultDate, charities }: {
  securities: LedgerRegisters["securities"]; lots: LedgerRegisters["lots"]; defaultDate: string;
  charities?: LedgerRegisters["charities"];
}) {
  const router = useRouter();
  const options = Object.values(securities).filter(security => ["listed", "fund", "govsec", "unlisted"].includes(security.taxClass) &&
    !("inactive" in security && security.inactive));
  const [type, setType] = useState<"buy" | "sell" | "gift" | null>(null);
  const [sym, setSym] = useState(options[0]?.sym ?? "");
  const [accountType, setAccountType] = useState("Taxable");
  const [date, setDate] = useState(defaultDate);
  const [specific, setSpecific] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const eligible = lots.filter(lot => lot.sym === sym && lot.acctType === accountType && lot.date <= date && lot.openQty > 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type || saving) return;
    const form = new FormData(event.currentTarget);
    const picks = type !== "buy" && specific ? eligible.flatMap(lot => {
      const qty = Number(form.get(`lot-${lot.id}`));
      return qty ? [{ lotId: lot.id, qty }] : [];
    }) : undefined;
    if (specific && type !== "buy" && !picks?.length) {
      setResult({ ok: false, text: "Enter a quantity for at least one lot." });
      return;
    }
    setSaving(true);
    try {
      const saved = await submitLedger(type === "gift" ? "giving" : "trade", { type, sym, date, acctType: accountType, picks,
        account: form.get("account"), qty: Number(form.get("qty")), price: Number(form.get("price")),
        fees: Number(form.get("fees")), memo: form.get("memo"), target: form.get("target"), valuation: form.get("valuation") });
      setResult({ ok: saved.ok, text: saved.ok ? `JE-${saved.number} posted.` : saved.message });
      if (saved.ok) { setType(null); router.refresh(); }
    } finally { setSaving(false); }
  }

  const selectClass = "h-9 rounded-md border bg-background px-2";
  return <Card>
    <CardHeader><CardTitle>{charities ? "Securities gifts" : "Securities trades"}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {!type && <div className="flex gap-2">
        {charities ? <Button variant="outline" disabled={!options.length} onClick={() => { setResult(undefined); setType("gift"); }}>Record securities gift</Button> : <>
        <Button variant="outline" disabled={!options.length} onClick={() => { setResult(undefined); setType("buy"); }}>Record purchase</Button>
        <Button variant="outline" disabled={!options.length} onClick={() => { setResult(undefined); setType("sell"); }}>Record sale</Button>
        </>}
      </div>}
      {type && <form onSubmit={submit} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <label className="grid gap-1">Security<select className={selectClass} value={sym} onChange={event => setSym(event.target.value)}>
          {options.map(row => <option key={row.sym} value={row.sym}>{row.sym} · {row.name}</option>)}
        </select></label>
        <label>Trade date<Input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
        {type === "gift" ? <>
          <label className="grid gap-1">Donee<select className={selectClass} name="target" required>
            {charities?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>
          <label>Valuation source<Input name="valuation" required maxLength={200} /></label>
        </> : <><label className="grid gap-1">Investment account<select className={selectClass} value={accountType} onChange={event => setAccountType(event.target.value)}>
          <option>Taxable</option><option>PERA</option>
        </select></label></>}
        <label className="grid gap-1">Cash account<select name="account" className={selectClass}>
          {["1000", "1010", "1020"].map(code => <option key={code} value={code}>{accounts[code]}</option>)}
        </select></label>
        <label>Units<Input name="qty" type="number" min="0.000001" step="0.000001" required /></label>
        <label>{type === "gift" ? "Fair value per unit (PHP)" : "Price per unit (PHP)"}<Input name="price" type="number" min="0.000001" step="0.000001" required /></label>
        {type !== "gift" && <label>Trading costs, excluding STT (PHP)<Input name="fees" type="number" min="0" step="0.01" defaultValue="0" required /></label>}
        <label>Memo<Input name="memo" maxLength={250} /></label>
        {type !== "buy" && <>
          <label className="grid gap-1">Lot selection<select className={selectClass} value={specific ? "specific" : "fifo"} onChange={event => setSpecific(event.target.value === "specific")}>
            <option value="fifo">FIFO (oldest first)</option><option value="specific">Identify lots</option>
          </select></label>
          {specific && <fieldset key={`${sym}:${accountType}:${date}`} className="space-y-2 sm:col-span-2">
            <legend>Units to take from each lot</legend>
            {!eligible.length && <p>No lots available for this security, account, and date.</p>}
            {eligible.map(lot => <label key={lot.id} className="block">Lot {lot.seq} · {lot.date} · {lot.openQty} available
              <Input name={`lot-${lot.id}`} type="number" min="0" max={lot.openQty} step="0.000001" />
            </label>)}
          </fieldset>}
        </>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving}>{type === "buy" ? "Post purchase" : type === "gift" ? "Post gift" : "Post sale"}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setType(null)}>Cancel</Button>
        </div>
      </form>}
      {result && <p role={result.ok ? "status" : "alert"}>{result.text}</p>}
    </CardContent>
  </Card>;
}
