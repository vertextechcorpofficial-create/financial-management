"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type PolicyContext, usePolicyEditor } from "../policy-client";
import { savingsRateYear, type Settings } from "../policy-types";
import { PolicyFeedback, PolicyInput, PolicySelect } from "./PolicyForm";

export function SavingsPolicies({ context }: { context: PolicyContext }) {
  const stored = context.state.settings;
  const [form, setForm] = useState({
    membershipFee: stored?.membershipFee ?? "", minimumSavings: stored?.minimumSavings ?? "",
    maintainingBalance: stored?.maintainingBalance ?? "", withdrawals: String(stored?.withdrawalsPerYear ?? ""),
    floorMode: stored?.floorMode ?? "FIXED", fixed: stored?.floorFixedAmount ?? "", percent: stored?.floorPercent ?? "",
    paymentOrder: stored?.paymentOrder ?? "PENALTIES_FIRST",
  });
  const [rates, setRates] = useState(stored?.exitSavingsAnnualRates ?? {});
  const [newYear, setNewYear] = useState("");
  const editor = usePolicyEditor(context, latest => latest.settings);
  const years = Object.keys(rates).sort((a, b) => b.localeCompare(a));
  const canAddYear = savingsRateYear.safeParse(newYear).success && !Object.hasOwn(rates, newYear);

  return <section className="max-w-4xl rounded-lg border bg-card p-5">
    <h2 className="text-base font-semibold">Savings &amp; membership rules</h2>
    <form noValidate className="mt-4 space-y-4" onSubmit={event => {
      event.preventDefault();
      const common = {
        membershipFee: form.membershipFee, minimumSavings: form.minimumSavings,
        maintainingBalance: form.maintainingBalance,
        withdrawalsPerYear: /^\d+$/.test(form.withdrawals) ? Number(form.withdrawals) : -1,
        paymentOrder: form.paymentOrder,
        exitSavingsAnnualRates: rates,
      };
      const data: Settings = form.floorMode === "FIXED"
        ? { ...common, floorMode: "FIXED", floorFixedAmount: form.fixed, floorPercent: null }
        : { ...common, floorMode: "PERCENT", floorFixedAmount: null, floorPercent: form.percent };
      void editor.save({ section: "settings", data });
    }}>
      <fieldset disabled={editor.busy} className="grid gap-4 sm:grid-cols-2">
        <PolicyInput label="Membership fee (₱)" inputMode="decimal" value={form.membershipFee}
          onChange={event => setForm({ ...form, membershipFee: event.target.value })} />
        <PolicyInput label="Minimum savings per cutoff (₱)" inputMode="decimal" value={form.minimumSavings}
          onChange={event => setForm({ ...form, minimumSavings: event.target.value })} />
        <PolicyInput label="Maintaining balance (₱)" inputMode="decimal" value={form.maintainingBalance}
          onChange={event => setForm({ ...form, maintainingBalance: event.target.value })} />
        <PolicyInput label="Withdrawals allowed per year (0 = unlimited)" inputMode="numeric" value={form.withdrawals}
          onChange={event => setForm({ ...form, withdrawals: event.target.value })} />
        <PolicySelect label="Take-home pay floor" value={form.floorMode}
          onChange={event => setForm({ ...form, floorMode: event.target.value as Settings["floorMode"] })}>
          <option value="FIXED">Fixed amount per cutoff</option><option value="PERCENT">Percent of gross pay</option>
        </PolicySelect>
        {form.floorMode === "FIXED"
          ? <PolicyInput label="Fixed floor (₱ per cutoff)" inputMode="decimal" value={form.fixed}
              onChange={event => setForm({ ...form, fixed: event.target.value })} />
          : <PolicyInput label="Floor (% of gross pay)" inputMode="decimal" value={form.percent}
              onChange={event => setForm({ ...form, percent: event.target.value })} />}
        <PolicySelect label="Payment allocation order" value={form.paymentOrder}
          onChange={event => setForm({ ...form, paymentOrder: event.target.value as Settings["paymentOrder"] })}>
          <option value="PENALTIES_FIRST">Penalties first, then installments</option>
          <option value="INSTALLMENTS_FIRST">Installments first, then penalties</option>
        </PolicySelect>
      </fieldset>
      <fieldset disabled={editor.busy} className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Annual savings rates for exit clearance</legend>
        {years.map(year => <div key={year} className="flex flex-wrap items-end gap-2">
          <PolicyInput label={`Annual savings rate for ${year} (%)`} inputMode="decimal" maxLength={10}
            value={rates[year]} onChange={event => setRates({ ...rates, [year]: event.target.value })} />
          <Button type="button" variant="outline" onClick={() => {
            setRates(Object.fromEntries(Object.entries(rates).filter(([savedYear]) => savedYear !== year)));
          }} aria-label={`Remove rate for ${year}`}>Remove</Button>
        </div>)}
        <div className="flex flex-wrap items-end gap-2">
          <PolicyInput label="Year to add" inputMode="numeric" maxLength={4} value={newYear}
            onChange={event => setNewYear(event.target.value)} />
          <Button type="button" variant="outline" disabled={!canAddYear} onClick={() => {
            setRates({ ...rates, [newYear]: "" });
            setNewYear("");
          }}>Add year</Button>
        </div>
      </fieldset>
      <PolicyFeedback editor={editor} />
      <Button type="submit" disabled={editor.busy || editor.stale}>{editor.busy ? "Saving…" : "Save settings"}</Button>
    </form>
  </section>;
}
