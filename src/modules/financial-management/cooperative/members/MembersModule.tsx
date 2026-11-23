"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileWarning, Plus, Search, SearchX, UserPlus, UsersRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Panel, StatusChip } from "../console/components/ui";
import { AddMemberDialog } from "./AddMemberDialog";
import { MemberDetailDialog } from "./MemberDetailDialog";
import { MetricCard, PersonAvatar } from "./components";
import { memberFetch } from "./client";
import { date, MEMBER_STATUS_CHIP, MEMBER_STATUS_LABEL, peso } from "./format";
import { memberLoanAccountFilters, memberWithdrawalAccountFilter } from "./types";
import type { EnrollmentResult, MemberRegisterStatus, RegisterItem, RegisterResponse } from "./types";

type Notice = {
  employeeName: string;
  agreementNo: string;
  journalNo: string | null;
  orNo: string | null;
  duplicate: boolean;
};

export default function MembersModule() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [membership, setMembership] = useState("");
  const [account, setAccount] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<RegisterResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice>();
  const [adding, setAdding] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    if (department) params.set("department", department);
    if (membership) params.set("membership", membership);
    if (account) params.set("account", account);
    return params.toString();
  }, [search, department, membership, account, page]);

  const load = useCallback((signal: AbortSignal) => {
    setLoading(true);
    setError("");
    memberFetch<RegisterResponse>(`/api/fm/cooperative/members?${query}`, { signal })
      .then(payload => {
        if (signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(payload.total / payload.pageSize));
        if (account === memberWithdrawalAccountFilter && payload.withdrawalSource.state === "ready" && payload.page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(payload);
      })
      .catch(cause => {
        if (!signal.aborted && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "Unable to load the member register.");
        }
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });
  }, [query, account]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => load(controller.signal), 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load, attempt]);

  useEffect(() => {
    const refreshOnFocus = () => setAttempt(value => value + 1);
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  function changeFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  function clearFilters() {
    setSearch("");
    setDepartment("");
    setMembership("");
    setAccount("");
    setPage(1);
  }

  function toggleMembership(value: MemberRegisterStatus) {
    setMembership(current => current === value ? "" : value);
    setPage(1);
  }

  function enrolled(result: EnrollmentResult) {
    setAdding(false);
    setAttempt(value => value + 1);
    setSelectedUserId(result.membership.userId);
    setNotice({
      employeeName: result.membership.employeeName,
      agreementNo: result.membership.agreementNo,
      journalNo: result.membership.journalNo,
      orNo: result.membership.orNo,
      duplicate: result.duplicate,
    });
  }

  const counts = data?.counts;
  const hasMore = data ? data.page * data.pageSize < data.total : false;
  const hasFilters = Boolean(search.trim() || department || membership || account);
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const loanSource = data?.loanSource;
  const loanFilterUnavailable = data?.loanFilterUnavailable;
  const withdrawalSource = data?.withdrawalSource;
  const withdrawalFilterUnavailable = data?.withdrawalFilterUnavailable || Boolean(error && account === memberWithdrawalAccountFilter);
  const filterUnavailable = loanFilterUnavailable || withdrawalFilterUnavailable;

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <UsersRound className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Members</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Employee and membership register from VOS and Cooperative records. Open a row for the agreement, documents, savings, and take-home pay.
              </p>
            </div>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add member
          </Button>
        </div>
      </section>

      {notice && (
        <div role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {notice.duplicate ? "Enrollment already saved" : "Member enrolled"} <span className="font-normal">for {notice.employeeName}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">
              <span className="rounded-md border border-emerald-200 bg-background/70 px-2 py-1">{notice.agreementNo}</span>
              <span className="rounded-md border border-emerald-200 bg-background/70 px-2 py-1">{notice.journalNo ?? "No journal"}</span>
              <span className="rounded-md border border-emerald-200 bg-background/70 px-2 py-1">{notice.orNo ?? "No counter OR"}</span>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setNotice(undefined)} aria-label="Dismiss enrollment notice">
            <X className="size-4" />
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
        </div>
      )}

      {!counts && loading && (
        <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
        </div>
      )}

      {counts && (
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            className={cn("rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40", membership === "MEMBER" && "ring-2 ring-emerald-500/40 ring-offset-2 ring-offset-background")}
            onClick={() => toggleMembership("MEMBER")}
            aria-pressed={membership === "MEMBER"}
          >
            <MetricCard
              icon={UsersRound}
              label="Members"
              value={counts.members}
              detail={counts.separated ? `${counts.separated} separated in the register` : "Active memberships"}
              tone="emerald"
            />
          </button>
          <button
            type="button"
            className={cn("rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40", membership === "NON_MEMBER" && "ring-2 ring-sky-500/40 ring-offset-2 ring-offset-background")}
            onClick={() => toggleMembership("NON_MEMBER")}
            aria-pressed={membership === "NON_MEMBER"}
          >
            <MetricCard
              icon={UserPlus}
              label="Not yet joined"
              value={counts.nonMembers}
              detail="Active employees without a membership"
              tone="sky"
            />
          </button>
          <button
            type="button"
            className={cn("rounded-xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40", account === "documents" && "ring-2 ring-amber-500/40 ring-offset-2 ring-offset-background")}
            onClick={() => { setAccount(current => current === "documents" ? "" : "documents"); setPage(1); }}
            aria-pressed={account === "documents"}
          >
            <MetricCard
              icon={FileWarning}
              label="Missing documents"
              value={counts.documentsMissing}
              detail="Current members needing required files"
              tone={counts.documentsMissing ? "amber" : "slate"}
              alert={counts.documentsMissing > 0}
            />
          </button>
        </div>
      )}

      <Panel
        title="Member register"
        description="Search employees and open a row for the member detail."
      >
        <div className="mb-4 rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground sm:col-span-3">
              Search
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => { setSearch(event.target.value); setPage(1); }}
                  placeholder="Name, HR employee number, department, or agreement"
                  className="h-9 pl-8"
                />
              </div>
            </label>
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              Department
              <NativeSelect value={department} onChange={event => changeFilter(setDepartment)(event.target.value)} className="h-9 w-full">
                <option value="">All departments</option>
                {data?.departments.map(name => <option key={name} value={name}>{name}</option>)}
              </NativeSelect>
            </label>
            <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
              Membership
              <NativeSelect value={membership} onChange={event => changeFilter(setMembership)(event.target.value)} className="h-9 w-full">
                <option value="">All employees</option>
                {(Object.keys(MEMBER_STATUS_LABEL) as MemberRegisterStatus[]).map(value => (
                  <option key={value} value={value}>{MEMBER_STATUS_LABEL[value]}</option>
                ))}
              </NativeSelect>
            </label>
            <div className="space-y-1.5">
              <label htmlFor="cooperative-member-account" className="block text-[11px] font-medium text-muted-foreground">Account</label>
              <NativeSelect id="cooperative-member-account" value={account} onChange={event => changeFilter(setAccount)(event.target.value)} className="h-9 w-full">
                <option value="">Any</option>
                {Object.entries(memberLoanAccountFilters).map(([value, label]) => (
                  <option key={value} value={value} disabled={!loanSource || loanSource.state === "pending_rollout"}>{label}</option>
                ))}
                <option value={memberWithdrawalAccountFilter} disabled={!withdrawalSource || withdrawalSource.state === "pending_rollout"}>
                  With withdrawal request
                </option>
                <option value="documents">Missing documents</option>
              </NativeSelect>
            </div>
            <div className="flex items-end justify-between gap-2 sm:col-span-3">
              <p className="text-xs text-muted-foreground">
                {loading ? "Updating register..." : withdrawalFilterUnavailable ? "Withdrawal filter unavailable"
                  : loanFilterUnavailable ? "Loan filter unavailable" : `${data?.total ?? 0} employee${data?.total === 1 ? "" : "s"} match`}
              </p>
              {hasFilters && (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
                  <X className="size-3.5" /> Clear filters
                </Button>
              )}
            </div>
          </div>
        </div>

        {loanSource && loanSource.state !== "ready" && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <p role={loanSource.state === "unavailable" ? "alert" : "status"}>{loanSource.message}</p>
            {loanSource.state === "unavailable" && (
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setAttempt(value => value + 1)}>Retry loan data</Button>
            )}
          </div>
        )}
        {withdrawalSource && withdrawalSource.state !== "ready" && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <p role={withdrawalSource.state === "unavailable" ? "alert" : "status"}>{withdrawalSource.message}</p>
            {withdrawalSource.state === "unavailable" && (
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setAttempt(value => value + 1)}>Retry withdrawal data</Button>
            )}
          </div>
        )}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="min-w-56">Employee</TableHead>
                <TableHead>Membership</TableHead>
                <TableHead className="hidden xl:table-cell">Agreement</TableHead>
                <TableHead className="hidden xl:table-cell">Documents</TableHead>
                <TableHead className="text-right">Savings</TableHead>
                <TableHead className="text-right whitespace-nowrap">Loan balance</TableHead>
                <TableHead className="text-right whitespace-nowrap">Past due</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody className={cn("transition-opacity", loading && data && "opacity-60")}>
              {loading && !data && <RegisterSkeleton />}
              {!loading && !filterUnavailable && data?.items.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8}>
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><SearchX className="size-5" /></span>
                      <p className="text-sm font-medium">No employees match these filters</p>
                      <p className="max-w-sm text-xs text-muted-foreground">Try a different name, department, or membership status.</p>
                      {hasFilters && <Button type="button" variant="outline" size="sm" className="mt-1" onClick={clearFilters}>Clear filters</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!withdrawalFilterUnavailable && data?.items.map(item => (
                <MemberRow key={item.userId} item={item} onOpen={() => setSelectedUserId(item.userId)} />
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
          <span>
            {!filterUnavailable && (data && data.total > 0 ? <>Showing <span className="font-medium text-foreground">{from}-{to}</span> of <span className="font-medium text-foreground">{data.total}</span></> : "No records")}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))}>
              <ChevronLeft className="size-3.5" /> Previous
            </Button>
            <span className="min-w-14 text-center font-medium text-foreground">Page {data?.page ?? page}</span>
            <Button size="sm" variant="outline" disabled={!hasMore || loading || filterUnavailable} onClick={() => setPage(value => value + 1)}>
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Panel>

      {adding && <AddMemberDialog onClose={() => setAdding(false)} onEnrolled={enrolled} />}
      {selectedUserId !== null && (
        <MemberDetailDialog
          key={selectedUserId}
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onDocumentsChanged={() => setAttempt(value => value + 1)}
        />
      )}
    </main>
  );
}

function RegisterSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <TableRow key={index} className="hover:bg-transparent">
          <TableCell>
            <div className="flex items-center gap-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="space-y-2">
                <div className="h-3 w-36 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </TableCell>
          <TableCell><div className="h-5 w-24 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell className="hidden xl:table-cell"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell className="hidden xl:table-cell"><div className="h-5 w-20 animate-pulse rounded-full bg-muted" /></TableCell>
          <TableCell><div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell><div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  );
}

function MemberRow({ item, onOpen }: { item: RegisterItem; onOpen: () => void }) {
  const missing = item.documents?.missing.length ?? 0;
  return (
    <TableRow
      tabIndex={0}
      aria-label={`Open ${item.employeeName}`}
      className="group cursor-pointer transition-colors focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/30"
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="whitespace-normal">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={item.employeeName} />
          <div className="min-w-0">
            <p className="truncate font-medium">{item.employeeName}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.employeeNumber} <span className="mx-1 text-muted-foreground/50">/</span> {item.departmentName ?? "No department"}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <StatusChip status={MEMBER_STATUS_CHIP[item.membershipStatus]} label={MEMBER_STATUS_LABEL[item.membershipStatus]} />
        <span className="mt-1 block text-xs text-muted-foreground">{item.joinedAt ? date(item.joinedAt) : "No membership date"}</span>
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        {item.agreementNo
          ? <span className="rounded-md border bg-muted/40 px-1.5 py-1 font-mono text-[11px]">{item.agreementNo}</span>
          : <span className="text-xs text-muted-foreground">-</span>}
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        {!item.documents ? <span className="text-xs text-muted-foreground">-</span>
          : item.documents.required === 0 ? <span className="text-xs text-muted-foreground">None required</span>
          : missing > 0 ? <StatusChip status="PARTIAL" label={`${item.documents.onFile}/${item.documents.required}`} />
          : <StatusChip status="ACTIVE" label="Complete" />}
      </TableCell>
      <TableCell className="text-right font-mono font-medium tabular-nums">
        {item.savingsBalance ? peso(item.savingsBalance) : <span className="font-sans text-xs font-normal text-muted-foreground">-</span>}
        {item.withdrawal && item.withdrawal.pendingCount > 0 && (
          <span className="mt-1 block whitespace-nowrap font-sans text-xs font-normal text-muted-foreground">
            {peso(item.withdrawal.pendingAmount)} pending withdrawal
          </span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono tabular-nums"><LoanBalance item={item} amount={item.loanBalance} /></TableCell>
      <TableCell className="text-right font-mono tabular-nums"><LoanBalance item={item} amount={item.pastDue} /></TableCell>
      <TableCell>
        <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
}

function LoanBalance({ item, amount }: { item: RegisterItem; amount: string | null }) {
  return amount === null
    ? <span className="font-sans text-xs text-muted-foreground">{item.hasCurrent ? "Unavailable" : "—"}</span>
    : peso(amount);
}
