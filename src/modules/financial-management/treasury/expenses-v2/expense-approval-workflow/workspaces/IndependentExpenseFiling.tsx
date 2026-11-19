"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FilePlus2, Paperclip, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IndependentExpenseEvent, IndependentExpenseForm, WorkflowAttachment } from "../independentTypes";
import { SpecialExpenseFields, SpecialExpenseSummary } from "./SpecialExpenseFields";
import { specialRuleProblems, PURCHASE_CATEGORIES } from "../domain/filingSpecialRules";

const ROOT = "/fm/treasury/expenses-v2/expense-approval-workflow";
const API = "/api/fm/treasury/expenses-v2/expense-approval-workflow/requests";
const blank = (): IndependentExpenseForm => ({ expenseDate: "", amount: "", category: "", purpose: "", payee: "", requestedCompany: "", department: "", attachments: [], specialDetails: {} });
type Context = { actor: { id: number; name: string }; categories: { code: string; name: string }[]; items: IndependentExpenseEvent[]; dummyEnabled: boolean };
const statusLabel = (status: IndependentExpenseEvent["snapshot"]["status"]) => status === "NEEDS_CORRECTION" ? "Returned" : status.replaceAll("_", " ");

export function IndependentExpenseFiling({ showForm = true, embedded = false }: { showForm?: boolean; embedded?: boolean }) {
  const [context, setContext] = useState<Context | null>(null);
  const [departments, setDepartments] = useState<{ departmentId: number; departmentName: string }[]>([]);
  const [form, setForm] = useState<IndependentExpenseForm>(blank);
  const [editing, setEditing] = useState<IndependentExpenseEvent | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [history, setHistory] = useState<{ requestId: string; events: IndependentExpenseEvent[] } | null>(null);
  const pending = useRef<{ signature: string; requestKey: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(API, { cache: "no-store", signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw Error(result.error); return result.data as Context; })
      .then(data => { if (!controller.signal.aborted) setContext(data); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/fm/setup/departments", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || !Array.isArray(result)) throw Error("Department list is unavailable.");
      return result as { departmentId: number; departmentName: string }[];
    }).then(setDepartments).catch(() => { if (!controller.signal.aborted) setDepartments([]); });
    return () => controller.abort();
  }, []);
  const refresh = () => { setLoading(true); setError(""); setVersion(v => v + 1); };
  const update = (key: "expenseDate" | "amount" | "category" | "purpose" | "payee" | "requestedCompany" | "department", value: string) => setForm(current => ({ ...current, [key]: value, ...(key === "category" ? { specialDetails: { purchase: PURCHASE_CATEGORIES.includes(value) ? "Yes" : "" } } : {}) }));
  const save = async (action: "SAVE_DRAFT" | "SUBMIT") => {
    const problems = specialRuleProblems(form.category, form.specialDetails || {}, form.attachments.map(file => file.id), action === "SUBMIT");
    if (problems.length) { setError(problems.join(" ")); return; }
    setBusy(true); setError(""); setNotice("");
    const submittedForm = action === "SUBMIT" ? { ...form, executionMode: "DUMMY" as const } : form;
    const value = { action, ...(editing ? { requestId: editing.case_id, expectedRevision: editing.revision } : {}), form: submittedForm };
    const signature = JSON.stringify(value);
    if (pending.current?.signature !== signature) pending.current = { signature, requestKey: crypto.randomUUID() };
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...value, requestKey: pending.current.requestKey }) });
      const result = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; throw Error(result.error || "Save not confirmed."); }
      pending.current = null;
      const request = result.data.request as IndependentExpenseEvent;
      setNotice(action === "SUBMIT" ? `${request.snapshot.reference} submitted to the assigned approver.` : `${request.snapshot.reference} draft saved.`);
      setEditing(action === "SAVE_DRAFT" ? request : null);
      if (action === "SUBMIT") setForm(blank());
      setHistory(null); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Save not confirmed. Retry the same intent."); }
    finally { setBusy(false); }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (form.attachments.length + files.length > 10) { setError("Attach no more than 10 documents."); return; }
    setUploading(true); setError("");
    try {
      for (const file of Array.from(files)) {
        if (!file.size || file.size > 10 * 1024 * 1024) throw Error(`${file.name}: choose a nonempty file no larger than 10 MB.`);
        const body = new FormData(); body.set("file", file);
        const response = await fetch(`${API}/files`, { method: "POST", body });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Upload failed.");
        const attachment = result.data as WorkflowAttachment;
        setForm(current => ({ ...current, attachments: [...current.attachments, attachment] }));
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed; successfully uploaded files remain listed."); }
    finally { setUploading(false); }
  };
  const uploadRequirement = async (key: string, files: FileList | null) => {
    if (!files?.length) return;
    if (form.attachments.length >= 10) { setError("Attach no more than 10 documents."); return; }
    setUploading(true); setError("");
    try {
      const file = files[0];
      if (!file.size || file.size > 10 * 1024 * 1024) throw Error(`${file.name}: choose a nonempty file no larger than 10 MB.`);
      const body = new FormData(); body.set("file", file);
      const response = await fetch(`${API}/files`, { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Upload failed.");
      const attachment = result.data as WorkflowAttachment;
      setForm(current => {
        const previousId = current.specialDetails?.[key];
        const attachments = current.attachments.filter(item => item.id !== previousId);
        return { ...current, attachments: [...attachments, attachment], specialDetails: { ...current.specialDetails, [key]: attachment.id } };
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); }
  };
  const inspect = async (id: string) => {
    setError("");
    try {
      const response = await fetch(`${API}?requestId=${id}`, { cache: "no-store" }); const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setHistory({ requestId: id, events: result.data.history });
    } catch (e) { setError(e instanceof Error ? e.message : "History unavailable."); }
  };
  const edit = (request: IndependentExpenseEvent) => {
    const s = request.snapshot;
    setEditing(request); setForm({ expenseDate: s.expenseDate, amount: s.amount, category: s.category, purpose: s.purpose, payee: s.payee, requestedCompany: s.requestedCompany, department: s.department, attachments: s.attachments, specialDetails: s.specialDetails || {}, executionMode: s.executionMode }); setNotice(""); setError("");
  };
  const disabled = busy || uploading || loading || !context;
  return <section className={embedded ? "space-y-4" : "mx-auto max-w-6xl space-y-6 p-4 sm:p-6"}>
    {!embedded && <header className="flex flex-wrap justify-between gap-4 border-b pb-5"><div><Link href={ROOT} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="size-4" />Approval workspace</Link><h1 className="text-2xl font-semibold">{showForm ? "File an expense" : "My Requests"}</h1><p className="mt-1 text-sm text-muted-foreground">Requests submitted by {context?.actor.name || "the signed-in user"}</p></div><div className="flex items-start gap-2">{!showForm && <Button asChild><Link href={`${ROOT}/file-expense`}><FilePlus2 className="size-4" />File an Expense</Link></Button>}<Button variant="outline" onClick={refresh} disabled={busy || uploading || loading}><RefreshCw className="size-4" />Refresh</Button></div></header>}
    {embedded && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Requests submitted by {context?.actor.name || "the signed-in user"} · edit drafts or returned requests and review decision history.</p><div className="flex gap-2"><Button asChild><Link href={`${ROOT}/file-expense`}><FilePlus2 className="size-4" />File an Expense</Link></Button><Button variant="outline" onClick={refresh} disabled={busy || uploading || loading}><RefreshCw className="size-4" />Refresh</Button></div></div>}
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error} Your form entries have been preserved.</p>}
    {notice && <p role="status" className="rounded-lg border border-primary/30 p-3 text-sm">{notice}</p>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading your workflow requests…</p>}
    {(showForm || editing) && <Card><CardHeader><CardTitle>{editing ? "Edit your draft" : "New expense request"}</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void save("SUBMIT"); }}>
      <label className="space-y-1 text-sm">Expense date<Input required type="date" value={form.expenseDate} onChange={e => update("expenseDate", e.target.value)} disabled={busy} /></label>
      <label className="space-y-1 text-sm">Amount (PHP)<Input required inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e => update("amount", e.target.value)} disabled={busy} /></label>
      <label className="space-y-1 text-sm">Category<select aria-label="Category" required className="h-10 w-full rounded-md border bg-background px-3" value={form.category} onChange={e => update("category", e.target.value)} disabled={busy}><option value="">Choose category</option>{context?.categories.map(category => <option key={category.code} value={category.code}>{category.name}</option>)}</select></label>
      <label className="space-y-1 text-sm">Payee Name<Input required maxLength={200} placeholder="Supplier or recipient name" value={form.payee} onChange={e => update("payee", e.target.value)} disabled={busy} /><span className="block text-xs text-muted-foreground">Enter the supplier, employee, or other recipient paid or to be reimbursed.</span></label>
      <label className="space-y-1 text-sm">Company to be Charged<Input required maxLength={200} placeholder="Company or subsidiary name" value={form.requestedCompany} onChange={e => update("requestedCompany", e.target.value)} disabled={busy} /><span className="block text-xs text-muted-foreground">Select the company or subsidiary that incurred the expense, not the supplier.</span></label>
      <label className="space-y-1 text-sm">Department<select required aria-label="Department" className="h-10 w-full rounded-md border bg-background px-3" value={form.department} onChange={e => update("department", e.target.value)} disabled={busy}><option value="">Select department</option>{departments.map(department => <option key={department.departmentId} value={department.departmentName}>{department.departmentName}</option>)}</select></label>
      <label className="space-y-1 text-sm sm:col-span-2">Business purpose<Textarea required minLength={10} maxLength={2000} rows={4} value={form.purpose} onChange={e => update("purpose", e.target.value)} disabled={busy} /></label>
      <SpecialExpenseFields category={form.category} value={form.specialDetails || {}} attachments={form.attachments} disabled={busy || uploading} onChange={specialDetails => setForm(current => ({ ...current, specialDetails }))} onUpload={uploadRequirement} />
      <section className="space-y-3 rounded-lg border p-4 sm:col-span-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="size-4" />Supporting documents</h2><p className="text-xs text-muted-foreground">PDF, JPEG, PNG or WebP · up to 10 files · 10 MB each. Upload category-specific documents above; add any other supporting documents here.</p><Input aria-label="Upload supporting documents" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" disabled={disabled} onChange={e => { const files = e.target.files; void upload(files); e.target.value = ""; }} />{uploading && <p role="status" className="text-xs">Uploading…</p>}{form.attachments.map(file => <div key={file.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{file.name} · {(file.size / 1024).toFixed(0)} KB{Object.entries(form.specialDetails || {}).some(([, id]) => id === file.id) && <span className="ml-2 text-muted-foreground">({Object.entries(form.specialDetails || {}).filter(([, id]) => id === file.id).map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ")})</span>}</span><Button variant="ghost" size="sm" type="button" disabled={busy || uploading} onClick={() => setForm(current => ({ ...current, attachments: current.attachments.filter(f => f.id !== file.id), specialDetails: Object.fromEntries(Object.entries(current.specialDetails || {}).filter(([, id]) => id !== file.id)) }))}>Remove</Button></div>)}<p className="text-xs text-muted-foreground">Removing a reference does not delete a storage file. Uploaded-but-unsaved documents may require administrator cleanup.</p></section>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="button" variant="outline" disabled={disabled} onClick={() => void save("SAVE_DRAFT")}>{busy ? "Saving…" : "Save draft"}</Button><Button disabled={disabled || !form.attachments.length}>{busy ? "Submitting…" : "Submit to approver"}</Button>{editing && <Button type="button" variant="ghost" disabled={busy || uploading} onClick={() => { setEditing(null); setForm(blank()); pending.current = null; }}>Start a new request</Button>}</div>
    </form></CardContent></Card>}
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-semibold">Submitted requests</h2>{showForm && <Link className="text-sm text-primary underline" href={`${ROOT}/my-requests`}>View all requests</Link>}</div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50"><tr>{["Request", "Category", "Amount", "Current stage", "Assigned approver", "Status", "", ""].map((label, index) => <th key={index} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{context?.items.map(request => <tr key={request.case_id} className="border-t"><td className="max-w-sm p-3"><p className="break-all font-medium">{request.snapshot.reference}</p><p className="text-xs text-muted-foreground">{request.snapshot.expenseDate || "Date not yet set"} · {request.snapshot.department || "Department not yet set"}</p></td><td className="p-3">{context.categories.find(category => category.code === request.snapshot.category)?.name || request.snapshot.category || "Not selected"}</td><td className="p-3">{request.snapshot.amount ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(request.snapshot.amount)) : "Not set"}</td><td className="p-3">{statusLabel(request.snapshot.status)}</td><td className="p-3">Not verified</td><td className="p-3"><Badge variant="outline">{statusLabel(request.snapshot.status)}</Badge></td><td className="p-3">{request.snapshot.status === "DRAFT" && <Button variant="outline" size="sm" disabled={busy || uploading} onClick={() => edit(request)}>Edit draft</Button>}{request.snapshot.status === "NEEDS_CORRECTION" && <Button variant="outline" size="sm" disabled={busy || uploading} onClick={() => edit(request)}>Edit returned request</Button>}</td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => void inspect(request.case_id)}>View history</Button></td></tr>)}{context && !context.items.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No requests filed in this workflow yet.</td></tr>}</tbody></table></div></section>
    {context?.items.filter(request => request.snapshot.status === "NEEDS_CORRECTION").map(request => <section key={request.id} className="space-y-2 rounded-lg border p-4"><h2 className="font-semibold">Correction requested · {request.snapshot.reference}</h2><p className="text-sm">{request.reason}</p><Button disabled={busy || uploading} onClick={() => edit(request)}>Correct and resubmit</Button></section>)}
    {history && <section className="space-y-3 rounded-xl border p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Request history</h2><Button variant="ghost" onClick={() => setHistory(null)}>Close</Button></div>{history.events.map(event => <div key={event.id} className="space-y-2 rounded border p-3 text-sm"><p className="font-medium">{event.action.replaceAll("_", " ")} · {event.actor_name}</p><p>{new Date(event.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} Manila · revision {event.revision}</p><p>{event.reason}</p><p className="whitespace-pre-wrap">{event.snapshot.purpose || "No purpose recorded in this draft."}</p><SpecialExpenseSummary category={event.snapshot.category} value={event.snapshot.specialDetails} attachments={event.snapshot.attachments} />{event.snapshot.attachments.map((file, index) => <a key={file.id} className="mr-3 inline-block text-primary underline" href={`${API}/files?requestId=${event.case_id}&index=${index}&revision=${event.revision}`} target="_blank" rel="noopener noreferrer">{file.name}</a>)}</div>)}</section>}
  </section>;
}
