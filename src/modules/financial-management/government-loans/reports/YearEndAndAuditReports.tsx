"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date, peso } from "@/modules/financial-management/cooperative/members/format";
import { useLifecycleRead } from "../loans/lifecycle-client";
import type { reportYearEnd } from "../server/year-end-report";
import type { reportAuditTrail } from "../server/audit-report";
import { ReadFeedback, ReportPages } from "./GovernmentLoanReports";
import { CopyReport, ReportControls, useReportView } from "./ReportControls";

const base = "/api/fm/government-loans/reports";

type YearEnd = Awaited<ReturnType<typeof reportYearEnd>>;
type Audit = Awaited<ReturnType<typeof reportAuditTrail>>;
const manila = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Manila" });

export function YearEndSummaryReport({ actorId }: { actorId?: number }) {
  const state = useReportView("year", actorId);
  const [refresh, retry] = useState(0);
  const url = base + "/year-end?" + state.params;
  const loaded = useLifecycleRead<YearEnd>(url, refresh);
  const data = loaded?.data;

  return <section className="space-y-4">
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
    {!data && <ReadFeedback error={loaded?.error} retry={() => retry(value => value + 1)} message="Loading year-end summary…" />}
    {data && <>
      <CopyReport key={url} url={url + "&format=csv"} filename={`government-loans-year-end-${data.year}.csv`} countLabel="employees" />
      <div className="text-sm">
        <p className="font-medium">Payroll {data.year} through {data.end}</p>
        <p className="text-muted-foreground">{data.complete ? "All months in scope confirmed." :
          "Incomplete · Awaiting confirmed Payroll for " + data.months.filter(row => !row.receipt).map(row => row.month).join(", ")}</p>
        <details className="mt-2"><summary className="cursor-pointer">Payroll receipt sources</summary>
          <ul className="mt-1 space-y-1 text-muted-foreground">{data.months.map(row => <li className="break-all" key={row.month}>
            {row.month} · {row.receipt ? "Revision " + row.receipt.revision + " · " + row.receipt.id : "Awaiting Payroll"}
          </li>)}</ul>
        </details>
      </div>
      <h3 className="font-semibold">Agency reconciliation · Full selected year</h3>
      <div className="rounded-md border"><Table>
        <TableHeader><TableRow>{["Agency", "Withheld · Payroll year", "Remitted · Payroll year", "Outstanding · Payroll year",
          "Late remittances · Payroll year", "Penalties · Payment year"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data.agencies.map(row => <TableRow key={row.id}>
          <TableCell><div>{row.code} · {row.agency}</div>
            {row.payments.length > 0 && <details className="mt-1 text-xs">
              <summary className="cursor-pointer">Approval references</summary>
              <ul className="mt-1 space-y-1">{row.payments.map(payment => <li className="whitespace-normal break-words" key={payment.id}>
                {payment.reference} · Payroll {payment.payrollMonth} · Paid {date(payment.paymentDate)} · {peso(payment.principal)}
                <span className="block break-all text-muted-foreground">{payment.approvalId ? "Approval " + payment.approvalId : "Remittance " + payment.id}</span>
              </li>)}</ul>
            </details>}
          </TableCell>
          <TableCell>{peso(row.withheld)}</TableCell><TableCell>{peso(row.remitted)}</TableCell><TableCell>{peso(row.outstanding)}</TableCell>
          <TableCell>{row.late}</TableCell><TableCell>{peso(row.penalties)}</TableCell>
        </TableRow>)}
        {!data.agencies.length && <TableRow><TableCell colSpan={6}>No confirmed deduction or approved remittance activity.</TableCell></TableRow>}
        </TableBody>
        <TableFooter><TableRow><TableCell>Total</TableCell><TableCell>{peso(data.totals.withheld)}</TableCell>
          <TableCell>{peso(data.totals.remitted)}</TableCell><TableCell>{peso(data.totals.outstanding)}</TableCell>
          <TableCell>{data.totals.late}</TableCell><TableCell>{peso(data.totals.penalties)}</TableCell></TableRow></TableFooter>
      </Table></div>
      <h3 className="font-semibold">By employee</h3>
      <p className="text-sm text-muted-foreground">{data.totalEmployees} employee(s)</p>
      <div className="space-y-1 text-sm">
        <div>Filtered withholding · {peso(data.filteredWithheld)}</div>
        {data.filteredAgencies.map(row => <div key={row.id}>{row.code} · {row.agency} · {peso(row.withheld)}</div>)}
      </div>
      <div className="rounded-md border"><Table><TableHeader><TableRow>
        <TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Agency deductions</TableHead><TableHead>Total</TableHead>
      </TableRow></TableHeader><TableBody>
        {data.employees.map(row => <TableRow key={row.id}><TableCell>{row.name} · {row.id}</TableCell>
          <TableCell>{row.department ?? "—"}</TableCell><TableCell><ul>{row.agencies.map(item => <li key={item.agencyId}>
            {data.agencies.find(agency => agency.id === item.agencyId)?.code ?? item.agencyId} · {peso(item.amount)}
          </li>)}</ul></TableCell><TableCell>{peso(row.total)}</TableCell></TableRow>)}
        {!data.employees.length && <TableRow><TableCell colSpan={4}>No employee deductions match.</TableCell></TableRow>}
      </TableBody></Table></div>
      <ReportPages page={state.page} more={data.hasMore} change={state.setPage} label="Year-end employee pages" />
    </>}
  </section>;
}

export function AuditTrailReport({ actorId }: { actorId?: number }) {
  const state = useReportView("audit", actorId);
  const [refresh, retry] = useState(0);
  const url = base + "/audit?" + state.params;
  const loaded = useLifecycleRead<Audit>(url, refresh);
  const data = loaded?.data;
  return <section className="space-y-3">
    <ReportControls state={state}>
      {([["user", "User name or ID", 120], ["action", "Action", 100], ["reference", "Reference or detail", 200]] as const).map(([key, label, limit]) =>
        <label key={key} className="grid gap-1 text-sm">{label}
          <Input name={key} maxLength={limit} defaultValue={state.view.filters[key] ?? ""} />
        </label>)}
      <label className="grid gap-1 text-sm">From (Manila)<Input type="date" name="from" defaultValue={state.view.filters.from ?? ""} /></label>
      <label className="grid gap-1 text-sm">To (Manila)<Input type="date" name="to" defaultValue={state.view.filters.to ?? ""} /></label>
    </ReportControls>
    {!data && <ReadFeedback error={loaded?.error} retry={() => retry(value => value + 1)} message="Loading audit trail…" />}
    {data && <>
      <p className="text-sm text-muted-foreground">{data.total} matching event(s)</p>
      <CopyReport key={url} url={url + "&format=csv"} filename="government-loans-audit-trail.csv" countLabel="events" />
      <div className="rounded-md border"><Table><TableHeader><TableRow>
        {["When (Manila)", "User", "Action", "Reference", "Details"].map(label => <TableHead key={label}>{label}</TableHead>)}
      </TableRow></TableHeader><TableBody>
        {data.items.map(event => <TableRow key={event.key}>
          <TableCell>{manila.format(new Date(event.at))}</TableCell>
          <TableCell>{event.actor}{event.role && <span className="block text-xs text-muted-foreground">{event.role}</span>}</TableCell>
          <TableCell>{event.label}</TableCell>
          <TableCell className="whitespace-normal break-all">
            <span>{event.references[0]}</span>
            {event.references.length > 1 && <details className="mt-1 text-xs"><summary className="cursor-pointer">More references</summary>
              {event.references.slice(1).map(reference => <div key={reference}>{reference}</div>)}</details>}
          </TableCell>
          <TableCell className="min-w-48 whitespace-normal break-words">
            {event.details.length > 0 && <ul className="space-y-1">{event.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
          </TableCell>
        </TableRow>)}
        {!data.items.length && <TableRow><TableCell colSpan={5}>No audit entries match.</TableCell></TableRow>}
      </TableBody></Table></div>
      <ReportPages page={state.page} more={data.hasMore} change={state.setPage} label="Audit pages" />
    </>}
  </section>;
}
