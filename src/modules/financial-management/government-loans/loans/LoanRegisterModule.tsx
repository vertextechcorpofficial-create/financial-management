"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle, ArrowDown, ArrowUp, ChevronsUpDown, Download, RefreshCw, Rows3, Rows4, Search, SearchX, X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { date, peso } from "@/modules/financial-management/cooperative/members/format";
import { copyText } from "@/modules/financial-management/property-ledger/utils/clipboard";
import { agencyStatementDocumentUrl, copyRegisterCsv, listRegister, type RegisterTab } from "./api";
import { LoanRegisterDialog, loanPanels, type LoanPanel } from "./LoanRegisterDialog";
import {
  registerPageSizes, registerSorts, registerStatusLabels, registerViews, type LoanRegisterPage, type RegisterLoan,
  type RegisterSort, type RegisterView,
} from "./types";

const initialFilters = { q: "", agency: "", department: "", program: "", status: "", short: "", flagged: "", needsUpdate: "" };
type RegisterFilters = typeof initialFilters;
type Direction = "asc" | "desc";
type SavedView = {
  name: string; view: RegisterView; filters: RegisterFilters; sort: RegisterSort; direction: Direction; size: number;
};
type Loaded = { key: string; data?: LoanRegisterPage; error?: string };

const activeStatuses = new Set(["ACTIVE", "SUSPENDED", "FINAL_PAY_REQUESTED"]);
const emptyOptions: LoanRegisterPage["filters"] = { agencies: [], departments: [], programs: [] };
const viewStorage = (tab: RegisterTab) => `government-loans:register-views:${tab}:v1`;
const densityStorage = "government-loans:register-density";
const amount = (value: string | null) => value === null ? "—" : peso(value);
const timeLabel = (value: Date) => value.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

function savedSignature(value: Pick<SavedView, "view" | "filters" | "sort" | "direction" | "size">) {
  return JSON.stringify([value.view, Object.entries(value.filters).filter(([, entry]) => entry), value.sort, value.direction, value.size]);
}

function defaultViews(tab: RegisterTab): SavedView[] {
  const base: Omit<SavedView, "name"> = { view: "active", filters: initialFilters, sort: "reference", direction: "desc", size: 25 };
  return tab === "agency-balances" ? [
    { ...base, name: "Active balances" },
    { ...base, name: "Needs update", filters: { ...initialFilters, needsUpdate: "1" } },
    { ...base, name: "Differs from agency", filters: { ...initialFilters, flagged: "1" } },
  ] : [
    { ...base, name: "Active loans" },
    { ...base, name: "Short last deduction", filters: { ...initialFilters, short: "1" } },
  ];
}

function readViews(tab: RegisterTab): SavedView[] {
  try {
    const raw = localStorage.getItem(viewStorage(tab));
    if (!raw) return defaultViews(tab);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultViews(tab);
    const views = parsed.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const view = item as SavedView;
      if (typeof view.name !== "string" || !(view.view in registerViews)) return [];
      return [{
        ...view,
        filters: { ...initialFilters, ...view.filters },
        sort: (view.sort in registerSorts ? view.sort : "reference") as RegisterSort,
        direction: (view.direction === "asc" ? "asc" : "desc") as Direction,
        size: (registerPageSizes as readonly number[]).includes(Number(view.size)) ? Number(view.size) : 25,
      }];
    });
    return views.length ? views : defaultViews(tab);
  } catch {
    return defaultViews(tab);
  }
}

function writeViews(tab: RegisterTab, views: SavedView[]) {
  try {
    localStorage.setItem(viewStorage(tab), JSON.stringify(views));
  } catch {
    // Saved views stay in memory when storage is unavailable.
  }
}

function seedFrom(params: { get(name: string): string | null } | null) {
  const text = (name: string, max = 120) => (params?.get(name) ?? "").trim().slice(0, max);
  const id = (name: string) => /^[1-9]\d*$/.test(text(name)) ? text(name) : "";
  const view = text("view");
  const sort = text("sort");
  const direction = text("direction");
  const size = Number(text("size"));
  const page = Number(text("page"));
  const status = text("status");
  const loan = Number(id("loan"));
  const panel = text("panel");
  return {
    view: (view in registerViews ? view : "active") as RegisterView,
    filters: {
      q: text("q"), agency: id("agency"), department: id("department"), program: text("program", 160),
      status: status in registerStatusLabels ? status : "",
      short: text("short") === "1" ? "1" : "", flagged: text("flagged") === "1" ? "1" : "",
      needsUpdate: text("needsUpdate") === "1" ? "1" : "",
    },
    sort: (sort in registerSorts ? sort : "reference") as RegisterSort,
    direction: (direction === "asc" ? "asc" : "desc") as Direction,
    size: (registerPageSizes as readonly number[]).includes(size) ? size : 25,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    selected: loan ? { id: loan, record: text("record") === "1" } : null,
    panel: (loanPanels.includes(panel as LoanPanel) ? panel : "overview") as LoanPanel,
  };
}

function RegisterStatusBadge({ status }: { status: RegisterLoan["status"] }) {
  const tone = status === "ACTIVE" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
    : status === "SUSPENDED" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
    : status === "FINAL_PAY_REQUESTED" ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300"
    : status === "COMPLETED" ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
    : "text-muted-foreground";
  return <Badge variant="outline" className={tone}>{registerStatusLabels[status]}</Badge>;
}

function agencyTone(name: string) {
  const value = name.toLowerCase();
  if (value.includes("pag-ibig") || value.includes("hdmf")) return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (value.includes("sss") || value.includes("social security")) return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (value.includes("bank")) return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return "text-muted-foreground";
}

function AgencyBadge({ name }: { name: string }) {
  return <Badge variant="outline" className={agencyTone(name)}>{name}</Badge>;
}

const maskedReference = (value: string) => value.length > 4 ? "••••" + value.slice(-4) : value;

function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: "warning" }) {
  const content = <>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
  </>;
  return <div className={cn("rounded-lg border p-3 text-left",
    tone === "warning" && "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20")}>{content}</div>;
}

export function LoanRegisterModule({ tab }: { tab: RegisterTab }) {
  const balances = tab === "agency-balances";
  const searchParams = useSearchParams();
  const [seed] = useState(() => seedFrom(searchParams));
  const [filters, setFilters] = useState<RegisterFilters>(seed.filters);
  const [view, setView] = useState<RegisterView>(seed.view);
  const [sort, setSort] = useState<RegisterSort>(seed.sort);
  const [direction, setDirection] = useState<Direction>(seed.direction);
  const [size, setSize] = useState(seed.size);
  const [page, setPage] = useState(seed.page);
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>();
  const [data, setData] = useState<LoanRegisterPage>();
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [saving, setSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [exporting, setExporting] = useState(false);
  const [selected, selectLoan] = useState<{ id: number; record: boolean } | null>(seed.selected);
  const [panel, setPanel] = useState<LoanPanel>(seed.panel);

  const query = new URLSearchParams({
    view, sort, direction, size: String(size), page: String(page),
    ...Object.fromEntries(Object.entries(filters).flatMap(([name, value]) => value.trim() ? [[name, value.trim()]] : [])),
  }).toString();
  const key = tab + ":" + query + ":" + refresh;
  const current = loaded?.key === key ? loaded : undefined;
  const error = current?.error;
  const pending = !!data && !current?.data;
  const firstLoad = !data && !error;
  const options = data?.filters ?? emptyOptions;
  const compact = density === "compact";
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const start = total ? (page - 1) * size + 1 : 0;
  const end = Math.min(page * size, total);
  const filterCount = Object.entries(filters).filter(([name, value]) => name !== "q" && value).length;
  const hasFilters = filterCount > 0 || !!filters.q;
  const currentSignature = savedSignature({ view, filters, sort, direction, size });
  const matchingSaved = saved.some(item => savedSignature(item) === currentSignature);
  const statusOptions = Object.entries(registerStatusLabels).filter(([value]) =>
    view === "all" || (view === "active") === activeStatuses.has(value));

  useEffect(() => {
    setSaved(readViews(tab));
    try {
      setDensity(localStorage.getItem(densityStorage) === "compact" ? "compact" : "comfortable");
    } catch {
      // Fall back to the comfortable density.
    }
  }, [tab]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void listRegister(tab, query, controller.signal)
        .then(result => {
          if (controller.signal.aborted) return;
          setLoaded({ key, data: result });
          setData(result);
          setUpdatedAt(new Date());
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          setLoaded({ key, error: cause instanceof Error ? cause.message : "Could not load loans." });
        });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tab, query, key]);

  // Keep the address bar shareable without a Next.js navigation, so filtering never re-renders the shell.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    for (const name of ["q", "agency", "department", "program", "status", "short", "flagged", "needsUpdate",
      "view", "sort", "direction", "size", "page", "loan", "panel", "record"]) next.delete(name);
    const set = (name: string, value: string) => { if (value) next.set(name, value); };
    set("q", filters.q.trim());
    set("agency", filters.agency);
    set("department", filters.department);
    set("program", filters.program);
    set("status", filters.status);
    set("short", filters.short);
    set("flagged", filters.flagged);
    set("needsUpdate", filters.needsUpdate);
    if (view !== "active") set("view", view);
    if (sort !== "reference") set("sort", sort);
    if (direction !== "desc") set("direction", direction);
    if (size !== 25) set("size", String(size));
    if (page > 1) set("page", String(page));
    if (selected) {
      set("loan", String(selected.id));
      if (selected.record) set("record", "1");
      if (panel !== "overview") set("panel", panel);
    }
    const search = next.toString();
    window.history.replaceState(null, "", window.location.pathname + (search ? "?" + search : ""));
  }, [filters, view, sort, direction, size, page, selected, panel]);

  useEffect(() => {
    if (data && page > pages) setPage(1);
  }, [data, page, pages]);

  const update = (name: keyof RegisterFilters, value: string) => {
    setFilters(previous => ({ ...previous, [name]: value }));
    setPage(1);
  };
  const clearFilters = () => { setFilters(initialFilters); setPage(1); };
  const reload = () => setRefresh(value => value + 1);
  const open = (id: number, record: boolean) => { selectLoan({ id, record }); setPanel("overview"); };

  function changeView(next: RegisterView) {
    setView(next);
    if (filters.status && next !== "all" && (next === "active") !== activeStatuses.has(filters.status)) {
      setFilters(previous => ({ ...previous, status: "" }));
    }
    setPage(1);
  }

  function toggleSort(next: RegisterSort) {
    if (next === sort) setDirection(value => value === "asc" ? "desc" : "asc");
    else {
      setSort(next);
      setDirection(next === "reference" || next === "statement" ? "desc" : "asc");
    }
    setPage(1);
  }

  function toggleDensity() {
    const next = compact ? "comfortable" : "compact";
    setDensity(next);
    try { localStorage.setItem(densityStorage, next); } catch { /* Keep the in-memory choice. */ }
  }

  function applyView(item: SavedView) {
    setView(item.view);
    setFilters({ ...initialFilters, ...item.filters });
    setSort(item.sort);
    setDirection(item.direction);
    setSize(item.size);
    setPage(1);
  }

  function saveView(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim().slice(0, 40);
    if (!name) return;
    const item: SavedView = { name, view, filters: { ...filters }, sort, direction, size };
    const next = [...saved.filter(existing => existing.name !== name), item];
    setSaved(next);
    writeViews(tab, next);
    setSaving(false);
    toast.success(`Saved view “${name}”.`);
  }

  function removeView(name: string) {
    const next = saved.filter(item => item.name !== name);
    setSaved(next);
    writeViews(tab, next);
  }

  async function copyCsv() {
    if (!data || exporting) return;
    setExporting(true);
    try {
      await copyText(await copyRegisterCsv(tab, query));
      toast.success(`Copied ${data.total} ${data.total === 1 ? "loan" : "loans"} as CSV.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not copy loans. Try again.");
    } finally {
      setExporting(false);
    }
  }

  async function downloadCsv() {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const csv = await copyRegisterCsv(tab, query);
      const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = href;
      link.download = `government-loans-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(href);
      toast.success(`Downloaded ${data.total} ${data.total === 1 ? "loan" : "loans"} as CSV.`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not download loans. Try again.");
    } finally {
      setExporting(false);
    }
  }

  const columns: (Column)[] = balances ? [
    { id: "reference", label: "Loan", sort: "reference", sticky: true, render: loan => <LoanReference loan={loan} onOpen={open} /> },
    { id: "employee", label: "Employee", sort: "employee", render: loan => <EmployeeCell loan={loan} /> },
    { id: "agency", label: "Agency", sort: "agency", render: loan => <AgencyCell loan={loan} /> },
    { id: "estimate", label: "System estimate", sort: "estimate", align: "right", render: loan => <span className="tabular-nums">{amount(loan.estimate)}</span> },
    { id: "adjusted", label: "Agency balance now", sort: "estimate", align: "right", render: loan => <AdjustedCell loan={loan} /> },
    { id: "difference", label: "Difference", sort: "difference", align: "right", render: loan => <DifferenceCell loan={loan} /> },
    { id: "statement", label: "Last update", sort: "statement", render: loan => <LastUpdateCell loan={loan} /> },
    { id: "action", label: "", align: "right", render: loan => <Button type="button" variant="outline" size="sm"
      onClick={event => { event.stopPropagation(); open(loan.id, true); }}>Record balance</Button> },
  ] : [
    { id: "reference", label: "Loan", sort: "reference", sticky: true, render: loan => <LoanReference loan={loan} onOpen={open} /> },
    { id: "employee", label: "Employee", sort: "employee", render: loan => <EmployeeCell loan={loan} /> },
    { id: "agency", label: "Agency", sort: "agency", render: loan => <AgencyBadge name={loan.agency} /> },
    { id: "program", label: "Program", render: loan => loan.program },
    { id: "principal", label: "Loan amount", sort: "principal", align: "right", render: loan => <span className="tabular-nums">{peso(loan.principal)}</span> },
    { id: "amortization", label: "Amortization", sort: "amortization", align: "right", render: loan => <span className="tabular-nums">{peso(loan.amortization)}</span> },
    { id: "counted", label: "Paid / total", sort: "counted", align: "right", render: loan => <span className="whitespace-nowrap tabular-nums">{loan.counted} / {loan.term}</span> },
    { id: "remaining", label: "Remaining (est.)", sort: "estimate", align: "right", render: loan => <RemainingCell loan={loan} /> },
    { id: "status", label: "Status", sort: "status", render: loan => <StatusCell loan={loan} /> },
  ];

  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{balances ? "Agency balances" : "Loan Register"}</h2>
        <p className="text-sm text-muted-foreground">
          {data ? `${total} ${total === 1 ? "loan matches" : "loans match"}` : "Loading loans"}
          {updatedAt && ` · Updated ${timeLabel(updatedAt)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" aria-pressed={compact} onClick={toggleDensity}
          title={compact ? "Use comfortable rows" : "Use compact rows"}>
          {compact ? <Rows3 className="size-4" /> : <Rows4 className="size-4" />}
          <span className="hidden sm:inline">{compact ? "Compact" : "Comfortable"}</span>
          <span className="sr-only sm:hidden">Toggle row density</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={!data || exporting}>
              <Download className={cn("size-4", exporting && "animate-pulse")} />
              <span className="hidden sm:inline">Export</span>
              <span className="sr-only sm:hidden">Export loans</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {data ? `${data.total} ${data.total === 1 ? "row" : "rows"} with current filters` : "Current filters"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void copyCsv()}>Copy as CSV</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void downloadCsv()}>Download CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="outline" size="sm" onClick={reload} disabled={pending}>
          <RefreshCw className={cn("size-4", pending && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
          <span className="sr-only sm:hidden">Refresh loans</span>
        </Button>
      </div>
    </header>

    {!balances && <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Loan register view">
      {(Object.keys(registerViews) as RegisterView[]).map(item => <Button key={item} type="button" size="sm"
        variant={item === view ? "default" : "outline"} aria-pressed={item === view}
        onClick={() => changeView(item)}>{registerViews[item]}</Button>)}
    </div>}

    {balances && (firstLoad ? <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-[74px] rounded-lg" />)}
    </div> : <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
      <Kpi label="Loans with an agency balance" value={`${data?.summary.withStatement ?? 0} / ${data?.summary.active ?? 0}`} />
      <Kpi label="Estimate differs from agency" value={data?.summary.flagged ?? 0}
        tone={(data?.summary.flagged ?? 0) > 0 ? "warning" : undefined} />
      <Kpi label="Not updated in 90 days" value={data?.summary.needsUpdate ?? 0}
        tone={(data?.summary.needsUpdate ?? 0) > 0 ? "warning" : undefined} />
    </div>)}

    <div className="sticky top-0 z-20 space-y-2 rounded-lg border bg-background p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm sm:min-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={filters.q} maxLength={120} placeholder="Employee, loan, or agency reference"
            aria-label="Search loans" onChange={event => update("q", event.target.value)} />
        </div>
        <Button type="button" variant="outline" size="sm" className="md:hidden" aria-expanded={showFilters}
          onClick={() => setShowFilters(value => !value)}>
          Filters{filterCount ? ` (${filterCount})` : ""}
        </Button>
        <div className="hidden flex-wrap items-center gap-2 md:flex">{filterControls()}</div>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap" aria-live="polite">
            {pending ? "Updating…" : data ? (total ? `Showing ${start}–${end} of ${total}` : "No loans") : "—"}
          </span>
          {hasFilters && <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
        </div>
      </div>
      {showFilters && <div className="flex flex-wrap items-center gap-2 md:hidden">{filterControls()}</div>}
      {pending && <div className="h-0.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
      </div>}
    </div>

    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Views</span>
      {saved.map(item => {
        const active = savedSignature(item) === currentSignature;
        return <span key={item.name} className={cn("inline-flex items-center rounded-full border bg-muted/40 pl-2.5 text-xs",
          active && "border-primary/40 bg-primary/10 text-primary")}>
          <button type="button" className="py-1" onClick={() => applyView(item)}>{item.name}</button>
          <button type="button" className="px-1.5 py-1 text-muted-foreground hover:text-foreground"
            aria-label={`Remove saved view ${item.name}`} onClick={() => removeView(item.name)}><X className="size-3" /></button>
        </span>;
      })}
      {!saving && !matchingSaved && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
        onClick={() => setSaving(true)}>Save view</Button>}
    </div>
    {saving && <form className="flex flex-wrap items-center gap-2" onSubmit={saveView}>
      <Input name="name" autoFocus maxLength={40} placeholder="View name" aria-label="Saved view name" className="h-8 w-48" />
      <Button type="submit" size="sm">Save</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setSaving(false)}>Cancel</Button>
    </form>}

    {error && <div role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-destructive">Could not load the loan register</p>
        <p className="text-muted-foreground">{error}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={reload}>Retry</Button>
    </div>}

    <div className={cn("space-y-2 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(column => <TableHead key={column.id} aria-sort={column.sort === sort ? (direction === "asc" ? "ascending" : "descending") : undefined}
                className={cn(column.align === "right" && "text-right",
                  column.sticky && "sticky left-0 z-10 bg-card shadow-[6px_0_8px_-8px_rgba(0,0,0,0.35)]")}>
                {column.sort ? <button type="button" onClick={() => toggleSort(column.sort!)}
                  className={cn("inline-flex w-full items-center gap-1 whitespace-nowrap hover:text-foreground",
                    column.align === "right" && "justify-end", sort === column.sort ? "text-foreground" : "text-muted-foreground")}>
                  {column.label}
                  {sort === column.sort ? (direction === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)
                    : <ChevronsUpDown className="size-3.5 opacity-50" />}
                </button> : column.label}
              </TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {firstLoad && Array.from({ length: 8 }, (_, row) => <TableRow key={row}>
              {columns.map(column => <TableCell key={column.id} className={cn(column.align === "right" && "text-right",
                column.sticky && "sticky left-0 z-10 bg-card")}>
                <Skeleton className={cn("h-4", column.id === "reference" ? "w-24" : column.align === "right" ? "ml-auto w-20" : "w-full max-w-32")} />
              </TableCell>)}
            </TableRow>)}
            {!firstLoad && data?.items.map(loan => <TableRow key={loan.id} className="group cursor-pointer"
              onClick={() => open(loan.id, false)}>
              {columns.map(column => <TableCell key={column.id} className={cn(column.align === "right" && "text-right",
                column.sticky && "sticky left-0 z-10 bg-card shadow-[6px_0_8px_-8px_rgba(0,0,0,0.35)] group-hover:bg-muted/50", compact && "py-1.5")}>
                {column.render(loan)}
              </TableCell>)}
            </TableRow>)}
            {!firstLoad && data && !data.items.length && <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                <Empty className="border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
                    <EmptyTitle>No loans match these filters</EmptyTitle>
                    <EmptyDescription>Try a different search, or clear the filters to see the full register.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <div className="flex flex-wrap justify-center gap-2">
                      {hasFilters && <Button type="button" size="sm" onClick={clearFilters}>Clear filters</Button>}
                      {view !== "all" && <Button type="button" size="sm" variant="outline"
                        onClick={() => changeView("all")}>Show all enrolled</Button>}
                    </div>
                  </EmptyContent>
                </Empty>
              </TableCell>
            </TableRow>}
          </TableBody>
        </Table>
      </div>
      {total > 10 && <nav aria-label="Loan register pages" className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">Rows per page
          <NativeSelect aria-label="Rows per page" className="h-8 w-20" value={String(size)}
            onChange={event => { setSize(Number(event.target.value)); setPage(1); }}>
            {registerPageSizes.map(value => <option key={value} value={value}>{value}</option>)}
          </NativeSelect>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button type="button" variant="outline" size="sm" disabled={page === 1}
            onClick={() => setPage(page - 1)}>Previous</Button>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages}
            onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </nav>}
    </div>

    {selected && <LoanRegisterDialog key={selected.id} id={selected.id} startRecording={selected.record}
      panel={panel} onPanelChange={setPanel} onClose={() => selectLoan(null)}
      onSaved={() => { setPage(1); reload(); }} />}
  </div>;

  function filterControls() {
    const flags: readonly (readonly [keyof RegisterFilters, string])[] =
      balances ? [["flagged", "Differs from agency"], ["needsUpdate", "Needs update"]] : [["short", "Last deduction short"]];
    return <>
      <NativeSelect aria-label="Filter by agency" value={filters.agency} onChange={event => update("agency", event.target.value)}>
        <option value="">All agencies</option>
        {options.agencies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      {!balances && <>
        <NativeSelect aria-label="Filter by program" value={filters.program} onChange={event => update("program", event.target.value)}>
          <option value="">All programs</option>
          {options.programs.map(item => <option key={item}>{item}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Filter by department" value={filters.department} onChange={event => update("department", event.target.value)}>
          <option value="">All departments</option>
          {options.departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Filter by status" value={statusOptions.some(([value]) => value === filters.status) ? filters.status : ""}
          onChange={event => update("status", event.target.value)}>
          <option value="">All statuses</option>
          {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </NativeSelect>
      </>}
      {flags.map(([name, label]) => <label key={name} className="flex items-center gap-2 px-2 text-sm">
        <Checkbox checked={filters[name] === "1"} onCheckedChange={value => update(name, value === true ? "1" : "")} />{label}
      </label>)}
    </>;
  }
}

type Column = { id: string; label: string; sort?: RegisterSort; align?: "right"; sticky?: boolean; render: (loan: RegisterLoan) => ReactNode };

function LoanReference({ loan, onOpen }: { loan: RegisterLoan; onOpen: (id: number, record: boolean) => void }) {
  return <>
    <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => onOpen(loan.id, false)}>{loan.reference}</Button>
    <p className="mt-1 max-w-36 truncate text-xs text-muted-foreground" title="Masked agency reference">{maskedReference(loan.agencyReference)}</p>
  </>;
}

function EmployeeCell({ loan }: { loan: RegisterLoan }) {
  return <>{loan.employee}{loan.department && <p className="text-xs text-muted-foreground">{loan.department}</p>}</>;
}

function AgencyCell({ loan }: { loan: RegisterLoan }) {
  return <><AgencyBadge name={loan.agency} /><p className="mt-0.5 text-xs text-muted-foreground">{loan.program}</p></>;
}

function AdjustedCell({ loan }: { loan: RegisterLoan }) {
  const { latest, adjusted } = loan.agencyBalance;
  return <div>
    <p className="tabular-nums">{amount(adjusted)}</p>
    {latest && <p className="text-xs text-muted-foreground">{peso(latest.balance)} on {date(latest.date)} less later deductions</p>}
  </div>;
}

function LastUpdateCell({ loan }: { loan: RegisterLoan }) {
  const data = loan.agencyBalance;
  if (!data.latest) return <Badge variant="outline" className="text-muted-foreground">Never recorded</Badge>;
  return <div className="space-y-0.5">
    <p className="whitespace-nowrap">{date(data.latest.date)}</p>
    <p className="text-xs text-muted-foreground">{data.latest.source} · {data.age ?? 0} {(data.age ?? 0) === 1 ? "day" : "days"} ago</p>
    <div className="flex flex-wrap items-center gap-1">
      {data.stale && <Badge variant="destructive">Stale</Badge>}
      {data.latest.attachmentName && <a className="text-xs text-primary underline" target="_blank" rel="noreferrer"
        href={agencyStatementDocumentUrl(loan.id, data.latest.id)}>Statement</a>}
    </div>
  </div>;
}

function RemainingCell({ loan }: { loan: RegisterLoan }) {
  const data = loan.agencyBalance;
  const value = data.latest ? data.adjusted : loan.estimate;
  return <div>
    <p className="tabular-nums">{amount(value)}</p>
    <p className="text-xs text-muted-foreground">{data.latest ? `per agency ${date(data.latest.date)}`
      : loan.active && loan.awaitingPayroll ? "estimate · awaiting Payroll" : "estimate"}</p>
  </div>;
}

function StatusCell({ loan }: { loan: RegisterLoan }) {
  return <div className="flex flex-wrap gap-1">
    <RegisterStatusBadge status={loan.status} />
    {loan.active && loan.lastDeductionShort && <Badge variant="destructive" title="Last deduction was short">Short</Badge>}
  </div>;
}

function DifferenceCell({ loan }: { loan: RegisterLoan }) {
  const value = loan.agencyBalance.difference;
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const number = Number(value);
  return <div>
    <p className={cn("whitespace-nowrap tabular-nums font-medium", number > 0 ? "text-emerald-700 dark:text-emerald-400"
      : number < 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
      {number > 0 ? "+" : ""}{peso(value)}
    </p>
    {loan.agencyBalance.flagged && <Badge variant="destructive" className="mt-0.5">Check</Badge>}
    {loan.awaitingPayroll && loan.agencyBalance.latest && <p className="text-xs text-muted-foreground">Awaiting Payroll results</p>}
  </div>;
}
