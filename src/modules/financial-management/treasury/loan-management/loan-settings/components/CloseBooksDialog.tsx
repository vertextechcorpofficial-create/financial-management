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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { LOCK_BLOCKS } from "../constants";
import { DateField } from "./DateField";
import { phtToday } from "../pht";

/** Close the books through a date, with a note for the audit line. */
export function CloseBooksDialog({
  currentLockedThrough,
  isSaving,
  onClose,
  onSubmit,
}: {
  currentLockedThrough: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (lockedThrough: string, note: string) => Promise<unknown>;
}) {
  const [lockedThrough, setLockedThrough] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const dateError =
    lockedThrough === ""
      ? "Pick the date the books are closed through."
      : lockedThrough > phtToday()
        ? "The closing date cannot be in the future."
        : currentLockedThrough && lockedThrough <= currentLockedThrough
          ? `The books are already closed through ${currentLockedThrough}.`
          : "";

  async function submit() {
    setTouched(true);
    if (dateError) return;
    const result = await onSubmit(lockedThrough, note.trim());
    if (result) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[550px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Close the books</DialogTitle>
          <DialogDescription>{LOCK_BLOCKS}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label>
              Closed through <span className="text-destructive">*</span>
            </Label>
            <DateField
              value={lockedThrough}
              onChange={setLockedThrough}
              placeholder="Pick the closing date"
              maxDate={phtToday()}
              inDialog
              aria-invalid={touched && Boolean(dateError)}
            />
            {touched && dateError ? <p className="text-xs text-destructive">{dateError}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="close-note">Note</Label>
            <Input
              id="close-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. November cut-off after the board pack"
            />
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void submit()}>
            Close the books
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
