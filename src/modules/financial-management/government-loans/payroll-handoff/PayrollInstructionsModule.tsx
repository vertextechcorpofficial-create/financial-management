"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { EmptyState, StatusChip, tabTriggerClass } from "../components/ui";
import { TabIcon } from "../components/tab-icons";
import { deductionMonthLabel } from "../enrollment/rules";
import type { Page } from "../requests/types";
import { payrollAcknowledgementTemplate } from "./file-exchange";
import { PayrollInstructionDetails } from "./PayrollInstructionDetails";
import { PayrollResults } from "./PayrollResults";
import { handoffStatusLabels, type PayrollInstructionRow } from "./types";

export function PayrollInstructionsModule({ canOpenSetup }: { canOpenSetup?: boolean } = {}) {
  const [tab, setTab] = useState("outbound");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string>();
  const [loaded, setLoaded] = useState<{ key: string; data?: Page<PayrollInstructionRow>; error?: string }>();
  const query = new URLSearchParams({ q: search.trim(), page: String(page), ...(status ? { state: status } : {}) }).toString();
  const key = query + ":" + refresh;
  const current = loaded?.key === key ? loaded : undefined;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/fm/government-loans/loans/payroll-instructions?" + query,
          { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message ?? "Could not load Payroll instructions.");
        if (!controller.signal.aborted) setLoaded({ key, data });
      } catch (cause) {
        if (!controller.signal.aborted) setLoaded({ key, error: cause instanceof Error ? cause.message : "Could not load Payroll instructions." });
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, key]);

  return <div className="space-y-4">
    <header>
      <h2 className="text-lg font-semibold">Payroll instructions</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">
        What this module sent to Payroll, and what Payroll reported back. Payroll performs the deduction and returns the result.
      </p>
    </header>

    <Tabs value={tab} onValueChange={setTab} className="gap-3">
      <TabsList aria-label="Payroll instruction views" className="w-full justify-start">
        <TabsTrigger value="outbound" className={tabTriggerClass}><TabIcon tabKey="outbound" />Outbound — instructions</TabsTrigger>
        <TabsTrigger value="inbound" className={tabTriggerClass}><TabIcon tabKey="inbound" />Inbound — results</TabsTrigger>
      </TabsList>

      <TabsContent value="inbound" className="mt-0">
        <PayrollResults canOpenSetup={canOpenSetup} />
      </TabsContent>

      <TabsContent value="outbound" className="mt-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-full sm:max-w-xs" value={search} maxLength={120} placeholder="Employee, loan, or agency reference"
            aria-label="Search Payroll instructions" onChange={event => { setSearch(event.target.value); setPage(1); }} />
          <NativeSelect aria-label="Filter Payroll instructions by status" value={status}
            onChange={event => { setStatus(event.target.value); setPage(1); }}>
            <option value="">All delivery statuses</option>
            {Object.entries(handoffStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </NativeSelect>
          <Button type="button" variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)}>Refresh</Button>
          <span className="ml-auto text-sm text-muted-foreground">{current?.data
            ? `${current.data.items.length}${current.data.hasMore ? "+" : ""} instruction${current.data.items.length === 1 ? "" : "s"}`
            : "Loading…"}</span>
        </div>

        {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
        {current?.error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <span className="min-w-0 flex-1">{current.error}</span>
          <Button size="sm" variant="outline" onClick={() => setRefresh(value => value + 1)}>Retry</Button>
        </div>}

        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-8" />
              <TableHead>Loan / Employee</TableHead>
              <TableHead>Agency</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Effective month</TableHead>
              <TableHead className="text-right">Monthly amount</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!current && Array.from({ length: 8 }, (_, row) => <TableRow key={row}>
                {Array.from({ length: 9 }, (_, cell) => <TableCell key={cell}><Skeleton className={cn("h-4", cell === 1 ? "w-40" : "w-24")} /></TableCell>)}
              </TableRow>)}
              {current?.data?.items.map(item => {
                const open = expanded === item.payload.handoffId;
                return <Fragment key={item.payload.handoffId}>
                  <TableRow key={item.payload.handoffId} className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpanded(open ? undefined : item.payload.handoffId)}>
                    <TableCell>{open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}</TableCell>
                    <TableCell>
                      <p className="font-medium">{item.reference}</p>
                      <p className="text-xs text-muted-foreground">{item.employeeName ?? "Employee " + item.payload.employeeId}</p>
                    </TableCell>
                    <TableCell>{item.agencyName ?? "Agency " + item.payload.agencyId}</TableCell>
                    <TableCell>{item.payload.program}</TableCell>
                    <TableCell>{deductionMonthLabel(item.payload.start.effectiveMonth)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(item.payload.start.monthlyAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.payload.start.remainingInstallments}</TableCell>
                    <TableCell><StatusChip status={item.state} label={handoffStatusLabels[item.state]} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{dateTime(item.updatedAt)}</TableCell>
                  </TableRow>
                  {open && <TableRow key={item.payload.handoffId + ":detail"}>
                    <TableCell colSpan={9} className="bg-muted/20">
                      <div className="space-y-3">
                        <PayrollInstructionDetails {...item} />
                        <div className="flex flex-wrap items-center gap-3">
                          {item.fileExchange && (item.state === "QUEUED" || item.state === "RETRYABLE") &&
                            <PayrollDownload item={item} onDownloaded={() => {
                              setNotice(`${item.reference} · CSV downloaded. Awaiting Payroll acknowledgement.`);
                              setRefresh(value => value + 1);
                            }} />}
                          {item.state !== "ACCEPTED" && <a className="inline-block text-sm text-primary underline" download="payroll-acknowledgement-template.csv"
                            href={"data:text/csv;charset=utf-8," + encodeURIComponent(payrollAcknowledgementTemplate(item.payload))}>
                            Download acknowledgement template
                          </a>}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>}
                </Fragment>;
              })}
              {current?.data && !current.data.items.length && <TableRow><TableCell colSpan={9} className="p-0">
                <EmptyState icon={FileSpreadsheet} title="No Payroll instructions match" description="Instructions appear here after an enrollment is verified." />
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        {current?.data && (page > 1 || current.data.hasMore) && <nav className="flex flex-wrap justify-end gap-2" aria-label="Payroll instruction pages">
          <Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="self-center text-sm text-muted-foreground">Page {page}</span>
          <Button type="button" size="sm" variant="outline" disabled={!current.data.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>}
      </TabsContent>
    </Tabs>
  </div>;
}

function PayrollDownload({ item, onDownloaded }: { item: PayrollInstructionRow; onDownloaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    key.current ??= consignmentRequestId();
    try {
      const response = await fetch(`/api/fm/government-loans/loans/payroll-instructions/${item.payload.enrollmentId}`, {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({ expectedRevision: item.revision }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "Payroll instructions could not be downloaded.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `payroll-instructions-${item.payload.handoffId}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onDownloaded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payroll instructions could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-2">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="button" size="sm" disabled={busy} onClick={() => void download()}>
      {busy ? "Downloading…" : item.state === "RETRYABLE" ? "Download original CSV for retry" : "Download instructions CSV"}
    </Button>
  </div>;
}
