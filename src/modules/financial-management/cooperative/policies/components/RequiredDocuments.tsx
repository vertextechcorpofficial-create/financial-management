"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type PolicyContext, usePolicyEditor } from "../policy-client";
import type { DocumentRule, DocumentType } from "../policy-types";
import { PolicyDialog, PolicyInput, PolicyPager, PolicySelect } from "./PolicyForm";

const scopes = { MEMBERSHIP: "Membership", CLEARANCE: "Exit clearance" } as const;

function DocumentTypeEditor({ context, type, close }: { context: PolicyContext; type: DocumentType | null; close: () => void }) {
  const [name, setName] = useState(type?.name ?? "");
  const [isActive, setActive] = useState(type?.isActive ?? true);
  const editor = usePolicyEditor(context, latest => latest.documentTypes.find(row => row.id === type?.id) ?? null);
  return <PolicyDialog title={type ? "Edit document type" : "Add document type"}
    description="Document types are shared across membership, loan products, and exit clearance."
    editor={editor} onClose={close} onSubmit={event => {
      event.preventDefault();
      void editor.save({ section: "documentType", data: { id: type?.id, name, isActive } })
        .then(saved => { if (saved) close(); });
    }}>
    <PolicyInput label="Document name" maxLength={60} value={name} onChange={event => setName(event.target.value)} />
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
    editor={editor} onClose={close} onSubmit={event => {
      event.preventDefault();
      const common = { documentTypeId: Number(documentId), isActive: required };
      const data = scope === "MEMBERSHIP" ? { ...common, scope, enforcement: "CHECK" as const }
        : { ...common, scope, enforcement: enforcement === "BLOCK" ? "BLOCK" as const : "WARN" as const };
      void editor.save({ section: "documentRule", data }).then(saved => { if (saved) close(); });
    }}>
    <PolicySelect label="Document type" value={documentId} onChange={event => setDocumentId(event.target.value)} disabled={!!rule}>
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
  const [page, setPage] = useState(1);
  const { documentTypes, documentRules } = context.state;
  const visible = documentTypes.filter(type => type.name.toLowerCase().includes(search.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / 25)));
  return <div className="space-y-4">
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {(Object.keys(scopes) as DocumentRule["scope"][]).map(scope => {
        const requirements = documentRules.filter(rule => rule.scope === scope && rule.isActive);
        return <section className="space-y-3 rounded-lg border bg-card p-4" key={scope}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{scopes[scope]} requirements</h2>
            <Button variant="outline" size="sm" onClick={() => setEditing({ scope })}>Add requirement</Button>
          </div>
          {requirements.length ? <ul className="divide-y rounded-md border">
            {requirements.map(rule => <li key={rule.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="mr-auto break-words">{documentTypes.find(type => type.id === rule.documentTypeId)?.name ?? "Unavailable document type"}</span>
              <Badge variant="secondary">{rule.enforcement === "BLOCK" ? "Block" : rule.enforcement === "WARN" ? "Warn" : "Checklist"}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setEditing({ scope, rule })}>Edit</Button>
            </li>)}
          </ul> : <p className="text-sm text-muted-foreground">No required documents configured.</p>}
        </section>;
      })}
    </div>
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Document types</h2>
        <Button size="sm" onClick={() => setDocumentType(null)}>Add document type</Button>
      </div>
      <div className="max-w-sm"><PolicyInput label="Search document types" value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }} /></div>
      {visible.length ? <div className="rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>{visible.slice((currentPage - 1) * 25, currentPage * 25).map(type => <TableRow key={type.id}>
            <TableCell className="whitespace-normal">{type.name}</TableCell>
            <TableCell>{type.isActive ? "Active" : "Archived"}</TableCell>
            <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => setDocumentType(type)}>Edit</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div> : <p className="text-sm text-muted-foreground">{search ? "No document types match your search." : "No document types configured."}</p>}
      <PolicyPager page={currentPage} more={currentPage * 25 < visible.length} onPage={setPage} />
    </section>
    {documentType !== undefined && <DocumentTypeEditor context={context} type={documentType} close={() => setDocumentType(undefined)} />}
    {editing && <DocumentRuleEditor context={context} {...editing} close={() => setEditing(undefined)} />}
  </div>;
}
