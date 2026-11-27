"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building2, TrendingUp, Receipt, Heart, Database, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { executeLedgerCommand } from "./ledger-api";
import { mutationError, mutationToast } from "./mutation-toast";
import type { LedgerRegisters } from "./server/registers";
import { accounts, type Entry } from "./ledger";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const tabs = ["Corporation", "Investing", "Tax", "Giving", "Data"] as const;
const tabIcons = { Corporation: Building2, Investing: TrendingUp, Tax: Receipt, Giving: Heart, Data: Database };
type Field = { key: keyof LedgerRegisters["policy"]; label: string; type?: "text" | "date"; options?: readonly (readonly [string | number, string])[] };
const documentFields: Field[] = [
  { key: "docVersion", label: "Document version", type: "text" }, { key: "effectiveDate", label: "Effective date", type: "date" },
  { key: "owner", label: "Owner / decision makers", type: "text" },
  { key: "cadence", label: "Review cadence", options: [["Semi-Annual", "Semi-Annual"], ["Annual", "Annual"]] },
  { key: "fyStart", label: "Financial year starts", options: months.map((month, index) => [index + 1, month]) },
];
const investingFields: Field[] = [
  { key: "reserveMonths", label: "Reserve (months of expenses)" }, { key: "monthlyExpenses", label: "Core monthly expenses" },
  { key: "debtThreshold", label: "High-interest debt threshold (%)" }, { key: "liquidityMonths", label: "Liquidity horizon (months)" },
  { key: "liquidityNeed", label: "Known needs within horizon" }, { key: "lumpThreshold", label: "Lump-sum threshold" },
  { key: "tranches", label: "Number of monthly tranches" }, { key: "savingsTarget", label: "Annual capital-raising target" },
  { key: "costMethod", label: "Default cost-basis method for sales / gifts", options: [["specific", "Specific identification"], ["fifo", "FIFO (oldest first)"]] },
];
const taxFields: Field[] = [
  ["sttRate", "STT, listed shares (%)"], ["sttRateOld", "STT before 1 July 2025 (%)"],
  ["divFwt", "Tax on dividends received from domestic corporations (%)"], ["intFwt", "Final tax on interest (%)"],
  ["cgtUnlisted", "CGT, unlisted shares (%)"], ["dstIssue", "DST on original issue (% of par)"],
  ["dstIssueOld", "Original-issue DST before 1 July 2025 (%)"], ["dstTransfer", "Seller DST on share transfer (% of par)"],
  ["brokerRate", "Broker commission (% of gross)"], ["brokerMin", "Minimum broker commission (PHP)"],
  ["vatRate", "VAT on commission (%)"], ["pseFee", "PSE transaction fee (%)"], ["sccpFee", "SCCP clearing fee (%)"],
  ["divWhtInd", "Dividend withholding, resident individuals (%)"], ["divWhtNr", "Dividend withholding, non-residents (%)"],
  ["donorRate", "Donor's tax rate (%)"], ["donorExempt", "Annual donor's tax exemption (PHP)"],
  ["taxableIncome", "Taxable income before contributions (PHP)"], ["deductCap", "Limited gifts deduction cap (%)"],
  ["marginalRate", "Corporate income tax rate (%)"],
].map(([key, label]) => ({ key: key as Field["key"], label }));
taxFields.push({ key: "dayCount", label: "Loan interest day count", options: [[365, "Actual / 365"], [360, "Actual / 360"]] },
  { key: "itemizes", label: "Corporate deductions", options: [["yes", "Itemized deductions"], ["no", "Optional standard deduction (40% of gross income)"]] });
const givingFields: Field[] = [
  { key: "giveMode", label: "Annual giving target basis", options: [["income", "Percentage of net income"], ["gains", "Percentage of realized gains"], ["fixed", "Fixed annual budget"]] },
  { key: "givePct", label: "Share of net income (%)" }, { key: "netIncome", label: "Annual net income assumption" },
  { key: "gainsPct", label: "Share of realized gains (%)" }, { key: "giveFixed", label: "Fixed annual giving budget" },
  { key: "reviewMonth", label: "Annual review month", options: months.map((month, index) => [index, month]) },
  { key: "focusAreas", label: "Focus areas / causes (comma-separated)", type: "text" },
];

export function Policy({ registers, revision = 0, entries = [], canEdit = true, dataTools }: {
  registers: LedgerRegisters; revision?: number; entries?: readonly Entry[]; canEdit?: boolean; dataTools?: ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<typeof tabs[number]>("Corporation");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const [allocationTotal, setAllocationTotal] = useState(registers.classes.reduce((sum, row) => sum + row.target, 0));
  const revisions = (registers as LedgerRegisters & { masterRevisions?: Record<string, number> }).masterRevisions;
  const locks = (registers as LedgerRegisters & { settingsLocks?: { fyStart: boolean; par: boolean } }).settingsLocks;
  const fiscalLocked = locks?.fyStart ?? entries.some(row => row.type === "closing" && !row.reversedBy);
  const parLocked = locks?.par ?? registers.subs.length > 0;
  const mappings = (registers as LedgerRegisters & { accountMappings?: { id: string; account: string; coaCode?: string }[] }).accountMappings ?? [];
  const fields = tab === "Corporation" ? documentFields : tab === "Investing" ? investingFields : tab === "Tax" ? taxFields : givingFields;
  async function save(event: FormEvent<HTMLFormElement>, entity: "policy" | "corp" | "classes") {
    event.preventDefault();
    if (saving || !canEdit) return;
    const form = new FormData(event.currentTarget);
    const value: Record<string, unknown> = {};
    if (entity === "policy") {
      for (const field of fields) {
        if (field.key === "fyStart" && fiscalLocked) continue;
        const raw = form.get(field.key);
        if (raw !== null) value[field.key] = typeof registers.policy[field.key] === "number" ? Number(raw) : String(raw).trim();
      }
    } else if (entity === "corp") {
      value.name = String(form.get("name") ?? "").trim(); value.secReg = String(form.get("secReg") ?? "").trim();
      value.secRegDate = String(form.get("secRegDate") ?? "");
      if (!parLocked) value.par = Number(form.get("par"));
    }
    const classes = entity === "classes" ? registers.classes.map(row => ({ ...row,
      target: Number(form.get(`${row.id}-target`)), band: Number(form.get(`${row.id}-band`)), vehicles: String(form.get(`${row.id}-vehicles`) ?? "").trim() })) : [];
    setSaving(true);
    try {
      const result = await executeLedgerCommand({ type: "master", entity, operation: "upsert", revision: revisions?.[entity] ?? revision,
        value: entity === "classes" ? classes : value });
      mutationToast(result.ok, result.ok ? "Policy changes saved and audited." : result.message); setFeedback(undefined);
      if (result.ok) router.refresh();
    } catch { mutationError("Save could not be confirmed. Refresh before retrying."); setFeedback(undefined); }
    finally { setSaving(false); }
  }
  async function saveMapping(event: FormEvent<HTMLFormElement>, code: string) {
    event.preventDefault();
    if (saving || !canEdit) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const result = await executeLedgerCommand({ type: "master", entity: "accountMappings", operation: "upsert", id: code,
        revision: revisions?.accountMappings ?? revision,
        value: { id: code, account: code, coaCode: String(form.get("coaCode") ?? "").trim() } });
      mutationToast(result.ok, result.ok ? `Main COA mapping for ${code} saved.` : result.message); setFeedback(undefined);
      if (result.ok) router.refresh();
    } catch { mutationError("Mapping save could not be confirmed. Refresh before retrying."); setFeedback(undefined); }
    finally { setSaving(false); }
  }
  return <Card>
    <CardHeader><CardTitle>Policy and targets</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <nav role="tablist" aria-label="Policy sections" className="flex gap-2 overflow-x-auto border-b pb-2" onKeyDown={event => {
        const current = tabs.indexOf(tab);
        const next = event.key === "ArrowRight" ? (current + 1) % tabs.length : event.key === "ArrowLeft" ? (current + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); setTab(tabs[next]); setFeedback(undefined);
        document.getElementById(`policy-tab-${tabs[next]}`)?.focus();
      }}>{tabs.map(value => { const Icon = tabIcons[value]; return <Button key={value} type="button" role="tab" id={`policy-tab-${value}`} aria-controls={`policy-panel-${value}`} tabIndex={tab === value ? 0 : -1}
        aria-selected={tab === value} variant="ghost" className={tab === value ? "border-b-2 border-primary bg-muted font-semibold text-foreground shadow-none" : "text-muted-foreground"} onClick={() => { setTab(value); setFeedback(undefined); }}><Icon className="h-4 w-4" aria-hidden="true" />{value}</Button>; })}</nav>
      <div role="tabpanel" id={`policy-panel-${tab}`} aria-labelledby={`policy-tab-${tab}`} className="space-y-4">
        {tab !== "Data" && <form key={`${tab}:${revisions?.policy ?? revision}`} onSubmit={event => save(event, "policy")} className="space-y-3">
          <fieldset disabled={!canEdit || saving} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><legend className="mb-3 font-medium">{tab === "Corporation" ? "Document control" : tab === "Investing" ? "Pre-investment and deployment" : tab === "Tax" ? "Philippine tax settings" : "Philanthropic budget and governance"}</legend>
            {fields.map(field => <label key={field.key} className="grid content-start gap-1">{field.label}
              {field.options ? <select name={field.key} className="h-9 w-full rounded-md border bg-background px-2" defaultValue={registers.policy[field.key]} disabled={field.key === "fyStart" && fiscalLocked}>
                {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> :
                <Input name={field.key} type={field.type ?? "number"} min={field.type ? undefined : "0"} step={field.type ? undefined : "any"}
                  required defaultValue={registers.policy[field.key]} maxLength={field.type === "text" ? 1000 : undefined} />}
              {field.key === "fyStart" && fiscalLocked && <span className="text-sm text-muted-foreground">Locked after a year-end close; a change of accounting period requires BIR approval.</span>}
            </label>)}
            {tab === "Corporation" && <><label>Reporting currency<Input disabled value="PHP - Philippine peso" /></label><label>Accounting basis<Input disabled value="Accrual" /></label></>}
          </fieldset>
           <Button type="submit" disabled={saving || !canEdit} title={!canEdit ? "Approval permission or the posting source is unavailable." : undefined}><Save className="h-4 w-4" aria-hidden="true" />Save {tab === "Corporation" ? "document control" : tab.toLowerCase()} policy</Button>
        </form>}
        {tab === "Corporation" && <form key={`corp:${revisions?.corp ?? revision}`} onSubmit={event => save(event, "corp")} className="space-y-3 border-t pt-4">
          <fieldset disabled={!canEdit || saving} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><legend className="mb-3 font-medium">Articles of incorporation</legend>
            <label>Corporate name<Input name="name" required maxLength={200} defaultValue={registers.corp.name} /></label>
            <label>SEC registration no.<Input name="secReg" required maxLength={120} defaultValue={registers.corp.secReg} /></label>
            <label>SEC registration date<Input name="secRegDate" type="date" required defaultValue={registers.corp.secRegDate} /></label>
            <label>Par value per share<Input name="par" type="number" min="0.000001" step="0.000001" required defaultValue={registers.corp.par} disabled={parLocked} />
              {parLocked && <span className="text-sm text-muted-foreground">Locked after the first subscription.</span>}</label>
            <label>Authorized shares<Input disabled value={registers.corp.authorized} /></label>
          </fieldset>
          <p className="text-sm text-muted-foreground">Change authorized capital through Record capital increase, after SEC approval. Original-issue DST attaches when a subscription is accepted, even when unpaid.</p>
          {canEdit && <Button type="submit" disabled={saving}><Save className="h-4 w-4" aria-hidden="true" />Save corporation</Button>}
        </form>}
        {tab === "Investing" && <form key={`classes:${revisions?.classes ?? revision}`} onSubmit={event => save(event, "classes")} className="space-y-3 border-t pt-4"
          onChange={event => { const data = new FormData(event.currentTarget); setAllocationTotal(registers.classes.reduce((sum, row) => sum + Number(data.get(`${row.id}-target`)), 0)); }}>
          <h3 className="font-medium">Target asset allocation</h3>
          <p className={Math.abs(allocationTotal - 100) < 0.000001 ? "text-sm" : "text-sm text-destructive"} aria-live="polite">Targets total {Math.round(allocationTotal * 1e6) / 1e6}%.</p>
          <p className="text-sm text-muted-foreground">Save all weights together. Targets must total 100%; bands are percentage points. Specific identification keeps lot instructions with each sale or gift.</p>
          <fieldset disabled={!canEdit || saving} className="min-w-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Asset class</th><th className="p-2">Target (%)</th><th className="p-2">Band (+/- %)</th><th className="p-2">Primary vehicles / accounts</th></tr></thead>
            <tbody>{registers.classes.map(row => <tr key={row.id} className="border-b"><td className="p-2">{row.name}</td>
              <td className="p-2"><Input name={`${row.id}-target`} aria-label={`${row.name} target`} className="min-w-24" type="number" min="0" max="100" step="any" required defaultValue={row.target} /></td>
              <td className="p-2"><Input name={`${row.id}-band`} aria-label={`${row.name} band`} className="min-w-24" type="number" min="0" max="50" step="any" required defaultValue={row.band} /></td>
              <td className="p-2"><Input name={`${row.id}-vehicles`} aria-label={`${row.name} vehicles`} className="min-w-60" maxLength={500} defaultValue={row.vehicles} /></td></tr>)}</tbody></table></div></fieldset>
          {canEdit && <Button type="submit" disabled={saving}><Save className="h-4 w-4" aria-hidden="true" />Save allocation targets</Button>}
        </form>}
        {tab === "Tax" && <p className="text-sm text-muted-foreground">Defaults reflect a domestic corporation. Change statutory rates only for a verified law or BIR issuance; retain the supporting reference. Withholding and share taxes are calculated by posting date.</p>}
        {tab === "Data" && <>
          {dataTools ?? <p className="text-sm text-muted-foreground">Backup tools are unavailable for this workspace or role.</p>}
          <section className="space-y-3 border-t pt-4"><h3 className="font-medium">Main chart-of-accounts mappings</h3>
            <p className="text-sm text-muted-foreground">Map each subsidiary ledger account to the maintained main financial-statement COA. These mappings do not rewrite posted journal entries.</p>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Ledger code</th><th className="p-2">Ledger account</th><th className="p-2">Main COA code</th><th className="p-2">Action</th></tr></thead>
              <tbody>{Object.entries(accounts).map(([code, label]) => <tr key={code} className="border-b"><td className="p-2">{code}</td><td className="p-2">{label}</td>
                <td className="p-2"><Input key={`${code}:${revisions?.accountMappings ?? revision}`} name="coaCode" form={`coa-map-${code}`} className="min-w-36" aria-label={`Main COA code for ${code}`} maxLength={64} required
                  defaultValue={mappings.find(row => row.id === code)?.coaCode ?? ""} disabled={!canEdit || saving} /></td>
                <td className="p-2"><form id={`coa-map-${code}`} onSubmit={event => saveMapping(event, code)}>
                  <Button type="submit" variant="outline" size="sm" disabled={!canEdit || saving}><Save className="h-4 w-4" aria-hidden="true" />Save mapping</Button></form></td>
              </tr>)}</tbody></table></div>
          </section>
        </>}
      </div>
      {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
    </CardContent>
  </Card>;
}
