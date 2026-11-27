"use client";

import { cloneElement, isValidElement, useId, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AgencyRequestError, saveAgency } from "./agencies-api";
import { AGENCY_TYPES, DEADLINE_RULES, PENALTY_BASES, parseAgencyList, type Agency } from "./types";

function Field({ label, hint, error, required, children }: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (id: string, describedBy?: string) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = children(id, describedBy);
  return <div className="min-w-0 space-y-1.5">
    <Label htmlFor={id}>{label}{required && <span className="text-destructive" aria-hidden> *</span>}</Label>
    {isValidElement(control)
      ? cloneElement(control as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": describedBy })
      : control}
    {hint && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    {error && <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p>}
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
  const [rule, setRule] = useState<string>(agency?.deadlineRule ?? "");
  const [day, setDay] = useState(agency?.deadlineDay?.toString() ?? "");
  const [basis, setBasis] = useState<string>(agency?.penaltyBasis ?? "");
  const [rate, setRate] = useState(agency?.penaltyRatePercent ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string }>();
  const fixedDay = rule === "FIXED_DAY";
  const chargesPenalty = basis === "MONTHLY" || basis === "DAILY";
  const fieldError = (field: string) => error?.field === field ? error.message : undefined;
  const detailFields = [
    { name: "displayName", label: "Display name", value: agency?.displayName, max: 160, required: true },
    { name: "fullName", label: "Full name", value: agency?.fullName, max: 160, required: true },
  ] as const;
  const programFields: { name: string; label: string; value?: string; max?: number; required?: boolean; hint?: string; placeholder?: string }[] = [
    { name: "programs", label: "Loan programs", value: agency?.programs.join(", "), hint: "Separate program names with commas.", required: true },
    { name: "referenceExample", label: "Reference example", value: agency?.referenceExample ?? "", max: 160, hint: "Enter the reference as printed on the agency notice." },
    { name: "paymentReferenceLabel", label: "Payment reference label", value: agency?.paymentReferenceLabel ?? "", max: 80, placeholder: "Payment reference" },
    { name: "payoutOptions", label: "Payout options", value: agency?.payoutOptions.join(", "), hint: "Separate choices with commas." },
    { name: "employerNumber", label: "Employer number", value: agency?.employerNumber ?? "", max: 80 },
  ];

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
        isActive: status === "active",
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
      const next: { message: string; field?: string } = cause instanceof AgencyRequestError
        ? { message: cause.message, field: cause.field }
        : { message: "Could not save the agency. Try again." };
      setError(next);
      toast.error(next.message, next.field === "expectedRevision"
        ? { action: { label: "Reload agency", onClick: onReload } } : undefined);
    } finally {
      setSaving(false);
    }
  }

  return <Sheet open onOpenChange={open => { if (!open && !saving) onCancel(); }}>
    <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
      <SheetHeader className="shrink-0 border-b p-4 pr-12">
        <SheetTitle>{agency ? `Edit ${agency.displayName}` : "Add an agency or lender"}</SheetTitle>
        <SheetDescription>Fields marked <span className="text-destructive">*</span> are required. Changes are recorded in agency history.</SheetDescription>
      </SheetHeader>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <fieldset disabled={saving} className="space-y-3">
            <legend className="text-sm font-semibold">Agency details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Short code" required={!agency} error={fieldError("shortCode")}>
                {id => <Input id={id} name="shortCode" defaultValue={agency?.shortCode} readOnly={Boolean(agency)}
                  required={!agency} placeholder="e.g. LBP" maxLength={32} aria-invalid={!!fieldError("shortCode")} />}
              </Field>
              <Field label="Agency type" required error={fieldError("agencyType")}>
                {id => <NativeSelect id={id} name="agencyType" defaultValue={agency?.agencyType ?? ""} required aria-invalid={!!fieldError("agencyType")}>
                  <option value="">Choose type</option>{choices(AGENCY_TYPES)}
                </NativeSelect>}
              </Field>
              {detailFields.map(field => <Field key={field.name} label={field.label} required={field.required} error={fieldError(field.name)}>
                {id => <Input id={id} name={field.name} defaultValue={field.value ?? ""} maxLength={field.max} required={field.required}
                  aria-invalid={!!fieldError(field.name)} />}
              </Field>)}
              <Field label={agency ? "Status" : "Initial status"} required error={fieldError("isActive")}>
                {id => <NativeSelect id={id} name="agencyStatus" defaultValue={agency ? (agency.isActive ? "active" : "inactive") : "active"}
                  required aria-invalid={!!fieldError("isActive")}>
                  <option value="active">Active</option><option value="inactive">Inactive</option>
                </NativeSelect>}
              </Field>
            </div>
          </fieldset>
          <fieldset disabled={saving} className="space-y-3 border-t pt-5">
            <legend className="text-sm font-semibold">Programs &amp; references</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {programFields.map(field => <Field key={field.name} label={field.label} hint={"hint" in field ? field.hint : undefined} required={"required" in field ? field.required : undefined}
                error={fieldError(field.name)}>
                {id => <Input id={id} name={field.name} defaultValue={field.value} placeholder={"placeholder" in field ? field.placeholder : undefined}
                  maxLength={"max" in field ? field.max : undefined} required={"required" in field ? field.required : undefined}
                  aria-invalid={!!fieldError(field.name)} />}
              </Field>)}
            </div>
          </fieldset>
          <fieldset disabled={saving} className="space-y-3 border-t pt-5">
            <legend className="text-sm font-semibold">Remittance policy</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Remittance deadline" required error={fieldError("deadlineRule")}>
                {id => <NativeSelect id={id} value={rule} required aria-invalid={!!fieldError("deadlineRule")} onChange={event => {
                  setRule(event.target.value);
                  if (event.target.value !== "FIXED_DAY") setDay("");
                }}>
                  <option value="">Choose deadline</option>{choices(DEADLINE_RULES)}
                </NativeSelect>}
              </Field>
              <Field label="Deadline day" required={fixedDay} hint="1–28, for a fixed-day deadline." error={fieldError("deadlineDay")}>
                {id => <Input id={id} name="deadlineDay" type="number" min={1} max={28} step={1}
                  disabled={!fixedDay} required={fixedDay} value={day} onChange={event => setDay(event.target.value)}
                  aria-invalid={!!fieldError("deadlineDay")} />}
              </Field>
              <Field label="Late-payment penalty" required error={fieldError("penaltyBasis")}>
                {id => <NativeSelect id={id} value={basis} required aria-invalid={!!fieldError("penaltyBasis")} onChange={event => {
                  setBasis(event.target.value);
                  if (event.target.value !== "MONTHLY" && event.target.value !== "DAILY") setRate("");
                }}>
                  <option value="">Choose penalty</option>{choices(PENALTY_BASES)}
                </NativeSelect>}
              </Field>
              <Field label="Penalty rate (%)" required={chargesPenalty} error={fieldError("penaltyRatePercent")}
                hint={chargesPenalty ? "Example: 0.10% per day on the withheld amount." : undefined}>
                {id => <Input id={id} name="penaltyRatePercent" type="number" min={0.01} step={0.01}
                  disabled={!chargesPenalty} required={chargesPenalty} value={rate} onChange={event => setRate(event.target.value)}
                  aria-invalid={!!fieldError("penaltyRatePercent")} />}
              </Field>
              <Field label="Reminder days" hint="Days before the deadline to show a reminder." error={fieldError("reminderDays")}>
                {id => <Input id={id} name="reminderDays" type="number" min={0} max={30} step={1} defaultValue={agency?.reminderDays ?? 5}
                  aria-invalid={!!fieldError("reminderDays")} />}
              </Field>
            </div>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="catchUp" className="mt-0.5 size-4 accent-primary" defaultChecked={agency?.catchUp} />
                <span><span className="font-medium">Add missed deductions to next month</span>
                  <span className="block text-xs text-muted-foreground">Carry a missed or partial deduction into the next billing cycle.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="sendsBilling" className="mt-0.5 size-4 accent-primary" defaultChecked={agency ? agency.sendsBilling : true} />
                <span><span className="font-medium">Sends a monthly billing</span>
                  <span className="block text-xs text-muted-foreground">Enable when the agency sends a monthly CSV for Billing reconciliation.</span></span>
              </label>
              {(error?.field === "catchUp" || error?.field === "sendsBilling") && <p role="alert" className="text-xs text-destructive">{error.message}</p>}
            </div>
          </fieldset>
        </div>
        <SheetFooter className="shrink-0 border-t p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : agency ? "Save changes" : "Add agency"}</Button>
        </SheetFooter>
      </form>
    </SheetContent>
  </Sheet>;
}
