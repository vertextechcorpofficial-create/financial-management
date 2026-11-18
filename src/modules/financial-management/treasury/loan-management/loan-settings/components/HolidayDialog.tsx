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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { HOLIDAY_KINDS, HOLIDAY_KIND_LABEL } from "../constants";
import { DateField } from "./DateField";
import type { HolidayBody } from "../schemas";
import type { HolidayKind, SettingsHoliday } from "../types";

/** Add or edit one holiday row. */
export function HolidayDialog({
  holiday,
  isSaving,
  onClose,
  onSubmit,
}: {
  holiday: SettingsHoliday | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (body: HolidayBody) => Promise<unknown>;
}) {
  const [name, setName] = useState(holiday?.name ?? "");
  const [holidayDate, setHolidayDate] = useState(holiday?.holidayDate ?? "");
  const [kind, setKind] = useState<HolidayKind>(holiday?.kind ?? "REGULAR");
  const [touched, setTouched] = useState(false);

  const nameError = name.trim().length < 2 ? "Name the holiday." : "";
  const dateError = holidayDate === "" ? "Pick the holiday date." : "";
  const invalid = Boolean(nameError || dateError);

  async function submit() {
    setTouched(true);
    if (invalid) return;
    const result = await onSubmit({ name: name.trim(), holidayDate, kind });
    if (result) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{holiday ? `Edit ${holiday.name}` : "Add a holiday"}</DialogTitle>
          <DialogDescription>
            The schedule engine moves a due date off weekends and off these dates.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="holiday-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="holiday-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ninoy Aquino Day"
              aria-invalid={touched && Boolean(nameError)}
            />
            {touched && nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>
              Date <span className="text-destructive">*</span>
            </Label>
            <DateField
              value={holidayDate}
              onChange={setHolidayDate}
              placeholder="Pick the holiday date"
              inDialog
              aria-invalid={touched && Boolean(dateError)}
            />
            {touched && dateError ? <p className="text-xs text-destructive">{dateError}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="holiday-kind">
              Kind <span className="text-destructive">*</span>
            </Label>
            <Select value={kind} onValueChange={(value) => setKind(value as HolidayKind)}>
              <SelectTrigger id="holiday-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {HOLIDAY_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {HOLIDAY_KIND_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void submit()}>
            {holiday ? "Save holiday" : "Add holiday"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
