"use client";

import { useState } from "react";
import {
  Check, ChevronsUpDown, Loader2, RefreshCw, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonAvatar } from "../members/components";
import type { LoanEnrollmentChoices } from "../server/loan-enrollment";

type Member = LoanEnrollmentChoices["members"][number];
const pageSize = 10;

export function LoanMemberSelect({
  member,
  members,
  page,
  hasMore,
  loading,
  error,
  search,
  onSearchChange,
  onPageChange,
  onRetry,
  onSelect,
  disabled = false,
  emptyMessage = "No active members match this search.",
}: {
  member?: Member;
  members: Member[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  error?: string;
  search: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onSelect: (member: Member | undefined) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const from = members.length ? (page - 1) * pageSize + 1 : 0;
  const to = (page - 1) * pageSize + members.length;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && search) onSearchChange("");
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Member"
          disabled={disabled}
          className="h-auto min-h-11 w-full min-w-0 justify-between gap-2 py-2 text-left font-normal"
        >
          {member ? (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <PersonAvatar name={member.name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{member.name}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {member.employeeNumber} <span className="mx-1 text-muted-foreground/50">/</span> {member.department ?? "No department"}
                </span>
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <UserRound className="size-4" />
              Select member
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[min(34rem,var(--radix-popover-trigger-width))] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            aria-label="Search members"
            placeholder="Search by name, HR employee number, or department..."
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList
            className="max-h-72 overflow-y-auto overscroll-contain"
            onWheel={event => event.stopPropagation()}
            onTouchMove={event => event.stopPropagation()}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading members...
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-destructive">
                <p>{error}</p>
                <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                  <RefreshCw className="size-3.5" /> Try again
                </Button>
              </div>
            ) : members.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              <CommandGroup>
                {members.map(choice => (
                  <CommandItem
                    key={choice.id}
                    value={String(choice.id)}
                    onSelect={() => {
                      onSelect(choice);
                      setOpen(false);
                    }}
                    className="items-center gap-2 py-2"
                  >
                    <Check className={`mr-1 size-4 shrink-0 ${member?.id === choice.id ? "opacity-100" : "opacity-0"}`} />
                    <PersonAvatar name={choice.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{choice.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {choice.employeeNumber} <span className="mx-1 text-muted-foreground/50">/</span> {choice.department ?? "No department"}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-2">
            <span className="text-xs text-muted-foreground">
              {loading ? "Loading..." : members.length ? `Showing ${from}-${to}` : "No members"}
            </span>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
              <span className="min-w-12 text-center text-xs">Page {page}</span>
              <Button type="button" size="sm" variant="outline" disabled={loading || !hasMore} onClick={() => onPageChange(page + 1)}>Next</Button>
            </div>
          </div>
          {member && (
            <div className="border-t p-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                onClick={() => {
                  onSelect(undefined);
                  setOpen(false);
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
