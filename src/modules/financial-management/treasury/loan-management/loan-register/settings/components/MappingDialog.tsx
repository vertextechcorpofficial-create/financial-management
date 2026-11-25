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

import { mappingLabel, MAPPING_BLOCKS } from "../constants";
import type { GlAccountOption, SettingsMapping } from "../types";
import { OptionCombobox } from "./OptionCombobox";

/** Point one GL key at an account, or clear it. */
export function MappingDialog({
  mapping,
  chartAccounts,
  isSaving,
  onClose,
  onSubmit,
}: {
  mapping: SettingsMapping;
  chartAccounts: GlAccountOption[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (coaId: number | null, description: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(mapping.coaId === null ? "" : String(mapping.coaId));
  const [description, setDescription] = useState(mapping.description ?? "");

  const options = chartAccounts.map((row) => ({
    value: String(row.coaId),
    label: `${row.glCode} · ${row.accountTitle}`,
    searchText: `${row.glCode} ${row.accountTitle}`,
  }));

  async function submit(next: number | null) {
    const result = await onSubmit(next, description.trim());
    if (result) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{mappingLabel(mapping.mappingKey)}</DialogTitle>
          <DialogDescription>
            {mapping.mappingKey}
            {MAPPING_BLOCKS[mapping.mappingKey] ? ` · ${MAPPING_BLOCKS[mapping.mappingKey]}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <OptionCombobox
            options={options}
            value={value}
            onChange={setValue}
            placeholder="Choose a GL account"
            searchPlaceholder="Search code or title…"
            emptyLabel="No chart account matches that search."
          />
          <p className="text-xs text-muted-foreground">
            Clearing this key blocks every entry that needs it. The page says which one at the top.
          </p>
          <div className="space-y-2 pt-2">
            <Label htmlFor="mapping-usage">Usage Description</Label>
            <Textarea
              id="mapping-usage"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this line is used for"
              maxLength={255}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="outline" disabled={isSaving || mapping.coaId === null} onClick={() => void submit(null)}>
            Unmap
          </Button>
          <Button
            type="button"
            disabled={isSaving || value === ""}
            onClick={() => void submit(Number(value))}
          >
            Save mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
