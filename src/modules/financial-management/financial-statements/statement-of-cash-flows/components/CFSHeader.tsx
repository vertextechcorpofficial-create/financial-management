"use client";

import React, { useState } from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { CFS_ENTITIES } from "../constants/sample-data";
import { CFSEntityCode } from "../types";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CFSHeader() {
  const { filters, setEntity } = useCashFlowStudio();
  const [openCombobox, setOpenCombobox] = useState(false);
  const currentEntity = CFS_ENTITIES.find((e) => e.code === filters.entity) || CFS_ENTITIES[0];

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            FINANCIAL STATEMENTS · {currentEntity.name.toUpperCase()}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Statement of Cash Flows
        </h1>
        <p className="text-sm text-muted-foreground">
          For the year-to-date period {filters.dateRangeLabel.split(" ")[0]} {filters.dateRangeLabel.split(" ")[1]} – {filters.dateRangeLabel.split(" ")[3]} {filters.dateRangeLabel.split(" ")[4]} {filters.dateRangeLabel.split(" ")[5]}
        </p>
      </div>

      <div className="flex flex-col gap-1 md:items-end">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          ENTITY
        </span>
        <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openCombobox}
              className="w-[280px] justify-between bg-card border-muted font-medium text-xs h-9"
            >
              <span className="truncate">{currentEntity.name}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Search entity..." className="h-9 text-xs" />
              <CommandList>
                <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                  No entity found.
                </CommandEmpty>
                <CommandGroup>
                  {CFS_ENTITIES.map((ent) => (
                    <CommandItem
                      key={ent.code}
                      value={`${ent.name} ${ent.code}`}
                      onSelect={() => {
                        setEntity(ent.code as CFSEntityCode);
                        setOpenCombobox(false);
                      }}
                      className="text-xs flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {ent.code}
                        </span>
                        <span className="truncate">{ent.name}</span>
                      </div>
                      <Check
                        className={cn(
                          "ml-2 h-3.5 w-3.5 shrink-0",
                          filters.entity === ent.code ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
