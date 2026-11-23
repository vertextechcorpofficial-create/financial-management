"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Asset } from "../types";
import { parseRegistrations } from "../utils/import";

export function ImportDialog({ kind, entityId, existing, lockThrough, saving, onSave, onClose }: { kind: Asset["kind"]; entityId: string; existing: Asset[]; lockThrough: string; saving: boolean; onSave: (assets: Asset[]) => Promise<boolean>; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  let assets: Asset[] = [];
  let previewError = "";
  try {
    assets = parseRegistrations(text, kind, entityId, existing, lockThrough);
  } catch (e) { previewError = e instanceof Error ? e.message : "Invalid import"; }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="sm:max-w-2xl" onInteractOutside={e => e.preventDefault()}><DialogHeader><DialogTitle>Import {kind} registrations</DialogTitle><DialogDescription>Paste CSV or spreadsheet rows. Columns: {kind === "land" ? "Name, Location, Groups, Acquired, Cost, Appreciation %, Lot area, Title no., Tax declaration no." : "Name, Land name, Groups, In service, Cost, Useful life, Salvage %, Method, Floor area, Storeys, Year built."} Separate groups with semicolons.</DialogDescription></DialogHeader>
    <Textarea aria-label="Property rows" className="min-h-48 font-mono text-xs" value={text} disabled={saving} onChange={e => { setText(e.target.value); setError(""); }} />
    <p role="status" className="text-sm text-muted-foreground">{previewError || `${assets.length} properties ready to import`}</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || !!previewError || !assets.length} onClick={async () => { if (await onSave(assets)) onClose(); else setError("Import was not saved. Review the notification, then retry."); }}>{saving ? "Saving…" : "Import properties"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
