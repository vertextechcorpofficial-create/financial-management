"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import { BadgeCheck, CheckCircle2, Plus, RotateCcw, Search, SearchX, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { EmptyState, MetricButton, MetricCard, Notice, PersonAvatar, StatusChip, TableRowsSkeleton } from "../components/ui";
import { agencyOptions, requestDocumentUrl } from "../requests/request-api";
import { applicationPageSizes, requestStatusLabels, type AgencyChoice, type EmployeeChoice } from "../requests/types";
import { getEnrollment, importBatches, listEnrollments } from "./api";
import { EnrollmentDetails } from "./EnrollmentDetails";
import { EnrollmentEditor } from "./EnrollmentEditor";
import { EnrollmentEvidenceEditor } from "./EnrollmentEvidenceEditor";
import { LoanImportDialog, LoanImportHistoryDialog } from "./LoanImportsDialog";
import type { EnrollmentImportBatch } from "./import-types";
import { deductionMonthLabel } from "./rules";
import { enrollmentSorts, type EnrollmentDetail, type EnrollmentListItem, type EnrollmentPage, type EnrollmentSort } from "./types";

type Filters = { q: string; agency: string; status: string };
type Direction = "asc" | "desc";
type SavedView = { name: string; filters: Filters; sort: EnrollmentSort; direction: Direction; size: number };
type Loaded = { key: string; data?: EnrollmentPage; error?: string };

const initialFilters: Filters = { q: "", agency: "", status: "" };
const enrollmentStatusOptions = [
  ["APPROVED", "Approved · awaiting agency"], ["ENROLLED", "For verification"], ["RETURNED", "Returned for correction"],
  ["VERIFIED", "Verified · awaiting activation"], ["ACTIVATING", "Activation pending"], ["ACTIVE", "Active"],
  ["AGENCY_DECLINED", "Not approved by agency"],
] as const;
const viewStorage = "government-loans:application-enrollment-views:v1";

function signature(value: Pick<SavedView, "filters" | "sort" | "direction" | "size">) {
  return JSON.stringify([Object.entries(value.filters).filter(([, entry]) => entry), value.sort, value.direction, value.size]);
}

function defaultViews(): SavedView[] {
  const base: Omit<SavedView, "name"> = { filters: initialFilters, sort: "updated", direction: "desc", size: 25 };
  return [
    { ...base, name: "Awaiting agency", filters: { ...initialFilters, status: "APPROVED" } },
    { ...base, name: "For verification", filters: { ...initialFilters, status: "ENROLLED" } },
    { ...base, name: "Returned", filters: { ...initialFilters, status: "RETURNED" } },
    { ...base, name: "Verified", filters: { ...initialFilters, status: "VERIFIED" } },
    { ...base, name: "Active", filters: { ...initialFilters, status: "ACTIVE" } },
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
      if (typeof view.name !== "string") return [];
      return [{
        ...view, filters: { ...initialFilters, ...view.filters },
        sort: (view.sort in enrollmentSorts ? view.sort : "updated") as EnrollmentSort,
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
  try { localStorage.setItem(viewStorage, JSON.stringify(views)); } catch { /* Keep in memory. */ }
}

function statusLabel(value: string) {
  return enrollmentStatusOptions.find(([status]) => status === value)?.[1] ?? requestStatusLabels[value as keyof typeof requestStatusLabels] ?? value;
}

function seedFrom(params: { get(name: string): string | null } | null) {
  const text = (name: string, max = 120) => (params?.get(name) ?? "").trim().slice(0, max);
  const id = (name: string) => /^[1-9]\d*$/.test(text(name)) ? text(name) : "";
  const sort = text("enr_sort");
  const direction = text("enr_direction");
  const status = text("enr_status");
  const size = Number(text("enr_size"));
  const page = Number(text("enr_page"));
  return {
    filters: { q: text("enr_q"), agency: id("enr_agency"),
      status: enrollmentStatusOptions.some(([value]) => value === status) ? status : "" } as Filters,
    sort: (sort in enrollmentSorts ? sort : "updated") as EnrollmentSort,
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

function SummaryCard({ label, value, active, onClick, icon, tone, ringClass, detail }: {
  label: string; value: number; active: boolean; onClick: () => void;
  icon: ComponentType<{ className?: string }>; tone: "emerald" | "sky" | "amber" | "rose" | "slate";
  ringClass: string; detail: string;
}) {
  return <MetricButton active={active} onClick={onClick} label={label} ringClass={ringClass}>
    <MetricCard icon={icon} label={label} value={value} detail={detail} tone={tone} />
  </MetricButton>;
}

function SortHeader({ label, sortKey, sort, direction, align, onSort }: {
  label: string; sortKey: EnrollmentSort; sort: EnrollmentSort; direction: Direction; align?: "right";
  onSort: (key: EnrollmentSort) => void;
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

function EvidenceCell({ item }: { item: EnrollmentListItem }) {
  const evidence = item.evidenceSummary;
  if (!evidence) return <span className="text-sm text-muted-foreground">—</span>;
  const complete = evidence.onFile >= evidence.required;
  return <Badge variant="outline" title={complete ? "All required evidence is attached" : "Required evidence is missing"}
    className={complete ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"}>
    {evidence.onFile}/{evidence.required}
  </Badge>;
}

export function LoanEnrollmentModule({ transferEmployee, canOpenSetup }: { transferEmployee?: EmployeeChoice; canOpenSetup?: boolean } = {}) {
  const searchParams = useSearchParams();
  const [seed] = useState(() => seedFrom(searchParams));
  const [importView, setImportView] = useState<"upload" | "history" | null>(null);
  const [importedBatch, setImportedBatch] = useState<number | null>(null);
  const [latestImport, setLatestImport] = useState<EnrollmentImportBatch>();
  const [importAttempt, reloadImport] = useState(0);
  const [selected, setSelected] = useState<number | "new" | null>(transferEmployee ? "new" : null);
  const [initialTransfer, setInitialTransfer] = useState(transferEmployee);
  const [correcting, setCorrecting] = useState(false);
  const [filters, setFilters] = useState<Filters>(seed.filters);
  const [sort, setSort] = useState<EnrollmentSort>(seed.sort);
  const [direction, setDirection] = useState<Direction>(seed.direction);
  const [size, setSize] = useState(seed.size);
  const [page, setPage] = useState(seed.page);
  const [showFilters, setShowFilters] = useState(false);
  const [listAttempt, reloadList] = useState(0);
  const [detailAttempt, reloadDetail] = useState(0);
  const [agencyAttempt, reloadAgencies] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>();
  const [data, setData] = useState<EnrollmentPage>();
  const [detail, setDetail] = useState<{ key: string; data?: EnrollmentDetail; error?: string }>();
  const [agencies, setAgencies] = useState<{ items: AgencyChoice[]; error?: string }>({ items: [] });
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<SavedView[]>([]);
  const [saving, setSaving] = useState(false);
  const detailKey = selected + ":" + detailAttempt;
  const record = detail?.key === detailKey ? detail : undefined;
  const query = new URLSearchParams({
    q: filters.q.trim(), page: String(page), sort, direction, size: String(size),
    ...(filters.status ? { status: filters.status } : {}), ...(filters.agency ? { agency: filters.agency } : {}),
  }).toString();
  const listKey = query + ":" + listAttempt;
  const current = loaded?.key === listKey ? loaded : undefined;
  const pending = !!data && !current?.data;
  const firstLoad = !data && !current?.error;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const start = total ? (page - 1) * size + 1 : 0;
  const end = Math.min(page * size, total);
  const filterCount = [filters.agency, filters.status].filter(Boolean).length;
  const hasFilters = filterCount > 0 || !!filters.q;
  const currentSignature = signature({ filters, sort, direction, size });
  const matchingSaved = saved.some(item => signature(item) === currentSignature);

  useEffect(() => { setSaved(readViews()); }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const items: AgencyChoice[] = [];
      for (let page = 1; ; page++) {
        const batch = await agencyOptions(page, controller.signal);
        items.push(...batch.items);
        if (!batch.hasMore) break;
      }
      if (!controller.signal.aborted) setAgencies({ items });
    }
    void load().catch(error => {
      if (!controller.signal.aborted) setAgencies({ items: [], error: error instanceof Error ? error.message : "Could not load agencies." });
    });
    return () => controller.abort();
  }, [agencyAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    importBatches(1, controller.signal).then(page => {
      if (!controller.signal.aborted) setLatestImport(page.items[0]);
    }).catch(() => { /* The callout is optional. */ });
    return () => controller.abort();
  }, [importAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      listEnrollments(query, controller.signal).then(result => {
        if (controller.signal.aborted) return;
        setLoaded({ key: listKey, data: result });
        setData(result);
      }).catch(error => {
        if (!controller.signal.aborted) setLoaded({ key: listKey, error: error instanceof Error ? error.message : "Could not load enrollments." });
      });
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [listKey, query]);

  useEffect(() => {
    if (typeof selected !== "number") return;
    const controller = new AbortController();
    getEnrollment(selected, controller.signal).then(value => {
      if (!controller.signal.aborted) setDetail({ key: detailKey, data: value });
    }).catch(error => {
      if (!controller.signal.aborted) setDetail({ key: detailKey, error: error instanceof Error ? error.message : "Could not load the enrollment." });
    });
    return () => controller.abort();
  }, [detailKey, selected]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    for (const name of ["enr_q", "enr_agency", "enr_status", "enr_sort", "enr_direction", "enr_size", "enr_page", "q", "agency", "status", "sort", "direction", "size", "page"]) next.delete(name);
    const set = (name: string, value: string) => { if (value) next.set(name, value); };
    set("enr_q", filters.q.trim());
    set("enr_agency", filters.agency);
    set("enr_status", filters.status);
    if (sort !== "updated") set("enr_sort", sort);
    if (direction !== "desc") set("enr_direction", direction);
    if (size !== 25) set("enr_size", String(size));
    if (page > 1) set("enr_page", String(page));
    const search = next.toString();
    window.history.replaceState(null, "", window.location.pathname + (search ? "?" + search : ""));
  }, [direction, filters, page, size, sort]);

  useEffect(() => {
    if (data && page > pages) setPage(1);
  }, [data, page, pages]);

  const back = () => { setSelected(null); setCorrecting(false); setNotice(""); setInitialTransfer(undefined); };
  const refreshMonth = () => { reloadList(value => value + 1); reloadImport(value => value + 1); };
  const agencyError = agencies.error && <LoadError message={agencies.error} retry={() => reloadAgencies(value => value + 1)} />;

  function update(name: keyof Filters, value: string) {
    setFilters(previous => ({ ...previous, [name]: value }));
    setPage(1);
  }

  function applyStatus(status: string) {
    setFilters(previous => ({ ...previous, status: previous.status === status ? "" : status }));
    setPage(1);
  }

  function applyView(item: SavedView) {
    setFilters({ ...initialFilters, ...item.filters });
    setSort(item.sort); setDirection(item.direction); setSize(item.size); setPage(1);
  }

  function saveView() {
    const name = filters.status ? statusLabel(filters.status) : "All enrollments";
    const item: SavedView = { name: name.slice(0, 40), filters: { ...filters }, sort, direction, size };
    const next = [...saved.filter(existing => existing.name !== item.name), item];
    setSaved(next); writeViews(next); setSaving(false);
  }

  function removeView(name: string) {
    const next = saved.filter(item => item.name !== name);
    setSaved(next); writeViews(next);
  }

  function toggleSort(next: EnrollmentSort) {
    if (next === sort) setDirection(value => value === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection(next === "reference" ? "desc" : "asc"); }
    setPage(1);
  }

  if (selected !== null) {
    const value = record?.data;
    if (selected === "new" || value?.status === "APPROVED" || value?.status === "RETURNED" && correcting) return <div className="space-y-3">
      {agencyError}
      <EnrollmentEditor key={detailKey} record={value} transferEmployee={selected === "new" ? initialTransfer : undefined}
        agencies={agencies.items} openMonth={data?.openMonth ?? null} canOpenSetup={canOpenSetup}
        onBack={correcting ? () => setCorrecting(false) : back} onReload={() => reloadDetail(count => count + 1)}
        refreshMonth={refreshMonth} onSaved={result => {
          setNotice(correcting ? "Enrollment resubmitted for verification." :
            result.status === "ENROLLED" ? "Enrollment saved for verification." : "Agency decline recorded.");
          setCorrecting(false); setInitialTransfer(undefined); setSelected(result.id);
          reloadDetail(count => count + 1); refreshMonth();
        }} />
    </div>;
    return <div className="space-y-3">
      <Button type="button" variant="ghost" onClick={back}>Back to enrollment</Button>
      {notice && <Notice title={notice} />}
      {record?.error && <LoadError message={record.error} retry={() => reloadDetail(value => value + 1)} />}
      {!record && <p role="status" className="text-sm text-muted-foreground">Loading enrollment…</p>}
      {value && <EnrollmentDetails record={value} documentHref={kind => requestDocumentUrl(value.id, kind)}>
        {Boolean(value.enrollment?.payrollWarnings?.length) && <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {value.enrollment?.payrollWarnings?.map(warning => <li key={warning}>{warning}</li>)}
        </ul>}
        {value.enrollment && <EnrollmentEvidenceEditor key={detailKey} record={value} onChanged={() => {
          reloadDetail(count => count + 1); refreshMonth();
        }} />}
        {value.status === "RETURNED" && <Button type="button" onClick={() => setCorrecting(true)}>Correct and resubmit</Button>}
      </EnrollmentDetails>}
    </div>;
  }

  const summary = data?.summary;

  return <div className="space-y-4">
    {importView === "upload" && <LoanImportDialog close={() => setImportView(null)} onSaved={id => {
      setImportedBatch(id); setImportView("history"); refreshMonth();
    }} />}
    {importView === "history" && <LoanImportHistoryDialog initialBatch={importedBatch} close={() => setImportView(null)} onSelect={id => {
      setImportView(null); setSelected(id);
    }} />}

    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Loan Enrollment</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Once the agency approves a loan, enter the amortization and first deduction month exactly as on the agency notice. A second person verifies the enrollment before payroll deducts anything.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => { setImportedBatch(null); setImportView("history"); }}>Import history</Button>
        <Button type="button" variant="outline" onClick={() => setImportView("upload")}>Import existing loans</Button>
        <Button type="button" onClick={() => setSelected("new")}><Plus /> Enroll existing loan</Button>
      </div>
    </header>
    {agencyError}

    {latestImport && <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm",
      latestImport.totals.ready ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30"
        : "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30")}>
      <div>
        <p className={cn("font-medium", latestImport.totals.ready ? "text-emerald-900 dark:text-emerald-200" : "text-amber-900 dark:text-amber-200")}>
          Last import: BT-{String(latestImport.id).padStart(4, "0")} — {latestImport.totals.ready
            ? `${latestImport.totals.ready} loan${latestImport.totals.ready === 1 ? "" : "s"} from ${latestImport.filename}, waiting for verification`
            : `no valid loans in ${latestImport.filename}`}
        </p>
        <p className={cn("text-xs", latestImport.totals.ready ? "text-emerald-800/80 dark:text-emerald-300/80" : "text-amber-800/80 dark:text-amber-300/80")}>
          Imported by {latestImport.actorName} · {dateTime(latestImport.createdAt)} PHT · Open month {deductionMonthLabel(latestImport.openMonth)}
          {latestImport.totals.skipped ? ` · ${latestImport.totals.skipped} row(s) skipped` : ""}
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => { setImportedBatch(latestImport.id); setImportView("history"); }}>Review import</Button>
    </div>}

    {summary && <section aria-label="Enrollment queue summary" className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Queue overview</p>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
        <SummaryCard label="Approved · awaiting agency" value={summary.APPROVED} active={filters.status === "APPROVED"} onClick={() => applyStatus("APPROVED")}
          icon={CheckCircle2} tone="emerald" ringClass="ring-emerald-500/40" detail="Ready to enroll" />
        <SummaryCard label="For verification" value={summary.ENROLLED} active={filters.status === "ENROLLED"} onClick={() => applyStatus("ENROLLED")}
          icon={ShieldCheck} tone="sky" ringClass="ring-sky-500/40" detail="Waiting for a second reviewer" />
        <SummaryCard label="Returned for correction" value={summary.RETURNED} active={filters.status === "RETURNED"} onClick={() => applyStatus("RETURNED")}
          icon={RotateCcw} tone="amber" ringClass="ring-amber-500/40" detail="Needs correction" />
        <SummaryCard label="Verified · awaiting activation" value={summary.VERIFIED} active={filters.status === "VERIFIED"} onClick={() => applyStatus("VERIFIED")}
          icon={BadgeCheck} tone="sky" ringClass="ring-sky-500/40" detail="Ready to activate" />
        <SummaryCard label="Active" value={summary.ACTIVE} active={filters.status === "ACTIVE"} onClick={() => applyStatus("ACTIVE")}
          icon={CheckCircle2} tone="emerald" ringClass="ring-emerald-500/40" detail="Deducted through Payroll" />
      </div>
    </section>}

    <div className="sticky top-0 z-20 space-y-2 rounded-lg border bg-background p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm sm:min-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" aria-label="Search enrollments" placeholder="Employee, loan, or agency reference"
            value={filters.q} maxLength={120} onChange={event => update("q", event.target.value)} />
        </div>
        <Button type="button" variant="outline" size="sm" className="md:hidden" aria-expanded={showFilters}
          onClick={() => setShowFilters(value => !value)}>Filters{filterCount ? ` (${filterCount})` : ""}</Button>
        <div className="hidden flex-wrap items-center gap-2 md:flex">{filterControls()}</div>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span className="whitespace-nowrap" aria-live="polite">{pending ? "Updating…" : data ? (total ? `Showing ${start}–${end} of ${total}` : "No enrollments") : "—"}</span>
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
      <span className="text-sm text-muted-foreground">Save “{filters.status ? statusLabel(filters.status) : "All enrollments"}”</span>
      <Button type="submit" size="sm">Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setSaving(false)}>Cancel</Button>
    </form>}

    {current?.error && <LoadError message={current.error} retry={() => reloadList(value => value + 1)} />}
    {!current && !firstLoad && <p role="status" className="text-sm text-muted-foreground">Loading enrollments…</p>}
    {data?.openMonth && <p className="text-sm text-muted-foreground">Open month {deductionMonthLabel(data.openMonth)}</p>}
    {!data?.openMonth && data && <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>Set the Government Loans open month to enroll loans.</span>
      {canOpenSetup && <Link className="underline" href="/fm/government-loans/month-end-close?tab=setup">Open Period setup</Link>}
    </p>}

    <div className={cn("space-y-2 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <div className="rounded-md border"><Table>
        <TableHeader><TableRow>
          <SortHeader label="Loan" sortKey="reference" sort={sort} direction={direction} onSort={toggleSort} />
          <SortHeader label="Employee" sortKey="employee" sort={sort} direction={direction} onSort={toggleSort} />
          <SortHeader label="Agency" sortKey="agency" sort={sort} direction={direction} onSort={toggleSort} />
          <SortHeader label="Program" sortKey="program" sort={sort} direction={direction} onSort={toggleSort} />
          <SortHeader label="Amortization" sortKey="amortization" sort={sort} direction={direction} align="right" onSort={toggleSort} />
          <SortHeader label="First deduction" sortKey="starts" sort={sort} direction={direction} onSort={toggleSort} />
          <TableHead>Documents</TableHead>
          <SortHeader label="Status" sortKey="status" sort={sort} direction={direction} onSort={toggleSort} />
        </TableRow></TableHeader>
        <TableBody>
          {firstLoad && <TableRowsSkeleton rows={6} columns={8} />}
          {!firstLoad && data?.items.map(item => <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50"
            onClick={() => { setSelected(item.id); reloadDetail(value => value + 1); }}>
            <TableCell>
              <Button variant="link" type="button" className="h-auto p-0 font-medium" onClick={event => { event.stopPropagation(); setSelected(item.id); }}>{item.reference}</Button>
              {item.enrollment && <p className="mt-1 max-w-36 truncate text-xs text-muted-foreground" title="Agency reference">{item.enrollment.agencyReference}</p>}
            </TableCell>
            <TableCell>
              <div className="flex min-w-0 items-center gap-2.5">
                <PersonAvatar name={item.employeeName ?? "Employee"} size="sm" />
                <span className="truncate font-medium">{item.employeeName ?? "—"}</span>
              </div>
            </TableCell>
            <TableCell><AgencyBadge name={item.agencyName} /></TableCell>
            <TableCell>{item.program}</TableCell>
            <TableCell className="text-right tabular-nums">{item.enrollment ? peso(item.enrollment.monthlyAmortization) : "—"}</TableCell>
            <TableCell>{item.enrollment ? deductionMonthLabel(item.enrollment.firstDeductionMonth) : "—"}</TableCell>
            <TableCell><EvidenceCell item={item} /></TableCell>
            <TableCell><StatusChip status={item.status} label={item.status === "APPROVED" ? "Approved · awaiting agency" : requestStatusLabels[item.status]} /></TableCell>
          </TableRow>)}
          {!firstLoad && data && !data.items.length && <TableRow><TableCell colSpan={8} className="p-0">
            <EmptyState icon={SearchX} title="No enrollments match" description="Try a different search, agency, or status."
              action={hasFilters ? <Button type="button" variant="outline" size="sm" onClick={() => { setFilters(initialFilters); setPage(1); }}>Clear filters</Button> : undefined} />
          </TableCell></TableRow>}
        </TableBody>
      </Table></div>
      {total > 10 && <nav aria-label="Enrollment pages" className="flex flex-wrap items-center justify-between gap-2">
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
      <NativeSelect aria-label="Filter enrollments by agency" value={filters.agency} onChange={event => update("agency", event.target.value)}>
        <option value="">All agencies</option>
        {agencies.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Filter enrollments by status" value={filters.status} onChange={event => update("status", event.target.value)}>
        <option value="">All statuses</option>
        {enrollmentStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </NativeSelect>
    </>;
  }
}
