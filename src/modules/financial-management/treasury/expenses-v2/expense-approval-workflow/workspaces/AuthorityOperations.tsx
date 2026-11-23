"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, History, RefreshCw, ShieldCheck } from "lucide-react";
import { ExpenseStatus, expenseAmount } from "./ExpenseStatus";
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
   const canApprove = !!data?.actor.authorities?.length;
   const isCeo = data?.actor.authorities?.includes("CEO") || false;
   const visibleTab = tab === "requests" && isCeo ? "pending" : tab;
   const rows = visibleTab === "requests" ? data?.employeeRequests || [] : visibleTab === "history" ? data?.decidedExpenses || [] : data?.assignedExpenses || [];
   const viewTabs: Array<[string, string]> = [...(!isCeo ? [["requests", "My Requests"] as [string, string]] : []), ...(canApprove ? [["approvals", "My Approvals"] as [string, string]] : [])];
  const approvalTabs: Array<[string, string]> = [["pending", `Pending Decision (${data?.assignedExpenses?.length || 0})`], ["history", `Decision History (${data?.decidedExpenses?.length || 0})`]];
  const columns = ["Request", "Requester", "Category", "Amount", "Authority", "Submitted", "Status", ""];
  const expense = detail?.expense;
  const snapshot = expense?.independentSnapshot;
  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-gradient-to-br from-primary/10 to-card p-5">
      <div><h1 className="flex items-center gap-3 text-2xl font-semibold"><ShieldCheck aria-hidden="true" className="text-primary" />Expense Approval Authority</h1><p className="mt-2 text-sm text-muted-foreground">Track your requests and review expenses assigned to you.</p></div>
      <Button variant="outline" onClick={reload}><RefreshCw aria-hidden="true" />Refresh</Button>
    </header>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!data && !error && <p role="status">Loading approvals…</p>}
    {data && <>
      <p className="text-sm text-muted-foreground">{data.actor.name}</p>
      {data.decisionHistoryAvailable === false && <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Decision history is temporarily unavailable. Your separate My Requests list is still loaded.</p>}
       <nav aria-label="Expense views" className="flex flex-wrap gap-2">{viewTabs.map(([key, label]) => <Button key={key} variant={(key === "requests" && visibleTab === "requests") || (key === "approvals" && visibleTab !== "requests") ? "secondary" : "ghost"} aria-pressed={(key === "requests" && visibleTab === "requests") || (key === "approvals" && visibleTab !== "requests")} onClick={() => setTab(key === "requests" ? "requests" : data.assignedExpenses?.length ? "pending" : data.decidedExpenses?.length ? "history" : "pending")}>{label}</Button>)}{visibleTab !== "requests" && canApprove && approvalTabs.map(([key, label]) => <Button key={key} variant={visibleTab === key ? "secondary" : "ghost"} aria-pressed={visibleTab === key} onClick={() => setTab(key)}>{label}</Button>)}</nav>
       {visibleTab === "requests" && !isCeo ? <IndependentExpenseFiling showForm={false} embedded /> : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr>{columns.map((label, index) => <th key={index} className="p-3">{label}</th>)}</tr></thead><tbody>
        {rows.map(row => <tr key={row.id} className="border-t hover:bg-muted/40"><td className="break-all p-3 font-medium">{row.doc_no}</td><td className="p-3">{requesterName(row)}</td><td className="p-3">{row.categoryName}</td><td className="whitespace-nowrap p-3 font-semibold tabular-nums">{expenseAmount(row.amount)}</td><td className="p-3"><span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{row.requiredAuthority || "—"}</span></td><td className="whitespace-nowrap p-3">{row.independentSnapshot?.expenseDate}</td><td className="p-3"><ExpenseStatus value={row.status} /></td><td className="p-3"><Button size="sm" variant="outline" onClick={() => { setDetail(null); setDetailError(""); setSelected(String(row.id)); }}><Eye aria-hidden="true" />View details</Button></td></tr>)}
        {!rows.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No requests have a verified assignment to you.</td></tr>}
      </tbody></table></div>}
    </>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setDetail(null); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Expense review · {expense?.doc_no || selected}</DialogTitle><DialogDescription>Review the supporting evidence before deciding. Requesters cannot approve their own requests.</DialogDescription></DialogHeader>
      {detailError && <p role="alert" className="text-destructive">{detailError}</p>}
      {!detail && !detailError && <p>Loading request…</p>}
      {expense && snapshot && <div className="space-y-5">
        <section className="space-y-4 rounded-xl border bg-primary/5 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-2xl font-semibold tabular-nums">{expenseAmount(snapshot.amount)}</p><ExpenseStatus value={expense.status} /></div>
          <dl className="grid gap-3 sm:grid-cols-2">{[["Requester", requesterName(expense)], ["Company", snapshot.requestedCompany], ["Department", snapshot.department], ["Category", expense.categoryName], ["Payee", snapshot.payee], ["Expense date", snapshot.expenseDate], ["Required authority", expense.requiredAuthority], ["Revision", expense.revision]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value || "—"}</dd></div>)}</dl>
          <p className="whitespace-pre-wrap border-t pt-3"><strong>Purpose: </strong>{snapshot.purpose}</p>
        </section>
        <SpecialExpenseSummary category={snapshot.category} value={snapshot.specialDetails} attachments={snapshot.attachments} />
        <section className="space-y-2"><h3 className="font-semibold">Supporting documents</h3>{snapshot.attachments.map((file, index) => <Button key={file.id} asChild variant="outline"><a href={`${API}?expenseId=${expense.id}&documentIndex=${index}`} target="_blank" rel="noopener noreferrer">{file.name}</a></Button>)}</section>
        <DummyExpenseActions key={`${expense.id}:${expense.revision}`} expense={expense} onSaved={() => { setSelected(null); setDetail(null); reload(); }} />
        {snapshot.dummyReview && <details className="rounded-lg border p-3 text-sm"><summary>Recorded review findings</summary><p className="mt-2 whitespace-pre-wrap">{snapshot.dummyReview.evidence}</p><p>Reviewer #{snapshot.dummyReview.reviewerId}</p></details>}
        <section className="space-y-3"><h3 className="flex items-center gap-2 font-semibold"><History aria-hidden="true" className="size-4 text-primary" />Request history</h3><ol className="space-y-3 border-s-2 border-primary/20 ps-4">{detail.logs.map(log => <li key={log.id} className="space-y-2 rounded-lg border bg-card p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><ExpenseStatus value={log.action} /><time dateTime={log.created_at} className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} Manila</time></div><p className="whitespace-pre-wrap">{log.remarks}</p></li>)}</ol></section>
      </div>}
    </DialogContent></Dialog>
  </div>;
}
