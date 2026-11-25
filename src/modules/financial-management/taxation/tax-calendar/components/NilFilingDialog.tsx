"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { DateField } from "./DateField";
import { phtToday } from "../pht";
import type { CalendarObligation } from "../types";

/**
 * Records a zero-peso (Nil) filing against `tax_payment` using the BIR Filing Reference Number
 * so ₱0.00 obligations can be closed without requiring a cash remittance.
 */
export function NilFilingDialog({
  obligation,
  taxYear,
  onOpenChange,
  onFiled,
}: {
  obligation: CalendarObligation | null;
  taxYear: number;
  onOpenChange: (open: boolean) => void;
  onFiled: () => void;
}) {
  const [referenceNo, setReferenceNo] = useState("");
  const [filedOn, setFiledOn] = useState(() => phtToday());
  const [remarks, setRemarks] = useState("Nil / zero return filed via eFPS / eBIRForms");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = Boolean(obligation && referenceNo.trim().length > 0 && filedOn.trim().length === 10 && !isSubmitting);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!obligation || !canSubmit) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/fm/taxation/payments-2307/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: obligation.companyId,
          taxYear,
          periodKey: obligation.periodKey,
          formCode: obligation.formCode,
          paidOn: filedOn,
          amount: 0,
          referenceNo: referenceNo.trim(),
          remarks: remarks.trim() || "Nil / zero return filed",
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.message || body?.error || "Could not record nil filing.");
      }
      toast.success(`Marked ${obligation.formCode} (${obligation.periodLabel}) as filed (Nil return).`);
      setReferenceNo("");
      onOpenChange(false);
      onFiled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record nil filing.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={obligation !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] rounded-2xl p-0 sm:max-w-[500px]">
        <form onSubmit={(event) => void handleSubmit(event)} className="flex max-h-[85vh] flex-col overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Mark as Filed (Nil / Zero Return)</DialogTitle>
            <DialogDescription>
              {obligation
                ? `${obligation.companyName} · ${obligation.formCode} (${obligation.periodLabel}) — ₱0.00 tax due.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="nil-filing-ref">
                BIR Filing Reference Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nil-filing-ref"
                value={referenceNo}
                onChange={(event) => setReferenceNo(event.target.value)}
                placeholder="e.g. eFPS / eBIRForms confirmation number"
                maxLength={80}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Date Filed <span className="text-destructive">*</span>
              </Label>
              <DateField
                value={filedOn}
                onChange={setFiledOn}
                placeholder="Pick the date filed"
                aria-label="Date filed"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nil-filing-remarks">Remarks</Label>
              <Textarea
                id="nil-filing-remarks"
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                rows={3}
                className="min-h-[100px] resize-none"
                maxLength={300}
              />
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm Nil Filing
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
