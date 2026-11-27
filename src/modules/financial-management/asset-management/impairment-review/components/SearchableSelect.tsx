"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export interface SearchableSelectOption {
  label: string;
  value: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "— Conclude —",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(q))
    );
  }, [options, search]);

  const selectedOption = React.useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between h-8 text-xs px-2.5 font-normal bg-background hover:bg-muted/50 border",
            !selectedOption && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] min-w-[280px] p-0 shadow-md border rounded-md z-50 bg-popover text-popover-foreground"
        align="start"
      >
        <div className="flex items-center border-b px-2.5 py-1.5 bg-muted/20">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 border-0 bg-transparent text-xs p-0 focus-visible:ring-0 focus-visible:outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-60 overflow-y-auto p-1 text-xs">
          {filteredOptions.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              No matching options.
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground transition-colors",
                    isSelected && "bg-accent/60 font-medium text-accent-foreground"
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.subLabel && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {opt.subLabel}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
