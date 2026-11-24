"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldErrorsFrom, MemberApiError, memberFetch } from "../../members/client";
import { Panel, StatusChip } from "../components/ui";
import { reportManilaTime } from "../reports/report-dates";
import { calculateDividendPreview, readDividendAllocation } from "./allocation";
import { DividendBasisPanel } from "./DividendBasisPanel";
import { DividendPostingDetails, DividendPostingDialog } from "./DividendPostingDialog";
import { DividendPools } from "./DividendPools";
import { dividendActionDetails, dividendInputs, type DividendBasis, type DividendInputs, type DividendPostedRun, type DividendYear } from "./types";
import { useDividendRead } from "./useDividendRead";

const empty: DividendInputs = { netSurplus: "", reservePercent: "", educationPercent: "", savingsSharePercent: "" };
const fields = [
  ["netSurplus", "Net operating surplus (₱)"],
  ["reservePercent", "Reserve fund (%)"],
  ["educationPercent", "Education & training fund (%)"],
  ["savingsSharePercent", "Share for interest on savings (%)"],
] as const;
type Feedback = { message: string; error?: boolean; conflict?: boolean };

export default function DividendsModule({ currentYear }: { currentYear: number }) {
  const [year, setYear] = useState(String(currentYear));
  const [yearInput, setYearInput] = useState(year);
  const [yearError, setYearError] = useState("");
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

  function openYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = yearInput.trim();
    if (!/^[1-9]\d{3}$/.test(next) || Number(next) > currentYear) {
      setYearError("Choose the current Manila year or an earlier calendar year.");
      return;
    }
    setYearError("");
    if (next === year || saving) return;
    if (dirty && !window.confirm("Discard unsaved changes and open another year?")) return;
    setEdits({});
    setFieldErrors({});
    setFeedback(undefined);
    setYear(next);
    result.reload();
    basis.reload();
  }

  function openPosted(run: DividendPostedRun) {
    setEdits({});
    setFeedback(undefined);
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

  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Year-end dividends</h1>
        <p className="mt-1 text-sm text-muted-foreground">Save the reviewed surplus and verify the savings and interest basis for {year}.</p>
      </div>
      <form onSubmit={openYear} className="space-y-1" noValidate>
        <label htmlFor="dividend-year" className="block text-sm font-medium">Year</label>
        <div className="flex items-center gap-2">
          <Input id="dividend-year" inputMode="numeric" maxLength={4} value={yearInput} disabled={saving}
            onChange={event => { setYearInput(event.target.value); setYearError(""); }}
            aria-invalid={Boolean(yearError)} aria-describedby={yearError ? "dividend-year-error" : undefined} className="w-24" />
          <Button type="submit" variant="outline" disabled={saving}>Open year</Button>
        </div>
        {yearError && <p id="dividend-year-error" role="alert" className="text-sm text-destructive">{yearError}</p>}
      </form>
    </div>

    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel title="Allocation" actions={<StatusChip status={posted ? "POSTED" : "DRAFT"} label={posted ? "Posted" : "Draft"} />}>
        {result.loading && <p role="status" className="mb-3 text-sm text-muted-foreground">Loading draft…</p>}
        {result.error && <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>{result.error}</span>
          <Button type="button" variant="outline" size="sm" onClick={result.reload}>Retry draft</Button>
        </div>}
        {result.data && <form onSubmit={save} className="space-y-3" noValidate>
          {draft && <p className="text-sm text-muted-foreground">
            Revision {draft.revision} · Saved by {draft.savedBy} · {reportManilaTime(draft.savedAt)} PHT
          </p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(([key, label]) => {
              const error = fieldErrors[key];
              return <div key={key} className="space-y-1">
                <label htmlFor={`dividend-${key}`} className="block text-sm font-medium">{label}</label>
                <Input id={`dividend-${key}`} inputMode="decimal" value={values[key]} disabled={!editable}
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
                {error && <span id={`dividend-${key}-error`} className="block text-sm text-destructive">{error}</span>}
              </div>;
            })}
          </div>
          <p className="text-sm text-muted-foreground">The savings share applies to the surplus after the reserve and education funds.</p>
          {!posted && <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={!editable || feedback?.conflict}>{saving ? "Saving…" : "Save draft"}</Button>
            {feedback && <span role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {feedback.message}
            </span>}
            {feedback?.conflict && <Button type="button" variant="outline" onClick={() => {
              result.reload();
              setFeedback(undefined);
            }}>Load latest draft</Button>}
          </div>}
        </form>}
      </Panel>
      <DividendPools preview={preview} pending={pending} unsaved={dirty} revision={draft?.revision} posted={Boolean(posted)} />
    </div>

    <DividendBasisPanel key={year} data={posted?.basis ?? basis.data} loading={result.loading || basis.loading}
      error={basis.error} onRefresh={!posted && result.data ? basis.reload : undefined} preview={preview}
      actions={!posted && result.data?.postingAvailable && Number(year) < currentYear && <DividendPostingDialog key={year}
        endpoint={endpoint} disabled={!editable || !draft || dirty || Boolean(feedback?.conflict)}
        reloadYear={result.reload} onPosted={openPosted} />} />
    {posted && <Panel title={posted.reference}
      description={`Posted by ${posted.postedBy} · ${reportManilaTime(posted.postedAt)} PHT`}>
      <DividendPostingDetails preview={posted} journals={posted.journals} />
    </Panel>}
  </main>;
}
