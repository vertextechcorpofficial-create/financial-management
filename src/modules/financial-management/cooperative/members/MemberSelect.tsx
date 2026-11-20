"use client";

import {
  Check, ChevronsUpDown, Loader2, RefreshCw, UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./components";
import { useMemberCandidates } from "./useMemberCandidates";
import type { MemberCandidate, MemberCandidateEligibility } from "./types";

const eligibilityLabels: Record<MemberCandidateEligibility, string> = {
  eligible: "Eligible to enroll",
  already_member: "Already a member",
  membership_closed: "Membership closed",
  inactive: "Inactive employee",
  no_posted_payroll: "No posted payroll",
  payroll_review: "Payroll needs review",
  below_take_home_floor: "Below take-home floor",
  unavailable: "Eligibility unavailable",
};

function canSelect(eligibility: MemberCandidateEligibility) {
  return eligibility === "eligible" || eligibility === "no_posted_payroll"
    || eligibility === "payroll_review" || eligibility === "below_take_home_floor";
}

export function MemberSelect({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: MemberCandidate | null;
  onSelect: (candidate: MemberCandidate | null) => void;
  disabled?: boolean;
}) {
  const choices = useMemberCandidates();
  const from = choices.total === 0 ? 0 : (choices.page - 1) * choices.pageSize + 1;
  const to = Math.min(choices.page * choices.pageSize, choices.total);

  return (
    <Popover open={choices.open} onOpenChange={choices.onOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={choices.open}
          aria-label="Employee"
          disabled={disabled}
          className="h-auto min-h-10 w-full min-w-0 justify-between gap-2 py-2 text-left font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <PersonAvatar name={selected.employeeName} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{selected.employeeName}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {selected.employeeNumber} <span className="mx-1 text-muted-foreground/50">/</span> {selected.departmentName ?? "No department"}
                </span>
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <UserRound className="size-4" />
              Select employee
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[min(34rem,var(--radix-popover-trigger-width))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            aria-label="Search employees"
            placeholder="Search by name, HR employee number, or department..."
            value={choices.search}
            onValueChange={choices.onSearchChange}
          />
          <p className="px-3 pt-2 text-xs text-muted-foreground">
            Eligibility uses today&apos;s Manila date, minimum savings, and an over-the-counter fee.
          </p>
          {choices.payrollUnavailable && (
            <div className="flex flex-wrap items-center gap-2 px-3 pt-2 text-xs text-muted-foreground">
              <p role="status">Payroll eligibility could not be checked.</p>
              <Button type="button" size="sm" variant="outline" onClick={choices.reload}>
                <RefreshCw className="size-3.5" /> Retry eligibility
              </Button>
            </div>
          )}
          <CommandList
            className="max-h-72 overflow-y-auto overscroll-contain"
            onWheel={event => event.stopPropagation()}
            onTouchMove={event => event.stopPropagation()}
          >
            {choices.loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading employees...
              </div>
            ) : choices.error ? (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-destructive">
                <p>{choices.error}</p>
                <Button type="button" size="sm" variant="outline" onClick={choices.reload}>
                  <RefreshCw className="size-3.5" /> Try again
                </Button>
              </div>
            ) : choices.items.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No employees or members match this search.
              </div>
            ) : (
              <CommandGroup>
                {choices.items.map(candidate => {
                  const selectable = canSelect(candidate.eligibility);
                  return (
                    <CommandItem
                      key={candidate.userId}
                      value={String(candidate.userId)}
                      disabled={!selectable}
                      onSelect={() => {
                        if (!selectable) return;
                        onSelect(candidate);
                        choices.onOpenChange(false);
                      }}
                      className="items-start gap-2 py-2 data-[disabled=true]:opacity-100"
                    >
                      <Check className={cn("mt-1 mr-1 size-4 shrink-0", selected?.userId !== candidate.userId && "opacity-0")} />
                      <PersonAvatar name={candidate.employeeName} size="sm" />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="min-w-0 break-words text-sm font-medium">{candidate.employeeName}</span>
                          <Badge variant="outline" className={cn(
                            "whitespace-normal text-[10px]",
                            candidate.eligibility === "eligible"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                              : selectable || candidate.eligibility === "unavailable"
                                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-muted text-muted-foreground",
                          )}>
                            {eligibilityLabels[candidate.eligibility]}
                          </Badge>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {candidate.employeeNumber} <span className="mx-1 text-muted-foreground/50">/</span> {candidate.departmentName ?? "No department"}
                        </span>
                        <span className="block text-xs text-muted-foreground">{candidate.reason}</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-2">
            <span className="text-xs text-muted-foreground">
              {choices.loading ? "Loading..." : choices.total > 0 ? `Showing ${from}-${to} of ${choices.total}` : "0 employees"}
            </span>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" disabled={choices.loading || choices.page <= 1} onClick={choices.previous}>Previous</Button>
              <span className="min-w-12 text-center text-xs">Page {choices.page}</span>
              <Button type="button" size="sm" variant="outline" disabled={choices.loading || !choices.hasMore} onClick={choices.next}>Next</Button>
            </div>
          </div>
          {selected && (
            <div className="border-t p-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onClick={() => {
                  onSelect(null);
                  choices.onOpenChange(false);
                }}
              >
                Clear selection
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
