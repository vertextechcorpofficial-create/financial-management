"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";

import type { ReconciliationRow } from "../types";
import { formatDateMDY } from "../pht";
import { Notice } from "./Notice";

type Props = {
  row: ReconciliationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (row: ReconciliationRow, remarks: string) => Promise<ReconciliationRow | null>;
};

/**
 * Signing freezes the figures a period reported, so it asks first and records why.
 * A period that still shows a difference cannot be signed: the server refuses it too.
 */
export function SignOffDialog({ row, open, onOpenChange, onConfirm }: Props) {
  const [remarks, setRemarks] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) setRemarks("");
  }, [open]);

  if (!row) return null;

  const reconciled = row.result === "RECONCILED" && Math.abs(row.difference) < 0.005;

  const submit = async () => {
    setIsSaving(true);
    try {
      const signed = await onConfirm(row, remarks);
      if (signed) {
        toast.success(`The period ending ${formatDateMDY(signed.periodEnd)} is signed off.`);
        onOpenChange(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[550px]"
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base">Sign off {formatDateMDY(row.periodStart)} → {formatDateMDY(row.periodEnd)}</DialogTitle>
          <DialogDescription>
            The figures below are frozen as accepted. Nothing is recalculated afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Roll-forward closes at</dt>
              <dd className="tabular-nums">{formatCurrency(row.closingBalance)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Difference</dt>
              <dd className={reconciled ? "tabular-nums" : "tabular-nums text-destructive"}>
                {formatCurrency(row.difference)}
              </dd>
            </div>
          </dl>

          {reconciled ? null : (
            <Notice tone="danger" title="This period does not tie">
              It shows a difference of {formatCurrency(row.difference)}, so it cannot be signed off. Reconcile the
              period first; a sign-off would freeze that difference as accepted.
            </Notice>
          )}

          <div>
            <Label htmlFor="sign-off-remarks" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Remarks
            </Label>
            <Textarea
              id="sign-off-remarks"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="What was checked, and what it settled."
              rows={3}
              className="resize-none"
              disabled={!reconciled || isSaving}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
          <span title={reconciled ? undefined : "The period still shows a difference."} className="inline-flex">
            <Button type="button" onClick={() => void submit()} disabled={!reconciled || isSaving}>
              {isSaving ? "Signing…" : "Sign off"}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
