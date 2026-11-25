"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CustodyRow, CustodyTransferInput, LguOffice } from "../../types";
import { custodyFormFor, DOC_TYPE_LABELS } from "../../types";
import { SearchableSelect } from "./SearchableSelect";

export type CustodyMode = "issue" | "transfer" | "return";

interface CustodyActionDialogProps {
  open: boolean;
  mode: CustodyMode;
  row: CustodyRow | null;
  officers: string[];
  offices: LguOffice[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CustodyTransferInput) => Promise<void>;
  onReturn: (input: { assetId: number; remarks?: string | null }) => Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CustodyActionDialog({
  open,
  mode,
  row,
  officers,
  offices,
  busy,
  onClose,
  onSubmit,
  onReturn,
}: CustodyActionDialogProps) {
  const [officer, setOfficer] = React.useState("");
  const [officeId, setOfficeId] = React.useState("");
  const [docDate, setDocDate] = React.useState(today());
  const [docNo, setDocNo] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setOfficer(mode === "transfer" ? "" : "");
    setOfficeId(row?.asset.office_id ? String(row.asset.office_id) : "");
    setDocDate(today());
    setDocNo("");
    setRemarks("");
  }, [open, mode, row]);

  const form = row ? custodyFormFor(row.asset) : "PAR";
  const officeOptions = offices.map((o) => ({ label: o.name, value: String(o.id) }));

  async function submit() {
    if (!row) return;
    setError(null);
    if (mode === "return") {
      try {
        await onReturn({ assetId: row.asset.id, remarks: remarks.trim() || null });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    if (!officer.trim()) return setError("The accountable officer is required");
    if (!docNo.trim()) return setError("The " + form + " number on the paper form is required");
    try {
      await onSubmit({
        assetId: row.asset.id,
        toOfficer: officer.trim(),
        toOfficeId: officeId ? Number(officeId) : null,
        docDate,
        docNo: docNo.trim(),
        remarks: remarks.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const title = mode === "issue" ? "Issue asset" : mode === "transfer" ? "Transfer custody" : "Return asset";

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {row ? row.asset.property_no + " " + row.asset.description : ""}
            {mode !== "return" ? " gets a " + form + ": " + DOC_TYPE_LABELS[form] + "." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 pb-2">
          {mode !== "return" ? (
            <>
              <div className="grid gap-2">
                <Label>Accountable officer</Label>
                <Input
                  list="custody-officers"
                  value={officer}
                  onChange={(e) => setOfficer(e.target.value)}
                  placeholder={row?.asset.accountable_officer_name ?? "Name of the person signing"}
                />
                <datalist id="custody-officers">
                  {officers.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground">
                  Type any name. Past names appear as suggestions.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Office</Label>
                <SearchableSelect
                  options={officeOptions}
                  value={officeId}
                  onChange={setOfficeId}
                  placeholder="Select office"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{form} number</Label>
                  <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="From the printed form" />
                </div>
                <div className="grid gap-2">
                  <Label>Date on the form</Label>
                  <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Returning clears {row?.asset.accountable_officer_name ?? "the officer"} from the asset and records the movement.
              The officer keeps the signed paper.
            </p>
          )}

          <div className="grid gap-2">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving..." : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
