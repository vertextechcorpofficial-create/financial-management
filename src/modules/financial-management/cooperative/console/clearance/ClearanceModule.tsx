"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Ban, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, DoorOpen, FileClock,
  Plus, RefreshCw, Search, SearchX, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MetricCard } from "../../members/components";
import type { ClearanceRegister } from "../../server/clearance-store";
import { Panel } from "../components/ui";
import { CASE_STATUS_LABEL, CLEARANCE_REASONS } from "../types";
import { ClearanceDetailDialog, StartClearanceDialog } from "./ClearanceDialogs";
import { ClearanceRegisterSkeleton, ClearanceRow } from "./components";
import { clearanceEndpoint, useClearanceData } from "./useClearanceData";

const registerPageSize = 50;

export default function ClearanceModule() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number>();
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState("");
  const params = new URLSearchParams({ q: search, status, reason, page: String(page) });
  const { data, loading, error, reload } = useClearanceData<ClearanceRegister>(`${clearanceEndpoint}?${params}`, 180);
  const shownPage = data?.page ?? page;
  const ready = !loading && !error && data;
  const hasFilters = Boolean(search.trim() || status || reason);
  const from = data && data.total > 0 ? (shownPage - 1) * registerPageSize + 1 : 0;
  const to = data && data.total > 0 ? Math.min(from + data.rows.length - 1, data.total) : 0;
  const counts = data?.counts;
  const cards = counts ? [
    {
      key: "", label: "Total clearances", value: counts.draft + counts.completed + counts.cancelled,
      detail: "All stages", icon: ClipboardList, tone: "slate" as const, ring: "ring-slate-500/40", alert: false,
    },
    {
      key: "DRAFT", label: "Settlement review", value: counts.draft,
      detail: "Draft clearances", icon: FileClock, tone: "amber" as const, ring: "ring-amber-500/40", alert: false,
    },
    {
      key: "COMPLETED", label: "Settled & closed", value: counts.completed,
      detail: "Memberships closed", icon: CheckCircle2, tone: "emerald" as const, ring: "ring-emerald-500/40", alert: false,
    },
    {
      key: "CANCELLED", label: "Cancelled", value: counts.cancelled,
      detail: "Closed without settlement", icon: Ban, tone: "rose" as const, ring: "ring-rose-500/40", alert: false,
    },
  ] : [];

  useEffect(() => {
    const refreshOnFocus = () => reload();
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [reload]);

  function refresh(message?: string) {
    if (message) setNotice(message);
    reload();
  }

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
  }

  function toggleStatus(value: string) {
    setStatus(current => current === value ? "" : value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatus("");
    setReason("");
    setPage(1);
  }

  function closeDetail() {
    const id = selectedId;
    setSelectedId(undefined);
    if (id === undefined) return;
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-clearance-id="${id}"]`)?.focus();
    });
  }

  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <DoorOpen className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Exit clearance</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Start a clearance, attach separation papers, verify final pay, and settle the membership.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
          <Button className="w-full sm:w-auto" onClick={() => setStarting(true)}>
            <Plus className="size-4" /> Start clearance
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => refresh()} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>
    </section>

    {notice && (
      <div role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <p className="min-w-0 flex-1">{notice}</p>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setNotice("")} aria-label="Dismiss notice">
          <X className="size-4" />
        </Button>
      </div>
    )}

    {error && (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
        <AlertTriangle className="size-4 shrink-0 text-destructive" />
        <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => refresh()}>Retry</Button>
      </div>
    )}

    {!counts && loading && (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
      </div>
    )}

    {counts && (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => (
          <button
            key={card.key || "all"}
            type="button"
            aria-pressed={status === card.key}
            className={cn(
              "rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40",
              status === card.key && `ring-2 ring-offset-2 ring-offset-background ${card.ring}`,
            )}
            onClick={() => toggleStatus(card.key)}
          >
            <MetricCard
              icon={card.icon}
              label={card.label}
              value={card.value}
              detail={card.detail}
              tone={card.tone}
              alert={card.alert}
            />
          </button>
        ))}
      </div>
    )}

    <Panel title="Clearance register" description="Search clearances and open a row for the case details, documents, settlement, and history.">
      <div className="mb-4 rounded-xl border bg-muted/20 p-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground sm:col-span-2">
            Search
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                aria-label="Search clearances"
                onChange={event => changeFilter(setSearch, event.target.value)}
                placeholder="Member or clearance no."
                className="h-9 pl-8"
              />
            </div>
          </label>
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Stage
            <NativeSelect value={status} aria-label="Stage" className="h-9 w-full"
              onChange={event => changeFilter(setStatus, event.target.value)}>
              <option value="">All stages</option>
              {Object.entries(CASE_STATUS_LABEL).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </NativeSelect>
          </label>
          <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
            Reason
            <NativeSelect value={reason} aria-label="Reason" className="h-9 w-full"
              onChange={event => changeFilter(setReason, event.target.value)}>
              <option value="">All reasons</option>
              {Object.entries(CLEARANCE_REASONS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </NativeSelect>
          </label>
          <div className="flex items-end justify-between gap-2 sm:col-span-2 xl:col-span-4">
            <p className="text-xs text-muted-foreground">
              {loading ? "Updating register..." : `${data?.total ?? 0} clearance${data?.total === 1 ? "" : "s"} match`}
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
        <Table className="min-w-full">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="min-w-44">Clearance</TableHead>
              <TableHead className="hidden w-60 max-w-60 lg:table-cell">Member</TableHead>
              <TableHead className="hidden xl:table-cell">Separation date</TableHead>
              <TableHead className="hidden xl:table-cell">Documents</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Owed</TableHead>
              <TableHead className="hidden min-[1400px]:table-cell text-right">Posted savings</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="hidden w-8 sm:table-cell" />
            </TableRow>
          </TableHeader>
          <TableBody className={cn("transition-opacity", loading && data && "opacity-60")} aria-busy={loading}>
            {loading && !data && <ClearanceRegisterSkeleton />}
            {ready && !data.rows.length && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
                    <p className="text-sm font-medium">{hasFilters ? "No clearances match these filters" : "No clearances yet"}</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      {hasFilters ? "Try a different member, clearance number, stage, or reason." : "Start a clearance to begin a settlement review."}
                    </p>
                    {hasFilters
                      ? <Button type="button" variant="outline" size="sm" className="mt-1" onClick={clearFilters}>Clear filters</Button>
                      : <Button type="button" size="sm" className="mt-1" onClick={() => setStarting(true)}><Plus className="size-3.5" /> Start clearance</Button>}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {data?.rows.map(row => (
              <ClearanceRow key={row.id} row={row} onOpen={() => setSelectedId(row.id)} />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
        <span>
          {data && data.total > 0
            ? <>Showing <span className="font-medium text-foreground">{from}-{to}</span> of <span className="font-medium text-foreground">{data.total}</span></>
            : data ? "No records" : error ? "Unavailable" : "Loading..."}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={shownPage <= 1 || loading} onClick={() => setPage(shownPage - 1)}>
            <ChevronLeft className="size-3.5" /> Previous
          </Button>
          <span className="min-w-14 text-center font-medium text-foreground">Page {shownPage}</span>
          <Button size="sm" variant="outline" disabled={!data?.hasMore || loading} onClick={() => setPage(shownPage + 1)}>
            Next <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </Panel>

    {starting && <StartClearanceDialog onClose={() => setStarting(false)} onSaved={result => {
      setStarting(false);
      setSelectedId(result.id);
      refresh(`${result.reference} saved as a draft.`);
    }} />}
    {selectedId !== undefined && <ClearanceDetailDialog key={selectedId} id={selectedId} onClose={closeDetail} onChanged={refresh} />}
  </main>;
}
