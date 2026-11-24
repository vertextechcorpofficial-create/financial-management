"use client";
import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fundDisplayLabel as fundLabel, fundMatchesSearch, normalizeFundSearch } from "../utils/fundSearch";

export type FundOption = { id: number; docNo: string; name: string; custodian?: string; custodianName?: string };

export function FundSelect({ label = "Fund", funds, value, onChange, includeAll = false, disabled = false, error, size = "default", searchPlaceholder = "Search fund number, name, or custodian...", pageSize }: {
  label?: string;
  funds: FundOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  includeAll?: boolean;
  disabled?: boolean;
  error?: string;
  size?: "sm" | "default";
  searchPlaceholder?: string;
  pageSize?: number;
}) {
  const id = useId(), errorId = error ? `${id}-error` : undefined, [open, setOpen] = useState(false), [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const selected = funds.find(fund => fund.id === value) || null;
  const normalized = normalizeFundSearch(search);
  const filtered = useMemo(() => funds.filter(fund => fundMatchesSearch(fund, search)), [funds, search]);
  const totalPages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1, currentPage = Math.min(page, totalPages);
  const choices = pageSize ? filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize) : filtered;
  const showAll = includeAll && (!normalized || "all funds".includes(normalized));
  const text = selected ? fundLabel(selected) : includeAll && value === null ? "All funds" : "Select fund";
  function select(value: number | null) { onChange(value); setOpen(false); setSearch(""); setPage(1); }
  return <div className="min-w-0 space-y-2"><label id={`${id}-label`} className="text-sm font-medium">{label}</label><Popover modal open={open} onOpenChange={next => { setOpen(next); if (!next) { setSearch(""); setPage(1); } }}><PopoverTrigger asChild>
    <Button type="button" variant="outline" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open} aria-invalid={Boolean(error)} aria-describedby={errorId} disabled={disabled} className={`w-full min-w-0 justify-between font-normal ${size === "sm" ? "h-9" : "h-10"}`}><span className="truncate">{text}</span><ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" /></Button>
  </PopoverTrigger><PopoverContent align="start" className="flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] flex-col p-0"><Command shouldFilter={false} className="h-auto min-h-0 [&_[data-slot=command-input-wrapper]]:shrink-0"><CommandInput aria-label={`Search ${label.toLowerCase()}`} placeholder={searchPlaceholder} value={search} onValueChange={value => { setSearch(value); setPage(1); }} /><CommandList className="min-h-0 max-h-72 overflow-y-auto overscroll-contain"><CommandEmpty>No matching funds.</CommandEmpty><CommandGroup>
    {showAll && <CommandItem value="ALL" onSelect={() => select(null)}><Check className={`mr-2 size-4 shrink-0 ${value === null ? "opacity-100" : "opacity-0"}`} /><span>All funds</span></CommandItem>}
    {choices.map(fund => <CommandItem key={fund.id} value={String(fund.id)} onSelect={() => select(fund.id)}><Check className={`mr-2 size-4 shrink-0 ${value === fund.id ? "opacity-100" : "opacity-0"}`} /><span className="min-w-0 whitespace-normal break-words">{fundLabel(fund)}</span></CommandItem>)}
  </CommandGroup></CommandList></Command>{pageSize && <div role="group" aria-label={`${label} choices pagination`} className="flex shrink-0 items-center justify-between gap-2 border-t p-2">
    <Button type="button" aria-label="Previous choices" size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><span aria-live="polite" className="whitespace-nowrap text-xs">Page {currentPage} of {totalPages}</span><Button type="button" aria-label="Next choices" size="sm" variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
  </div>}</PopoverContent></Popover>{error && <p id={errorId} className="text-xs font-medium text-destructive">{error}</p>}</div>;
}
