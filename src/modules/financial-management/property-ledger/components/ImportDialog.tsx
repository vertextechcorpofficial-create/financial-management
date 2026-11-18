"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assetSchema, type Asset } from "../types";
import { newAsset } from "./AssetDialog";
import { newLedgerId } from "../utils/id";

/** TSV deliberately avoids ambiguous comma quoting in names and currency amounts. */
export function ImportDialog({ entityId, saving, onSave, onClose }: { entityId: string; saving: boolean; onSave: (assets: Asset[]) => Promise<boolean>; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  let assets: Asset[] = [];
  let previewError = "";
  try {
    const lines = text.trim() ? text.trim().split(/\r?\n/) : [];
    if (lines.length > 200) throw new Error("Import up to 200 properties at a time");
    assets = lines.map((line, i) => {
      const [kind, name, acquired, cost, life = "25", salvage = "10", location = ""] = line.split("\t");
      if (kind !== "land" && kind !== "building") throw new Error(`Row ${i + 1}: type must be land or building (no header row)`);
      const asset = { ...newAsset(kind, entityId), name, acquired, cost: Number(cost), location };
      if (kind === "building") asset.parts = [{ id: newLedgerId(), name: "Whole building", date: acquired, cost: Number(cost), life: Number(life || 25), salvage: Number(salvage || 10) }];
      const parsed = assetSchema.safeParse(asset);
      if (!parsed.success) throw new Error(`Row ${i + 1}: ${parsed.error.issues[0].message}`);
      return parsed.data;
    });
  } catch (e) { previewError = e instanceof Error ? e.message : "Invalid import"; }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="sm:max-w-2xl" onInteractOutside={e => e.preventDefault()}><DialogHeader><DialogTitle>Import property registrations</DialogTitle><DialogDescription>Paste tab-separated rows from a spreadsheet, without a header: type (land/building), name, acquired (YYYY-MM), cost, life (years), salvage (%), location. Properties use the selected entity. Existing records are never overwritten.</DialogDescription></DialogHeader>
    <Textarea aria-label="Tab-separated property rows" className="min-h-48 font-mono text-xs" value={text} disabled={saving} onChange={e => { setText(e.target.value); setError(""); }} placeholder={"land\tExample parcel\t2025-01\t1000000\t\t\tManila"} />
    <p role="status" className="text-sm text-muted-foreground">{previewError || `${assets.length} properties ready to import`}</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving || !!previewError || !assets.length} onClick={async () => { if (await onSave(assets)) onClose(); else setError("Import was not saved. Review the notification, then retry."); }}>{saving ? "Saving…" : "Import properties"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
