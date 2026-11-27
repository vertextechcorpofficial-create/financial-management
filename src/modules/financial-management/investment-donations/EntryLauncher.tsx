"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export type EntryOption = { id: string; label: string; description?: string; disabled?: boolean };

export function EntryLauncher({ options, onSelect, disabled = false, disabledReason }: {
  options: readonly EntryOption[]; onSelect: (id: string) => void; disabled?: boolean; disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  return <div className="space-y-3">
    <Button type="button" disabled={disabled || !options.length} title={disabledReason} aria-expanded={open} onClick={() => setOpen(!open)}><Plus aria-hidden="true" /> New entry</Button>
    {disabled && disabledReason && <p className="text-sm text-muted-foreground">{disabledReason}</p>}
    {open && <section aria-label="Choose new entry" className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-2"><h2 className="font-medium">Choose an entry type</h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{options.map(option => <button type="button" key={option.id}
        disabled={option.disabled} className="rounded-md border p-3 text-left hover:bg-accent focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => { setOpen(false); onSelect(option.id); }}>
        <span className="block font-medium">{option.label}</span>{option.description && <span className="block text-sm text-muted-foreground">{option.description}</span>}
      </button>)}</div>
    </section>}
  </div>;
}
