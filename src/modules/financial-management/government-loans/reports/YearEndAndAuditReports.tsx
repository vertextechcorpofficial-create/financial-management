"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { date, peso } from "@/modules/financial-management/cooperative/members/format";
import { EmptyState } from "../components/ui";
import { useRetainedLifecycleRead } from "../loans/lifecycle-client";
import type { reportYearEnd } from "../server/year-end-report";
import type { reportAuditTrail } from "../server/audit-report";
import { AgencyBadge, ReadFeedback, ReportPages } from "./GovernmentLoanReports";
import { CopyReport, ReportControls, ReportHeader, ReportMetric, useReportView } from "./ReportControls";

const base = "/api/fm/government-loans/reports";
const money = (value: string | null) => value === null ? "—" : peso(value);
const monthLabel = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" })
  .format(new Date(value + "-01T00:00:00Z"));
const manila = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila" });

type YearEnd = Awaited<ReturnType<typeof reportYearEnd>>;
type Audit = Awaited<ReturnType<typeof reportAuditTrail>>;

function ReportSkeleton({ rows = 5 }: { rows?: number }) {
  return <div className="space-y-2 rounded-lg border p-3">{Array.from({ length: rows }, (_, index) =>
    <Skeleton key={index} className="h-10 w-full" style={{ opacity: 1 - index * 0.12 }} />)}</div>;
}

export function YearEndSummaryReport({ actorId }: { actorId?: number }) {
  const state = useReportView("year", actorId);
  const [refresh, retry] = useState(0);
  const url = base + "/year-end?" + state.params;
  const loaded = useRetainedLifecycleRead<YearEnd>(url, refresh);
  const data = loaded.data;

  return <section className="space-y-4">
    <ReportHeader title="Year-End Summary" subtitle="What was deducted, remitted and paid in penalties for the year, by agency and by employee.">
      {data && <CopyReport key={url} url={url + "&format=csv"} filename={`government-loans-year-end-${data.year}.csv`} countLabel="employees" />}
    </ReportHeader>
    <ReportControls state={state}>
      <label className="grid gap-1 text-sm">Payroll year
        <Input type="number" name="year" min={1000} max={data?.openYear ?? 9999}
          placeholder={data?.openYear ?? "Open Payroll year"} defaultValue={state.view.filters.year ?? ""} className="w-40" />
      </label>
      <label className="grid gap-1 text-sm">Employee name or ID
        <Input name="q" defaultValue={state.view.filters.q ?? ""} maxLength={120} />
      </label>
      <label className="grid gap-1 text-sm">Department
        <NativeSelect aria-label="Department" name="department" defaultValue={state.view.filters.department ?? ""}>
          <option value="">All departments</option>
          {state.view.filters.department && !data?.departments.some(row => String(row.id) === state.view.filters.department) &&
            <option value={state.view.filters.department}>Department {state.view.filters.department}</option>}
          {data?.departments.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </NativeSelect>
      </label>
    </ReportControls>
    {!data && !loaded.error && <ReportSkeleton rows={6} />}
    {loaded.error && <ReadFeedback error={loaded.error} retry={() => retry(value => value + 1)} message="Loading year-end summary…" />}
    {data && <>
      <div className={cn("grid grid-cols-2 gap-2 xl:grid-cols-4", loaded.pending && "opacity-60")}>
        <ReportMetric label="Withheld" value={money(data.totals.withheld)} detail="Payroll year" tone="accent" />
        <ReportMetric label="Remitted" value={money(data.totals.remitted)} detail="Approved principal" />
        <ReportMetric label="Outstanding" value={money(data.totals.outstanding)} detail="Not yet remitted"
          tone={data.totals.outstanding !== "0.00" ? "critical" : undefined} />
        <ReportMetric label="Penalties" value={money(data.totals.penalties)} detail={`${data.totals.late} late remittance(s)`} />
      </div>
      <div className="rounded-lg border p-3 text-sm">
        <p className="font-medium">Payroll {data.year} through {monthLabel(data.end)}</p>
        <p className="text-muted-foreground">{data.complete ? "All months in scope confirmed." :
          "Incomplete · Awaiting confirmed Payroll for " + data.months.filter(row => !row.receipt).map(row => monthLabel(row.month)).join(", ")}</p>
        <details className="mt-2"><summary className="cursor-pointer">Payroll receipt sources</summary>
          <ul className="mt-1 space-y-1 text-muted-foreground">{data.months.map(row => <li className="break-all" key={row.month}>
            {monthLabel(row.month)} · {row.receipt ? "Revision " + row.receipt.revision + " · " + row.receipt.id : "Awaiting Payroll"}
          </li>)}</ul>
        </details>
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold">Agency reconciliation · Full selected year</h3>
        <div className={cn("hidden overflow-x-auto rounded-lg border md:block", loaded.pending && "opacity-60")}>
          <Table>
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
              {["Agency", "Withheld · Payroll year", "Remitted · Payroll year", "Outstanding · Payroll year", "Late remittances · Payroll year", "Penalties · Payment year"]
                .map(label => <TableHead key={label} className={label !== "Agency" ? "text-right" : undefined}>{label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>{data.agencies.map(row => <TableRow key={row.id}>
              <TableCell><div><AgencyBadge name={row.agency} code={row.code} /></div>
                {row.payments.length > 0 && <details className="mt-1 text-xs">
                  <summary className="cursor-pointer">Approval references</summary>
                  <ul className="mt-1 space-y-1">{row.payments.map(payment => <li className="whitespace-normal break-words" key={payment.id}>
                    {payment.reference} · Payroll {monthLabel(payment.payrollMonth)} · Paid {date(payment.paymentDate)} · {peso(payment.principal)}
                    <span className="block break-all text-muted-foreground">{payment.approvalId ? "Approval " + payment.approvalId : "Remittance " + payment.id}</span>
                  </li>)}</ul>
                </details>}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(row.withheld)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(row.remitted)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(row.outstanding)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.late}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(row.penalties)}</TableCell>
            </TableRow>)}
              {!data.agencies.length && <TableRow><TableCell colSpan={6} className="p-0">
                <EmptyState icon={SearchX} title="No confirmed deduction or remittance activity" description="Activity appears after Payroll and remittances are confirmed." />
              </TableCell></TableRow>}
            </TableBody>
            <TableFooter><TableRow><TableCell>Total</TableCell><TableCell className="text-right tabular-nums">{peso(data.totals.withheld)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(data.totals.remitted)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(data.totals.outstanding)}</TableCell>
              <TableCell className="text-right tabular-nums">{data.totals.late}</TableCell>
              <TableCell className="text-right tabular-nums">{peso(data.totals.penalties)}</TableCell></TableRow></TableFooter>
          </Table>
        </div>
        <div className={cn("space-y-2 md:hidden", loaded.pending && "opacity-60")}>{data.agencies.map(row => <article key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><AgencyBadge name={row.agency} code={row.code} />
            <span className="text-xs text-muted-foreground">{row.late} late</span></div>
          <dl className="grid grid-cols-2 gap-2">
            <div><dt className="text-xs text-muted-foreground">Withheld</dt><dd className="tabular-nums">{peso(row.withheld)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Remitted</dt><dd className="tabular-nums">{peso(row.remitted)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Outstanding</dt><dd className="tabular-nums">{peso(row.outstanding)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Penalties</dt><dd className="tabular-nums">{peso(row.penalties)}</dd></div>
          </dl>
          {row.payments.length > 0 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Approval references</summary>
            <ul className="mt-1 space-y-1">{row.payments.map(payment => <li className="break-words" key={payment.id}>
              {payment.reference} · {monthLabel(payment.payrollMonth)} · {peso(payment.principal)}</li>)}</ul></details>}
        </article>)}
          {!data.agencies.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No confirmed deduction or approved remittance activity.</p>}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2"><h3 className="font-semibold">By employee</h3>
          <p className="text-sm text-muted-foreground">{data.totalEmployees} employee(s)</p></div>
        <p className="text-sm text-muted-foreground">Filtered withholding · {peso(data.filteredWithheld)}
          {data.filteredAgencies.map(row => <span key={row.id} className="block">{row.code} · {row.agency} · {peso(row.withheld)}</span>)}</p>
        <div className={cn("hidden overflow-x-auto rounded-lg border md:block", loaded.pending && "opacity-60")}>
          <Table>
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
              {["Employee", "Department", "Agency deductions", "Total"].map(label =>
                <TableHead key={label} className={label === "Total" ? "text-right" : undefined}>{label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {data.employees.map(row => <TableRow key={row.id}><TableCell>{row.name} · {row.id}</TableCell>
                <TableCell>{row.department ?? "—"}</TableCell><TableCell><ul>{row.agencies.map(item => <li key={item.agencyId}>
                  {data.agencies.find(agency => agency.id === item.agencyId)?.code ?? item.agencyId} · {peso(item.amount)}</li>)}</ul></TableCell>
                <TableCell className="text-right tabular-nums">{peso(row.total)}</TableCell></TableRow>)}
              {!data.employees.length && <TableRow><TableCell colSpan={4} className="p-0">
                <EmptyState icon={SearchX} title="No employee deductions match" description="Try a different year, name, or department." />
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className={cn("space-y-2 md:hidden", loaded.pending && "opacity-60")}>{data.employees.map(row => <article key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{row.name} · {row.id}</p>
            <span className="tabular-nums">{peso(row.total)}</span></div>
          <p className="text-xs text-muted-foreground">{row.department ?? "No department"}</p>
          <ul className="text-xs text-muted-foreground">{row.agencies.map(item => <li key={item.agencyId}>
            {data.agencies.find(agency => agency.id === item.agencyId)?.code ?? item.agencyId} · {peso(item.amount)}</li>)}</ul>
        </article>)}
          {!data.employees.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No employee deductions match.</p>}
        </div>
        <ReportPages page={state.page} more={data.hasMore} change={state.setPage} label="Year-end employee pages" />
      </div>
    </>}
  </section>;
}

export function AuditTrailReport({ actorId }: { actorId?: number }) {
  const state = useReportView("audit", actorId);
  const [refresh, retry] = useState(0);
  const url = base + "/audit?" + state.params;
  const loaded = useRetainedLifecycleRead<Audit>(url, refresh);
  const data = loaded.data;
  return <section className="space-y-3">
    <ReportHeader title="Audit Trail" subtitle="Every action in the module: who did it, when, and what changed. Entries cannot be edited or deleted.">
      {data && <CopyReport key={url} url={url + "&format=csv"} filename="government-loans-audit-trail.csv" countLabel="events" />}
    </ReportHeader>
    <ReportControls state={state}>
      {([["user", "User name or ID", 120], ["action", "Action", 100], ["reference", "Reference or detail", 200]] as const).map(([key, label, limit]) =>
        <label key={key} className="grid gap-1 text-sm">{label}
          <Input name={key} maxLength={limit} defaultValue={state.view.filters[key] ?? ""} />
        </label>)}
      <label className="grid gap-1 text-sm">From (Manila)<Input type="date" name="from" defaultValue={state.view.filters.from ?? ""} /></label>
      <label className="grid gap-1 text-sm">To (Manila)<Input type="date" name="to" defaultValue={state.view.filters.to ?? ""} /></label>
    </ReportControls>
    {!data && !loaded.error && <ReportSkeleton rows={6} />}
    {loaded.error && <ReadFeedback error={loaded.error} retry={() => retry(value => value + 1)} message="Loading audit trail…" />}
    {data && <>
      <p className="text-sm text-muted-foreground">{data.total} matching event(s)</p>
      <div className={cn("hidden overflow-x-auto rounded-lg border md:block", loaded.pending && "opacity-60")}>
        <Table>
          <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card"><TableRow>
            {["When (Manila)", "User", "Action", "Reference", "Details"].map(label => <TableHead key={label}>{label}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {data.items.map(event => <TableRow key={event.key}>
              <TableCell className="whitespace-nowrap">{manila.format(new Date(event.at))}</TableCell>
              <TableCell>{event.actor}{event.role && <span className="block text-xs text-muted-foreground">{event.role}</span>}</TableCell>
              <TableCell><Badge variant="outline">{event.label}</Badge></TableCell>
              <TableCell className="whitespace-normal break-all">
                <span>{event.references[0]}</span>
                {event.references.length > 1 && <details className="mt-1 text-xs"><summary className="cursor-pointer">More references</summary>
                  {event.references.slice(1).map(reference => <div key={reference}>{reference}</div>)}</details>}
              </TableCell>
              <TableCell className="min-w-48 whitespace-normal break-words">
                {event.details.length > 0 && <ul className="space-y-1">{event.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
              </TableCell>
            </TableRow>)}
            {!data.items.length && <TableRow><TableCell colSpan={5} className="p-0">
              <EmptyState icon={SearchX} title="No audit entries match" description="Try a different user, action, reference, or date range." />
            </TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className={cn("space-y-2 md:hidden", loaded.pending && "opacity-60")}>{data.items.map(event => <article key={event.key} className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium">{event.actor}</p><Badge variant="outline">{event.label}</Badge></div>
        <p className="text-xs text-muted-foreground">{manila.format(new Date(event.at))}{event.role && " · " + event.role}</p>
        {event.references.length > 0 && <p className="break-all text-xs">{event.references.join(" · ")}</p>}
        {event.details.length > 0 && <ul className="list-inside list-disc text-xs text-muted-foreground">{event.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
      </article>)}
        {!data.items.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No audit entries match.</p>}
      </div>
      <ReportPages page={state.page} more={data.hasMore} change={state.setPage} label="Audit pages" />
    </>}
  </section>;
}
