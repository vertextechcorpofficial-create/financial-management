"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CountLineRow } from "../types";
import { COUNT_STATUS_LABELS } from "../types";
import { ReconcilePanel } from "./components/ReconcilePanel";
import { ReportPanel } from "./components/ReportPanel";
import { useCountSession } from "./hooks/useCountSessions";

type SheetFilter = "all" | "uncounted" | "found" | "notfound" | "station";
type Tab = "sheet" | "reconcile" | "report";
type PendingAction = "lock" | "reopen" | "submit" | null;

const FILTERS: { key: SheetFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "uncounted", label: "Not yet counted" },
  { key: "found", label: "Found" },
  { key: "notfound", label: "Not found" },
  { key: "station", label: "At station" },
];

export default function CountSessionModule({ sessionId }: { sessionId: number }) {
  const { detail, report, loading, error, busy, refresh, mark, resolve, act, loadReport } = useCountSession(sessionId);
  const [tab, setTab] = React.useState<Tab>("sheet");
  const [filter, setFilter] = React.useState<SheetFilter>("all");
  const [q, setQ] = React.useState("");
  const [pending, setPending] = React.useState<PendingAction>(null);
  const [input, setInput] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  const stats = detail?.stats;
  const status = detail?.session.session_status ?? "draft";
  const locked = status === "locked" || status === "submitted";

  // opening the Report tab should show the PPE report, not an empty frame
  const autoReport = React.useRef(false);
  React.useEffect(() => {
    if (tab !== "report" || report || autoReport.current) return;
    autoReport.current = true;
    void loadReport("rpcppe");
  }, [tab, report, loadReport]);

  const [sheetPage, setSheetPage] = React.useState(1);
  const [sheet, setSheet] = React.useState<{ rows: CountLineRow[]; total: number; pageSize: number }>({
    rows: [],
    total: 0,
    pageSize: 100,
  });
  const [sheetLoading, setSheetLoading] = React.useState(false);
  const [sheetToken, setSheetToken] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setSheetLoading(true);
    const params = new URLSearchParams({ page: String(sheetPage), filter, q });
    fetch("/api/fm/lgu-asset-management-system/physical-count/" + sessionId + "/lines?" + params)
      .then((res) => res.json())
      .then((json) => {
        if (!alive || !json || !Array.isArray(json.rows)) return;
        setSheet({ rows: json.rows, total: Number(json.total ?? 0), pageSize: Number(json.pageSize ?? 100) });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setSheetLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sessionId, sheetPage, filter, q, sheetToken]);

  const rows = sheet.rows;
  const sheetPages = Math.max(1, Math.ceil(sheet.total / sheet.pageSize));

  const progress = stats && stats.total > 0 ? Math.round((stats.counted / stats.total) * 100) : 0;

  async function markRow(row: CountLineRow, found: boolean) {
    if (locked) return;
    await mark({ lineId: row.line.id, found });
    setSheetToken((t) => t + 1);
  }

  async function runAction() {
    if (!pending) return;
    setActionError(null);
    if (pending === "reopen" && !input.trim()) return setActionError("A reason is required to reopen");
    if (pending === "submit" && !input.trim()) return setActionError("Say who received the report");
    await act(pending, { reason: input.trim() || undefined, submittedTo: input.trim() || undefined });
    setSheetToken((t) => t + 1);
    setPending(null);
    setInput("");
  }

  if (loading && !detail) {
    return <div className="p-8 text-sm text-muted-foreground">Loading count session...</div>;
  }

  if (!detail) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">{error ?? "Session not found"}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/fm/lgu-asset-management-system/physical-count">Back to sessions</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href="/fm/lgu-asset-management-system/physical-count">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="font-mono text-xl font-semibold tracking-tight">{detail.session.count_no}</h1>
            <p className="text-sm text-muted-foreground">
              As of {detail.session.as_of_date ?? "unknown date"}
              {detail.session.counted_by ? " | counted by " + detail.session.counted_by : ""}
              {detail.session.verified_by ? " | verified by " + detail.session.verified_by : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={locked ? "default" : "secondary"}>{COUNT_STATUS_LABELS[status]}</Badge>
          <Badge variant="outline">{stats?.counted ?? 0} of {stats?.total ?? 0} counted</Badge>
          {status !== "submitted" && status !== "locked" && stats?.readyToLock ? (
            <Button size="sm" onClick={() => { setPending("lock"); setInput(""); }} disabled={busy}>
              Lock session
            </Button>
          ) : null}
          {status === "locked" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => { setPending("reopen"); setInput(""); }} disabled={busy}>
                Reopen
              </Button>
              <Button size="sm" onClick={() => { setPending("submit"); setInput(""); }} disabled={busy}>
                Mark submitted
              </Button>
            </>
          ) : null}
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{progress} percent counted</span>
          <span className="text-muted-foreground">
            {stats?.found ?? 0} found, {stats?.notFound ?? 0} not found, {stats?.pendingResolution ?? 0} awaiting a decision
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: progress + "%" }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {stats?.readyToLock
            ? status === "submitted"
              ? "This session is submitted and closed. Its report is final."
              : status === "locked"
                ? "This session is locked. Reopen it with a reason to change anything."
                : "Every line is counted and every not found line has a decision, so this session can be locked."
            : "Locking needs every line counted and every not found line resolved."}
        </p>
      </div>

      <div className="flex gap-1 border-b pb-2">
        <Button size="sm" variant={tab === "sheet" ? "default" : "ghost"} onClick={() => setTab("sheet")}>
          Count sheet
        </Button>
        <Button size="sm" variant={tab === "reconcile" ? "default" : "ghost"} onClick={() => setTab("reconcile")}>
          Reconcile
          {stats?.pendingResolution ? <span className="ml-2 rounded-full bg-destructive px-1.5 text-[10px] text-white">{stats.pendingResolution}</span> : null}
        </Button>
        <Button size="sm" variant={tab === "report" ? "default" : "ghost"} onClick={() => { setTab("report"); if (!report) void loadReport("rpcppe"); }}>
          Report
        </Button>
      </div>

      {error || actionError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {actionError ?? error}
        </div>
      ) : null}

      {tab === "sheet" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSheetPage(1);
              }}
              placeholder="Search property number, description, officer..."
              className="w-full max-w-sm"
            />
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={filter === f.key ? "default" : "outline"}
                  onClick={() => {
                    setFilter(f.key);
                    setSheetPage(1);
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border">
            {rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {sheetLoading ? "Loading this page..." : "Nothing matches this filter."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property No.</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Expected officer</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="w-[120px] text-right">Mark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.line.id}>
                      <TableCell className="font-mono text-xs">{row.line.expected_property_no ?? row.asset?.property_no ?? "-"}</TableCell>
                      <TableCell className="text-sm">{row.line.expected_description ?? row.asset?.description ?? "-"}</TableCell>
                      <TableCell className="text-sm">
                        {row.line.expected_officer ?? <span className="text-muted-foreground">unassigned</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.line.found === null ? (
                          <span className="text-muted-foreground">not counted</span>
                        ) : row.line.found ? (
                          <Badge variant="secondary">Found</Badge>
                        ) : (
                          <Badge variant="destructive">Not found</Badge>
                        )}
                        {row.line.is_found_at_station ? (
                          <Badge
                            variant="outline"
                            className="ml-2"
                            title={row.line.station_description ?? "found at another station"}
                          >
                            at station
                          </Badge>
                        ) : null}
                        {row.line.resolution !== "pending" && !row.line.found ? (
                          <span className="ml-2 text-xs text-muted-foreground">{row.line.resolution}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1" title={locked ? "This session is locked. Reopen it to change a mark." : undefined}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Found"
                            disabled={busy || locked}
                            className={locked ? "cursor-not-allowed opacity-25" : undefined}
                            onClick={() => void markRow(row, true)}
                          >
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Not found"
                            disabled={busy || locked}
                            className={locked ? "cursor-not-allowed opacity-25" : undefined}
                            onClick={() => void markRow(row, false)}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
              <span className="text-muted-foreground">
                {sheet.total} line{sheet.total === 1 ? "" : "s"}
                {sheetPages > 1 ? " · page " + sheetPage + " of " + sheetPages : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={sheetPage <= 1 || sheetLoading}
                  onClick={() => setSheetPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={sheetPage >= sheetPages || sheetLoading}
                  onClick={() => setSheetPage((p) => Math.min(sheetPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {tab === "reconcile" ? (
        <ReconcilePanel
          rows={detail.lines}
          offices={detail.lookups.offices}
          busy={busy}
          locked={locked}
          onResolve={resolve}
        />
      ) : null}

      {tab === "report" ? <ReportPanel report={report} busy={busy} onLoad={(form) => void loadReport(form)} /> : null}

      <Dialog open={Boolean(pending)} onOpenChange={(next) => (!next ? setPending(null) : undefined)}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 max-h-[90vh] sm:max-w-md">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>
              {pending === "lock" ? "Lock this session" : pending === "reopen" ? "Reopen this session" : "Mark as submitted"}
            </DialogTitle>
            <DialogDescription>
              {pending === "lock"
                ? "Locking freezes every line and marks confirmed missing assets on the register. Nothing changes after this."
                : pending === "reopen"
                  ? "Reopening unfreezes the lines. The reason is recorded on the session."
                  : "Record who received the report. This is the last step."}
            </DialogDescription>
          </DialogHeader>

          {pending === "lock" ? null : (
            <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto px-6 pb-2">
              <Label>{pending === "reopen" ? "Reason" : "Received by"}</Label>
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={pending === "reopen" ? "Why are we reopening" : "Name or office"} />
            </div>
          )}

          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void runAction()} disabled={busy}>
              {busy ? "Working..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
