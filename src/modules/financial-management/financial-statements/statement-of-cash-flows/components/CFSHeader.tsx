"use client";

import React from "react";
import { useCashFlowStudio } from "../providers/CashFlowStudioProvider";
import { CFS_ENTITIES } from "../constants/sample-data";
import { CFSEntityCode } from "../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function CFSHeader() {
  const { filters, setEntity } = useCashFlowStudio();
  const currentEntity = CFS_ENTITIES.find((e) => e.code === filters.entity) || CFS_ENTITIES[0];

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            FINANCIAL STATEMENTS · {currentEntity.name.toUpperCase()}
          </span>
          <Badge variant="outline" className="text-[10px] font-semibold bg-amber-500/10 text-amber-500 border-amber-500/30">
            PREVIEW · SAMPLE DATA
          </Badge>
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
        <Select
          value={filters.entity}
          onValueChange={(val) => setEntity(val as CFSEntityCode)}
        >
          <SelectTrigger className="w-[280px] bg-card border-muted font-medium">
            <SelectValue placeholder="Select entity" />
          </SelectTrigger>
          <SelectContent align="end">
            {CFS_ENTITIES.map((ent) => (
              <SelectItem key={ent.code} value={ent.code}>
                {ent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
