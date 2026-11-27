"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, DatabaseBackup, History, Upload, FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { exportFinancialStatements, exportFullJournal, exportLedgerBackup, loadLedgerSample, restoreLedgerBackup, readLedgerActivity } from "./server/commands";
import { mutationError, mutationToast } from "./mutation-toast";

export function DataTools({ maintenanceEnabled = false, canExport = true, onExportJournal }: {
  maintenanceEnabled?: boolean; canExport?: boolean; onExportJournal?: () => void;
}) {
  const actionLabels: Record<string, string> = { create: "Created", update: "Updated", delete: "Removed", restore: "Restored", export: "Exported" };
  const router = useRouter();
  const [mode, setMode] = useState<"restore" | "sample" | null>(null);
  const [backup, setBackup] = useState<unknown>();
  const [fileName, setFileName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [afterEntry, setAfterEntry] = useState(0);
  const [includeClosing, setIncludeClosing] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const [activity, setActivity] = useState<{ id: string; at: string; actor: number; action: string; entity: string; before: unknown; after: unknown }[]>();
  const maintenanceAllowed = maintenanceEnabled && process.env.NODE_ENV !== "production";
  const phrase = mode === "restore" ? "RESTORE EMPTY LEDGER" : "LOAD SAMPLE INTO EMPTY LEDGER";
  async function exportCsv(financial: boolean) {
    if (saving) return;
    setSaving(true); setFeedback(undefined);
    try {
      const result = financial ? await exportFinancialStatements({ afterEntry, includeClosing }) : await exportFullJournal();
      if (!result.ok) { mutationError(result.message); setFeedback(undefined); return; }
      const url = URL.createObjectURL(new Blob([result.content], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename;
      anchor.click(); URL.revokeObjectURL(url);
      mutationToast(true, financial ? "Mapped financial-statement workpaper exported." : "Full journal exported."); setFeedback(undefined);
    } catch { mutationError("Export could not be completed. Verify all required account mappings before retrying."); setFeedback(undefined); }
    finally { setSaving(false); }
  }
  async function exportBackup() {
    if (saving) return;
    setSaving(true); setFeedback(undefined);
    try {
      const result = await exportLedgerBackup();
      if (!result.ok) { mutationError(result.message); setFeedback(undefined); return; }
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.backup, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `capital-giving-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click(); URL.revokeObjectURL(url);
      mutationToast(true, "Backup exported. Store it securely; it contains financial records and personal data."); setFeedback(undefined);
    } catch { mutationError("Backup could not be exported."); setFeedback(undefined); }
    finally { setSaving(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !maintenanceAllowed || confirmation !== phrase || !mode) return;
    setSaving(true); setFeedback(undefined);
    try {
      const result = mode === "restore" ? await restoreLedgerBackup({ backup, confirmation }) : await loadLedgerSample({ confirmation });
      mutationToast(result.ok, result.ok ? mode === "restore" ? "Backup restored into the empty ledger." : "Sample loaded into the empty ledger." : result.message); setFeedback(undefined);
      if (result.ok) { setMode(null); setBackup(undefined); setConfirmation(""); router.refresh(); }
    } catch { mutationError("The operation could not be confirmed. Refresh before retrying."); setFeedback(undefined); }
    finally { setSaving(false); }
  }
  return <section className="space-y-3" aria-label="Data and backups">
    <h3 className="font-medium">Data and backups</h3>
    <div className="flex flex-wrap gap-2">
       {canExport && <Button type="button" variant="outline" disabled={saving} onClick={onExportJournal ?? (() => exportCsv(false))}><Download className="h-4 w-4" aria-hidden="true" />Export journal CSV</Button>}
       {canExport && <Button type="button" variant="outline" disabled={saving} onClick={exportBackup}><DatabaseBackup className="h-4 w-4" aria-hidden="true" />Back up all records</Button>}
      {canExport && <Button type="button" variant="outline" disabled={saving} onClick={async () => {
        setSaving(true); setFeedback(undefined);
        try {
          const result = await readLedgerActivity();
          if (result.ok) setActivity(result.events);
          else setFeedback({ ok: false, text: result.message });
        } catch { setFeedback({ ok: false, text: "Activity could not be loaded." }); }
        finally { setSaving(false); }
       }}><History className="h-4 w-4" aria-hidden="true" />Activity log</Button>}
       <Button type="button" variant="outline" disabled={saving || !maintenanceAllowed} onClick={() => { setMode("restore"); setConfirmation(""); setFeedback(undefined); }}><Upload className="h-4 w-4" aria-hidden="true" />Restore backup</Button>
       <Button type="button" variant="outline" disabled={saving || !maintenanceAllowed} onClick={() => { setMode("sample"); setConfirmation(""); setFeedback(undefined); }}><FlaskConical className="h-4 w-4" aria-hidden="true" />Load sample records</Button>
    </div>
    {canExport && <div className="grid max-w-2xl gap-3 rounded-md border p-3 sm:grid-cols-2">
      <h4 className="font-medium sm:col-span-2">Mapped financial-statement export</h4>
      <label>After JE number (0 = all entries)<Input type="number" min="0" step="1" value={afterEntry} disabled={saving} onChange={event => setAfterEntry(Number(event.target.value))} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={includeClosing} disabled={saving} onChange={event => setIncludeClosing(event.target.checked)} />Include year-end closing entries</label>
       <Button type="button" variant="outline" disabled={saving || !Number.isSafeInteger(afterEntry) || afterEntry < 0} onClick={() => exportCsv(true)}><Download className="h-4 w-4" aria-hidden="true" />Export mapped financial statements CSV</Button>
      <p className="text-sm text-muted-foreground sm:col-span-2">Maintain all required main-COA mappings below. Use the checkpoint to avoid exporting entries already imported into the main ledger. Exporting never records an import or changes the journal.</p>
    </div>}
    <p className="text-sm text-muted-foreground">Full-ledger exports require permission to view all workspaces. Restore and sample loading are disabled in production, require server configuration and full administrator approval permissions, and only accept an empty ledger. Existing records are never replaced or cleared.</p>
    {mode && maintenanceAllowed && <form onSubmit={submit} className="max-w-2xl space-y-3 rounded-md border p-3">
      <h4 className="font-medium">{mode === "restore" ? "Restore a verified backup" : "Load sample records"}</h4>
      {mode === "restore" && <label className="grid gap-1">Backup JSON<Input type="file" accept=".json,application/json" required disabled={saving} onChange={async event => {
        const file = event.target.files?.[0]; setBackup(undefined); setFileName(""); setFeedback(undefined);
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { setFeedback({ ok: false, text: "Use a backup smaller than 20 MB." }); return; }
        try {
          const parsed: unknown = JSON.parse(await file.text());
          if (!parsed || typeof parsed !== "object" || !("format" in parsed) || parsed.format !== "cgl-backup") throw new Error("Select a Capital and Giving Ledger backup.");
          setBackup(parsed); setFileName(file.name);
        } catch (error) { setFeedback({ ok: false, text: error instanceof Error ? error.message : "The backup could not be read." }); }
      }} /></label>}
      {fileName && mode === "restore" && <p className="text-sm">Selected {fileName}. The server verifies the checksum, schema, balances, and empty destination before restoring.</p>}
      <label className="grid gap-1">Type <span className="font-mono">{phrase}</span> to confirm<Input required value={confirmation} disabled={saving} onChange={event => setConfirmation(event.target.value)} autoComplete="off" /></label>
       <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving || confirmation !== phrase || (mode === "restore" && !backup)}><Upload className="h-4 w-4" aria-hidden="true" />{saving ? "Working..." : mode === "restore" ? "Restore into empty ledger" : "Load sample into empty ledger"}</Button>
         <Button type="button" variant="outline" disabled={saving} onClick={() => { setMode(null); setConfirmation(""); }}><X className="h-4 w-4" aria-hidden="true" />Cancel</Button></div>
    </form>}
    {feedback && <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p>}
    {activity && <div className="space-y-2"><h4 className="font-medium">Latest activity</h4>
      {activity.length === 0 && <p className="text-sm text-muted-foreground">No activity records.</p>}
       {activity.map(event => <details className="rounded-md border p-3 text-sm" key={event.id}>
         <summary className="flex cursor-pointer flex-wrap items-center gap-2"><span>{new Date(event.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</span><Badge variant="outline">Finance team member</Badge><span>{actionLabels[event.action] ?? "Activity recorded"}</span><span className="text-muted-foreground">{event.entity}</span></summary>
        <div className="mt-2 grid gap-3 md:grid-cols-2"><div>Before<pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(event.before, null, 2)}</pre></div>
          <div>After<pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(event.after, null, 2)}</pre></div></div>
      </details>)}
    </div>}
  </section>;
}
