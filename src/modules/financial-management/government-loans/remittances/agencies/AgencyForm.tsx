"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { AgencyRequestError, saveAgency } from "./agencies-api";
import { AGENCY_TYPES, DEADLINE_RULES, PENALTY_BASES, parseAgencyList, type Agency } from "./types";

function Field({ label, hint, children }: {
  label: string;
  hint?: string;
  children: (id: string, descriptionId?: string) => ReactNode;
}) {
  const id = useId();
  const descriptionId = hint ? `${id}-hint` : undefined;
  return <div className="min-w-0 space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children(id, descriptionId)}
    {hint && <p id={descriptionId} className="text-xs text-muted-foreground">{hint}</p>}
  </div>;
}

function choices(options: Record<string, string>) {
  return Object.entries(options).map(([value, label]) => <option key={value} value={value}>{label}</option>);
}

export function AgencyForm({ agency, onCancel, onSaved, onReload }: {
  agency?: Agency;
  onCancel: () => void;
  onSaved: (saved: Agency) => void;
  onReload: () => void;
}) {
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [rule, setRule] = useState<string>(agency?.deadlineRule ?? "");
  const [day, setDay] = useState(agency?.deadlineDay?.toString() ?? "");
  const [basis, setBasis] = useState<string>(agency?.penaltyBasis ?? "");
  const [rate, setRate] = useState(agency?.penaltyRatePercent ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string }>();
  const fixedDay = rule === "FIXED_DAY";
  const chargesPenalty = basis === "MONTHLY" || basis === "DAILY";

  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "");
    const status = text("agencyStatus");
    setSaving(true);
    setError(undefined);
    try {
      const saved = await saveAgency({
        ...(agency ? { expectedRevision: agency.revision } : { shortCode: text("shortCode") }),
        isActive: status ? status === "active" : undefined,
        displayName: text("displayName"),
        fullName: text("fullName"),
        agencyType: text("agencyType"),
        programs: parseAgencyList(text("programs")),
        referenceExample: text("referenceExample"),
        paymentReferenceLabel: text("paymentReferenceLabel"),
        payoutOptions: parseAgencyList(text("payoutOptions")),
        employerNumber: text("employerNumber"),
        deadlineRule: rule,
        deadlineDay: fixedDay && text("deadlineDay") ? Number(text("deadlineDay")) : null,
        penaltyBasis: basis,
        penaltyRatePercent: chargesPenalty ? text("penaltyRatePercent") : null,
        reminderDays: text("reminderDays") ? Number(text("reminderDays")) : undefined,
        catchUp: data.has("catchUp"),
        sendsBilling: data.has("sendsBilling"),
      }, agency?.id);
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof AgencyRequestError ? cause : { message: "Could not save the agency. Try again." });
    } finally {
      setSaving(false);
    }
  }

  const textFields = [
    { name: "displayName", label: "Display name", value: agency?.displayName, max: 160 },
    { name: "fullName", label: "Full name", value: agency?.fullName, max: 160 },
    { name: "programs", label: "Loan programs", value: agency?.programs.join(", "), hint: "Separate program names with commas." },
    { name: "referenceExample", label: "Reference example", value: agency?.referenceExample, max: 160, hint: "Enter the reference as printed on the agency notice." },
    { name: "paymentReferenceLabel", label: "Payment reference label", value: agency?.paymentReferenceLabel, max: 80, placeholder: "Payment reference" },
    { name: "payoutOptions", label: "Payout options", value: agency?.payoutOptions.join(", "), hint: "Separate choices with commas." },
    { name: "employerNumber", label: "Employer number", value: agency?.employerNumber, max: 80 },
  ];

  return <form ref={formRef} aria-labelledby={titleId} onSubmit={submit} noValidate className="space-y-4 rounded-lg border bg-card p-4">
    <h3 id={titleId} className="text-base font-semibold">{agency ? `Edit ${agency.displayName}` : "Add an agency or lender"}</h3>
    {error && <div className="flex flex-wrap items-center gap-3">
      <p role="alert" className="text-sm text-destructive">{error.message}</p>
      {error.field === "expectedRevision" && <Button type="button" variant="outline" size="sm" onClick={onReload}>Reload agency</Button>}
    </div>}
    <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Short code">{id => <Input id={id} name="shortCode" defaultValue={agency?.shortCode} readOnly={Boolean(agency)}
        placeholder="e.g. LBP" maxLength={32} aria-invalid={error?.field === "shortCode"} />}</Field>
      <Field label="Agency type">{id => <NativeSelect id={id} name="agencyType" defaultValue={agency?.agencyType ?? ""}
        aria-invalid={error?.field === "agencyType"}>
        <option value="">Choose type</option>{choices(AGENCY_TYPES)}
      </NativeSelect>}</Field>
      {textFields.map(field => <Field key={field.name} label={field.label} hint={field.hint}>{(id, description) =>
        <Input id={id} name={field.name} defaultValue={field.value ?? ""} placeholder={field.placeholder} maxLength={field.max}
          aria-describedby={description} aria-invalid={error?.field === field.name} />
      }</Field>)}
      <Field label={agency ? "Status" : "Initial status"}>{id => <NativeSelect id={id} name="agencyStatus"
        defaultValue={agency ? (agency.isActive ? "active" : "inactive") : ""} aria-invalid={error?.field === "isActive"}>
        <option value="" disabled>Choose status</option><option value="active">Active</option><option value="inactive">Inactive</option>
      </NativeSelect>}</Field>
    </fieldset>
    <fieldset disabled={saving} className="grid gap-4 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Remittance deadline">{id => <NativeSelect id={id} value={rule} onChange={event => {
        setRule(event.target.value);
        if (event.target.value !== "FIXED_DAY") setDay("");
      }}
        aria-invalid={error?.field === "deadlineRule"}>
        <option value="">Choose deadline</option>{choices(DEADLINE_RULES)}
      </NativeSelect>}</Field>
      <Field label="Deadline day">{id => <Input id={id} name="deadlineDay" type="number" min={1} max={28} step={1}
        disabled={!fixedDay} value={day} onChange={event => setDay(event.target.value)}
        aria-invalid={error?.field === "deadlineDay"} />}</Field>
      <Field label="Late-payment penalty">{id => <NativeSelect id={id} value={basis} onChange={event => {
        setBasis(event.target.value);
        if (event.target.value !== "MONTHLY" && event.target.value !== "DAILY") setRate("");
      }}
        aria-invalid={error?.field === "penaltyBasis"}>
        <option value="">Choose penalty</option>{choices(PENALTY_BASES)}
      </NativeSelect>}</Field>
      <Field label="Penalty rate (%)">{id => <Input id={id} name="penaltyRatePercent" type="number" min={0.01} step={0.01}
        disabled={!chargesPenalty} value={rate} onChange={event => setRate(event.target.value)}
        aria-invalid={error?.field === "penaltyRatePercent"} />}</Field>
      <Field label="Reminder days" hint="Days before the deadline.">{(id, description) => <Input id={id} name="reminderDays"
        type="number" min={0} max={30} step={1} defaultValue={agency?.reminderDays ?? ""} placeholder="5"
        aria-describedby={description} aria-invalid={error?.field === "reminderDays"} />}</Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="catchUp" className="accent-primary" defaultChecked={agency?.catchUp} />
        Add missed deductions to next month
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sendsBilling" className="accent-primary" defaultChecked={agency?.sendsBilling} />
        Sends a monthly billing
      </label>
    </fieldset>
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button type="submit" disabled={saving}>{saving ? "Saving…" : agency ? "Save changes" : "Add agency"}</Button>
    </div>
  </form>;
}
