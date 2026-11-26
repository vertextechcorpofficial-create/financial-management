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
import { Paperclip, Printer } from "lucide-react";
import { FilePreviewDialog } from "../../shared/FilePreviewDialog";
import { printDocument } from "../services/documentPrint";
import type { AssetHistory, LguOffice } from "../../types";
import { DOC_TYPE_LABELS, MOVEMENT_LABELS } from "../../types";

interface HistoryDialogProps {
  history: AssetHistory | null;
  offices: LguOffice[];
  onClose: () => void;
  /** Called after a scan is attached so the caller can reload the history. */
  onUploaded?: () => void;
}

export function HistoryDialog({ history, offices, onClose, onUploaded }: HistoryDialogProps) {
  const [uploading, setUploading] = React.useState<number | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement | null>(null);
  const pendingDoc = React.useRef<number | null>(null);
  const [preview, setPreview] = React.useState<{ url: string; title: string; description: string } | null>(null);

  function pickScan(documentId: number) {
    pendingDoc.current = documentId;
    setUploadError(null);
    fileInput.current?.click();
  }

  async function uploadScan(file: File) {
    const documentId = pendingDoc.current;
    if (!documentId) return;
    setUploading(documentId);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("documentId", String(documentId));
      body.append("file", file);
      const res = await fetch("/api/fm/lgu-asset-management-system/custody/attachments", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(json?.message ?? "The scan could not be attached");
      onUploaded?.();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(null);
      pendingDoc.current = null;
    }
  }
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
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {history ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          title="Sample layout, not the official municipal blank"
                          onClick={() =>
                            printDocument({
                              asset: history.asset,
                              document: doc,
                              className: history.className ?? null,
                              conditionName: history.conditionName ?? null,
                              officeName:
                                (doc.issued_to_office_id
                                  ? officeName.get(doc.issued_to_office_id) ?? ""
                                  : history.asset.office_id
                                    ? officeName.get(history.asset.office_id) ?? ""
                                    : "") || "Office of the Municipal Accountant",
                            })
                          }
                        >
                          <Printer className="mr-1 h-3.5 w-3.5" />
                          Print form
                        </Button>
                      ) : null}
                      {doc.attachment ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPreview({
                                url: "/api/fm/lgu-asset-management-system/custody/attachments/" + doc.attachment,
                                title: doc.doc_type + " " + doc.doc_no,
                                description:
                                  DOC_TYPE_LABELS[doc.doc_type] +
                                  " issued to " +
                                  (doc.issued_to ?? "unknown") +
                                  (doc.doc_date ? " on " + doc.doc_date : ""),
                              })
                            }
                          >
                            <Paperclip className="mr-1 h-3.5 w-3.5" />
                            View scan
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={uploading === doc.id}
                            onClick={() => pickScan(doc.id)}
                          >
                            {uploading === doc.id ? "Uploading..." : "Replace"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={uploading === doc.id}
                          onClick={() => pickScan(doc.id)}
                        >
                          <Paperclip className="mr-1 h-3.5 w-3.5" />
                          {uploading === doc.id ? "Uploading..." : "Attach scan"}
                        </Button>
                      )}
                    </div>
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

        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadScan(file);
          }}
        />
        {uploadError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            {uploadError}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      <FilePreviewDialog
        open={Boolean(preview)}
        url={preview?.url ?? null}
        title={preview?.title ?? "Scan"}
        description={preview?.description ?? null}
        onClose={() => setPreview(null)}
      />
    </Dialog>
  );
}
