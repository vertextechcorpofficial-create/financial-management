"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OperationsData, OperationsExpense, OperationsLog, OperationsSection } from "../operationsTypes";
import { requesterName } from "../domain/reviewProjection";
import { DummyExpenseActions } from "./DummyExpenseActions";
import { SpecialExpenseSummary } from "./SpecialExpenseFields";
import { IndependentExpenseFiling } from "./IndependentExpenseFiling";

const ROOT = "/fm/treasury/expenses-v2/expense-approval-workflow";
const API = "/api/fm/treasury/expenses-v2/authority-operations";

export function AuthorityOperations({ initialSection = "approvals" }: { initialSection?: OperationsSection }) {
  const [data, setData] = useState<OperationsData | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState("requests");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ expense: OperationsExpense; logs: OperationsLog[] } | null>(null);
  const [detailError, setDetailError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}?section=approvals`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load approvals.");
      return result.data;
    }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`${API}?expenseId=${selected}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to load request.");
      return result.data;
    }).then(setDetail).catch(e => { if (!controller.signal.aborted) setDetailError(e.message); });
    return () => controller.abort();
  }, [selected]);
  // Compatibility callers cannot re-enable removed Finance or administration screens.
  if (initialSection !== "approvals") return <p className="p-6">This workspace has been removed. <Link className="underline" href={`${ROOT}/my-approvals`}>Open My Approvals</Link></p>;
  const reload = () => { setData(null); setError(""); setVersion(value => value + 1); };
  const rows = tab === "requests" ? data?.employeeRequests || [] : tab === "history" ? data?.decidedExpenses || [] : data?.assignedExpenses || [];
  const viewTabs: Array<[string, string]> = [["requests", "My Requests"], ["approvals", "My Approvals"]];
  const approvalTabs: Array<[string, string]> = [["pending", `Pending Decision (${data?.assignedExpenses?.length || 0})`], ["history", `Decision History (${data?.decidedExpenses?.length || 0})`]];
  const columns = ["Request", "Requester", "Category", "Amount", "Authority", "Submitted", "Status", ""];
  const expense = detail?.expense;
  const snapshot = expense?.independentSnapshot;
  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div><h1 className="text-2xl font-semibold">Expense Approval Authority</h1><p className="mt-2 text-sm text-muted-foreground">Manage requests you submitted and review expenses assigned to you.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={reload}>Refresh</Button></div>
    </header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!data && !error && <p role="status">Loading approvals…</p>}
    {data && <>
      <p className="text-sm text-muted-foreground">{data.actor.name}</p>
      {data.decisionHistoryAvailable === false && <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Decision history is temporarily unavailable. Your separate My Requests list is still loaded.</p>}
      <nav aria-label="Expense views" className="flex flex-wrap gap-2">{viewTabs.map(([key, label]) => <Button key={key} variant={(key === "requests" && tab === "requests") || (key === "approvals" && tab !== "requests") ? "secondary" : "ghost"} aria-pressed={(key === "requests" && tab === "requests") || (key === "approvals" && tab !== "requests")} onClick={() => setTab(key === "requests" ? "requests" : data.assignedExpenses?.length ? "pending" : data.decidedExpenses?.length ? "history" : "pending")}>{label}</Button>)}{tab !== "requests" && approvalTabs.map(([key, label]) => <Button key={key} variant={tab === key ? "secondary" : "ghost"} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</Button>)}</nav>
      {tab === "requests" ? <IndependentExpenseFiling showForm={false} embedded /> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr>{columns.map((label, index) => <th key={index} className="p-3">{label}</th>)}</tr></thead><tbody>
        {rows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{row.doc_no}</td><td className="p-3">{requesterName(row)}</td><td className="p-3">{row.categoryName}</td><td className="p-3">PHP {row.amount}</td><td className="p-3">{row.requiredAuthority}</td><td className="p-3">{row.independentSnapshot?.expenseDate}</td><td className="p-3">{row.status === "NEEDS_CORRECTION" ? "Returned" : row.status}</td><td className="p-3"><Button variant="outline" onClick={() => { setDetail(null); setDetailError(""); setSelected(String(row.id)); }}>View details</Button></td></tr>)}
        {!rows.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No requests have a verified assignment to you.</td></tr>}
      </tbody></table></div>}
    </>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setDetail(null); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Expense review · {expense?.doc_no || selected}</DialogTitle><DialogDescription>Review the supporting evidence before deciding. Requesters cannot approve their own requests.</DialogDescription></DialogHeader>
      {detailError && <p role="alert" className="text-destructive">{detailError}</p>}
      {!detail && !detailError && <p>Loading request…</p>}
      {expense && snapshot && <div className="space-y-5">
        <section className="space-y-2 rounded-lg border p-3 text-sm"><p>Revision {expense.revision} · Required tier: {expense.requiredAuthority}</p><p>Requester: {requesterName(expense)}</p><p>Company requested: {snapshot.requestedCompany} · Department: {snapshot.department}</p><p>Category: {expense.categoryName} · Amount: PHP {snapshot.amount}</p><p>Payee: {snapshot.payee} · Date: {snapshot.expenseDate}</p><p className="whitespace-pre-wrap">Purpose: {snapshot.purpose}</p></section>
        <SpecialExpenseSummary category={snapshot.category} value={snapshot.specialDetails} attachments={snapshot.attachments} />
        <section className="space-y-2"><h3 className="font-semibold">Supporting documents</h3>{snapshot.attachments.map((file, index) => <Button key={file.id} asChild variant="outline"><a href={`${API}?expenseId=${expense.id}&documentIndex=${index}`} target="_blank" rel="noopener noreferrer">{file.name}</a></Button>)}</section>
        <DummyExpenseActions key={`${expense.id}:${expense.revision}`} expense={expense} onSaved={() => { setSelected(null); setDetail(null); reload(); }} />
        {snapshot.dummyReview && <details className="rounded-lg border p-3 text-sm"><summary>Recorded review findings</summary><p className="mt-2 whitespace-pre-wrap">{snapshot.dummyReview.evidence}</p><p>Reviewer #{snapshot.dummyReview.reviewerId}</p></details>}
        <section className="space-y-2"><h3 className="font-semibold">Request history</h3>{detail.logs.map(log => <div key={log.id} className="rounded-lg border p-3 text-sm"><p>{log.action} · {log.created_at}</p><p className="whitespace-pre-wrap">{log.remarks}</p></div>)}</section>
      </div>}
    </DialogContent></Dialog>
  </div>;
}
