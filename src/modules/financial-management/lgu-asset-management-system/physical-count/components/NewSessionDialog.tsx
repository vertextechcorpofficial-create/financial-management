"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CountLookups, CountSessionInput } from "../../types";
import { SearchableSelect } from "../../registry/components/SearchableSelect";

interface NewSessionDialogProps {
  open: boolean;
  lookups: CountLookups;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CountSessionInput) => Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewSessionDialog({ open, lookups, busy, onClose, onSubmit }: NewSessionDialogProps) {
  const [asOf, setAsOf] = React.useState(today());
  const [officeId, setOfficeId] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [countedBy, setCountedBy] = React.useState("");
  const [verifiedBy, setVerifiedBy] = React.useState("");
  const [witnessedBy, setWitnessedBy] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setAsOf(today());
    setOfficeId("");
    setClassId("");
    setCountedBy("");
    setVerifiedBy("");
    setWitnessedBy("");
    setRemarks("");
  }, [open]);

  const officeOptions = lookups.offices.map((o) => ({ label: o.name, value: String(o.id) }));
  const classOptions = lookups.classes.map((c) => ({ label: c.name, value: String(c.id) }));

  async function submit() {
    setError(null);
    if (!asOf) return setError("The as of date is required. A count without a date cannot be reported");
    try {
      await onSubmit({
        as_of_date: asOf,
        office_id: officeId ? Number(officeId) : null,
        class_id: classId ? Number(classId) : null,
        counted_by: countedBy.trim() || null,
        verified_by: verifiedBy.trim() || null,
        witnessed_by: witnessedBy.trim() || null,
        remarks: remarks.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start a physical count</DialogTitle>
          <DialogDescription>
            The session copies one line per asset in scope. Expected officers are snapshotted now,
            so later transfers do not rewrite this count.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>As of date</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Office, blank for all</Label>
            <SearchableSelect options={officeOptions} value={officeId} onChange={setOfficeId} placeholder="All offices" />
          </div>

          <div className="grid gap-2">
            <Label>Class, blank for all</Label>
            <SearchableSelect options={classOptions} value={classId} onChange={setClassId} placeholder="All classes" />
          </div>

          <div className="grid gap-2">
            <Label>Counted by</Label>
            <Input value={countedBy} onChange={(e) => setCountedBy(e.target.value)} placeholder="Committee member" />
          </div>

          <div className="grid gap-2">
            <Label>Verified by</Label>
            <Input value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="Chair or accountant" />
          </div>

          <div className="grid gap-2">
            <Label>Witnessed by</Label>
            <Input value={witnessedBy} onChange={(e) => setWitnessedBy(e.target.value)} placeholder="COA representative, if any" />
          </div>

          <div className="sm:col-span-2 grid gap-2">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>

          {error ? (
            <div className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Creating..." : "Create session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
