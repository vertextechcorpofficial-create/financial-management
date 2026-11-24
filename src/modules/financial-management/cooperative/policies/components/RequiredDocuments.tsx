"use client";

import { useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "../../console/components/ui";
import { type PolicyContext, usePolicyEditor } from "../policy-client";
import { documentTypeSchema, type DocumentRule, type DocumentType } from "../policy-types";
import { PolicyEmpty, PolicyEnforcementChip, PolicyStatusChip } from "./PolicyUi";
import { PolicyDialog, PolicyInput, PolicyPager, PolicySelect } from "./PolicyForm";

const scopes = { MEMBERSHIP: "Membership", CLEARANCE: "Exit clearance" } as const;

function DocumentTypeEditor({ context, type, close }: { context: PolicyContext; type: DocumentType | null; close: () => void }) {
  const [name, setName] = useState(type?.name ?? "");
  const [isActive, setActive] = useState(type?.isActive ?? true);
  const [submitted, setSubmitted] = useState(false);
  const editor = usePolicyEditor(context, latest => latest.documentTypes.find(row => row.id === type?.id) ?? null);
  const valid = documentTypeSchema.safeParse({ id: type?.id, name, isActive });
  const nameIssue = submitted && !valid.success ? valid.error.issues.find(issue => issue.path[0] === "name") : undefined;
  const nameError = nameIssue
    ? nameIssue.message.includes("Too small") ? "Enter at least 2 characters."
      : nameIssue.message.includes("Too big") ? "Enter no more than 60 characters."
        : nameIssue.message
    : undefined;
  return <PolicyDialog title={type ? "Edit document type" : "Add document type"}
    description="Document types are shared across membership, loan products, and exit clearance." editor={editor} onClose={close}
    onSubmit={event => {
      event.preventDefault();
      setSubmitted(true);
      if (!valid.success) return;
      void editor.save({ section: "documentType", data: valid.data }).then(saved => { if (saved) close(); });
    }}>
    <PolicyInput label="Document name" maxLength={60} required value={name} error={nameError}
      onChange={event => setName(event.target.value)} />
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="accent-primary" checked={isActive} onChange={event => setActive(event.target.checked)} />
      Available for new requirements
    </label>
  </PolicyDialog>;
}

function DocumentRuleEditor({ context, scope, rule, close }: {
  context: PolicyContext;
  scope: DocumentRule["scope"];
  rule?: DocumentRule;
  close: () => void;
}) {
  const [documentId, setDocumentId] = useState(String(rule?.documentTypeId ?? ""));
  const [enforcement, setEnforcement] = useState(rule?.enforcement === "BLOCK" ? "BLOCK" : "WARN");
  const [required, setRequired] = useState(true);
  const editor = usePolicyEditor(context, latest => latest.documentRules.find(
    row => row.scope === scope && row.documentTypeId === Number(documentId)) ?? null);
  const types = context.state.documentTypes.filter(type => type.id === rule?.documentTypeId ||
    (type.isActive && !context.state.documentRules.some(row => row.scope === scope && row.isActive && row.documentTypeId === type.id)));

  return <PolicyDialog title={`${scopes[scope]} document requirement`}
    description={scope === "CLEARANCE" ? "Choose what happens when this document is missing." : "Add this document to the enrollment checklist."}
    editor={editor} onClose={close} submitDisabled={!documentId}
    onSubmit={event => {
      event.preventDefault();
      const common = { documentTypeId: Number(documentId), isActive: required };
      const data = scope === "MEMBERSHIP" ? { ...common, scope, enforcement: "CHECK" as const }
        : { ...common, scope, enforcement: enforcement === "BLOCK" ? "BLOCK" as const : "WARN" as const };
      void editor.save({ section: "documentRule", data }).then(saved => { if (saved) close(); });
    }}>
    <PolicySelect label="Document type" required value={documentId} onChange={event => setDocumentId(event.target.value)} disabled={!!rule}>
      <option value="">Select a document type</option>
      {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
    </PolicySelect>
    {!types.length && <p className="text-sm text-muted-foreground">Add a document type to the catalog to create another requirement.</p>}
    {scope === "CLEARANCE" && <PolicySelect label="If missing" value={enforcement} onChange={event => setEnforcement(event.target.value)}>
      <option value="WARN">Warn and allow clearance</option>
      <option value="BLOCK">Block clearance</option>
    </PolicySelect>}
    {rule && <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="accent-primary" checked={required} onChange={event => setRequired(event.target.checked)} />
      Include in current requirements
    </label>}
  </PolicyDialog>;
}

export function RequiredDocuments({ context }: { context: PolicyContext }) {
  const [documentType, setDocumentType] = useState<DocumentType | null>();
  const [editing, setEditing] = useState<{ scope: DocumentRule["scope"]; rule?: DocumentRule }>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const { documentTypes, documentRules, products } = context.state;
  const pageSize = 25;
  const hasFilters = Boolean(search.trim() || status !== "all");
  const visible = documentTypes.filter(type => {
    const matchesSearch = type.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (status === "all" || type.isActive === (status === "active"));
  });
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const rows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = visible.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = first ? first + rows.length - 1 : 0;

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setPage(1);
  }

  function usage(typeId: number) {
    const productCount = products.filter(product => product.documentRules.some(rule => rule.documentTypeId === typeId)).length;
    const ruleCount = documentRules.filter(rule => rule.isActive && rule.documentTypeId === typeId).length;
    return { productCount, ruleCount };
  }

  return <div className="space-y-4">
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {(Object.keys(scopes) as DocumentRule["scope"][]).map(scope => {
        const requirements = documentRules.filter(rule => rule.scope === scope && rule.isActive);
        return <Panel key={scope} title={`${scopes[scope]} requirements`}
          description={scope === "CLEARANCE" ? "Documents checked during member separation." : "Documents checked during enrollment."}
          actions={<div className="flex items-center gap-2">
            <Badge variant="outline">{requirements.length}</Badge>
            <Button variant="outline" size="sm" onClick={() => setEditing({ scope })}><Plus className="size-3.5" /> Add requirement</Button>
          </div>}>
          {requirements.length ? <ul className="divide-y rounded-xl border">
            {requirements.map(rule => <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="mr-auto break-words">{documentTypes.find(type => type.id === rule.documentTypeId)?.name ?? "Unavailable document type"}</span>
              <PolicyEnforcementChip enforcement={rule.enforcement === "BLOCK" ? "BLOCK" : rule.enforcement === "WARN" ? "WARN" : "CHECK"} />
              <Button variant="ghost" size="sm" onClick={() => setEditing({ scope, rule })}>Edit</Button>
            </li>)}
          </ul> : <PolicyEmpty compact icon={FileText} title="No required documents"
            description={scope === "CLEARANCE" ? "Add documents to the separation checklist." : "Add documents to the enrollment checklist."}
            action={<Button variant="outline" size="sm" onClick={() => setEditing({ scope })}>Add requirement</Button>} />}
        </Panel>;
      })}
    </div>

    <Panel title="Document types" description="The shared catalog used by membership, loan products, and exit clearance."
      actions={<Button size="sm" onClick={() => setDocumentType(null)}><Plus className="size-4" /> Add document type</Button>}>
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto]">
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Search document types
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-8" value={search} placeholder="Name"
                onChange={event => { setSearch(event.target.value); setPage(1); }} />
            </div>
          </label>
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Status
            <NativeSelect className="h-9 w-full" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived</option>
            </NativeSelect>
          </label>
          <div className="flex items-end">
            <Button type="button" variant="ghost" size="sm" className="h-9" disabled={!hasFilters} onClick={clearFilters}>Clear filters</Button>
          </div>
        </div>
        <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">{visible.length} of {documentTypes.length} document types</p>
      </div>

      <div className="mt-3 rounded-xl border">
        <Table aria-label="Document types">
          <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead scope="col">Name</TableHead>
            <TableHead scope="col" className="hidden md:table-cell">Used by</TableHead>
            <TableHead scope="col" className="hidden sm:table-cell">Status</TableHead>
            <TableHead scope="col" className="text-right">Action</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!rows.length && <TableRow className="hover:bg-transparent"><TableCell colSpan={4}>
              <PolicyEmpty title={documentTypes.length ? "No document types match these filters" : "No document types yet"}
                description={documentTypes.length ? "Try a different name or status." : "Add a document type to build requirements."}
                action={hasFilters ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined} />
            </TableCell></TableRow>}
            {rows.map(type => {
              const { productCount, ruleCount } = usage(type.id);
              return <TableRow key={type.id}>
                <TableCell className="whitespace-normal">
                  <p className="font-medium">{type.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground md:hidden">
                    <span>{productCount} product{productCount === 1 ? "" : "s"} · {ruleCount} requirement{ruleCount === 1 ? "" : "s"}</span>
                    <span className="sm:hidden"><PolicyStatusChip active={type.isActive} activeLabel="Active" inactiveLabel="Archived" /></span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {productCount || ruleCount
                    ? <span className="text-sm">{productCount} product{productCount === 1 ? "" : "s"} <span className="text-muted-foreground">· {ruleCount} requirement{ruleCount === 1 ? "" : "s"}</span></span>
                    : <span className="text-sm text-muted-foreground">Unused</span>}
                </TableCell>
                <TableCell className="hidden sm:table-cell"><PolicyStatusChip active={type.isActive} activeLabel="Active" inactiveLabel="Archived" /></TableCell>
                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setDocumentType(type)}>Edit</Button></TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
      {visible.length > 0 && <div className="mt-3">
        <PolicyPager page={currentPage} more={currentPage * pageSize < visible.length} onPage={setPage}
          from={first} to={last} total={visible.length} noun="document types" />
      </div>}
    </Panel>

    {documentType !== undefined && <DocumentTypeEditor context={context} type={documentType} close={() => setDocumentType(undefined)} />}
    {editing && <DocumentRuleEditor context={context} {...editing} close={() => setEditing(undefined)} />}
  </div>;
}
