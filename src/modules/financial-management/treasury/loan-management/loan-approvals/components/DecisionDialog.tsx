"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";

import type { ApprovalQueueRow } from "../types";

export type DecisionKind = "APPROVE" | "REJECT";

const COPY: Record<DecisionKind, { title: string; verb: string; hint: string }> = {
  APPROVE: {
    title: "Approve this loan",
    verb: "Approve",
    hint: "Approving moves the loan to awaiting release. Remarks are optional; they go into the approval trail.",
  },
  REJECT: {
    title: "Reject this loan",
    verb: "Reject",
    hint: "The loan goes back to the preparer as rejected. Say what has to change — the reason is shown in the approval trail.",
  },
};

/** Mounted only while a decision is open, so the draft starts empty every time. */
export function DecisionDialog({
  kind,
  row,
  isSaving,
  onClose,
  onSubmit,
}: {
  kind: DecisionKind;
  row: ApprovalQueueRow;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const copy = COPY[kind];
  const needsReason = kind === "REJECT";
  const blocked = needsReason && text.trim().length < 3;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent showCloseButton={false} className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[550px]">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {copy.title} · {row.loanNo}
          </DialogTitle>
          <DialogDescription>
            {row.lenderName} · {formatCurrency(row.principal)} · releases {row.releaseDate}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <p className="text-xs text-muted-foreground">{copy.hint}</p>
          <div className="space-y-1.5">
            <Label htmlFor="decision-text">
              {needsReason ? (
                <>
                  Reason <span className="text-destructive">*</span>
                </>
              ) : (
                "Remarks"
              )}
            </Label>
            <Textarea
              id="decision-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                needsReason ? "What has to change before this loan can go ahead" : "Anything the preparer should know"
              }
              className="min-h-[100px] resize-none"
            />
            {blocked ? <p className="text-xs text-muted-foreground">Say why in one sentence.</p> : null}
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(text.trim())} disabled={isSaving || blocked}>
            {isSaving ? "Saving…" : copy.verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
