"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, ChevronLeft, ChevronRight, HandCoins, Landmark, RefreshCw, Search, SearchX, ShieldCheck, UserPlus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Panel } from "../console/components/ui";
import { MetricCard } from "../members/components";
import { statusText } from "../members/format";
import type { ApprovalQueue } from "../server/approvals";
import { ApprovalDialog } from "./ApprovalDialog";
import { approvalStatuses, approvalTypes, type ApprovalStatusFilter, type ApprovalType } from "./filters";
import { ApprovalQueueSkeleton, ApprovalRow } from "./components";

type Row = ApprovalQueue["rows"][number];
type LoadResult<T> = { key: string; data?: T; error?: string };

const sourceCards = [
  { type: "membership" as const, label: "Membership", icon: UserPlus, tone: "slate" as const, ring: "ring-slate-500/40" },
  { type: "loan" as const, label: "Loan", icon: HandCoins, tone: "emerald" as const, ring: "ring-emerald-500/40" },
  { type: "withdrawal" as const, label: "Withdrawal", icon: Landmark, tone: "sky" as const, ring: "ring-sky-500/40" },
];

async function loadRequest<T>(url: string, signal: AbortSignal, message: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.message || message);
  return payload as T;
}

export default function ApprovalsModule() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ApprovalType | "">("");
  const [status, setStatus] = useState<ApprovalStatusFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([null]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult<ApprovalQueue>>();
  const [selected, setSelected] = useState<Row | null>(null);

  const params = new URLSearchParams({ page: String(page), status });
  if (search.trim()) params.set("search", search.trim());
  if (type) params.set("type", type);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  const requestKey = `${query}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    const message = "Unable to load the approval queue.";
    const timer = window.setTimeout(() => {
      loadRequest<ApprovalQueue>(`/api/fm/cooperative/approvals?${query}`, controller.signal, message)
        .then(data => { if (!controller.signal.aborted) setResult({ key: requestKey, data }); })
        .catch(cause => { if (!controller.signal.aborted) setResult({ key: requestKey, error: cause instanceof Error ? cause.message : message }); });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, requestKey]);

  useEffect(() => {
    const refreshOnFocus = () => setAttempt(value => value + 1);
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  function resetPaging() {
    setPage(1);
    setCursor(null);
    setCursorHistory([null]);
  }

  function setTypeFilter(value: ApprovalType | "") {
    setType(value);
    resetPaging();
  }

  function toggleType(value: ApprovalType) {
    setType(current => current === value ? "" : value);
    resetPaging();
  }

  function setStatusFilter(value: ApprovalStatusFilter) {
    setStatus(value);
    resetPaging();
  }

  function clearFilters() {
    setSearch("");
    setType("");
    setStatus("PENDING");
    resetPaging();
  }

  function refresh() {
    resetPaging();
    setAttempt(value => value + 1);
  }

  function nextPage() {
    if (!data?.hasMore) return;
    const currentPage = data.page ?? page;
    const nextCursor = data.nextCursor;
    if (nextCursor) {
      setCursorHistory(history => [...history, nextCursor]);
      setCursor(nextCursor);
    }
    setPage(currentPage + 1);
  }

  function previousPage() {
    const currentPage = data?.page ?? page;
    if (currentPage <= 1) return;
    if (cursorHistory.length > 1) {
      const history = cursorHistory.slice(0, -1);
      setCursorHistory(history);
      setCursor(history[history.length - 1] ?? null);
    }
    setPage(currentPage - 1);
  }

  const current = result?.key === requestKey ? result : undefined;
  const loading = !current;
  const data = current?.data;
  const source = data?.tiles[type || "loan"];
  const unavailableSources = data?.sources.filter(item => item.state === "unavailable") ?? [];
  const shownPage = data?.page ?? page;
  const from = data && data.total > 0 ? (shownPage - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min((shownPage - 1) * data.pageSize + data.rows.length, data.total) : 0;
  const hasFilters = Boolean(search.trim() || type || status !== "PENDING");

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Approvals</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Review loan and savings withdrawal requests, document compliance, and release decisions.
              </p>
            </div>
          </div>
          <Button variant="outline" className="w-full shrink-0 sm:w-auto" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </section>

      {!data && loading && (
        <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
        </div>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          {sourceCards.map(card => {
            const tile = data.tiles[card.type];
            const unavailable = tile?.state === "unavailable";
            const value = tile?.state === "ready" ? tile.count ?? 0 : "—";
            const detail = tile?.state === "ready"
              ? tile.count ? "Pending requests" : "No pending requests"
              : tile?.state === "pending_rollout" ? "Pending rollout"
                : unavailable ? "Temporarily unavailable" : "Loading...";
            return (
              <button
                key={card.type}
                type="button"
                aria-pressed={type === card.type}
                className={cn(
                  "rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
                  type === card.type && `ring-2 ring-offset-2 ring-offset-background ${card.ring}`,
                )}
                onClick={() => toggleType(card.type)}
              >
                <MetricCard
                  icon={card.icon}
                  label={card.label}
                  value={value}
                  detail={detail}
                  tone={unavailable ? "rose" : card.tone}
                  alert={unavailable}
                />
              </button>
            );
          })}
        </div>
      )}

      {current?.error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-sm text-destructive">{current.error}</p>
          <Button size="sm" variant="outline" onClick={refresh}>Retry</Button>
        </div>
      )}
      {unavailableSources.map(item => (
        <div key={item.type} role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">{item.message}</p>
          <Button size="sm" variant="outline" onClick={refresh}>Retry</Button>
        </div>
      ))}

      <Panel title="Request queue" description="Open a request to review its details, document status, history, and decision.">
        <div className="mb-4 rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground sm:col-span-2">
              Search
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => { setSearch(event.target.value); resetPaging(); }}
                  placeholder="Member, reference, product, or department"
                  className="h-9 pl-8"
                />
              </div>
            </label>
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              Type
              <NativeSelect value={type} onChange={event => setTypeFilter(event.target.value as ApprovalType | "")} className="h-9 w-full">
                <option value="">All types</option>
                {approvalTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              Status
              <NativeSelect value={status} onChange={event => setStatusFilter(event.target.value as ApprovalStatusFilter)} className="h-9 w-full">
                {approvalStatuses.map(value => (
                  <option key={value} value={value}>{value === "ALL" ? "All statuses" : statusText(value)}</option>
                ))}
              </NativeSelect>
            </label>
            <div className="flex items-end justify-between gap-2 sm:col-span-2 xl:col-span-4">
              <p className="text-xs text-muted-foreground">
                {loading ? "Updating queue..." : `${data?.total ?? 0} request${data?.total === 1 ? "" : "s"} match`}
              </p>
              {hasFilters && (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
                  <X className="size-3.5" /> Clear filters
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Table className="min-w-full sm:min-w-[560px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="hidden md:table-cell">Filed</TableHead>
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead className="min-w-44 sm:min-w-52">Reference</TableHead>
                <TableHead className="hidden min-w-48 sm:table-cell">Member</TableHead>
                <TableHead className="hidden lg:table-cell">Documents</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody className={cn("transition-opacity", loading && data && "opacity-60")} aria-busy={loading}>
              {loading && !data && <ApprovalQueueSkeleton />}
              {!loading && !current?.error && data?.rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8}>
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
                      <p className="text-sm font-medium">No requests match these filters</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        {source?.state === "pending_rollout"
                          ? source.message
                          : "Try a different member, reference, status, or request type."}
                      </p>
                      {hasFilters && <Button type="button" variant="outline" size="sm" className="mt-1" onClick={clearFilters}>Clear filters</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {data?.rows.map(row => (
                <ApprovalRow key={`${row.type}-${row.id}`} row={row} onOpen={() => setSelected(row)} />
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span>
            {data && data.total > 0
              ? <>Showing <span className="font-medium text-foreground">{from}-{to}</span> of <span className="font-medium text-foreground">{data.total}</span></>
              : data ? "No records" : "Loading..."}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={shownPage <= 1 || loading} onClick={previousPage}>
              <ChevronLeft className="size-3.5" /> Previous
            </Button>
            <span className="min-w-14 text-center font-medium text-foreground">Page {shownPage}</span>
            <Button size="sm" variant="outline" disabled={!data?.hasMore || loading} onClick={nextPage}>
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Panel>

      {selected && (
        <ApprovalDialog
          key={`${selected.type}-${selected.id}`}
          row={selected}
          onChanged={() => setAttempt(value => value + 1)}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
