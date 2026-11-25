"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { peso } from "./ledger";
import { executeLedgerCommand } from "./ledger-api";
import { parsePriceCsv, type PriceRow } from "./form-helpers";
import type { LedgerRegisters } from "./server/registers";

export function Price({ registers, defaultDate, revision = 0, hideLauncher = false, initialOpen = false, onClose, canEdit = true }: {
  registers: LedgerRegisters; defaultDate: string; revision?: number; canEdit?: boolean;
  hideLauncher?: boolean; initialOpen?: boolean; onClose?: () => void;
}) {
  const router = useRouter();
  const securities = Object.values(registers.securities);
  const editable = securities.filter(row => row.active !== false && !row.inactive);
  const [open, setOpen] = useState(initialOpen);
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [date, setDate] = useState(defaultDate);
  const [csv, setCsv] = useState("");
  const [source, setSource] = useState("manual");
  const [history, setHistory] = useState(securities[0]?.sym ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const close = () => { setOpen(false); onClose?.(); };
  let parsed: PriceRow[] = [], parseError = "";
  if (csv.trim()) {
    try { parsed = parsePriceCsv(csv, date, editable.map(row => row.sym)); }
    catch (error) { parseError = error instanceof Error ? error.message : "Invalid CSV."; }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    try {
      const prices = mode === "csv" ? parsePriceCsv(csv, date, editable.map(row => row.sym)).map(row => ({ ...row, source: source.trim() })) :
        editable.flatMap(row => {
          const raw = String(form.get(`price-${row.sym}`) ?? "");
          const price = Number(raw);
          return raw && (price !== row.price || date !== row.priceDate) ? [{ sym: row.sym, price, date, source: source.trim() }] : [];
        });
      if (!prices.length) throw new Error("Enter at least one changed price or new price date.");
      setSaving(true);
      const revisions = (registers as LedgerRegisters & { masterRevisions?: Record<string, number> }).masterRevisions;
      const result = await executeLedgerCommand({ type: "prices", revision: revisions?.prices ?? revision, prices });
      setFeedback({ ok: result.ok, text: result.ok ? `${prices.length} price(s) recorded in history.` : result.message });
      if (result.ok) { close(); router.refresh(); }
    } catch (error) { setFeedback({ ok: false, text: error instanceof Error ? error.message : "Save could not be confirmed. Refresh before retrying." }); }
    finally { setSaving(false); }
  }
  return <Card>
    <CardHeader><CardTitle>Prices and history</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {!open && !hideLauncher && <Button type="button" variant="outline" disabled={!editable.length || !canEdit} title={!canEdit ? "Preparation permission or posting service is unavailable." : undefined} onClick={() => { setOpen(true); setFeedback(undefined); }}>Update prices</Button>}
      {open && <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2"><label>Prices as of<Input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
          <label className="grid gap-1">Entry method<select className="h-9 rounded-md border bg-background px-2" value={mode} onChange={event => { setMode(event.target.value as "manual" | "csv"); setSource(event.target.value === "manual" ? "manual" : "paste"); }}>
            <option value="manual">Manual prices</option><option value="csv">Paste / import CSV</option></select></label></div>
        <label className="grid gap-1">Price source / observation reference<Input required maxLength={200} value={source} onChange={event => setSource(event.target.value)} placeholder="Broker confirmation / exchange closing price" /></label>
        {mode === "manual" ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left">
          <th className="p-2">Security</th><th className="p-2">Last price</th><th className="p-2">Price date</th><th className="p-2">New price</th>
        </tr></thead><tbody>{editable.map(row => <tr key={row.sym} className="border-b"><td className="p-2">{row.sym} · {row.name}</td>
          <td className="p-2">{peso(row.price)}</td><td className="p-2 whitespace-nowrap">{row.priceDate}</td><td className="p-2"><Input name={`price-${row.sym}`} aria-label={`New price for ${row.sym}`}
            className="min-w-32" type="number" min="0.000001" step="0.000001" defaultValue={row.price} /></td></tr>)}</tbody></table></div> : <>
          <label className="grid gap-1">Price CSV (SYMBOL, price, optional YYYY-MM-DD)
            <textarea required rows={5} className="w-full rounded-md border bg-background p-2 font-mono text-sm" value={csv}
              onChange={event => setCsv(event.target.value)} placeholder={"PHEQ,136.20,2026-11-17\nREIT,32.10"} /></label>
          <label className="grid gap-1">Import CSV file<Input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 1024 * 1024) { setFeedback({ ok: false, text: "Use a CSV file smaller than 1 MB." }); return; }
            try { setCsv(await file.text()); } catch { setFeedback({ ok: false, text: "The CSV file could not be read." }); }
          }} /></label>
          <p className="text-sm" role={parseError ? "alert" : "status"}>{parseError || `${parsed.length} valid price row(s). No prices are saved until submitted.`}</p>
          {parsed.length > 0 && !parseError && <div className="max-h-60 overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th>Symbol</th><th>Price</th><th>Date</th></tr></thead>
            <tbody>{parsed.map(row => <tr key={`${row.sym}:${row.date}`}><td>{row.sym}</td><td>{peso(row.price)}</td><td>{row.date}</td></tr>)}</tbody></table></div>}
        </>}
        <p className="text-sm text-muted-foreground">Every update retains its price date and source. Historical prices do not replace a later current price. For a correction, use a distinct source reference; existing price-history observations are never replaced.</p>
        <div className="flex gap-2"><Button type="submit" disabled={saving || !canEdit || (mode === "csv" && !!parseError)}>{saving ? "Saving..." : "Save prices"}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button></div>
      </form>}
      {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
      <details><summary className="cursor-pointer font-medium">Price history</summary>
        <label className="mt-3 grid gap-1">Security<select className="h-9 rounded-md border bg-background px-2" value={history} onChange={event => setHistory(event.target.value)}>
          {securities.map(row => <option key={row.sym}>{row.sym}</option>)}</select></label>
        <div className="max-h-80 overflow-auto"><table className="mt-3 w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Date</th><th className="p-2">Price</th><th className="p-2">Source</th></tr></thead>
          <tbody>{[...(registers.priceHist[history as keyof typeof registers.priceHist] ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map((row, index) =>
            <tr key={`${row.date}:${index}`} className="border-b"><td className="p-2">{row.date}</td><td className="p-2">{peso(row.price)}</td><td className="p-2">{row.src}</td></tr>)}</tbody></table>
          {!(registers.priceHist[history as keyof typeof registers.priceHist] ?? []).length && <p className="py-3 text-sm text-muted-foreground">No prices recorded.</p>}
        </div>
      </details>
    </CardContent>
  </Card>;
}
