"use client";

import React, { useState, useEffect } from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
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
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyItem {
  code: string;
  name: string;
  hasKey: boolean;
  isOwnCompany: boolean;
}

export function CFSHeader() {
  const { filters, setEntity, liveSummaryData } = useCashFlowStudio();
  const [openCombobox, setOpenCombobox] = useState(false);
  const [companies, setCompanies] = useState<CompanyItem[]>([
    { code: "GRP", name: "Group (Combined before eliminations)", hasKey: true, isOwnCompany: false },
    { code: "MEN2", name: "MEN2 (Dummy ERP)", hasKey: true, isOwnCompany: false },
  ]);

  useEffect(() => {
    fetch("/api/fm/financial-statements/statement-of-cash-flow/companies")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.companies && Array.isArray(data.companies) && data.companies.length > 0) {
          setCompanies(data.companies);
        }
      })
      .catch(() => {});
  }, []);

  const currentCompany = companies.find((c) => c.code === filters.entity) || {
    code: filters.entity,
    name: liveSummaryData?.companyName || filters.entity,
    hasKey: true,
    isOwnCompany: false,
  };

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            FINANCIAL STATEMENTS · {currentCompany.name.toUpperCase()}
          </span>
          {filters.entity === "GRP" && (
            <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20 font-medium">
              Combined (before eliminations)
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Statement of Cash Flows
        </h1>
        <p className="text-sm text-muted-foreground">
          For the period {filters.startDate} to {filters.endDate}
        </p>
      </div>

      <div className="flex flex-col gap-1 md:items-end">
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          COMPANY
        </span>
        <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openCombobox}
              className="w-[300px] justify-between bg-card border-muted font-medium text-xs h-9"
            >
              <span className="truncate">{currentCompany.name}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="end">
            <Command>
              <CommandInput placeholder="Search company..." className="h-9 text-xs" />
              <CommandList>
                <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                  No company found.
                </CommandEmpty>
                <CommandGroup>
                  {companies.map((ent) => (
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
