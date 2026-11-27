"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BrgySettings } from "../../types";
import { call, Field } from "../../shared/ui";

/* -------------------------------------------------------------- settings */

export function SettingsTab({
  settings,
  canEdit,
  setError,
  setNotice,
}: {
  settings: BrgySettings | null;
  /** municipal reads these rates, only the system admin changes them */
  canEdit: boolean;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const [form, setForm] = React.useState({
    salvagePercent: String(settings?.salvage_percent ?? 0),
    approvalRequired: settings?.approval_required ?? true,
    lifeEquipment: String(settings?.life_equipment ?? ""),
    lifeMachinery: String(settings?.life_machinery ?? ""),
    lifeFurniture: String(settings?.life_furniture ?? ""),
    lifeOther: String(settings?.life_other ?? ""),
  });
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      await call("/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salvagePercent: Number(form.salvagePercent || 0),
          approvalRequired: form.approvalRequired,
          lifeEquipment: form.lifeEquipment ? Number(form.lifeEquipment) : null,
          lifeMachinery: form.lifeMachinery ? Number(form.lifeMachinery) : null,
          lifeFurniture: form.lifeFurniture ? Number(form.lifeFurniture) : null,
          lifeOther: form.lifeOther ? Number(form.lifeOther) : null,
        }),
      });
      setNotice("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const ro = !canEdit;
  return (
    <div className="grid max-w-xl gap-3 rounded-md border p-4">
      {ro ? (
        <p className="text-sm text-muted-foreground">
          Read only for your role. These rates decide every projected value, so the System Admin keeps them.
        </p>
      ) : null}
      <Field label="Salvage percent of cost, the projected value never goes below it">
        <Input disabled={ro} value={form.salvagePercent} onChange={(e) => setForm({ ...form, salvagePercent: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={ro}
          checked={form.approvalRequired}
          onChange={(e) => setForm({ ...form, approvalRequired: e.target.checked })}
        />
        Disposal needs approval from another person
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Equipment life, years"><Input disabled={ro} value={form.lifeEquipment} onChange={(e) => setForm({ ...form, lifeEquipment: e.target.value })} /></Field>
        <Field label="Machinery life, years"><Input disabled={ro} value={form.lifeMachinery} onChange={(e) => setForm({ ...form, lifeMachinery: e.target.value })} /></Field>
        <Field label="Furniture life, years"><Input disabled={ro} value={form.lifeFurniture} onChange={(e) => setForm({ ...form, lifeFurniture: e.target.value })} /></Field>
        <Field label="Other assets life, years"><Input disabled={ro} value={form.lifeOther} onChange={(e) => setForm({ ...form, lifeOther: e.target.value })} /></Field>
      </div>
      <div className="text-sm text-muted-foreground">Valuation method: straight line, fixed for now.</div>
      {ro ? null : (
        <div>
          <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving..." : "Save settings"}</Button>
        </div>
      )}
    </div>
  );
}
