"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssetHistory, LguOffice } from "../../types";
import { DOC_TYPE_LABELS, MOVEMENT_LABELS } from "../../types";

interface HistoryDialogProps {
  history: AssetHistory | null;
  offices: LguOffice[];
  onClose: () => void;
}

export function HistoryDialog({ history, offices, onClose }: HistoryDialogProps) {
  const officeName = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const o of offices) map.set(o.id, o.name);
    return map;
  }, [offices]);

  return (
    <Dialog open={Boolean(history)} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{history?.asset.property_no ?? ""}</DialogTitle>
          <DialogDescription>
            {history?.asset.description ?? ""}
            {history?.asset.accountable_officer_name
              ? " held by " + history.asset.accountable_officer_name
              : " unassigned"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <section>
            <h3 className="mb-2 text-sm font-medium">Documents</h3>
            {history && history.documents.length > 0 ? (
              <div className="grid gap-2">
                {history.documents.map((doc) => (
                  <div key={doc.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {doc.doc_type} {doc.doc_no}
                      </span>
                      <span className="text-xs text-muted-foreground">{doc.doc_date ?? ""}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {DOC_TYPE_LABELS[doc.doc_type]} issued to {doc.issued_to ?? "unknown"}
                      {doc.issued_to_office_id ? " at " + (officeName.get(doc.issued_to_office_id) ?? "unknown office") : ""}
                    </p>
                    {doc.remarks ? <p className="mt-1 text-xs">{doc.remarks}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium">Movements</h3>
            {history && history.movements.length > 0 ? (
              <div className="grid gap-2">
                {history.movements.map((movement) => {
                  const fromOffice = movement.from_office_id ? officeName.get(movement.from_office_id) ?? "-" : null;
                  const toOffice = movement.to_office_id ? officeName.get(movement.to_office_id) ?? "-" : null;
                  const sameOffice = Boolean(fromOffice) && fromOffice === toOffice;
                  return (
                  <div key={movement.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="secondary">{MOVEMENT_LABELS[movement.movement]}</Badge>
                      <span className="text-xs text-muted-foreground">{movement.movement_date ?? ""}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {movement.from_officer ? movement.from_officer : "unassigned"}
                      {!sameOffice && fromOffice ? " (" + fromOffice + ")" : ""}
                      {" to "}
                      {movement.to_officer ? movement.to_officer : "unassigned"}
                      {!sameOffice && toOffice ? " (" + toOffice + ")" : ""}
                      {sameOffice ? ", office unchanged, " + fromOffice : ""}
                    </p>
                    {movement.remarks ? <p className="mt-1 text-xs">{movement.remarks}</p> : null}
                  </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
