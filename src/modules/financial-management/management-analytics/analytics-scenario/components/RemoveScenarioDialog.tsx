"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import type { ScenarioRow } from "../types";

export function RemoveScenarioDialog({
  row,
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  row: ScenarioRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => Promise<void>;
  busy: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[425px]">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">Remove this scenario</DialogTitle>
          <p className="text-xs text-muted-foreground">It is deleted for good; the live levers are untouched.</p>
        </DialogHeader>
        <div className="space-y-2 px-6 py-4 text-sm">
          <p>{row ? `${row.name} goes off the saved list.` : null}</p>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={busy || !row} onClick={() => row && void onConfirm(row.id)}>
            Remove scenario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
