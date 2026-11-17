"use client";
import { useEffect, useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFundRead } from "../hooks/useFunds";
import { OnboardingError } from "../providers/onboarding.api";
import type { Choice, Page } from "../onboarding-types";

export function FundingAccountChoice({ selected, disabled, onSelect, error }: { selected: Choice | null; disabled: boolean; onSelect: (choice: Choice | null) => void; error?: string }) {
  const id = useId(), [open, setOpen] = useState(false), errorId = error ? `${id}-error` : undefined;
  return <div className="min-w-0 space-y-2"><label id={id} className="text-sm font-medium">Funding cash / bank account</label>
    <Popover modal open={open} onOpenChange={setOpen}><PopoverTrigger asChild>
      <Button type="button" variant="outline" role="combobox" aria-labelledby={id} aria-expanded={open} aria-invalid={Boolean(error)} aria-describedby={errorId} disabled={disabled} className="w-full min-w-0 justify-between font-normal">
        <span className="truncate">{selected ? `${selected.code} · ${selected.name}` : "Select funding cash / bank account"}</span><ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </Button></PopoverTrigger><PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
        {open && <Choices selected={selected} onSelect={choice => { onSelect(choice); setOpen(false); }} />}
      </PopoverContent></Popover>{error && <p id={errorId} className="text-xs font-medium text-destructive">{error}</p>}
  </div>;
}
function retryableLookupError(error: Error | null | undefined): boolean {
  if (!error) return false;
  if (!(error instanceof OnboardingError)) return true;
  return error.status === 0 || error.status === 502 || error.status === 503;
}
function Choices({ selected, onSelect }: { selected: Choice | null; onSelect: (choice: Choice | null) => void }) {
  const [search, setSearch] = useState(""), [page, setPage] = useState(1), [attempt, setAttempt] = useState(0);
  const params = new URLSearchParams({ search, page: String(page), pageSize: "25" });
  const { data, error, loading, refreshing, refresh } = useFundRead<Page<Choice>>(`onboarding-approval/funding-accounts?${params}`, 250);
  const retryable = retryableLookupError(error), busy = loading || refreshing;
  const requestId = error instanceof OnboardingError ? error.requestId : undefined;
  useEffect(() => {
    if (!retryable || refreshing || attempt >= 2) return;
    const timer = window.setTimeout(() => { setAttempt(value => value + 1); refresh(); }, 1000 * (attempt + 1));
    return () => window.clearTimeout(timer);
  }, [retryable, refreshing, attempt, refresh]);
  function changeSearch(value: string) { setSearch(value); setPage(1); setAttempt(0); }
  function changePage(value: number) { setPage(value); setAttempt(0); }
  function retry() { setAttempt(0); refresh(); }
  return <Command label="Search funding accounts" shouldFilter={false} className="h-auto max-h-[var(--radix-popover-content-available-height)] [&_[data-slot=command-input-wrapper]]:shrink-0">
    <CommandInput aria-label="Search funding accounts" placeholder="Search by code or name..." value={search} onValueChange={changeSearch} />
    <CommandList aria-busy={busy} className="min-h-0 max-h-64 overflow-y-auto overscroll-contain">
      <CommandEmpty>{busy ? "Loading accounts..." : error ? <>{error.message}{requestId && <small className="mt-1 block break-all text-xs opacity-75">Reference: {requestId}</small>}</> : "No matching accounts."}</CommandEmpty><CommandGroup>
        {!busy && !error && data?.items.map(choice => <CommandItem key={choice.id} value={String(choice.id)} disabled={!choice.eligible} onSelect={() => onSelect(choice)}>
          <Check className={`mr-2 size-4 shrink-0 ${selected?.id === choice.id ? "opacity-100" : "opacity-0"}`} /><span className="min-w-0 whitespace-normal">{choice.code} · {choice.name}<small className="block text-muted-foreground">{choice.reason || `${choice.classification} · ${choice.status}`}</small></span>
        </CommandItem>)}
      </CommandGroup></CommandList>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t p-2"><Button type="button" size="sm" variant="ghost" onClick={() => onSelect(null)}>Clear selection</Button>
      {error ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={retry}>{busy ? "Retrying..." : "Retry choices"}</Button> : <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <Button type="button" aria-label="Previous accounts" size="sm" variant="outline" disabled={busy || page === 1} onClick={() => changePage(page - 1)}>Previous</Button><span className="text-xs">Page {page}</span>
        <Button type="button" aria-label="Next accounts" size="sm" variant="outline" disabled={busy || !data || page * data.pageSize >= data.total} onClick={() => changePage(page + 1)}>Next</Button></div>}
    </div>
  </Command>;
}
