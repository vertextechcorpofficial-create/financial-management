"use client";
import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem } from "@/components/ui/command";
import type { Asset } from "../types";

export function ScheduleAssetPicker({ id, assets, kind, value, onChange }: {
  id?: string; assets: Asset[]; kind: "land" | "building" | "all"; value: string; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const all = kind === "land" ? "All land" : kind === "building" ? "All buildings" : "All assets";
  const matches = assets.filter(asset => `${asset.name} ${asset.location}`.toLowerCase().includes(query.trim().toLowerCase()));
  const select = (id: string) => { onChange(id); setOpen(false); };
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setQuery(""); }}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-controls={listId} aria-label="Asset" className="w-60 justify-between">
      <span className="truncate">{assets.find(asset => asset.id === value)?.name ?? all}</span><ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-80 p-0"><Command shouldFilter={false}>
      <CommandInput autoFocus aria-controls={listId} aria-label={`Search ${kind === "land" ? "land" : kind === "building" ? "building" : "assets"}`} placeholder={`Search ${kind === "land" ? "land" : kind === "building" ? "building" : "assets"}...`} value={query} onValueChange={setQuery} />
      <CommandList id={listId}>
        <CommandItem className="sticky top-0 z-10 border-b bg-popover" value="all" onSelect={() => select("")}><Check className={!value ? "opacity-100" : "opacity-0"} />{all}</CommandItem>
        {matches.map(asset => <CommandItem key={asset.id} value={asset.id} onSelect={() => select(asset.id)}><Check className={value === asset.id ? "opacity-100" : "opacity-0"} /><span className="truncate">{asset.name}</span></CommandItem>)}
        {!matches.length && <p role="status" className="p-4 text-sm text-muted-foreground">{kind === "building" ? "No matching buildings found" : "No matching assets found"}</p>}
      </CommandList>
    </Command></PopoverContent>
  </Popover>;
}
