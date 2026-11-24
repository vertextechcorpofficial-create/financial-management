"use client";

import { useState, type FormEvent } from "react";
import { FileCheck2, Percent, RefreshCw, Scale, UsersRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { centsToAmount } from "../../loans/loan-schedule";
import { fieldErrorsFrom, MemberApiError, memberFetch } from "../../members/client";
import { peso } from "../../members/format";
import { Panel, StatusChip } from "../components/ui";
import { reportManilaTime } from "../reports/report-dates";
import { calculateDividendPreview, readDividendAllocation } from "./allocation";
import { DividendBasisPanel } from "./DividendBasisPanel";
import { DividendPostingDetails, DividendPostingDialog } from "./DividendPostingDialog";
import { DividendPools } from "./DividendPools";
import { DividendAlert, DividendKpis, DiscardYearDialog, PostingReadiness, type ReadinessCheck } from "./DividendUi";
import { dividendActionDetails, dividendInputs, type DividendBasis, type DividendInputs, type DividendPostedRun, type DividendYear } from "./types";
import { useDividendRead } from "./useDividendRead";

const empty: DividendInputs = { netSurplus: "", reservePercent: "", educationPercent: "", savingsSharePercent: "" };
const fields = [
  ["netSurplus", "Net operating surplus (₱)"],
  ["reservePercent", "Reserve fund (%)"],
  ["educationPercent", "Education & training fund (%)"],
  ["savingsSharePercent", "Share for interest on savings (%)"],
] as const;
const tabTriggerClass = "shrink-0 gap-1.5 whitespace-nowrap data-[state=active]:bg-background";
type Feedback = { message: string; error?: boolean; conflict?: boolean };

export default function DividendsModule({ currentYear }: { currentYear: number }) {
  const [year, setYear] = useState(String(currentYear));
  const [yearInput, setYearInput] = useState(year);
  const [yearError, setYearError] = useState("");
  const [tab, setTab] = useState("allocation");
  const [pendingYear, setPendingYear] = useState<string>();
  const [notice, setNotice] = useState("");
  const [edits, setEdits] = useState<Partial<DividendInputs>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof DividendInputs, string>>>({});
  const [feedback, setFeedback] = useState<Feedback>();
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/fm/cooperative/year-end-dividends/${year}`;
  const result = useDividendRead<DividendYear>(endpoint);
  const posted = result.data?.posted;
  const basis = useDividendRead<DividendBasis>(result.data && !posted ? endpoint + "/basis" : null);
  const draft = result.data?.draft;
  const saved = draft?.values ?? empty;
  const values = { ...saved, ...edits };
  const parsed = dividendInputs.safeParse(values);
  const dirty = fields.some(([key]) => values[key] !== saved[key]);
  const editable = !posted && Boolean(result.data) && !result.loading && !result.error && !saving;
  const preview = posted ? readDividendAllocation(posted.allocation) :
    !result.loading && !result.error && !basis.loading && !basis.error && basis.data && parsed.success
      ? calculateDividendPreview(parsed.data, basis.data) : undefined;
  const pending = result.error ? "Retry loading the draft to preview allocations." :
    basis.error ? "Retry loading the posted member data to preview allocations." :
      result.loading || basis.loading ? "Loading data for the allocation preview…" :
        "Enter valid reviewed values to preview allocations.";
  const creditedMembers = preview ? [...preview.credits.values()].filter(row => row.total > 0n).length : undefined;
  const yearStatus = result.loading ? { status: "DRAFT", label: "Loading" }
    : result.error ? { status: "REJECTED", label: "Unavailable" }
      : posted ? { status: "POSTED", label: "Posted" }
        : draft ? { status: "DRAFT", label: "Draft" }
          : { status: "CANCELLED", label: "Not started" };
  const postingReady = Boolean(!posted && result.data?.postingAvailable && Number(year) < currentYear &&
    draft && !dirty && !feedback?.conflict && parsed.success && basis.data && preview);
  const checks: ReadinessCheck[] = [
    {
      label: "Draft saved",
      detail: draft ? `Revision ${draft.revision} saved by ${draft.savedBy} · ${reportManilaTime(draft.savedAt)} PHT.` : "Save the reviewed allocation first.",
      state: draft ? "ok" : "pending",
    },
    {
      label: "Member basis",
      detail: basis.error ? "The basis could not be loaded. Retry it before posting." : basis.data ? `${basis.data.rows.length} members for ${year}.` : "Loading the posted member basis.",
      state: basis.error ? "blocked" : basis.data ? "ok" : "pending",
    },
    {
      label: "Reviewed values",
      detail: parsed.success ? "The surplus and percentages are valid." : "Complete all allocation fields with valid values.",
      state: parsed.success ? "ok" : "pending",
    },
    {
      label: "Draft state",
      detail: feedback?.conflict ? "Load the latest draft before posting." : dirty ? "Save or discard changes before posting." : "The draft matches the latest save.",
      state: feedback?.conflict ? "blocked" : dirty ? "pending" : "ok",
    },
    {
      label: "Closed year",
      detail: Number(year) < currentYear ? `${year} is a closed calendar year.` : `Posting opens after December 31, ${currentYear}.`,
      state: Number(year) < currentYear ? "ok" : "blocked",
    },
    {
      label: "Posting enabled",
      detail: result.loading ? "Loading posting availability." : result.data?.postingAvailable ? "Posting is available in this environment." : "Posting is not enabled for this environment.",
      state: result.loading ? "pending" : result.data?.postingAvailable ? "ok" : "blocked",
    },
  ];
  const postingBlocked = checks.find(check => check.state !== "ok")?.detail;

  function switchYear(next: string) {
    setYear(next);
    setYearInput(next);
    setEdits({});
    setFieldErrors({});
    setFeedback(undefined);
    setNotice("");
    setTab("allocation");
    setPendingYear(undefined);
    result.reload();
    basis.reload();
  }

  function openYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = yearInput.trim();
    if (!/^[1-9]\d{3}$/.test(next) || Number(next) > currentYear) {
      setYearError("Choose the current Manila year or an earlier calendar year.");
      return;
    }
    setYearError("");
    if (next === year || saving) return;
    if (dirty) {
      setPendingYear(next);
      return;
    }
    switchYear(next);
  }

  function cancelYearChange() {
    setPendingYear(undefined);
    setYearInput(year);
  }

  function refreshAll() {
    result.reload();
    basis.reload();
  }

  function openPosted(run: DividendPostedRun) {
    setEdits({});
    setFeedback(undefined);
    setTab("posting");
    setNotice(`Dividend posted for ${year} · ${run.reference}`);
    result.replace({ draft: run.draft, posted: run, postingAvailable: true });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || feedback?.conflict) return;
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0], issue.message])));
      setFeedback({ message: "Check the highlighted fields.", error: true });
      return;
    }
    setSaving(true);
    setFeedback(undefined);
    setFieldErrors({});
    try {
      result.replace(await memberFetch<DividendYear>(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, expectedRevision: draft?.revision ?? 0 }),
      }));
      setEdits({});
      setFeedback({ message: "Draft saved." });
    } catch (error) {
      const detail = dividendActionDetails.safeParse(error instanceof MemberApiError ? error.payload?.details : null);
      if (detail.success && detail.data.run) {
        openPosted(detail.data.run);
        return;
      }
      setFieldErrors(fieldErrorsFrom(error));
      setFeedback({
        message: error instanceof Error ? error.message : "The draft could not be saved. Try again.",
        error: true, conflict: error instanceof MemberApiError && error.payload?.code === "DIVIDEND_DRAFT_CHANGED",
      });
    } finally {
      setSaving(false);
    }
  }

  function discardEdits() {
    setEdits({});
    setFieldErrors({});
    if (!feedback?.conflict) setFeedback(undefined);
  }

  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Percent className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Year-end dividends</h1>
              <StatusChip status={yearStatus.status} label={yearStatus.label} />
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Review surplus allocation, verify the member basis, and post annual savings credits.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto lg:justify-end">
          <form onSubmit={openYear} className="flex flex-wrap items-end gap-2" noValidate>
            <label htmlFor="dividend-year" className="grid gap-1 text-[11px] font-medium text-muted-foreground">Dividend year
              <Input id="dividend-year" inputMode="numeric" maxLength={4} value={yearInput} disabled={saving}
                onChange={event => { setYearInput(event.target.value); setYearError(""); }}
                aria-invalid={Boolean(yearError)} aria-describedby={yearError ? "dividend-year-error" : undefined} className="h-9 w-24" />
            </label>
            <Button type="submit" size="sm" variant="outline" disabled={saving}>Open year</Button>
          </form>
          <Button type="button" size="sm" variant="outline" onClick={refreshAll} disabled={result.loading || basis.loading || saving}>
            <RefreshCw className={cn("size-3.5", (result.loading || basis.loading) && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>
      {yearError && <p id="dividend-year-error" role="alert" className="relative mt-2 text-sm text-destructive">{yearError}</p>}
    </section>

    <DividendKpis preview={preview} loading={result.loading || basis.loading} />
    {notice && <DividendAlert tone="success" message={notice} action={
      <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => setNotice("")} aria-label="Dismiss notice">
        <X className="size-4" />
      </Button>
    } />}

    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <TabsList className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
          <TabsTrigger value="allocation" className={tabTriggerClass}><Scale className="size-3.5" /> Allocation</TabsTrigger>
          <TabsTrigger value="basis" className={tabTriggerClass}>
            <UsersRound className="size-3.5" /> Member basis
            {basis.data && <Badge variant="outline" className="ml-1">{basis.data.rows.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="posting" className={tabTriggerClass}>
            <FileCheck2 className="size-3.5" /> Posting
            {posted && <Badge variant="outline" className="ml-1">Posted</Badge>}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="allocation" className="mt-0">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Panel title="Reviewed allocation" description="Save the surplus and percentages that drive the annual distribution." actions={
            <StatusChip status={posted ? "POSTED" : dirty ? "DRAFT" : draft ? "READY" : "CANCELLED"}
              label={posted ? "Posted" : dirty ? "Unsaved" : draft ? "Saved" : "Not started"} />
          }>
            {result.loading && <DividendAllocationSkeleton />}
            {result.error && <DividendAlert tone="error" message={result.error} action={
              <Button type="button" variant="outline" size="sm" onClick={result.reload}>Retry draft</Button>
            } />}
            {result.data && <form onSubmit={save} className="space-y-4" noValidate>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {draft ? <span>Revision {draft.revision} · Saved by {draft.savedBy} · {reportManilaTime(draft.savedAt)} PHT</span>
                  : <span>No draft saved for {year}. Enter the reviewed values and save.</span>}
                {dirty && <span className="rounded-md border border-amber-300 bg-amber-50/70 px-2 py-0.5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Unsaved changes</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map(([key, label]) => {
                  const error = fieldErrors[key];
                  return <div key={key} className="space-y-1.5">
                    <label htmlFor={`dividend-${key}`} className="block text-sm font-medium">{label}</label>
                    <Input id={`dividend-${key}`} inputMode="decimal" value={values[key]} disabled={!editable} className="h-9"
                      aria-invalid={Boolean(error)} aria-describedby={error ? `dividend-${key}-error` : undefined}
                      onChange={event => {
                        const value = event.target.value;
                        setEdits(previous => {
                          const next = { ...previous };
                          if (value === saved[key]) delete next[key];
                          else next[key] = value;
                          return next;
                        });
                        setFieldErrors(previous => ({ ...previous, [key]: undefined }));
                        setFeedback(previous => previous?.conflict ? previous : undefined);
                      }} />
                    {error && <span id={`dividend-${key}-error`} className="block text-xs text-destructive">{error}</span>}
                  </div>;
                })}
              </div>
              <p className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
                The savings share applies to the surplus after the reserve and education funds. Percentages are capped at 50% for reserve and education, and 100% for the savings share.
              </p>
              {posted ? <DividendAlert tone="success" message={`This year is posted and locked · ${posted.reference}`} /> : <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={!editable || !dirty || feedback?.conflict}>{saving ? "Saving…" : "Save draft"}</Button>
                  {dirty && <Button type="button" variant="outline" disabled={saving} onClick={discardEdits}>Discard changes</Button>}
                </div>
                {feedback && <DividendAlert tone={feedback.conflict ? "warning" : feedback.error ? "error" : "success"} message={feedback.message} action={
                  feedback.conflict
                    ? <Button type="button" variant="outline" size="sm" onClick={() => { result.reload(); setFeedback(undefined); }}>Load latest draft</Button>
                    : undefined
                } />}
              </>}
            </form>}
          </Panel>
          <DividendPools preview={preview} pending={pending} unsaved={dirty} revision={draft?.revision} posted={Boolean(posted)}
            basisMembers={basis.data?.rows.length} creditedMembers={creditedMembers} />
        </div>
      </TabsContent>

      <TabsContent value="basis" forceMount className="mt-0 data-[state=inactive]:hidden">
        <DividendBasisPanel key={year} data={posted?.basis ?? basis.data} loading={result.loading || basis.loading}
          error={basis.error} onRefresh={!posted && result.data ? basis.reload : undefined} preview={preview}
          onEditAllocation={() => setTab("allocation")} />
      </TabsContent>

      <TabsContent value="posting" className="mt-0 space-y-4">
        {posted ? <Panel title={posted.reference} description={`Posted by ${posted.postedBy} · ${reportManilaTime(posted.postedAt)} PHT`}
          actions={<StatusChip status="POSTED" label="Posted" />}>
          <DividendPostingDetails preview={posted} journals={posted.journals} />
        </Panel> : <>
          {result.error && <DividendAlert tone="error" message={result.error} action={
            <Button type="button" variant="outline" size="sm" onClick={result.reload}>Retry year</Button>
          } />}
          {basis.error && <DividendAlert tone="error" message={basis.error} action={
            <Button type="button" variant="outline" size="sm" onClick={basis.reload}>Retry basis</Button>
          } />}
          <PostingReadiness checks={checks} />
          <Panel title="Annual posting" description="Posting credits member savings and records the annual dividend journals.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Members receiving credit", creditedMembers !== undefined && basis.data ? `${creditedMembers} of ${basis.data.rows.length}` : "—"],
                ["Savings credits", preview ? peso(centsToAmount(preview.savings.allocated)) : "—"],
                ["Patronage refunds", preview ? peso(centsToAmount(preview.patronage.allocated)) : "—"],
                ["Undivided surplus", preview ? peso(centsToAmount(preview.undividedSurplus)) : "—"],
              ].map(([label, value]) => <div key={label} className="rounded-xl border bg-muted/20 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
              </div>)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <DividendPostingDialog endpoint={endpoint} disabled={!postingReady} disabledReason={postingBlocked}
                onPosted={openPosted} reloadYear={result.reload} />
              {!postingReady && <p className="text-xs text-muted-foreground">{postingBlocked ?? "Complete the checklist to enable posting."}</p>}
              {!postingReady && <Button type="button" variant="outline" size="sm" onClick={() => setTab("allocation")}>Open allocation</Button>}
            </div>
          </Panel>
        </>}
      </TabsContent>
    </Tabs>

    {pendingYear && <DiscardYearDialog year={year} nextYear={pendingYear} onCancel={cancelYearChange}
      onConfirm={() => switchYear(pendingYear)} />}
  </main>;
}

function DividendAllocationSkeleton() {
  return <div className="space-y-3" aria-busy="true">
    <div className="h-4 w-64 animate-pulse rounded bg-muted" />
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="h-9 animate-pulse rounded border bg-muted/30" />
      </div>)}
    </div>
    <div className="h-9 w-28 animate-pulse rounded bg-muted" />
  </div>;
}
