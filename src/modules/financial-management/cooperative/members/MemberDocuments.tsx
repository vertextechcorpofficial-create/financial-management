"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileText, FolderOpen, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { maxFiles, maxFileSize } from "../document-limits";
import { EmptyState, Panel, StatusChip } from "../console/components/ui";
import { memberFetch, newRequestKey, uploadMemberDocuments } from "./client";
import { dateTime, fileSize } from "./format";
import type { DocumentRequirement, MemberDocument, MemberDocumentList } from "./types";

type DocumentType = MemberDocumentList["documentTypes"][number];

export function MemberDocuments({
  userId,
  required,
  storageReady,
  canEdit,
  onChanged,
}: {
  userId: number;
  required: DocumentRequirement[];
  storageReady: boolean;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [documentTypeId, setDocumentTypeId] = useState(String(required[0]?.documentTypeId ?? ""));
  const [files, setFiles] = useState<File[]>([]);
  const [uploadKey, setUploadKey] = useState(() => newRequestKey());
  const [filter, setFilter] = useState<DocumentType>();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ query: string; attempt: number; result?: MemberDocumentList; error?: string }>();
  const [onFile, setOnFile] = useState<DocumentType[]>();
  const [busy, setBusy] = useState<"upload" | "remove">();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = "/api/fm/cooperative/members/" + userId + "/documents";
  const query = new URLSearchParams({
    page: String(page), ...(filter ? { documentTypeId: String(filter.id) } : {}),
  }).toString();
  const current = loaded?.query === query && loaded.attempt === attempt ? loaded : undefined;
  const documents = current?.result?.items ?? [];
  const types = onFile ?? [];
  const typeOptions = filter && !types.some(type => type.id === filter.id) ? [...types, filter] : types;
  const uploadType = required.some(row => String(row.documentTypeId) === documentTypeId) ? documentTypeId : "";

  useEffect(() => {
    const controller = new AbortController();
    memberFetch<MemberDocumentList>(endpoint + "?" + query, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setOnFile(result.documentTypes);
        if (page > 1 && result.items.length === 0) setPage(page - 1);
        else setLoaded({ query, attempt, result });
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setLoaded({ query, attempt, error: cause instanceof Error ? cause.message : "Unable to load the documents." });
        }
      });
    return () => controller.abort();
  }, [endpoint, query, attempt, page]);

  function setBatch(next: File[]) {
    setFiles(next);
    setUploadKey(newRequestKey());
    setNotice("");
    setError("");
  }

  function addFiles(selected: File[]) {
    if (busy || !storageReady || !selected.length) return;
    setNotice("");
    if (files.length + selected.length > maxFiles) {
      setError("Choose up to 10 files per batch.");
      return;
    }
    const invalid = selected.find(file => !/\.(pdf|jpe?g|png)$/i.test(file.name) || file.size === 0 || file.size > maxFileSize);
    if (invalid) {
      setError(invalid.name + " must be a PDF, JPEG, or PNG file between 1 byte and 10 MB.");
      return;
    }
    setBatch([...files, ...selected]);
  }

  function refreshAfterWrite(message: string) {
    setNotice(message);
    setAttempt(value => value + 1);
    onChanged();
  }

  async function upload() {
    if (!canEdit || !storageReady || !files.length || !uploadType || busy) return;
    setBusy("upload");
    setError("");
    setNotice("");
    try {
      await uploadMemberDocuments(endpoint, uploadType, uploadKey, files);
      setBatch([]);
      refreshAfterWrite(files.length === 1 ? "Document uploaded." : files.length + " documents uploaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The documents could not be uploaded.");
    } finally {
      setBusy(undefined);
    }
  }

  async function remove(document: MemberDocument) {
    if (!canEdit || busy) return;
    if (!window.confirm(`Remove ${document.filename}? The file will stay in the audit history.`)) return;
    setBusy("remove");
    setError("");
    setNotice("");
    try {
      await memberFetch(endpoint + "/" + document.id, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Removed from the member record" }),
      });
      refreshAfterWrite("Document removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The document could not be removed.");
    } finally {
      setBusy(undefined);
    }
  }

  const missing = required.filter(row => !types.some(type => type.id === row.documentTypeId));
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
        ) : !onFile ? (
          <p className="text-sm text-muted-foreground">{current?.error ? "Document compliance is unavailable." : "Checking required documents…"}</p>
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
        <Panel title="Upload documents" description="Choose one document type per batch. Add up to 10 PDF, JPEG, or PNG files, each up to 10 MB.">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor="cooperative-upload-type" className="block text-xs font-medium text-muted-foreground">Document type</label>
              <NativeSelect
                id="cooperative-upload-type"
                value={uploadType}
                disabled={!storageReady || Boolean(busy)}
                onChange={event => {
                  setDocumentTypeId(event.target.value);
                  setBatch(files);
                }}
                className="h-9 w-full"
              >
                <option value="" disabled>Choose a document type</option>
                {required.map(row => <option key={row.documentTypeId} value={row.documentTypeId}>{row.name}</option>)}
              </NativeSelect>
            </div>
            <label
              className="space-y-1.5 text-xs font-medium text-muted-foreground"
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              Add files
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-2 py-1.5">
                <UploadCloud className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  type="file"
                  multiple
                  aria-label="Choose files"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  disabled={!storageReady || Boolean(busy)}
                  onChange={event => {
                    addFiles(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                  className="h-7 border-0 bg-transparent p-0 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-background file:px-2 file:py-1 file:text-xs file:font-medium"
                />
              </div>
              <span className="block font-normal">You can also drop files here.</span>
            </label>
          </div>
          {files.length > 0 && (
            <ul aria-label="Files to upload" className="mt-3 divide-y rounded-lg border">
              {files.map((file, index) => (
                <li key={index} className="flex items-center gap-2 px-2 py-1 text-sm">
                  <span className="min-w-0 flex-1 break-all">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fileSize(file.size)}</span>
                  <Button
                    type="button" variant="ghost" size="icon" className="size-8 shrink-0"
                    aria-label={"Remove " + file.name + " from batch"} disabled={Boolean(busy)}
                    onClick={() => setBatch(files.filter((_, fileIndex) => fileIndex !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" disabled={!storageReady || !files.length || !uploadType || Boolean(busy)} onClick={() => void upload()}>
              {busy === "upload" ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
              {busy === "upload" ? "Uploading…" : files.length ? "Upload " + files.length + (files.length === 1 ? " file" : " files") : "Upload"}
            </Button>
            {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
          </div>
        </Panel>
      )}

      <Panel
        title="Documents on file"
      >
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="space-y-1.5">
            <label htmlFor="cooperative-document-filter" className="block text-xs font-medium text-muted-foreground">Filter by document type</label>
            <NativeSelect
              id="cooperative-document-filter"
              className="h-9 w-full"
              value={filter?.id ?? ""}
              onChange={event => {
                setFilter(typeOptions.find(type => String(type.id) === event.target.value));
                setPage(1);
              }}
            >
              <option value="">All document types</option>
              {typeOptions.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
            </NativeSelect>
          </div>
          <span className="text-xs text-muted-foreground">
            {current?.result && documents.length + (documents.length === 1 ? " document on this page" : " documents on this page")}
          </span>
        </div>
        {current?.error && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-destructive">
            <p>{current.error}</p>
            <Button variant="outline" size="sm" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead><TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Size</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!current && (
                <TableRow><TableCell colSpan={4}><p role="status" className="p-2 text-sm text-muted-foreground">Loading documents…</p></TableCell></TableRow>
              )}
              {current?.result && documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><FolderOpen className="size-5" /></span>
                      <p className="text-sm font-medium">{filter ? "No documents match this type." : "No documents have been uploaded."}</p>
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
                        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-destructive" title="Remove" aria-label={`Remove ${document.filename}`} disabled={Boolean(busy)} onClick={() => void remove(document)}>
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
        {(page > 1 || current?.result?.hasMore) && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous page</Button>
            <Button type="button" variant="outline" size="sm" disabled={!current?.result?.hasMore} onClick={() => setPage(value => value + 1)}>Next page</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
