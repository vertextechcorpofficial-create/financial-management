"use client";

import { useState } from "react";

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

import type { SettingsLock } from "../types";

/** Reopen a closed period. The reason is required and lands on the lock row. */
export function ReopenDialog({
  lock,
  isSaving,
  onClose,
  onSubmit,
}: {
  lock: SettingsLock;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const error = reason.trim().length < 3 ? "Say why the period is being reopened." : "";

  async function submit() {
    setTouched(true);
    if (error) return;
    const result = await onSubmit(reason.trim());
    if (result) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Remove the lock on {lock.lockedThrough}</DialogTitle>
          <DialogDescription>
            Payments and reconciliations dated on or before {lock.lockedThrough} can post again. The reason stays on
            the row.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
          <Label htmlFor="reopen-reason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. A November payment was dated in October by mistake."
            className="min-h-[100px] resize-none"
            aria-invalid={touched && Boolean(error)}
          />
          {touched && error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void submit()}>
            Remove the lock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
