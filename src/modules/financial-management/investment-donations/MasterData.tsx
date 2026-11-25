"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { executeLedgerCommand } from "./ledger-api";
import type { LedgerRegisters } from "./server/registers";

export const securityTaxClasses = { listed: "Listed shares / ETF (PSE)", unlisted: "Unlisted shares",
  fund: "Mutual fund / UITF", govsec: "Government securities / bonds" };
export const holderTypes = { individual: "Individual (resident)", domestic: "Domestic or resident foreign corporation",
  nrfc: "Non-resident foreign corporation", nra: "Non-resident individual" };
const selectClass = "h-9 w-full rounded-md border bg-background px-2";
type Kind = "security" | "organization" | "holder";

export function MasterData({ registers, revision = 0, kind, hideLauncher = false, initialId, initialOpen = false, onClose, onSaved, formOnly = false }: {
  registers: LedgerRegisters; revision?: number; kind: Kind; hideLauncher?: boolean;
  initialId?: string; initialOpen?: boolean; onClose?: () => void; onSaved?: (id: string) => void; formOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(initialId ?? (initialOpen ? "" : null));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const security = kind === "security" && editing ? registers.securities[editing] : undefined;
  const charity = kind === "organization" ? registers.charities.find(row => row.id === editing) : undefined;
  const holder = kind === "holder" ? registers.holders.find(row => row.id === editing) : undefined;
  const [donee, setDonee] = useState(charity?.donee ?? "accredited");
  const name = kind === "security" ? "Security" : kind === "organization" ? "Organization" : "Stockholder";
  const hasLots = security && registers.lots.some(row => row.sym === security.sym);
  const held = security && registers.lots.some(row => row.sym === security.sym && row.openQty > 0);
  const close = () => { setEditing(null); onClose?.(); };
  function open(id: string) {
    setEditing(id); setFeedback(undefined);
    setDonee(registers.charities.find(row => row.id === id)?.donee ?? "accredited");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const value = kind === "security" ? {
      sym: security?.sym ?? text("sym").toUpperCase(), name: text("name"),
      cls: hasLots ? security?.cls : text("cls"), taxClass: text("taxClass"),
      inactive: held ? false : form.has("inactive"), active: held || !form.has("inactive"),
      ...(!security ? { price: Number(form.get("price")), priceDate: text("priceDate") } : {}),
    } : kind === "holder" ? { name: text("name"), type: text("type"), tin: text("tin"),
      nationality: text("nationality"), address: text("address"), active: form.has("active"), inactive: !form.has("active") } : {
      name: text("name"), reg: text("reg"), jurisdiction: text("jurisdiction"), focus: text("focus"),
      donee, accredUntil: donee === "accredited" ? text("accredUntil") : "", expenseRatio: text("expenseRatio") === "" ? "" : Number(form.get("expenseRatio")),
      isDAF: form.has("isDAF"), notes: text("notes"), active: form.has("active"), inactive: !form.has("active"),
      checks: { reg: text("check-reg") || null, gov: text("check-gov") || null, pay: text("check-pay") || null },
    };
    setSaving(true);
    try {
      const entity = kind === "security" ? "securities" : kind === "organization" ? "charities" : "holders";
      const revisions = (registers as LedgerRegisters & { masterRevisions?: Record<string, number> }).masterRevisions;
      const result = await executeLedgerCommand({ type: "master", entity,
        operation: "upsert", id: editing || undefined, revision: revisions?.[entity] ?? revision, value });
      setFeedback({ ok: result.ok, text: result.ok ? `${name} saved.` : result.message });
      if (result.ok) {
        const savedId = kind === "security" ? security?.sym ?? text("sym").toUpperCase() :
          "id" in result && typeof result.id === "string" ? result.id : editing ?? "";
        onSaved?.(savedId); close(); router.refresh();
      }
    } catch { setFeedback({ ok: false, text: "Save could not be confirmed. Refresh before retrying." }); }
    finally { setSaving(false); }
  }
  const rows = kind === "security" ? Object.values(registers.securities).map(row => ({ id: row.sym, name: `${row.sym} · ${row.name}`,
    detail: `${securityTaxClasses[row.taxClass as keyof typeof securityTaxClasses] ?? row.taxClass}${"inactive" in row && row.inactive ? " · Inactive" : ""}` })) :
    kind === "holder" ? registers.holders.map(row => ({ id: row.id, name: row.name, detail: `${row.type} · ${row.tin || "TIN not recorded"}${row.active === false || row.inactive ? " · Inactive" : ""}` })) :
    registers.charities.map(row => ({ id: row.id, name: row.name, detail: `${row.donee} · ${row.checks.reg && row.checks.gov && row.checks.pay ? "Vetted" : "Vetting incomplete"}${row.active === false || row.inactive ? " · Inactive" : ""}` }));
  return <Card>
    <CardHeader><CardTitle>{name} register</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {editing === null && !hideLauncher && <Button type="button" variant="outline" onClick={() => open("")}>Add {name.toLowerCase()}</Button>}
      {editing !== null && <form key={`${kind}:${editing}`} onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <h3 className="font-medium sm:col-span-2">{editing ? "Edit" : "Add"} {name.toLowerCase()}</h3>
        {kind === "security" && <>
          <label>Ticker or code<Input name="sym" required maxLength={64} defaultValue={security?.sym} disabled={!!security} /></label>
          <label>Name<Input name="name" required maxLength={160} defaultValue={security?.name} /></label>
          <label className="grid gap-1">Asset class<select name="cls" className={selectClass} defaultValue={security?.cls} disabled={!!hasLots}>
            {registers.classes.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>{hasLots && <span className="text-sm text-muted-foreground">Locked after the first lot; historical ledger account is preserved.</span>}</label>
          <label className="grid gap-1">Tax class<select name="taxClass" className={selectClass} defaultValue={security?.taxClass ?? "listed"}>
            {Object.entries(securityTaxClasses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {!security && <><label>Initial price<Input name="price" type="number" min="0.000001" step="0.000001" required /></label>
            <label>Price date<Input name="priceDate" type="date" required /></label></>}
          {security && <label className="flex items-center gap-2"><input name="inactive" type="checkbox" defaultChecked={"inactive" in security && !!security.inactive} disabled={!!held} />Inactive{held ? " (units still held)" : ""}</label>}
        </>}
        {kind === "holder" && <>
          <label>Name<Input name="name" required maxLength={160} defaultValue={holder?.name} /></label>
          <label className="grid gap-1">Stockholder type<select name="type" className={selectClass} defaultValue={holder?.type ?? "individual"}>
            {Object.entries(holderTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            {holder?.type && !(holder.type in holderTypes) && <option value={holder.type}>{holder.type}</option>}
          </select></label>
          <label>TIN<Input name="tin" required pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{3}(-?[0-9]{3})?" maxLength={15} defaultValue={holder?.tin} /></label>
          <label>Nationality<Input name="nationality" required maxLength={100} defaultValue={holder?.nationality ?? "Filipino"} /></label>
          <label className="sm:col-span-2">Residential or business address<Input name="address" required maxLength={500} defaultValue={holder?.address} /></label>
        </>}
        {kind === "organization" && <>
          <label>Organization name<Input name="name" required maxLength={160} defaultValue={charity?.name} /></label>
          <label>SEC registration no.<Input name="reg" required maxLength={200} defaultValue={charity?.reg} /></label>
          <label>Jurisdiction<Input name="jurisdiction" required maxLength={100} defaultValue={charity?.jurisdiction ?? "Philippines"} /></label>
          <label className="grid gap-1">Focus area<select name="focus" className={selectClass} defaultValue={charity?.focus}>
            {[...new Set([...registers.policy.focusAreas.split(",").map(row => row.trim()).filter(Boolean), "Pooled giving fund", "Other", ...(charity?.focus ? [charity.focus] : [])])].map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label className="grid gap-1">Donee status<select className={selectClass} value={donee} onChange={event => setDonee(event.target.value)}>
            <option value="accredited">Accredited NGO (PCNC / BIR)</option><option value="government">Government (priority program)</option><option value="nonaccredited">Not accredited</option>
          </select></label>
          {donee === "accredited" && <label>Accreditation valid until<Input name="accredUntil" type="date" required defaultValue={charity?.accredUntil} /></label>}
          <label>Admin expense ratio (%)<Input name="expenseRatio" type="number" min="0" max="100" step="0.01" required defaultValue={charity?.expenseRatio ?? 0} /></label>
          <label className="flex items-center gap-2"><input name="isDAF" type="checkbox" defaultChecked={charity?.isDAF} />Pooled giving fund / re-granting foundation</label>
          <label className="sm:col-span-2">Notes<Input name="notes" maxLength={1000} defaultValue={charity?.notes} /></label>
          <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-3"><legend>Vetting dates (leave blank until verified)</legend>
            {([["reg", "Registration verified"], ["gov", "Governance verified"], ["pay", "Payment details verified"]] as const).map(([key, label]) =>
              <label key={key}>{label}<Input name={`check-${key}`} type="date" defaultValue={charity?.checks[key] ?? ""} /></label>)}
          </fieldset>
        </>}
        {kind !== "security" && <label className="flex items-center gap-2"><input name="active" type="checkbox"
          defaultChecked={((kind === "holder" ? holder : charity) as { active?: boolean } | undefined)?.active !== false} />Active record</label>}
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button></div>
      </form>}
      {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
      {!formOnly && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Name</th><th className="p-2">Status / type</th><th className="p-2">Action</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-b"><td className="p-2">{row.name}</td><td className="p-2">{row.detail}</td><td className="p-2">
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => open(row.id)}>Edit</Button></td></tr>)}</tbody></table>
        {!rows.length && <p className="py-3 text-sm text-muted-foreground">No records yet.</p>}
      </div>}
    </CardContent>
  </Card>;
}
