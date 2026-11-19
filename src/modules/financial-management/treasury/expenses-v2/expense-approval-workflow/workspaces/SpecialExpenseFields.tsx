"use client";

import { Input } from "@/components/ui/input";
import { specialFields, specialRuleNotes, applicableDetails, type SpecialDetails } from "../domain/filingSpecialRules";
import type { WorkflowAttachment } from "../independentTypes";

export function SpecialExpenseFields({ category, value, attachments, disabled, onChange, onUpload }: {
  category: string; value: SpecialDetails; attachments: WorkflowAttachment[]; disabled: boolean;
  onChange: (value: SpecialDetails) => void;
  onUpload?: (key: string, files: FileList | null) => void;
}) {
  if (!category) return null;
  return <section className="space-y-4 rounded-lg border p-4 sm:col-span-2">
    <h2 className="font-semibold">Special expense requirements · Policy item 4</h2>
     <p className="text-xs text-muted-foreground">Required fields apply when submitting. Optional and conditional fields are labeled; drafts may be incomplete. Upload each required document using its corresponding field.</p>
    <div className="grid gap-4 sm:grid-cols-2">{specialFields(category, value).map(f => <label key={f.key} className="space-y-1 text-sm">
      <span>{f.label} <span className="text-xs text-muted-foreground">({f.required ? "required" : "optional"})</span></span>
       {f.document ? <div className="space-y-2"><Input aria-label={`Upload ${f.label}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required={f.required && !value[f.key]} disabled={disabled} onChange={e => { onUpload?.(f.key, e.target.files); e.target.value = ""; }} />{value[f.key] && <span className="block text-xs text-muted-foreground">Attached: {attachments.find(file => file.id === value[f.key])?.name || "Document uploaded"}</span>}</div> : f.options ? <select className="h-10 w-full min-w-0 rounded-md border bg-background px-3" required={f.required} disabled={disabled} value={value[f.key] || ""} onChange={e => onChange(applicableDetails(category, { ...value, [f.key]: e.target.value }))}><option value="">Choose…</option>{f.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <Input required={f.required} maxLength={2000} disabled={disabled} value={value[f.key] || ""} onChange={e => onChange({ ...value, [f.key]: e.target.value })} />}
      {f.help && <span className="block text-xs text-muted-foreground">{f.help}</span>}
    </label>)}</div>
    {specialRuleNotes(category).map(note => <p key={note} className="text-xs text-muted-foreground">{note}</p>)}
  </section>;
}

export function SpecialExpenseSummary({ category, value, attachments }: { category: string; value?: SpecialDetails; attachments: WorkflowAttachment[] }) {
  return <section className="space-y-3"><h3 className="font-semibold">Special expense requirements</h3>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">{specialFields(category, value).map(f => <div key={f.key}><dt className="text-muted-foreground">{f.label}{!f.required && " (optional)"}</dt><dd className="break-words">{f.document ? attachments.find(file => file.id === value?.[f.key])?.name || "Not recorded" : value?.[f.key] || "Not recorded"}</dd></div>)}</dl>
    {specialRuleNotes(category).map(note => <p key={note} className="text-xs text-muted-foreground">{note}</p>)}
  </section>;
}
