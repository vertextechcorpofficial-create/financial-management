"use client";

import { useEffect, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { employeeOptions } from "./request-api";
import type { EmployeeChoice, Page } from "./types";

export function RequestEmployeePicker({ label, value, onChange, exclude, invalid, disabled }: {
  label: string; value: EmployeeChoice | null; onChange: (choice: EmployeeChoice) => void;
  exclude?: number | null; invalid?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Page<EmployeeChoice>; error?: string }>();
  const query = new URLSearchParams({ type: "employees", page: String(page), q: q.trim() });
  if (exclude) query.set("exclude", String(exclude));
  const search = query.toString();
  const key = search + "#" + attempt;
  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      employeeOptions(search, controller.signal).then(data => {
        if (!controller.signal.aborted) setResult({ key, data });
      }).catch(error => {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "Could not look up employees." });
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, search, key]);

  return <Popover open={open} onOpenChange={setOpen} modal>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} aria-invalid={invalid}
        disabled={disabled} className="w-full justify-between font-normal">
        <span className="min-w-0 truncate">{value ? value.name + " · " + value.id : "Choose " + label.toLowerCase()}</span>
        <ChevronsUpDown className="shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[90vw] p-0">
      <Command shouldFilter={false}>
        <CommandInput placeholder={"Search " + label.toLowerCase() + " by name or ID"} value={q} maxLength={120}
          onValueChange={value => { setQuery(value); setPage(1); }} />
        <CommandList>
          {!data && !error && <p className="p-3 text-sm text-muted-foreground">Loading employees…</p>}
          {error && <div role="alert" className="p-3 text-sm">{error}
            <Button type="button" variant="ghost" size="sm" onClick={() => retry(value => value + 1)}>Retry</Button>
          </div>}
          {data?.items.length === 0 && <p className="p-3 text-sm text-muted-foreground">No active employees match.</p>}
          {data?.items.map(choice => <CommandItem key={choice.id} value={String(choice.id)} onSelect={() => {
            onChange(choice); setOpen(false); setQuery(""); setPage(1);
          }}>
            <span className="min-w-0 break-words">{choice.name}
              <span className="block text-xs text-muted-foreground">{choice.id}{choice.department ? " · " + choice.department : ""}</span>
            </span>
          </CommandItem>)}
        </CommandList>
      </Command>
      {(page > 1 || data?.hasMore) && <div className="flex items-center gap-2 border-t p-2 text-xs">
        <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page}</span>
        <Button type="button" size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
      </div>}
    </PopoverContent>
  </Popover>;
}
