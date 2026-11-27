"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { accounts, peso, type Entry } from "./ledger";
import { submitLedger } from "./ledger-api";
import { mutationError, mutationToast } from "./mutation-toast";
import type { LedgerRegisters } from "./server/registers";
import { MasterData } from "./MasterData";
import { automaticFees, donationTaxPreview, eligibleFormLots, fillLotPicks, lotUnitCost,
  previewLotCost, priorTaxableGifts, totalFees, type FeeBreakdown, type LotOrder, type LotPick } from "./form-helpers";

const selectClass = "h-9 w-full rounded-md border bg-background px-2";
const fallbackPolicy = { brokerRate: 0.25, brokerMin: 20, vatRate: 12, pseFee: 0.005, sccpFee: 0.01,
  donorRate: 6, donorExempt: 250000, itemizes: "yes", deductCap: 5, taxableIncome: 0, costMethod: "specific" };

export function DonationPreview({ date, amount, cost = amount, charity, policy, entries = [] }: {
  date: string; amount: number; cost?: number; charity?: LedgerRegisters["charities"][number];
  policy: Pick<LedgerRegisters["policy"], "donorRate" | "donorExempt" | "itemizes" | "deductCap" | "taxableIncome">;
  entries?: readonly Entry[];
}) {
  if (!charity) return <p className="text-sm text-muted-foreground">Select a recipient for the tax preview.</p>;
  const prior = priorTaxableGifts(entries, date);
  const preview = donationTaxPreview({ date, amount, cost, donee: charity.donee,
    accredUntil: charity.accredUntil, expenseRatio: charity.expenseRatio, priorTaxableGifts: prior, policy });
  return <div className="rounded-md border bg-muted/30 p-3 text-sm" aria-live="polite">
    <p className="font-medium">Indicative tax preview, subject to server validation</p>
    <p>Fair market value {peso(amount)}. Acquisition/cash basis {peso(cost)}.</p>
    <p>{policy.itemizes === "yes" ? `${preview.limited ? "Limited" : "Full"} deduction: ${peso(preview.deduction)}${preview.limited ? " before other gifts use the fiscal-year cap" : ""}.` : "No charitable deduction under the optional standard deduction election."}</p>
    <p>{preview.exempt ? "Donor's tax exempt; retain Certificate of Donation (BIR Form 2322)." :
      `Incremental donor's tax: ${peso(preview.donorTax)}. Prior taxable calendar-year gifts through this date: ${peso(prior)}. File BIR Form 1800 within 30 days.`}</p>
    {preview.expired && <p className="text-destructive">Accreditation is missing or expired on the gift date. Renew and verify the organization before posting.</p>}
    {charity.donee === "accredited" && charity.expenseRatio > 30 && <p>Admin expenses exceed 30%; the preview does not assume donor&apos;s tax exemption.</p>}
  </div>;
}

export function TradeForm({ securities, lots, defaultDate, charities, policy, entries = [], hideLauncher = false,
  initialType, initialLotId, initialSym, onClose, registers }: {
  securities: LedgerRegisters["securities"]; lots: LedgerRegisters["lots"]; defaultDate: string;
  charities?: LedgerRegisters["charities"]; policy?: LedgerRegisters["policy"]; entries?: readonly Entry[];
  hideLauncher?: boolean; initialType?: "buy" | "sell" | "gift"; initialLotId?: string; initialSym?: string; onClose?: () => void;
  registers?: LedgerRegisters;
}) {
  const router = useRouter();
  const settings = policy ?? fallbackPolicy;
  const preset = lots.find(row => row.id === initialLotId && (initialType !== "gift" || row.acctType === "Taxable"));
  const [type, setType] = useState<"buy" | "sell" | "gift" | null>(initialType ?? null);
  const [date, setDate] = useState(defaultDate);
  const options = Object.values(securities).filter(security => ["listed", "fund", "govsec", "unlisted"].includes(security.taxClass) &&
    (type === "sell" || type === "gift" ? lots.some(lot => lot.sym === security.sym && lot.openQty > 0 && lot.date <= date && (type !== "gift" || lot.acctType === "Taxable")) : !security.inactive && security.active !== false));
  const [sym, setSym] = useState(preset?.sym ?? initialSym ?? options[0]?.sym ?? "");
  const [accountType, setAccountType] = useState(initialType === "gift" ? "Taxable" : preset?.acctType ?? "Taxable");
  const [method, setMethod] = useState(preset ? "specific" : settings.costMethod);
  const [quantity, setQuantity] = useState(preset?.openQty ?? 0);
  const [price, setPrice] = useState(securities[preset?.sym ?? initialSym ?? options[0]?.sym]?.price ?? 0);
  const [picks, setPicks] = useState<LotPick[]>(preset ? [{ lotId: preset.id, qty: preset.openQty }] : []);
  const [manualFees, setManualFees] = useState<FeeBreakdown | null>(null);
  const [target, setTarget] = useState(charities?.find(row => row.active !== false && !row.inactive &&
    Object.values(row.checks).every(checked => !!checked && checked <= defaultDate))?.id ?? "");
  const [newSecurityOpen, setNewSecurityOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const security = securities[sym];
  const eligible = eligibleFormLots(lots, sym, accountType, date);
  const selected = method === "specific" ? picks.filter(pick => eligible.some(lot => lot.id === pick.lotId)) :
    quantity > 0 && Number.isFinite(quantity) && Math.round(quantity * 1e6) / 1e6 === quantity ? fillLotPicks(eligible, quantity, "oldest").picks : [];
  const selectedQty = Math.round(selected.reduce((sum, pick) => sum + pick.qty, 0) * 1e6) / 1e6;
  const gross = quantity * price;
  const fees = manualFees ?? automaticFees(gross, security?.taxClass ?? "", settings);
  const feeTotal = totalFees(fees);
  const close = () => { setType(null); onClose?.(); };
  function fill(order: LotOrder) {
    try {
      const next = fillLotPicks(eligible, quantity, order);
      setPicks(next.picks);
      setResult(next.shortfall ? { ok: false, text: `Only ${quantity - next.shortfall} units are available; shortfall ${next.shortfall}.` } : undefined);
    } catch (error) { setResult({ ok: false, text: error instanceof Error ? error.message : "Enter units first." }); }
  }
  function changePick(id: string, qty: number) {
    const next = [...picks.filter(pick => pick.lotId !== id), ...(qty > 0 ? [{ lotId: id, qty }] : [])];
    setPicks(next);
    setQuantity(Math.round(next.reduce((sum, pick) => sum + pick.qty, 0) * 1e6) / 1e6);
    setManualFees(null);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type || saving) return;
    if (type !== "buy" && (selectedQty !== quantity || !quantity)) {
      setResult({ ok: false, text: "Selected lots must cover exactly the requested units." }); return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const saved = await submitLedger(type === "gift" ? "giving" : "trade", { type, sym, date, acctType: accountType,
        picks: type !== "buy" && method === "specific" ? selected : undefined, method,
        account: form.get("account") ?? "1000", qty: quantity, price, fees: type === "gift" ? 0 : feeTotal,
        feeBreakdown: type === "gift" ? undefined : fees, memo: String(form.get("memo") ?? ""),
        source: type === "gift" ? "Securities donation" : String(form.get("source") ?? ""),
        target, valuation: String(form.get("valuation") ?? "") });
      if (saved.ok) { mutationToast(true, `JE-${saved.number} posted.`); setResult(undefined); close(); router.refresh(); }
      else { mutationError(saved.message); setResult(undefined); }
    } catch { mutationError("Save could not be confirmed. Refresh before retrying."); setResult(undefined); }
    finally { setSaving(false); }
  }
  if (hideLauncher && !type && !result) return null;
  return <Card>
    <CardHeader><CardTitle>{type === "buy" ? "Record purchase" : type === "sell" ? "Record sale" : charities ? "Securities gifts" : "Securities trades"}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {!type && !hideLauncher && <div className="flex flex-wrap gap-2">
        {(charities ? ["gift"] as const : ["buy", "sell"] as const).map(value => <Button key={value} variant="outline" disabled={!options.length && !(value === "buy" && registers)}
          onClick={() => {
            setResult(undefined); setType(value);
            if (value !== "buy" && !lots.some(lot => lot.sym === sym && lot.openQty > 0)) {
              const next = Object.values(securities).find(row => lots.some(lot => lot.sym === row.sym && lot.openQty > 0));
              setSym(next?.sym ?? ""); setPrice(next?.price ?? 0); setPicks([]);
            }
          }}>{value === "gift" ? "Record securities gift" : value === "buy" ? "Record purchase" : "Record sale"}</Button>)}
      </div>}
      {newSecurityOpen && registers && <MasterData registers={registers} kind="security" hideLauncher initialOpen formOnly
        onClose={() => setNewSecurityOpen(false)} onSaved={id => { setSym(id); setPrice(0); setPicks([]); setManualFees(null); }} />}
      {type && <form hidden={newSecurityOpen} onSubmit={submit} className={newSecurityOpen ? "hidden" : "grid gap-3 sm:grid-cols-2"}>
        <label className="grid gap-1">Security<select className={selectClass} value={sym} required onChange={event => {
          if (event.target.value === "__new") { setNewSecurityOpen(true); return; }
          setSym(event.target.value); setPrice(securities[event.target.value]?.price ?? 0); setPicks([]); setManualFees(null);
        }}>{!options.length && <option value="">Choose a security</option>}{options.map(row => <option key={row.sym} value={row.sym}>{row.sym} · {row.name}</option>)}
          {type === "buy" && registers && <option value="__new">Add a new security...</option>}</select></label>
        <label>Trade date<Input type="date" required value={date} onChange={event => { setDate(event.target.value); setPicks([]); }} /></label>
        <label className="grid gap-1">Investment account<select className={selectClass} value={accountType} onChange={event => { setAccountType(event.target.value); setPicks([]); }}>
          <option>Taxable</option>{type !== "gift" && security?.taxClass !== "unlisted" && <option>PERA</option>}
        </select></label>
        {type === "gift" ? <>
          <label className="grid gap-1">Donee<select className={selectClass} required value={target} onChange={event => setTarget(event.target.value)}>
            <option value="">Choose recipient</option>{charities?.map(row => {
              const available = row.active !== false && !row.inactive && Object.values(row.checks).every(checked => !!checked && checked <= date);
              return <option key={row.id} value={row.id} disabled={!available}>{row.name}{!available ? " (inactive / vetting incomplete on this date)" : ""}</option>;
            })}
          </select></label>
          <label>Valuation source<Input name="valuation" required maxLength={200} placeholder="PSE close / NAVPU confirmation" /></label>
        </> : <label className="grid gap-1">Cash account<select name="account" className={selectClass}>
          {["1000", "1010", "1020"].map(code => <option key={code} value={code}>{accounts[code]}</option>)}
        </select></label>}
        <label>Units<Input type="number" min="0.000001" step="0.000001" required value={quantity || ""} onChange={event => { setQuantity(Number(event.target.value)); setManualFees(null); }} /></label>
        <label>{type === "gift" ? "Fair value per unit (PHP)" : "Price per unit (PHP)"}<Input type="number" min="0.000001" step="0.000001" required value={price || ""} onChange={event => { setPrice(Number(event.target.value)); setManualFees(null); }} /></label>
        {type === "buy" && <label className="grid gap-1">Reason<select name="source" className={selectClass}>
          {["Routine contribution (DCA)", "Lump-sum tranche", "Reinvested income", "Rebalancing"].map(value => <option key={value}>{value}</option>)}
        </select></label>}
        <label>Memo / rationale<Input name="memo" maxLength={250} /></label>
        {type !== "buy" && <>
          <label className="grid gap-1">Cost-basis method<select className={selectClass} value={method} onChange={event => setMethod(event.target.value)}>
            <option value="fifo">FIFO (oldest first)</option><option value="specific">Specific identification</option>
          </select></label>
          {method === "specific" && <fieldset className="min-w-0 space-y-2 sm:col-span-2">
            <legend>Choose lots to relieve</legend>
            <div className="flex flex-wrap gap-2">{([["smallestgain", "Smallest gain first"], ["largestgain", "Largest gain first"], ["oldest", "Oldest first"]] as const).map(([order, label]) =>
              <Button type="button" key={order} variant="outline" size="sm" onClick={() => fill(order)}>{label}</Button>)}</div>
            {!eligible.length && <p>No lots available for this security, account, and date.</p>}
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">
              <th className="p-2">Acquired</th><th className="p-2">Open units</th><th className="p-2">Unit cost</th><th className="p-2">Gain / unit</th><th className="p-2">Units to use</th>
            </tr></thead><tbody>{eligible.map(lot => <tr key={lot.id} className="border-b">
              <td className="p-2 whitespace-nowrap">{lot.date}</td><td className="p-2">{lot.openQty}</td><td className="p-2">{peso(lotUnitCost(lot))}</td><td className="p-2">{peso(price - lotUnitCost(lot))}</td>
              <td className="p-2"><Input aria-label={`Units from lot ${lot.seq} acquired ${lot.date}`} className="min-w-28" type="number" min="0" max={lot.openQty} step="0.000001"
                value={picks.find(pick => pick.lotId === lot.id)?.qty ?? ""} onChange={event => changePick(lot.id, Number(event.target.value))} /></td>
            </tr>)}</tbody></table></div>
            <p className="text-sm" aria-live="polite">Selected {selectedQty} of {quantity} units; cost basis {peso(previewLotCost(eligible, selected))}.</p>
          </fieldset>}
        </>}
        {type !== "gift" && <fieldset className="space-y-2 sm:col-span-2">
          <legend>Trading costs from broker confirmation</legend>
          <div className="grid gap-3 sm:grid-cols-2">{([["comm", "Broker commission"], ["vat", "VAT on commission"], ["pse", "PSE transaction fee"], ["sccp", "SCCP clearing fee"]] as const).map(([key, label]) =>
            <label key={key}>{label}<Input type="number" min="0" step="0.01" required value={fees[key]} onChange={event => setManualFees({ ...fees, [key]: Number(event.target.value) })} /></label>)}</div>
          <Button type="button" variant="outline" size="sm" onClick={() => setManualFees(null)}>Recalculate automatic fees</Button>
          <p className="text-sm" aria-live="polite">{manualFees ? "Manual broker confirmation costs" : "Policy-estimated costs"}: {peso(feeTotal)}. Gross {peso(gross)}; {type === "buy" ? `total lot cost ${peso(gross + feeTotal)}` : `proceeds before separate STT ${peso(gross - feeTotal)}`}.</p>
          <p className="text-sm text-muted-foreground">STT is calculated separately using the trade date. Automatic listed-share fees are estimates; edit to match the broker confirmation.</p>
        </fieldset>}
        {type === "gift" && <div className="sm:col-span-2"><DonationPreview date={date} amount={gross} cost={previewLotCost(eligible, selected)}
          charity={charities?.find(row => row.id === target)} policy={settings} entries={entries} /></div>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving || !security}>{saving ? "Posting..." : type === "buy" ? "Post purchase" : type === "gift" ? "Post gift" : "Post sale"}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button>
        </div>
      </form>}
      {result && <p role={result.ok ? "status" : "alert"}>{result.text}</p>}
    </CardContent>
  </Card>;
}
