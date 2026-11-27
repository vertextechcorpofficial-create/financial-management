"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * One action button per row, with the options in a menu. Three buttons in every row made the
 * table look crowded, and the Delete explanation had nowhere to live.
 *
 * Delete is offered but disabled while anything points at the row, and the reason is printed
 * in the menu rather than hidden in a tooltip.
 */

export interface RowActionsProps {
  canEdit: boolean;
  busy: boolean;
  retired: boolean;
  usage: number;
  noun: string;
  onSave: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

export function RowActions({ canEdit, busy, retired, usage, noun, onSave, onToggle, onDelete }: RowActionsProps) {
  const blocked = usage > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={!canEdit} title={"Actions for this " + noun}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="ml-1">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Save, or take this row out of the lists
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={busy} onSelect={() => onSave()}>
          Save changes
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => onToggle()}>
          {retired ? "Restore to the lists" : "Retire from the lists"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy || blocked}
          onSelect={() => {
            if (!blocked) onDelete();
          }}
          className={blocked ? "text-muted-foreground" : "text-destructive focus:text-destructive"}
        >
          Delete
        </DropdownMenuItem>
        <div className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground">
          {blocked
            ? "Still used by " + usage + " record" + (usage === 1 ? "" : "s") + ". Retire it instead."
            : "Nothing points at this row, so it can be removed."}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
