"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText, FolderOpen, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState, Panel, StatusChip } from "../console/components/ui";
import { MemberApiError, memberFetch, newRequestKey } from "./client";
import { dateTime, fileSize } from "./format";
import type { DocumentRequirement, MemberDocument } from "./types";

type DocumentMetadata = {
  id: string;
  documentTypeId: number;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  removedAt: string | null;
};

type ListResponse = { items: DocumentMetadata[]; hasMore: boolean };

export function MemberDocuments({
  userId,
  required,
  storageReady,
  initial,
  canEdit,
}: {
  userId: number;
  required: DocumentRequirement[];
  storageReady: boolean;
  initial: MemberDocument[];
  canEdit: boolean;
}) {
  const [documents, setDocuments] = useState<MemberDocument[]>(initial);
  const [documentTypeId, setDocumentTypeId] = useState(String(required[0]?.documentTypeId ?? ""));
  const [file, setFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState(() => newRequestKey());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const names = useMemo(() => new Map(required.map(row => [row.documentTypeId, row.name])), [required]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const payload = await memberFetch<ListResponse>(`/api/fm/cooperative/members/${userId}/documents`, { signal });
      setDocuments(payload.items.map(row => ({
        ...row,
        documentTypeName: names.get(row.documentTypeId) ?? `Document type ${row.documentTypeId}`,
      })));
      setError("");
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load the documents.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [userId, names]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("documentTypeId", documentTypeId);
      form.append("uploadKey", uploadKey);
      form.append("files", file);
      await memberFetch(`/api/fm/cooperative/members/${userId}/documents`, { method: "POST", body: form });
      setFile(null);
      setUploadKey(newRequestKey());
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(document: MemberDocument) {
    if (!window.confirm(`Remove ${document.filename}? The file will stay in the audit history.`)) return;
    setError("");
    try {
      await memberFetch(`/api/fm/cooperative/members/${userId}/documents/${document.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Removed from the member record" }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof MemberApiError ? cause.message : "The document could not be removed.");
    }
  }

  const missing = required.filter(row => !documents.some(document => document.documentTypeId === row.documentTypeId));
  const complete = required.length - missing.length;
  const progress = required.length ? Math.round((complete / required.length) * 100) : 100;

  return (
    <div className="space-y-4">
      {!storageReady && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Private document storage is unavailable. Uploads stay disabled until the Cooperative documents folder is protected.</p>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <Panel title="Required documents" description="The document rules come from Policies.">
        {required.length === 0 ? (
          <EmptyState>Policies do not require a membership document.</EmptyState>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", progress === 100 ? "bg-emerald-500" : "bg-amber-500")}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{complete}/{required.length} on file</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {required.map(row => {
                const isMissing = missing.some(item => item.documentTypeId === row.documentTypeId);
                return (
                  <div key={row.documentTypeId} className={cn("flex min-w-0 items-center gap-2.5 rounded-lg border p-2.5", isMissing ? "border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20" : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20")}>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", isMissing ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}>
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.name}</p>
                      <p className="text-[11px] text-muted-foreground">{isMissing ? "Needs attention" : "On file"}</p>
                    </div>
                    <span className="shrink-0"><StatusChip status={isMissing ? "PARTIAL" : "ACTIVE"} label={isMissing ? "Missing" : "Ready"} /></span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      {canEdit && required.length > 0 && (
        <Panel title="Upload a document" description="PDF, JPG, or PNG up to 10 MB.">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Document type
              <NativeSelect value={documentTypeId} onChange={event => setDocumentTypeId(event.target.value)} className="h-9 w-full">
                {required.map(row => <option key={row.documentTypeId} value={row.documentTypeId}>{row.name}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              File
              <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-2 py-1.5">
                <UploadCloud className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={event => {
                    setFile(event.target.files?.[0] ?? null);
                    setUploadKey(newRequestKey());
                  }}
                  className="h-7 border-0 bg-transparent p-0 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-background file:px-2 file:py-1 file:text-xs file:font-medium"
                />
              </div>
            </label>
            <Button type="button" size="sm" className="h-9" disabled={!storageReady || !file || uploading} onClick={upload}>
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
          {file && <p className="mt-2 text-xs text-muted-foreground">Selected: <span className="font-medium text-foreground">{file.name}</span> ({fileSize(file.size)})</p>}
        </Panel>
      )}

      <Panel
        title="Documents on file"
        description={loading ? "Refreshing documents..." : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
      >
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead><TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Size</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && documents.length === 0 && (
                <TableRow><TableCell colSpan={4}><div className="h-12 animate-pulse rounded bg-muted/50" /></TableCell></TableRow>
              )}
              {!loading && documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><FolderOpen className="size-5" /></span>
                      <p className="text-sm font-medium">No documents have been uploaded</p>
                      <p className="text-xs text-muted-foreground">Use the upload panel above to add a required file.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {documents.map(document => (
                <TableRow key={document.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><FileText className="size-4" /></span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={document.filename}>{document.filename}</p>
                        <p className="text-xs text-muted-foreground">{document.documentTypeName}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTime(document.uploadedAt)}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{fileSize(document.size)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <Button asChild size="icon" variant="ghost" className="size-8" title="Open" aria-label={`Open ${document.filename}`}>
                        <a href={`/api/fm/cooperative/members/${userId}/documents/${document.id}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a>
                      </Button>
                      <Button asChild size="icon" variant="ghost" className="size-8" title="Download" aria-label={`Download ${document.filename}`}>
                        <a href={`/api/fm/cooperative/members/${userId}/documents/${document.id}?download=1`}><Download className="size-4" /></a>
                      </Button>
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" title="Remove" aria-label={`Remove ${document.filename}`} onClick={() => void remove(document)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
