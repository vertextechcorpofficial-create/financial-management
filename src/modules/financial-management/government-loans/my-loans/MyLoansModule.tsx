"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, MessageSquarePlus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { copyText } from "@/modules/financial-management/property-ledger/utils/clipboard";
import { PostingDisputesModule } from "../loans/PostingDisputesModule";
import { useRetainedLifecycleRead } from "../loans/lifecycle-client";
import { registerStatusLabels } from "../loans/types";
import { LoanRequestsModule } from "../requests/LoanRequestsModule";
import type { EmployeeChoice, RequestSummary } from "../requests/types";
import type { listOwnLoans, readOwnLoan } from "../server/loan-reports";

const endpoint = "/api/fm/government-loans/my-loans";
type History = Awaited<ReturnType<typeof readOwnLoan>>;
type Loan = Awaited<ReturnType<typeof listOwnLoans>>["loans"][number];
type HistoryDeduction = History["deductions"][number];

const monthFormat = new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" });
const monthLabel = (value: string) => monthFormat.format(new Date(value + "-01T00:00:00Z"));
const displayAmount = (value: string | null) => value === null ? "—" : peso(value);
const deductionLabels: Record<HistoryDeduction["status"], string> = {
  D: "Full deduction", P: "Partial deduction", F: "Not deducted", X: "Final pay",
  AWAITING: "Awaiting Payroll", NO_RESULT: "No result reported",
};
const refundLabels: Record<Loan["refunds"][number]["state"], string> = {
  QUEUED: "Queued for Payroll", EXPORTED: "Sent to Payroll", ACKNOWLEDGED: "Acknowledged by Payroll",
  RETRYABLE: "Awaiting Payroll retry", REVERSING: "Reversal pending", PAID: "Paid", CANCELLED: "Cancelled",
};

function agencyTone(name: string) {
  const value = name.toLowerCase();
  if (value.includes("pag-ibig") || value.includes("hdmf")) return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (value.includes("sss") || value.includes("social security")) return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (value.includes("bank")) return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return "text-muted-foreground";
}

function AgencyBadge({ name }: { name: string }) {
  return <Badge variant="outline" className={agencyTone(name)} title={name}>
    <span className="max-w-36 truncate">{name}</span>
  </Badge>;
}

function statusTone(active: boolean) {
  return active ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
    : "text-muted-foreground";
}

function deductionTone(status: HistoryDeduction["status"]) {
  if (status === "D") return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (status === "P" || status === "X") return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  if (status === "F") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "text-muted-foreground";
}

function remittanceLabel(remittance: { state: string; date: string; reference: string } | null | undefined) {
  if (!remittance) return "Remittance pending";
  if (remittance.state === "APPROVED") return "Remitted " + date(remittance.date) + " · " + remittance.reference;
  if (remittance.state === "RETURNED") return "Remittance returned";
  return "Remittance awaiting approval";
}

function SummaryCard({ label, value, detail, active, onClick }: {
  label: string; value: string; detail?: string; active?: boolean; onClick?: () => void;
}) {
  const content = <>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
  </>;
  const className = cn("rounded-lg border bg-card p-3 text-left", active && "border-primary/60 bg-primary/5");
  return onClick ? <button type="button" aria-pressed={active} onClick={onClick}
    className={cn(className, "transition-colors hover:bg-muted/50")}>{content}</button> : <div className={className}>{content}</div>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
    {message}<Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function LoanNotices({ loan }: { loan: Loan }) {
  const { notice, refunds, agency, reference } = loan;
  const actionableRefunds = refunds.filter(refund => refund.state !== "PAID" && refund.state !== "CANCELLED");
  return <>
    {notice && <li className="rounded-lg border border-amber-300/70 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-amber-700 dark:text-amber-300">Shortfall</Badge>
        <p className="font-medium">{reference} · {agency} · {monthLabel(notice.month)} · {deductionLabels[notice.status]}</p>
      </div>
      <p>Expected {peso(notice.expected)} · Withheld {peso(notice.actual)} · Shortfall {peso(notice.shortfall)}</p>
      <p className="text-muted-foreground">{notice.catchUp
        ? notice.catchUpScheduled ? `The agency's catch-up policy applies this shortfall to the ${monthLabel(notice.catchUpMonth)} Payroll schedule.`
          : "The agency allows Payroll catch-up, but the next month has no scheduled catch-up. Check with Payroll for the settlement instructions."
        : `The agency policy requires you to settle the ${peso(notice.shortfall)} shortfall directly with ${agency}.`}</p>
    </li>}
    {actionableRefunds.map(refund => <li key={refund.id} className="rounded-lg border border-sky-300/70 bg-sky-50/40 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="text-sky-700 dark:text-sky-300">Refund</Badge>
        <p className="font-medium">{reference} · {agency} · {monthLabel(refund.month)}</p></div>
      <p>{peso(refund.amount)} · {refundLabels[refund.state]}{refund.reference && ` · Agency reference ${refund.reference}`}</p>
      {refund.payout && <p className="text-muted-foreground">Paid {date(refund.payout.date)} · Payroll reference {refund.payout.reference}</p>}
    </li>)}
  </>;
}

function LoanHistory({ loan }: { loan: Loan }) {
  const [refresh, retry] = useState(0);
  const loaded = useRetainedLifecycleRead<History>(endpoint + "/" + loan.id, refresh);
  const data = loaded.data;
  return <>
    <DialogHeader>
      <DialogTitle>{loan.reference} · {loan.program}</DialogTitle>
      <DialogDescription>{loan.agency} · Monthly deductions and remittance evidence</DialogDescription>
    </DialogHeader>
    {!data && !loaded.error && <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></div>}
    {loaded.error && <LoadError message={loaded.error} retry={() => retry(value => value + 1)} />}
    {data && <div className={cn("min-h-0 space-y-4 overflow-y-auto pr-1", loaded.pending && "opacity-60")}>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-md border p-2"><p className="text-muted-foreground">Monthly amortization</p><p className="font-semibold">{peso(data.loan.amortization)}</p></div>
        <div className="rounded-md border p-2"><p className="text-muted-foreground">Paid</p><p className="font-semibold">{data.loan.counted} / {data.loan.term}</p></div>
        <div className="rounded-md border p-2"><p className="text-muted-foreground">Next deduction</p><p className="font-semibold">{displayAmount(data.loan.next)}</p></div>
        <div className="rounded-md border p-2"><p className="text-muted-foreground">Estimated balance</p><p className="font-semibold">{displayAmount(data.loan.estimate)}</p></div>
      </div>
      <h3 className="font-semibold">Monthly deductions</h3>
      <div className="hidden overflow-x-auto rounded-md border md:block"><Table>
        <TableHeader><TableRow>
          {["Payroll month", "Result", "Expected", "Withheld", "Remittance", "Final pay remainder"].map(label => <TableHead key={label}
            className={label === "Expected" || label === "Withheld" || label === "Final pay remainder" ? "text-right" : undefined}>{label}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{data.deductions.map(row => <TableRow key={row.month}>
          <TableCell>{monthLabel(row.month)}</TableCell>
          <TableCell><Badge variant="outline" className={deductionTone(row.status)}>{deductionLabels[row.status]}</Badge></TableCell>
          <TableCell className="text-right">{peso(row.expected)}</TableCell>
          <TableCell className="text-right">{displayAmount(row.actual)}</TableCell>
          <TableCell>{row.remittance ? <>
            {row.remittance.state === "APPROVED" ? "Approved" : "Awaiting approval"} · {date(row.remittance.date)}
            <div className="text-xs text-muted-foreground">{row.remittance.reference} · {peso(row.remittance.included)}</div>
          </> : "—"}</TableCell>
          <TableCell className="text-right">{displayAmount(row.unpaid)}</TableCell>
        </TableRow>)}
          {!data.deductions.length && <TableRow><TableCell colSpan={6}>No monthly deductions on record.</TableCell></TableRow>}
        </TableBody>
      </Table></div>
      <div className="space-y-2 md:hidden">{data.deductions.map(row => <article key={row.month} className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex items-center justify-between gap-2"><p className="font-medium">{monthLabel(row.month)}</p><Badge variant="outline" className={deductionTone(row.status)}>{deductionLabels[row.status]}</Badge></div>
        <dl className="grid grid-cols-2 gap-2">
          <div><dt className="text-xs text-muted-foreground">Expected</dt><dd>{peso(row.expected)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Withheld</dt><dd>{displayAmount(row.actual)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Final pay</dt><dd>{displayAmount(row.unpaid)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Remittance</dt><dd>{remittanceLabel(row.remittance)}</dd></div>
        </dl>
      </article>)}
        {!data.deductions.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No monthly deductions on record.</p>}
      </div>
      {(data.events.length > 0 || data.refunds.length > 0) && <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Loan changes and refunds ({data.events.length + data.refunds.length})</summary>
        {data.events.length > 0 && <ul className="mt-2 divide-y">{data.events.map(event => <li key={event.revision} className="break-words py-2">
          <div className="font-medium">Revision {event.revision} · {event.actor}</div>
          <div className="text-muted-foreground">{dateTime(event.at)} PHT · {event.remarks}</div>
        </li>)}</ul>}
        {data.refunds.length > 0 && <ul className="mt-2 divide-y">{data.refunds.map(refund => <li key={refund.id} className="break-words py-2">
          {peso(refund.amount)} refund · {refundLabels[refund.state]} · {monthLabel(refund.month)}
        </li>)}</ul>}
      </details>}
    </div>}
  </>;
}

export function MyLoansModule({ applicant }: { applicant: Pick<EmployeeChoice, "id" | "name"> }) {
  const [refresh, reload] = useState(0);
  const [agency, setAgency] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Loan>();
  const [requestSummary, setRequestSummary] = useState<RequestSummary>();
  const [applySignal, setApplySignal] = useState(0);
  const [reportSignal, setReportSignal] = useState(0);
  const [notice, setNotice] = useState("");
  const [copying, setCopying] = useState(false);
  const skipUrlWrite = useRef(true);
  const loaded = useRetainedLifecycleRead<Awaited<ReturnType<typeof listOwnLoans>>>(endpoint, refresh);
  const loans = loaded.data?.loans ?? [];
  const visible = loans.filter(loan => (!agency || String(loan.agencyId) === agency) && (!status || loan.active === (status === "active")));
  const hasFilters = Boolean(agency || status);
  const activeLoans = loans.filter(loan => loan.active);
  const monthly = activeLoans.reduce((sum, loan) => sum + Number(loan.next ?? 0), 0).toFixed(2);
  const requests = requestSummary
    ? requestSummary.REQUESTED + requestSummary.APPROVED + requestSummary.ENROLLED + requestSummary.RETURNED : null;
  const noticeCount = loans.reduce((count, loan) => count + (loan.notice ? 1 : 0) +
    loan.refunds.filter(refund => refund.state !== "PAID" && refund.state !== "CANCELLED").length, 0);

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      setAgency(params.get("ml_agency") ?? "");
      setStatus(["active", "closed"].includes(params.get("ml_status") ?? "") ? params.get("ml_status")! : "");
    };
    syncFromLocation();
    skipUrlWrite.current = true;
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (skipUrlWrite.current) { skipUrlWrite.current = false; return; }
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => value ? params.set(key, value) : params.delete(key);
    setOrDelete("ml_agency", agency);
    setOrDelete("ml_status", status);
    const next = params.toString();
    const target = window.location.pathname + (next ? "?" + next : "") + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (target !== current) window.history.replaceState(window.history.state, "", target);
  }, [agency, status]);

  function scrollTo(id: string) {
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  function openApply() {
    setApplySignal(value => value + 1);
    scrollTo("my-loan-requests");
  }

  function openReport() {
    setReportSignal(value => value + 1);
    scrollTo("my-posting-disputes");
  }

  async function copyStatement() {
    if (!loans.length || copying) return;
    setCopying(true);
    setNotice("");
    const rows = [["Reference", "Agency", "Program", "Status", "Monthly amortization", "Paid", "Term", "Estimated balance",
      "Next deduction", "Latest deduction", "Latest remittance"], ...loans.map(loan => [
      loan.reference, loan.agency, loan.program, registerStatusLabels[loan.status], loan.amortization,
      String(loan.counted), String(loan.term), loan.estimate ?? "", loan.next ?? "",
      loan.latestDeduction ? `${monthLabel(loan.latestDeduction.month)} · ${deductionLabels[loan.latestDeduction.status]}` : "",
      loan.latestDeduction ? remittanceLabel(loan.latestDeduction.remittance) : "",
    ])];
    try {
      await copyText(rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n"));
      setNotice("Statement copied to clipboard.");
    } catch {
      setNotice("Could not copy the statement.");
    } finally {
      setCopying(false);
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Hi, {applicant.name.split(" ")[0]}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Your loans deducted through payroll, and when each deduction was remitted to the agency or lender.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void copyStatement()} disabled={!loans.length || copying}>
          <Copy className="size-4" />{copying ? "Preparing…" : "Copy my statement"}
        </Button>
        <Button type="button" variant="outline" onClick={openReport}><MessageSquarePlus className="size-4" />Report a posting problem</Button>
        <Button type="button" onClick={openApply}><Plus className="size-4" />Apply for a loan</Button>
      </div>
    </div>
    {notice && <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
    {loaded.error && <LoadError message={loaded.error} retry={() => reload(value => value + 1)} />}
    {!loaded.data && !loaded.error && <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">{[0, 1, 2].map(value => <Skeleton key={value} className="h-[86px] rounded-lg" />)}</div>}
    {loaded.data && <>
      <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-3", loaded.pending && "opacity-60")}>
        <SummaryCard label="Monthly loan deductions" value={peso(monthly)} detail={peso((Number(monthly) / 2).toFixed(2)) + " per cut-off"} />
        <SummaryCard label="Active loans" value={String(activeLoans.length)} detail={activeLoans.length ? "Deducted through payroll" : "No active loans"}
          active={status === "active"} onClick={() => setStatus(current => current === "active" ? "" : "active")} />
        <SummaryCard label="Requests in progress" value={requests === null ? "—" : String(requests)} detail="Open loan requests"
          onClick={() => scrollTo("my-loan-requests")} />
      </div>
      {noticeCount > 0 && <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Notices</h3><Badge variant="outline">{noticeCount}</Badge></div>
        <ul className="space-y-2 text-sm">{loans.map(loan => <LoanNotices key={loan.id} loan={loan} />)}</ul>
      </section>}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-lg font-semibold">Loan history</h3><p className="text-sm text-muted-foreground">{visible.length} of {loans.length} loan(s) shown</p></div>
          {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={() => { setAgency(""); setStatus(""); }}>Clear filters</Button>}
        </div>
        {loans.length > 0 && <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <label className="grid gap-1 text-sm">Agency<NativeSelect value={agency} onChange={event => setAgency(event.target.value)}>
            <option value="">All agencies</option>
            {[...new Map(loans.map(loan => [loan.agencyId, loan.agency]))].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </NativeSelect></label>
          <label className="grid gap-1 text-sm">Show<NativeSelect value={status} onChange={event => setStatus(event.target.value)}>
            <option value="">All loans</option><option value="active">Active loans</option><option value="closed">Closed loans</option>
          </NativeSelect></label>
        </div>}
        {!loans.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">You have no loans on record.</p>}
        {loans.length > 0 && !visible.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No loans match these filters.</p>}
        <div className={cn("grid gap-3 lg:grid-cols-2", loaded.pending && "opacity-60")}>{visible.map(loan => {
          const latest = loan.latestDeduction;
          return <article key={loan.id} className="cursor-pointer space-y-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
            onClick={() => setSelected(loan)}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h4 className="break-all font-semibold">{loan.reference} · {loan.program}</h4>
                <div className="mt-1 flex flex-wrap items-center gap-2"><AgencyBadge name={loan.agency} />
                  <Badge variant="outline" className={statusTone(loan.active)}>{registerStatusLabels[loan.status]}</Badge></div></div>
              <p className="text-sm text-muted-foreground">{loan.counted} / {loan.term} paid</p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Monthly amortization</dt><dd className="font-medium">{peso(loan.amortization)}</dd></div>
              <div><dt className="text-muted-foreground">Estimated balance</dt><dd>{displayAmount(loan.estimate)}</dd></div>
              <div><dt className="text-muted-foreground">Next deduction</dt><dd>{displayAmount(loan.next)}</dd></div>
            </dl>
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary"
                style={{ width: Math.min(100, loan.term ? loan.counted / loan.term * 100 : 0) + "%" }} /></div>
              <p className="mt-1 text-xs text-muted-foreground">{latest
                ? `Last deduction ${monthLabel(latest.month)} · ${deductionLabels[latest.status]} · ${remittanceLabel(latest.remittance)}`
                : "No deductions yet"}</p>
            </div>
            <Button type="button" size="sm" variant="outline" aria-label={`View deductions for ${loan.reference}`}
              onClick={event => { event.stopPropagation(); setSelected(loan); }}>View deductions</Button>
          </article>;
        })}</div>
      </section>
    </>}
    <section id="my-loan-requests" className="scroll-mt-4">
      <LoanRequestsModule key={`requests-${applySignal}`} applicant={applicant} initialNew={applySignal > 0} onSummary={setRequestSummary} />
    </section>
    <section id="my-posting-disputes" className="scroll-mt-4">
      <PostingDisputesModule key={`disputes-${reportSignal}`} self initialFiling={reportSignal > 0} />
    </section>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-3xl">
        {selected && <LoanHistory key={selected.id} loan={selected} />}
      </DialogContent>
    </Dialog>
  </div>;
}
