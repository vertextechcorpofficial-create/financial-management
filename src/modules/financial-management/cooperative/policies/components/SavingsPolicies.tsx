"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "../../console/components/ui";
import { type PolicyContext, usePolicyEditor } from "../policy-client";
import { settingsSchema, savingsRateYear, type Settings } from "../policy-types";
import { PolicyFeedback, PolicyInput, PolicySelect } from "./PolicyForm";

type SettingsForm = {
  membershipFee: string;
  minimumSavings: string;
  maintainingBalance: string;
  withdrawals: string;
  floorMode: Settings["floorMode"];
  fixed: string;
  percent: string;
  paymentOrder: Settings["paymentOrder"];
};

function formFrom(settings: Settings | null): SettingsForm {
  return {
    membershipFee: settings?.membershipFee ?? "",
    minimumSavings: settings?.minimumSavings ?? "",
    maintainingBalance: settings?.maintainingBalance ?? "",
    withdrawals: String(settings?.withdrawalsPerYear ?? ""),
    floorMode: settings?.floorMode ?? "FIXED",
    fixed: settings?.floorFixedAmount ?? "",
    percent: settings?.floorPercent ?? "",
    paymentOrder: settings?.paymentOrder ?? "PENALTIES_FIRST",
  };
}

function rateSignature(rates: Record<string, string>) {
  return JSON.stringify(Object.keys(rates).sort().map(year => [year, rates[year]]));
}

function displayRate(value: string) {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function ratesFrom(settings: Settings | null) {
  return Object.fromEntries(Object.entries(settings?.exitSavingsAnnualRates ?? {}).map(([year, rate]) => [year, displayRate(rate)]));
}

export function SavingsPolicies({ context }: { context: PolicyContext }) {
  const stored = context.state.settings;
  const [form, setForm] = useState(() => formFrom(stored));
  const [rates, setRates] = useState<Record<string, string>>(() => ratesFrom(stored));
  const [newYear, setNewYear] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const editor = usePolicyEditor(context, latest => latest.settings);
  const years = Object.keys(rates).sort((left, right) => right.localeCompare(left));
  const canAddYear = savingsRateYear.safeParse(newYear).success && !Object.hasOwn(rates, newYear);
  const initial = formFrom(stored);
  const initialRates = ratesFrom(stored);
  const changed = JSON.stringify(form) !== JSON.stringify(initial) ||
    rateSignature(rates) !== rateSignature(initialRates);
  const dirty = stored ? changed : Boolean(form.membershipFee || form.minimumSavings || form.maintainingBalance ||
    form.withdrawals || form.fixed || form.percent || Object.keys(rates).length);

  const data: Settings = form.floorMode === "FIXED"
    ? {
      membershipFee: form.membershipFee, minimumSavings: form.minimumSavings,
      maintainingBalance: form.maintainingBalance,
      withdrawalsPerYear: /^\d+$/.test(form.withdrawals) ? Number(form.withdrawals) : -1,
      paymentOrder: form.paymentOrder, exitSavingsAnnualRates: rates,
      floorMode: "FIXED", floorFixedAmount: form.fixed, floorPercent: null,
    }
    : {
      membershipFee: form.membershipFee, minimumSavings: form.minimumSavings,
      maintainingBalance: form.maintainingBalance,
      withdrawalsPerYear: /^\d+$/.test(form.withdrawals) ? Number(form.withdrawals) : -1,
      paymentOrder: form.paymentOrder, exitSavingsAnnualRates: rates,
      floorMode: "PERCENT", floorFixedAmount: null, floorPercent: form.percent,
    };
  const parsed = settingsSchema.safeParse(data);

  function errorFor(field: string) {
    if (!submitted) return undefined;
    const issue = parsed.success ? undefined : parsed.error.issues.find(issue => issue.path[0] === field);
    if (!issue) return undefined;
    if (field === "withdrawalsPerYear") return "Enter a whole number from 0 to 65,535.";
    if (field === "floorPercent") return "Enter a percentage from 0 to 100.";
    if (field === "exitSavingsAnnualRates") return "Enter a valid annual rate for every configured year.";
    return "Enter a valid nonnegative amount with up to two decimal places.";
  }

  function reset() {
    setForm(formFrom(stored));
    setRates(ratesFrom(stored));
    setNewYear("");
    setSubmitted(false);
  }

  const rateError = errorFor("exitSavingsAnnualRates");

  return <Panel title="Savings & membership" description="Set the rules applied to member savings, take-home pay, and exit clearance.">
    <form noValidate className="space-y-4" onSubmit={event => {
      event.preventDefault();
      setSubmitted(true);
      if (!parsed.success) return;
      void editor.save({ section: "settings", data: parsed.data }).then(saved => {
        if (!saved) return;
        setForm(formFrom(parsed.data));
        setRates(ratesFrom(parsed.data));
        setNewYear("");
        setSubmitted(false);
      });
    }}>
      {submitted && !parsed.success && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>Check the highlighted fields before saving.</p>
      </div>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Membership &amp; savings</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Fees, required balances, and withdrawal limits.</p>
            </div>
            {dirty && <Badge variant="outline" className="border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Unsaved</Badge>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <PolicyInput label="Membership fee (₱)" inputMode="decimal" required value={form.membershipFee}
              error={errorFor("membershipFee")} onChange={event => setForm({ ...form, membershipFee: event.target.value })} />
            <PolicyInput label="Minimum savings (₱)" inputMode="decimal" required value={form.minimumSavings}
              helper="Required savings per cutoff." error={errorFor("minimumSavings")}
              onChange={event => setForm({ ...form, minimumSavings: event.target.value })} />
            <PolicyInput label="Maintaining balance (₱)" inputMode="decimal" required value={form.maintainingBalance}
              error={errorFor("maintainingBalance")} onChange={event => setForm({ ...form, maintainingBalance: event.target.value })} />
            <PolicyInput label="Withdrawals per year" inputMode="numeric" required value={form.withdrawals}
              helper="0 means unlimited." error={errorFor("withdrawalsPerYear")}
              onChange={event => setForm({ ...form, withdrawals: event.target.value })} />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div>
            <h3 className="text-sm font-semibold">Take-home pay &amp; payment order</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Protect member pay and choose how payments are applied.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <PolicySelect label="Take-home pay floor" value={form.floorMode}
              onChange={event => setForm({ ...form, floorMode: event.target.value as Settings["floorMode"] })}>
              <option value="FIXED">Fixed amount per cutoff</option><option value="PERCENT">Percent of gross pay</option>
            </PolicySelect>
            {form.floorMode === "FIXED"
              ? <PolicyInput label="Fixed floor (₱ per cutoff)" inputMode="decimal" required value={form.fixed}
                  error={errorFor("floorFixedAmount")} onChange={event => setForm({ ...form, fixed: event.target.value })} />
              : <PolicyInput label="Floor (% of gross pay)" inputMode="decimal" required value={form.percent}
                  error={errorFor("floorPercent")} onChange={event => setForm({ ...form, percent: event.target.value })} />}
            <PolicySelect label="Payment allocation order" value={form.paymentOrder}
              onChange={event => setForm({ ...form, paymentOrder: event.target.value as Settings["paymentOrder"] })}>
              <option value="PENALTIES_FIRST">Penalties first</option>
              <option value="INSTALLMENTS_FIRST">Installments first</option>
            </PolicySelect>
          </div>
        </section>
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Annual savings rates for exit clearance</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Set the rate used for each calendar year of savings interest.</p>
          </div>
          <Badge variant="outline">{years.length} year{years.length === 1 ? "" : "s"}</Badge>
        </div>
        {years.length ? <div className="divide-y rounded-xl border">
          {years.map(year => <div key={year} className="grid gap-2 p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <div className="self-center">
              <p className="text-sm font-medium">{year}</p>
              <p className="text-xs text-muted-foreground">Annual rate</p>
            </div>
            <PolicyInput label={`Rate for ${year} (%)`} inputMode="decimal" maxLength={10} value={rates[year]}
              onChange={event => setRates({ ...rates, [year]: event.target.value })} />
            <Button type="button" variant="outline" onClick={() => {
              setRates(Object.fromEntries(Object.entries(rates).filter(([savedYear]) => savedYear !== year)));
            }} aria-label={`Remove rate for ${year}`}>Remove</Button>
          </div>)}
        </div> : <p className="rounded-xl border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">No annual savings rates configured.</p>}
        {rateError && <p className="text-sm text-destructive">{rateError}</p>}
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <PolicyInput label="Year to add" inputMode="numeric" maxLength={4} value={newYear}
            helper="Four-digit calendar year." onChange={event => setNewYear(event.target.value)} />
          <Button type="button" variant="outline" disabled={!canAddYear} onClick={() => {
            setRates({ ...rates, [newYear]: "" });
            setNewYear("");
          }}>Add year</Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {dirty ? <span>Unsaved changes</span> : <span>All changes saved</span>}
          <span>·</span>
          <span>Revision {context.state.revision}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!dirty || editor.busy} onClick={reset}>Discard changes</Button>
          <Button type="submit" disabled={!dirty || editor.busy || editor.stale}>{editor.busy ? "Saving…" : "Save settings"}</Button>
        </div>
      </div>
      <PolicyFeedback editor={editor} />
    </form>
  </Panel>;
}
