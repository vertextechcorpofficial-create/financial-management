"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { LineAccountBody } from "../schemas";
import type { GlAccountOption } from "../types";
import { OptionCombobox } from "./OptionCombobox";

/** The sentinel that swaps the group picker for a text field. */
const NEW_GROUP = "__new__";
const MAPPING_KEY = /^[A-Z][A-Z0-9_]{2,63}$/;

function chartOptions(chart: GlAccountOption[]) {
  // Codes are numbers to an accountant: 10001 must not sit between 1000 and 1002 because the
  // list was sorted as text.
  const ordered = [...chart].sort((left, right) => {
    const a = Number(String(left.glCode).replace(/\D/g, ""));
    const b = Number(String(right.glCode).replace(/\D/g, ""));
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
    return String(left.glCode).localeCompare(String(right.glCode), "en", { numeric: true });
  });
  return ordered.map((row) => ({
    value: String(row.coaId),
    label: `${row.glCode} · ${row.accountTitle}`,
    searchText: `${row.glCode} ${row.accountTitle}`,
  }));
}

/**
 * Add a GL line account: the key a posting asks for, the account it points at, the group it
 * sits under on the tab, and what the line is used for.
 */
export function AddLineAccountDialog({
  groups,
  chartAccounts,
  isSaving,
  onClose,
  onSubmit,
}: {
  groups: string[];
  chartAccounts: GlAccountOption[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (body: LineAccountBody) => Promise<unknown>;
}) {
  const [group, setGroup] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [coaId, setCoaId] = useState("");
  const [mappingKey, setMappingKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);

  const chosenGroup = (group === NEW_GROUP ? newGroup : group).trim();
  // Name only what is still empty. One sentence listing every requirement kept reading "choose a group"
  // after a group had been chosen, so the reader could not tell what the button was waiting for.
  const missing = [
    chosenGroup === "" ? "a group" : null,
    coaId === "" ? "a GL account" : null,
    mappingKey === "" ? "a system key" : null,
    label.trim() === "" ? "an account label" : null,
  ].filter((item): item is string => item !== null);
  const blocker = missing.length > 0
    ? `Still to fill in: ${missing.join(", ")}.`
    : MAPPING_KEY.test(mappingKey)
      ? ""
      : "A system key is uppercase letters, digits and underscores, starting with a letter.";

  async function submit() {
    setTouched(true);
    if (blocker) return;
    const result = await onSubmit({
      mappingKey,
      coaId: Number(coaId),
      mappingGroup: chosenGroup,
      mappingLabel: label.trim(),
      mappingDescription: description.trim(),
    });
    if (result) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Add Line Account</DialogTitle>
          <DialogDescription>
            A system key names the line a posting asks for. It is stored uppercase, with underscores between words.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="mapping-group">
              Category / Group <span className="text-destructive">*</span>
            </Label>
            <Select value={group || undefined} onValueChange={setGroup}>
              <SelectTrigger id="mapping-group" aria-invalid={touched && chosenGroup === ""}>
                <SelectValue placeholder="Choose a group" />
              </SelectTrigger>
              <SelectContent className="max-h-60 min-w-[200px] [&_[data-slot=select-item]]:whitespace-nowrap">
                {groups.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_GROUP}>New group…</SelectItem>
              </SelectContent>
            </Select>
            {group === NEW_GROUP ? (
              <Input
                value={newGroup}
                onChange={(event) => setNewGroup(event.target.value)}
                placeholder="e.g. Fees and charges"
                aria-label="New group name"
                maxLength={64}
                aria-invalid={touched && chosenGroup === ""}
              />
            ) : null}
            <p className="text-xs text-muted-foreground">The card the line is listed under on this tab.</p>
          </div>

          <div className="space-y-2">
            <Label>
              GL Account Mapping <span className="text-destructive">*</span>
            </Label>
            <OptionCombobox
              options={chartOptions(chartAccounts)}
              value={coaId}
              onChange={setCoaId}
              placeholder="Choose a GL account"
              searchPlaceholder="Search code or title…"
              emptyLabel="No chart account matches that search."
              aria-invalid={touched && coaId === ""}
            />
            <p className="text-xs text-muted-foreground">Every entry that asks for this key posts to that account.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mapping-key">
              System Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mapping-key"
              value={mappingKey}
              onChange={(event) => setMappingKey(event.target.value.toUpperCase())}
              placeholder="e.g. LOAN_FEE_EXPENSE"
              className="font-mono text-sm"
              maxLength={64}
              aria-invalid={touched && !MAPPING_KEY.test(mappingKey)}
            />
            <p className="text-xs text-muted-foreground">
              Uppercase letters, digits and underscores. A key that already exists is refused.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mapping-label">
              Account Label/Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mapping-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Loan fee expense"
              maxLength={120}
              aria-invalid={touched && label.trim() === ""}
            />
            <p className="text-xs text-muted-foreground">What the line is called on the tab; the key stays its identifier.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mapping-description">Usage Description</Label>
            <Textarea
              id="mapping-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this line is used for"
              maxLength={255}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">What postings this line is used for.</p>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          {blocker ? (
            <p className={cn("mr-auto text-left text-xs", touched ? "text-destructive" : "text-muted-foreground")}>{blocker}</p>
          ) : null}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
          <Button type="button" disabled={isSaving || blocker !== ""} onClick={() => void submit()}>
            Add Line Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
