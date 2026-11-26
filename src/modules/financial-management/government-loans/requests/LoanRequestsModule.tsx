"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { employeeRequestApi, staffRequestApi } from "./request-api";
import { RequestEditor } from "./RequestEditor";
import {
  applicationPageSizes, requestSorts, requestStatusLabels, requestStatusTone, requestViews,
  type AgencyChoice, type EmployeeChoice, type LoanRequest, type RequestPage, type RequestSort, type RequestSummary,
  type RequestView,
} from "./types";

type Filters = { q: string; agency: string; status: string };
type Direction = "asc" | "desc";
type SavedView = { name: string; view: RequestView; filters: Filters; sort: RequestSort; direction: Direction; size: number };
type Loaded = { key: string; data?: RequestPage; error?: string };

const initialFilters: Filters = { q: "", agency: "", status: "" };
const viewLabels: Record<RequestView, string> = { "in-progress": "In progress", drafts: "Drafts", decided: "Decided & enrolled" };
const viewStorage = "government-loans:application-request-views:v1";
const defaultView = "in-progress" as RequestView;

function signature(value: Pick<SavedView, "view" | "filters" | "sort" | "direction" | "size">) {
  return JSON.stringify([value.view, Object.entries(value.filters).filter(([, entry]) => entry), value.sort, value.direction, value.size]);
}

function defaultViews(): SavedView[] {
  const base: Omit<SavedView, "name"> = { view: defaultView, filters: initialFilters, sort: "filed", direction: "desc", size: 25 };
  return [
    { ...base, name: "In progress" },
    { ...base, name: "Awaiting approval", filters: { ...initialFilters, status: "REQUESTED" } },
    { ...base, name: "Approved · awaiting agency", filters: { ...initialFilters, status: "APPROVED" } },
    { ...base, name: "Returned for correction", view: "decided", filters: { ...initialFilters, status: "RETURNED" }, sort: "updated" },
    { ...base, name: "Drafts", view: "drafts", sort: "updated" },
  ];
}

function readViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(viewStorage);
    if (!raw) return defaultViews();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultViews();
    const views = parsed.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const view = item as SavedView;
      if (typeof view.name !== "string" || !(view.view in requestViews)) return [];
      return [{
        ...view, filters: { ...initialFilters, ...view.filters },
        sort: (view.sort in requestSorts ? view.sort : "filed") as RequestSort,
        direction: (view.direction === "asc" ? "asc" : "desc") as Direction,
        size: (applicationPageSizes as readonly number[]).includes(Number(view.size)) ? Number(view.size) : 25,
      }];
    });
    return views.length ? views : defaultViews();
  } catch {
    return defaultViews();
  }
}

function writeViews(views: SavedView[]) {
  try { localStorage.setItem(viewStorage, JSON.stringify(views)); } catch { /* Keep the in-memory views. */ }
}

function seedFrom(params: { get(name: string): string | null } | null) {
  const text = (name: string, max = 120) => (params?.get(name) ?? "").trim().slice(0, max);
  const id = (name: string) => /^[1-9]\d*$/.test(text(name)) ? text(name) : "";
  const view = text("req_view");
  const sort = text("req_sort");
  const direction = text("req_direction");
  const status = text("req_status");
  const size = Number(text("req_size"));
  const page = Number(text("req_page"));
  const viewValue = (view in requestViews ? view : defaultView) as RequestView;
  const defaultSort: RequestSort = viewValue === "in-progress" ? "filed" : "updated";
  return {
    view: viewValue,
    filters: { q: text("req_q"), agency: id("req_agency"), status: status in requestStatusLabels ? status : "" } as Filters,
    sort: (sort in requestSorts ? sort : defaultSort) as RequestSort,
    direction: (direction === "asc" ? "asc" : "desc") as Direction,
    size: (applicationPageSizes as readonly number[]).includes(size) ? size : 25,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function agencyTone(name: string) {
  const value = name.toLowerCase();
  if (value.includes("pag-ibig") || value.includes("hdmf")) return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (value.includes("sss") || value.includes("social security")) return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (value.includes("bank")) return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return "text-muted-foreground";
}

function AgencyBadge({ name }: { name: string | null }) {
  return <Badge variant="outline" className={agencyTone(name ?? "")}>{name ?? "—"}</Badge>;
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
    <span className="min-w-0 flex-1">{message}</span><Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function SummaryCard({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={active}
    className={cn("rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50", active && "ring-2 ring-primary/40")}>
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="text-xl font-semibold tabular-nums">{value.toLocaleString("en-PH")}</p>
  </button>;
}

function SortHeader({ label, sortKey, sort, direction, align, onSort }: {
  label: string; sortKey: RequestSort; sort: RequestSort; direction: Direction; align?: "right";
  onSort: (key: RequestSort) => void;
}) {
  const active = sortKey === sort;
  return <TableHead className={cn(align === "right" && "text-right")}
    aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}>
    <button type="button" onClick={() => onSort(sortKey)}
      className={cn("inline-flex w-full items-center gap-1 whitespace-nowrap hover:text-foreground",
        align === "right" && "justify-end", active ? "text-foreground" : "text-muted-foreground")}>
      {label}<span className="text-[10px]">{active ? (direction === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  </TableHead>;
}

export function LoanRequestsModule({ applicant, initialNew, onSummary }: {
  applicant?: Pick<EmployeeChoice, "id" | "name">; initialNew?: boolean; onSummary?: (summary: RequestSummary) => void;
} = {}) {
  const { agencyOptions, getRequest, getRequests } = applicant ? employeeRequestApi : staffRequestApi;
  const searchParams = useSearchParams();
  const [seed] = useState(() => seedFrom(searchParams));
  const [view, setView] = useState<RequestView>(seed.view);
  const [filters, setFilters] = useState<Filters>(seed.filters);
  const [sort, setSort] = useState<RequestSort>(seed.sort);
  const [direction, setDirection] = useState<Direction>(seed.direction);
  const [size, setSize] = useState(seed.size);
  const [page, setPage] = useState(seed.page);
  const [selected, setSelected] = useState<number | "new" | null>(initialNew ? "new" : null);
  const [attempt, setAttempt] = useState(0);
  const [agencyAttempt, setAgencyAttempt] = useState(0);
  const [agencies, setAgencies] = useState<{ items: AgencyChoice[]; error?: string }>({ items: [] });
  const [loaded, setLoaded] = useState<Loaded>();
  const [data, setData] = useState<RequestPage>();
  const [detail, setDetail] = useState<{ id: number; attempt: number; record?: LoanRequest; error?: string }>();
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [saving, setSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const isDrafts = view === "drafts";

  const query = new URLSearchParams({
    view, q: filters.q.trim(), page: String(page), sort, direction, size: String(size),
    ...(filters.agency ? { agency: filters.agency } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  }).toString();
  const listKey = query + ":" + attempt;
  const current = loaded?.key === listKey ? loaded : undefined;
  const pending = !!data && !current?.data;
  const firstLoad = !data && !current?.error;
  const options = { agencies: agencies.items };
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const start = total ? (page - 1) * size + 1 : 0;
  const end = Math.min(page * size, total);
  const filterCount = [filters.agency, filters.status].filter(Boolean).length;
  const hasFilters = filterCount > 0 || !!filters.q;
  const currentSignature = signature({ view, filters, sort, direction, size });
  const matchingSaved = saved.some(item => signature(item) === currentSignature);
  const statusOptions = requestViews[view].statuses.map(status => [status, requestStatusLabels[status]] as const);

  useEffect(() => {
    setSaved(readViews());
  }, []);

  useEffect(() => {
    if (data?.summary) onSummary?.(data.summary);
  }, [data?.summary, onSummary]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const results: AgencyChoice[] = [];
      for (let page = 1; ; page++) {
        const response = await agencyOptions(page, controller.signal);
        results.push(...response.items);
        if (!response.hasMore) break;
      }
      if (!controller.signal.aborted) setAgencies({ items: results });
    }
    void load().catch(error => {
      if (!controller.signal.aborted) setAgencies({ items: [], error: error instanceof Error ? error.message : "Agencies could not be loaded." });
    });
    return () => controller.abort();
  }, [agencyAttempt, agencyOptions]);

  useEffect(() => {
    if (selected !== null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getRequests(query, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setLoaded({ key: listKey, data: result });
        setData(result);
      }).catch(error => {
        if (!controller.signal.aborted) setLoaded({ key: listKey, error: error instanceof Error ? error.message : "Requests could not be loaded." });
      });
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [getRequests, listKey, query, selected]);

  useEffect(() => {
    if (typeof selected !== "number") return;
    const controller = new AbortController();
    getRequest(selected, controller.signal).then(record => {
      if (!controller.signal.aborted) setDetail({ id: selected, attempt, record });
    }).catch(error => {
      if (!controller.signal.aborted) setDetail({ id: selected, attempt, error: error instanceof Error ? error.message : "The request could not be loaded." });
    });
    return () => controller.abort();
  }, [attempt, getRequest, selected]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    for (const name of ["req_view", "req_q", "req_agency", "req_status", "req_sort", "req_direction", "req_size", "req_page", "view", "q", "agency", "status", "sort", "direction", "size", "page"]) next.delete(name);
    const set = (name: string, value: string) => { if (value) next.set(name, value); };
    if (view !== defaultView) set("req_view", view);
    set("req_q", filters.q.trim());
    set("req_agency", filters.agency);
    set("req_status", filters.status);
    if (sort !== "filed") set("req_sort", sort);
    if (direction !== "desc") set("req_direction", direction);
    if (size !== 25) set("req_size", String(size));
    if (page > 1) set("req_page", String(page));
    const search = next.toString();
    window.history.replaceState(null, "", window.location.pathname + (search ? "?" + search : ""));
  }, [direction, filters, page, size, sort, view]);

  useEffect(() => {
    if (data && page > pages) setPage(1);
  }, [data, page, pages]);

  function update(name: keyof Filters, value: string) {
    setFilters(previous => ({ ...previous, [name]: value }));
    setPage(1);
  }

  function changeView(next: RequestView) {
    setView(next);
    setPage(1);
    setFilters(previous => ({ ...previous, status: "" }));
    setSort(next === "in-progress" ? "filed" : "updated");
    setDirection("desc");
  }

  function applyView(item: SavedView) {
    setView(item.view);
    setFilters({ ...initialFilters, ...item.filters });
    setSort(item.sort);
    setDirection(item.direction);
    setSize(item.size);
    setPage(1);
  }

  function saveView() {
    const name = viewLabels[view] + (filters.status ? ` · ${requestStatusLabels[filters.status as keyof typeof requestStatusLabels]}` : "");
    const item: SavedView = { name: name.slice(0, 40), view, filters: { ...filters }, sort, direction, size };
    const next = [...saved.filter(existing => existing.name !== item.name), item];
    setSaved(next); writeViews(next); setSaving(false);
  }

  function removeView(name: string) {
    const next = saved.filter(item => item.name !== name);
    setSaved(next); writeViews(next);
  }

  function toggleSort(next: RequestSort) {
    if (next === sort) setDirection(value => value === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection(next === "filed" || next === "updated" || next === "reference" ? "desc" : "asc"); }
    setPage(1);
  }

  function showList(next?: RequestView, message = "") {
    setSelected(null); setDetail(undefined); setAttempt(value => value + 1); setNotice(message);
    if (next) { setView(next); setPage(1); setFilters(initialFilters); setSort(next === "drafts" ? "updated" : "filed"); }
  }

  const record = detail?.id === selected && detail?.attempt === attempt ? detail : undefined;
  const agencyError = agencies.error && <LoadError message={agencies.error} retry={() => setAgencyAttempt(value => value + 1)} />;

  if (selected !== null) return <div className="space-y-3">
    {agencyError}
    {selected === "new" || record?.record ? <RequestEditor key={selected + ":" + attempt} initial={record?.record ?? null}
      agencies={agencies.items} applicant={applicant} onBack={showList} onReload={id => { setSelected(id); setAttempt(value => value + 1); }} /> :
      <div className="space-y-3">
        <Button variant="ghost" onClick={() => showList()}>Back to requests</Button>
        {record?.error ? <LoadError message={record.error} retry={() => setAttempt(value => value + 1)} /> :
          <p role="status" className="text-sm text-muted-foreground">Loading request…</p>}
      </div>}
  </div>;

  const summary = data?.summary;
  const summaryActive = (nextView: RequestView, status: string) => view === nextView && filters.status === status;
  const dateLabel = view === "in-progress" ? "Filed" : "Last updated";

  return <div className="space-y-4">
    {notice && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
      <span>{notice}</span><Button type="button" variant="ghost" size="sm" onClick={() => setNotice("")}>Dismiss</Button>
    </div>}
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{applicant ? isDrafts ? "Your unfinished requests" : "Your loan requests" : "Loan Requests"}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          File an employee&apos;s SSS, Pag-IBIG, or lender loan application. The request goes to Loan Approval; once the agency approves it, enroll it under Enrollment.
        </p>
      </div>
      <Button type="button" onClick={() => setSelected("new")}><Plus /> {applicant ? "Apply for a loan" : "New request"}</Button>
    </header>
    {agencyError}

    {summary && <section aria-label="Request queue summary" className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Queue overview</p>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <SummaryCard label="Drafts" value={summary.DRAFT} active={summaryActive("drafts", "")} onClick={() => changeView("drafts")} />
        <SummaryCard label="Awaiting approval" value={summary.REQUESTED} active={summaryActive("in-progress", "REQUESTED")}
          onClick={() => { setView("in-progress"); setFilters(previous => ({ ...previous, status: "REQUESTED" })); setPage(1); setSort("filed"); }} />
        <SummaryCard label="Approved · awaiting agency" value={summary.APPROVED} active={summaryActive("in-progress", "APPROVED")}
          onClick={() => { setView("in-progress"); setFilters(previous => ({ ...previous, status: "APPROVED" })); setPage(1); setSort("filed"); }} />
        <SummaryCard label="Returned for correction" value={summary.RETURNED} active={summaryActive("decided", "RETURNED")}
          onClick={() => { setView("decided"); setFilters(previous => ({ ...previous, status: "RETURNED" })); setPage(1); setSort("updated"); }} />
      </div>
    </section>}

    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Loan request view">
      {(Object.keys(requestViews) as RequestView[]).map(item => <Button key={item} type="button" size="sm"
        variant={view === item ? "default" : "outline"} aria-pressed={view === item}
        onClick={() => changeView(item)}>{viewLabels[item]}</Button>)}
    </div>

    <div className="sticky top-0 z-20 space-y-2 rounded-lg border bg-background p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm sm:min-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" aria-label="Search requests" placeholder={applicant ? "Agency or request no." : "Employee, agency, or request no."}
            value={filters.q} maxLength={120} onChange={event => update("q", event.target.value)} />
        </div>
        <Button type="button" variant="outline" size="sm" className="md:hidden" aria-expanded={showFilters}
          onClick={() => setShowFilters(value => !value)}>Filters{filterCount ? ` (${filterCount})` : ""}</Button>
        <div className="hidden flex-wrap items-center gap-2 md:flex">{filterControls()}</div>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap" aria-live="polite">{pending ? "Updating…" : data ? (total ? `Showing ${start}–${end} of ${total}` : "No requests") : "—"}</span>
          {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={() => { setFilters(initialFilters); setPage(1); }}>Clear</Button>}
        </div>
      </div>
      {showFilters && <div className="flex flex-wrap items-center gap-2 md:hidden">{filterControls()}</div>}
      {pending && <div className="h-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>}
    </div>

    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Views</span>
      {saved.map(item => {
        const active = signature(item) === currentSignature;
        return <span key={item.name} className={cn("inline-flex items-center rounded-full border bg-muted/40 pl-2.5 text-xs",
          active && "border-primary/40 bg-primary/10 text-primary")}>
          <button type="button" className="py-1" onClick={() => applyView(item)}>{item.name}</button>
          <button type="button" className="px-1.5 py-1 text-muted-foreground hover:text-foreground" aria-label={`Remove saved view ${item.name}`}
            onClick={() => removeView(item.name)}><X className="size-3" /></button>
        </span>;
      })}
      {!saving && !matchingSaved && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSaving(true)}>Save view</Button>}
    </div>
    {saving && <form className="flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); saveView(); }}>
      <span className="text-sm text-muted-foreground">Save “{viewLabels[view]}{filters.status ? ` · ${requestStatusLabels[filters.status as keyof typeof requestStatusLabels]}` : ""}”</span>
      <Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setSaving(false)}>Cancel</Button>
    </form>}

    {current?.error && <LoadError message={current.error} retry={() => setAttempt(value => value + 1)} />}

    <div className={cn("space-y-2 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <div className="rounded-md border"><Table>
        <TableHeader><TableRow>
          <SortHeader label="Request" sortKey="reference" sort={sort} direction={direction} onSort={toggleSort} />
          {!applicant && <SortHeader label="Employee" sortKey="employee" sort={sort} direction={direction} onSort={toggleSort} />}
          <SortHeader label="Agency" sortKey="agency" sort={sort} direction={direction} onSort={toggleSort} />
          <SortHeader label="Program" sortKey="program" sort={sort} direction={direction} onSort={toggleSort} />
          <SortHeader label="Amount" sortKey="amount" sort={sort} direction={direction} align="right" onSort={toggleSort} />
          {isDrafts ? <TableHead>Missing fields</TableHead>
            : <SortHeader label={dateLabel} sortKey={view === "in-progress" ? "filed" : "updated"} sort={sort} direction={direction} onSort={toggleSort} />}
          <SortHeader label="Status" sortKey="status" sort={sort} direction={direction} onSort={toggleSort} />
          {isDrafts && <TableHead className="text-right">Action</TableHead>}
        </TableRow></TableHeader>
        <TableBody>
          {firstLoad && Array.from({ length: 6 }, (_, row) => <TableRow key={row}>
            {Array.from({ length: (applicant ? 6 : 7) + (isDrafts ? 1 : 0) }, (_, cell) => <TableCell key={cell}>
              <Skeleton className="h-4 w-full max-w-28" />
            </TableCell>)}
          </TableRow>)}
          {!firstLoad && data?.items.map(item => <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(item.id)}>
            <TableCell>
              <Button variant="link" type="button" className="h-auto p-0 font-medium" onClick={event => { event.stopPropagation(); setSelected(item.id); }}>{item.reference}</Button>
            </TableCell>
            {!applicant && <TableCell>{item.employeeName ?? "—"}</TableCell>}
            <TableCell><AgencyBadge name={item.agencyName} /></TableCell>
            <TableCell>{item.program}</TableCell>
            <TableCell className="text-right tabular-nums">{item.amount ? peso(item.amount) : "—"}</TableCell>
            {isDrafts ? <TableCell>
              {Object.keys(item.missing).length ? <ul className="min-w-40 space-y-0.5 text-xs">{Object.values(item.missing).map(error => <li key={error}>{error}</li>)}</ul>
                : <Badge variant="outline">Ready to submit</Badge>}
            </TableCell> : <TableCell className="whitespace-nowrap">{dateTime(view === "in-progress" ? item.requestedAt ?? item.updatedAt : item.updatedAt)}</TableCell>}
            <TableCell><Badge variant="outline" className={requestStatusTone[item.status]}>{requestStatusLabels[item.status]}</Badge></TableCell>
            {isDrafts && <TableCell className="text-right"><Button type="button" variant="outline" size="sm"
              onClick={event => { event.stopPropagation(); setSelected(item.id); }}>Continue</Button></TableCell>}
          </TableRow>)}
          {!firstLoad && data && !data.items.length && <TableRow><TableCell colSpan={applicant ? (isDrafts ? 7 : 6) : isDrafts ? 8 : 7} className="p-0">
            <Empty className="border-0"><EmptyHeader><EmptyMedia variant="icon"><span>📄</span></EmptyMedia>
              <EmptyTitle>{isDrafts ? "No drafts" : view === "decided" ? "No decided requests" : "No requests in progress"}</EmptyTitle>
              <EmptyDescription>{hasFilters ? "Try a different search or clear the filters." : "New requests appear here once they are filed."}</EmptyDescription>
            </EmptyHeader></Empty>
          </TableCell></TableRow>}
        </TableBody>
      </Table></div>
      {total > 10 && <nav aria-label="Loan request pages" className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Rows per page
          <NativeSelect aria-label="Rows per page" className="h-8 w-20" value={String(size)} onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>
            {applicationPageSizes.map(value => <option key={value} value={value}>{value}</option>)}
          </NativeSelect>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </nav>}
    </div>
  </div>;

  function filterControls() {
    return <>
      <NativeSelect aria-label="Filter by agency" value={filters.agency} onChange={event => update("agency", event.target.value)}>
        <option value="">All agencies</option>
        {options.agencies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      {!isDrafts && <NativeSelect aria-label="Filter by status" value={statusOptions.some(([value]) => value === filters.status) ? filters.status : ""}
        onChange={event => update("status", event.target.value)}>
        <option value="">All statuses</option>
        {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </NativeSelect>}
    </>;
  }
}
