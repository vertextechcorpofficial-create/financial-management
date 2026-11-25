"use client";

import * as React from "react";
import { FileText, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DisposalCandidate, DisposalInput } from "../types";
import { useDisposal } from "./hooks/useDisposal";

function peso(value: number): string {
  return "PHP " + value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DisposalModule() {
  const { params, patchParams, data, loading, error, busy, run, refresh } = useDisposal();
  const [target, setTarget] = React.useState<DisposalCandidate | null>(null);
  const [mode, setMode] = React.useState<"iirup" | "dispose">("iirup");
  const [docNo, setDocNo] = React.useState("");
  const [docDate, setDocDate] = React.useState(today());
  const [reason, setReason] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(data.total / (data.pageSize || 50)));

  function open(candidate: DisposalCandidate, nextMode: "iirup" | "dispose") {
    setTarget(candidate);
    setMode(nextMode);
    setDocNo("");
    setDocDate(today());
    setReason(candidate.asset.disposal_reason ?? "");
    setRemarks("");
    setFormError(null);
  }

  async function submit() {
    if (!target) return;
    setFormError(null);
    if (!docNo.trim()) return setFormError(mode === "iirup" ? "The IIRUP number is required" : "The PCV number is required");
    if (!reason.trim()) return setFormError("The reason for disposal is required");
    const payload: DisposalInput = {
      assetId: target.asset.id,
      docNo: docNo.trim(),
      docDate,
      reason: reason.trim(),
      remarks: remarks.trim() || null,
    };
    try {
      await run(mode, payload);
      setTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Disposal</h1>
          <p className="text-sm text-muted-foreground">
            Unserviceable and missing assets leave the register through an IIRUP and a PCV. Nothing is deleted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{data.total} candidates</Badge>
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={params.q}
          onChange={(e) => patchParams({ q: e.target.value, page: 1 })}
          placeholder="Search property number or description..."
          className="w-full max-w-sm"
        />
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="rounded-lg border">
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading candidates...</div>
        ) : data.candidates.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">Nothing waiting for disposal</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Assets appear here when their condition is unserviceable or obsolete, or when a count marked them missing.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property No.</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Book value</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.candidates.map((candidate) => (
                <TableRow key={candidate.asset.id}>
                  <TableCell className="font-mono text-xs">{candidate.asset.property_no}</TableCell>
                  <TableCell className="text-sm">{candidate.asset.description}</TableCell>
                  <TableCell className="text-sm">
                    {data.conditions.find((c) => c.id === candidate.asset.condition_id)?.name ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{candidate.asset.record_status}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{peso(candidate.bookValue)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => open(candidate, "iirup")}>
                        <FileText className="mr-1 h-4 w-4" /> IIRUP
                      </Button>
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => open(candidate, "dispose")}>
                        <Trash2 className="mr-1 h-4 w-4" /> Dispose
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {data.page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => patchParams({ page: data.page - 1 })}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={data.page >= totalPages} onClick={() => patchParams({ page: data.page + 1 })}>
            Next
          </Button>
        </div>
      </div>

      <Dialog open={Boolean(target)} onOpenChange={(next) => (!next ? setTarget(null) : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === "iirup" ? "File the IIRUP" : "Dispose under a PCV"}</DialogTitle>
            <DialogDescription>
              {target?.asset.property_no} {target?.asset.description}
              {mode === "dispose" ? " | carrying value " + peso(target?.bookValue ?? 0) : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{mode === "iirup" ? "IIRUP number" : "PCV number"}</Label>
              <Input value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="From the printed form" />
            </div>
            <div className="grid gap-2">
              <Label>Date on the form</Label>
              <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Unserviceable, beyond repair, missing" />
            </div>
            <div className="grid gap-2">
              <Label>Remarks</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "iirup"
                ? "Filing the inspection report records the decision. The asset stays on the register until a PCV is issued."
                : "Disposing freezes the carrying value on this date and removes the asset from the active register. It is never deleted."}
            </p>
            {formError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>
            ) : null}
          </div>

          <DialogFooter className="sticky bottom-0 z-10 -mx-6 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "Saving..." : mode === "iirup" ? "File IIRUP" : "Dispose"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
