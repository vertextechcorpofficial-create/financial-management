"use client";

import { Table } from "@tanstack/react-table";
import { Search, SlidersHorizontal, X } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  showDeactivated: boolean;
  setShowDeactivated: (val: boolean) => void;
  deactivatedCount: number;
  departments: string[];
  classifications: string[];
  totalCount: number;
}

export function DataTableToolbar<TData>({
  table,
  showDeactivated,
  setShowDeactivated,
  deactivatedCount,
  departments,
  classifications,
  totalCount,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
      <div className="flex flex-1 flex-wrap items-center gap-2 w-full sm:w-auto">
        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={(table.getColumn("item_name")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn("item_name")?.setFilterValue(event.target.value)
            }
            className="h-9 pl-8 text-xs bg-background"
          />
        </div>

        {/* Department Filter Chip */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs border-dashed gap-1.5 font-normal">
              <span className="font-semibold text-muted-foreground">⊞</span> Department
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">Filter by Department</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={!table.getColumn("department_name")?.getFilterValue()}
              onCheckedChange={() => table.getColumn("department_name")?.setFilterValue(undefined)}
            >
              All Departments
            </DropdownMenuCheckboxItem>
            {departments.map((dept) => (
              <DropdownMenuCheckboxItem
                key={dept}
                checked={table.getColumn("department_name")?.getFilterValue() === dept}
                onCheckedChange={(checked) =>
                  table.getColumn("department_name")?.setFilterValue(checked ? dept : undefined)
                }
              >
                {dept}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Classification Filter Chip */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs border-dashed gap-1.5 font-normal">
              <span className="font-semibold text-muted-foreground">⊞</span> Classification
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel className="text-xs">Filter by Classification</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={!table.getColumn("classification_name")?.getFilterValue()}
              onCheckedChange={() => table.getColumn("classification_name")?.setFilterValue(undefined)}
            >
              All Classifications
            </DropdownMenuCheckboxItem>
            {classifications.map((cls) => (
              <DropdownMenuCheckboxItem
                key={cls}
                checked={table.getColumn("classification_name")?.getFilterValue() === cls}
                onCheckedChange={(checked) =>
                  table.getColumn("classification_name")?.setFilterValue(checked ? cls : undefined)
                }
              >
                {cls}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Status Filter Chip */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs border-dashed gap-1.5 font-normal">
              <span className="font-semibold text-muted-foreground">⊞</span> Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel className="text-xs">Filter by Condition</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {["New", "Good", "Under Maintenance", "Discontinued", "Poor", "Damaged", "For repair"].map(
              (status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={table.getColumn("condition")?.getFilterValue() === status}
                  onCheckedChange={(checked) =>
                    table.getColumn("condition")?.setFilterValue(checked ? status : undefined)
                  }
                >
                  {status}
                </DropdownMenuCheckboxItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Show Deactivated Checkbox */}
        <div className="flex items-center space-x-2 pl-2">
          <Checkbox
            id="show-deactivated"
            checked={showDeactivated}
            onCheckedChange={(checked) => setShowDeactivated(!!checked)}
            className="h-4 w-4"
          />
          <label
            htmlFor="show-deactivated"
            className="text-xs font-normal text-muted-foreground cursor-pointer select-none"
          >
            Show deactivated ({deactivatedCount})
          </label>
        </div>

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3 text-xs"
          >
            Reset
            <X className="ml-2 h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="text-right text-xs text-muted-foreground whitespace-nowrap font-mono self-end sm:self-center">
        {totalCount} assets · values as of {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}
