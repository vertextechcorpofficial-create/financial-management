"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { RequestEmployeePicker } from "../requests/RequestEmployeePicker";
import type { AgencyChoice, EmployeeChoice } from "../requests/types";
import { declineAgency, enrollExisting, EnrollmentApiError, enrollRequest, priorLoans } from "./api";
import { deductionMonthLabel, deductionMonths, unusualReference } from "./rules";
import type { EnrollmentDetail, EnrollmentOutcome, EnrollmentTerms, PriorLoan } from "./types";

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1 text-sm">
    <span className="block font-medium">{label}</span>
    {children}
    {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    {error && <span className="block text-xs text-destructive">{error}</span>}
  </label>;
}

export function EnrollmentEditor({ record, agencies, openMonth, onBack, onReload, refreshMonth, onSaved }: {
  record?: EnrollmentDetail;
  agencies: AgencyChoice[];
  openMonth: string | null;
  onBack: () => void;
  onReload: () => void;
  refreshMonth: () => void;
  onSaved: (result: EnrollmentOutcome) => void;
}) {
  const filed = record?.request.form;
  const [employee, setEmployee] = useState<EmployeeChoice | null>(null);
  const [selectedAgency, setSelectedAgency] = useState("");
  const [program, setProgram] = useState("");
  const [transfer, setTransfer] = useState(false);
  const [fields, setFields] = useState({
    agencyReference: filed?.agencyReference ?? "", originalPrincipal: "", monthlyAmortization: "",
    installmentCount: "", installmentsPaid: "", firstDeductionMonth: "",
    priorLoanId: filed?.renewalLoanId?.toString() ?? "", referenceConfirmed: false,
  });
  const [showDecline, setShowDecline] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"enroll" | "decline" | null>(null);
  const [error, setError] = useState<{ message: string; status?: number; fields?: Record<string, string> } | null>(null);
  const [prior, setPrior] = useState<{ key: string; items?: PriorLoan[]; supported?: boolean; error?: string }>();
  const [priorAttempt, retryPrior] = useState(0);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const agencyId = filed?.agencyId ?? Number(selectedAgency);
  const employeeId = filed?.employeeId ?? employee?.id;
  const agency = agencies.find(item => item.id === agencyId);
  const lookupKey = employeeId + ":" + agencyId + ":" + priorAttempt;
  const choices = prior?.key === lookupKey ? prior : undefined;
  const months = deductionMonths(openMonth);
  const unusual = agency && unusualReference(agency.shortCode, fields.agencyReference);
  const errors = error?.fields;

  useEffect(() => {
    if (!employeeId || !agencyId) return;
    const controller = new AbortController();
    priorLoans(employeeId, agencyId, controller.signal).then(result => {
      if (!controller.signal.aborted) setPrior({ key: lookupKey, ...result });
    }).catch(cause => {
      if (!controller.signal.aborted) setPrior({ key: lookupKey, error: cause instanceof Error ? cause.message : "Could not load prior loans." });
    });
    return () => controller.abort();
  }, [employeeId, agencyId, lookupKey]);

  function change<K extends keyof typeof fields>(name: K, value: typeof fields[K]) {
    setFields(current => ({ ...current, [name]: value, ...(name === "agencyReference" ? { referenceConfirmed: false } : {}) }));
    setError(null);
  }

  async function save(action: "enroll" | "decline", payload: object, send: (key: string) => Promise<EnrollmentOutcome>) {
    if (pending) return;
    const identity = JSON.stringify({ action, payload });
    if (attempt.current?.payload !== identity) attempt.current = { payload: identity, key: consignmentRequestId() };
    setPending(action);
    setError(null);
    try {
      onSaved(await send(attempt.current.key));
    } catch (cause) {
      if (cause instanceof EnrollmentApiError) {
        setError({ message: cause.message, fields: cause.fieldErrors, status: cause.status });
        if (cause.fieldErrors?.firstDeductionMonth) refreshMonth();
      } else {
        setError({ message: "The agency outcome could not be saved. Try again." });
      }
    } finally {
      setPending(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form: EnrollmentTerms = {
      ...fields,
      installmentCount: Number(fields.installmentCount), installmentsPaid: Number(fields.installmentsPaid),
      priorLoanId: fields.priorLoanId ? Number(fields.priorLoanId) : null,
    };
    if (record) {
      void save("enroll", form, key => enrollRequest(record, form, key));
    } else {
      const existing = { ...form, employeeId: employeeId ?? 0, agencyId, program, transfer };
      void save("enroll", existing, key => enrollExisting(existing, key));
    }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="ghost" disabled={Boolean(pending)} onClick={onBack}>Back to enrollment</Button>
      {record && <Button type="button" variant="outline" disabled={Boolean(pending)} aria-expanded={showDecline}
        onClick={() => { setShowDecline(value => !value); setError(null); }}>Agency did not approve</Button>}
    </div>
    <h2 className="text-base font-semibold">{record ? "Enter the approved loan details · " + record.reference : "Enroll an existing loan"}</h2>
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
      {error.message}
      {record && error.status === 409 && !errors?.agencyReference &&
        <Button type="button" variant="outline" size="sm" onClick={onReload}>Reload request</Button>}
    </div>}
    {showDecline && record ? <form className="space-y-3 rounded-lg border p-4" onSubmit={event => {
      event.preventDefault();
      void save("decline", { reason }, key => declineAgency(record, reason.trim(), key));
    }}>
      <Field label="Agency reason or reference">
        <Textarea required maxLength={500} value={reason} disabled={Boolean(pending)} onChange={event => setReason(event.target.value)} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => { setShowDecline(false); setError(null); }}>Back to loan details</Button>
        <Button type="submit" variant="destructive" disabled={Boolean(pending) || !reason.trim()}>
          {pending === "decline" ? "Saving…" : "Confirm agency decline"}
        </Button>
      </div>
    </form> : <form className="space-y-4" onSubmit={submit}>
      {record ? <dl className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Employee</dt><dd>{record.employeeName}</dd>{errors?.employeeId && <dd className="text-destructive">{errors.employeeId}</dd>}</div>
        <div><dt className="text-muted-foreground">Agency</dt><dd>{record.agencyName}</dd>{errors?.agencyId && <dd className="text-destructive">{errors.agencyId}</dd>}</div>
        <div><dt className="text-muted-foreground">Program</dt><dd>{record.program}</dd>{errors?.program && <dd className="text-destructive">{errors.program}</dd>}</div>
      </dl> : <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 text-sm">
          <div className="font-medium">Employee</div>
          <RequestEmployeePicker label="Employee" value={employee} invalid={Boolean(errors?.employeeId)} disabled={Boolean(pending)}
            onChange={choice => { setEmployee(choice); change("priorLoanId", ""); }} />
          {errors?.employeeId && <span className="text-xs text-destructive">{errors.employeeId}</span>}
        </div>
        <Field label="Agency / lender" error={errors?.agencyId}>
          <NativeSelect className="w-full" required disabled={Boolean(pending)} value={selectedAgency} onChange={event => {
            setSelectedAgency(event.target.value);
            setProgram("");
            setFields(current => ({ ...current, priorLoanId: "", agencyReference: "", referenceConfirmed: false }));
            setError(null);
          }}>
            <option value="">Choose agency</option>
            {agencies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Program" error={errors?.program}>
          <NativeSelect className="w-full" required value={program} disabled={!agency || Boolean(pending)}
            onChange={event => { setProgram(event.target.value); setError(null); }}>
            <option value="">Choose program</option>
            {agency?.programs.map(item => <option key={item}>{item}</option>)}
          </NativeSelect>
        </Field>
      </div>}
      <fieldset disabled={Boolean(pending)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Field label="Agency reference" hint={agency?.referenceExample ? "Example " + agency.referenceExample : "Enter the reference as printed on the agency notice."}
            error={errors?.agencyReference ?? errors?.referenceConfirmed}>
            <Input required value={fields.agencyReference} maxLength={120} aria-invalid={Boolean(errors?.agencyReference)}
              onChange={event => change("agencyReference", event.target.value)} />
          </Field>
          {unusual && <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={fields.referenceConfirmed}
              onChange={event => change("referenceConfirmed", event.target.checked)} />
            <span><span className="block text-xs text-muted-foreground">Unusual format for {agency?.name}.</span>Reference is correct as printed</span>
          </label>}
        </div>
        <Field label="Original principal (₱)" error={errors?.originalPrincipal}>
          <Input required inputMode="decimal" value={fields.originalPrincipal} maxLength={13}
            onChange={event => change("originalPrincipal", event.target.value)} />
        </Field>
        <Field label="Exact monthly amortization (₱)" hint="Use the amount on the agency notice." error={errors?.monthlyAmortization}>
          <Input required inputMode="decimal" value={fields.monthlyAmortization} maxLength={13}
            onChange={event => change("monthlyAmortization", event.target.value)} />
        </Field>
        <Field label="Number of installments" error={errors?.installmentCount}>
          <Input required type="number" step={1} min={1} value={fields.installmentCount}
            onChange={event => change("installmentCount", event.target.value)} />
        </Field>
        <Field label="Installments already paid" hint="Use the statement of account for transfers or renewals." error={errors?.installmentsPaid}>
          <Input type="number" step={1} min={0} value={fields.installmentsPaid} placeholder="0"
            onChange={event => change("installmentsPaid", event.target.value)} />
        </Field>
        <Field label="First deduction month" error={errors?.firstDeductionMonth}>
          <NativeSelect className="w-full" required disabled={!months.length}
            value={months.includes(fields.firstDeductionMonth) ? fields.firstDeductionMonth : ""}
            onChange={event => change("firstDeductionMonth", event.target.value)}>
            <option value="">Choose month</option>
            {months.map(month => <option key={month} value={month}>{deductionMonthLabel(month)}</option>)}
          </NativeSelect>
        </Field>
        <div className="space-y-1">
          <Field label="Prior loan for renewal" error={errors?.priorLoanId}>
            <NativeSelect className="w-full" value={fields.priorLoanId} disabled={!employeeId || !agencyId || !choices?.supported}
              required={filed?.applicationType === "RENEWAL"} onChange={event => change("priorLoanId", event.target.value)}>
              <option value="">{filed?.applicationType === "RENEWAL" ? "Choose prior loan" : "No prior loan"}</option>
              {fields.priorLoanId && !choices?.items?.some(item => String(item.id) === fields.priorLoanId) &&
                <option value={fields.priorLoanId}>Payroll loan {fields.priorLoanId} · verify eligibility</option>}
              {choices?.items?.map(item => <option key={item.id} value={item.id}>{item.reference || "Payroll loan " + item.id}{item.program ? " · " + item.program : ""}</option>)}
            </NativeSelect>
          </Field>
          {choices?.supported === false && <p className="text-xs text-muted-foreground">The prior-loan source for this agency is pending verification.</p>}
          {choices?.error && <div role="alert" className="text-sm">
            {choices.error} <Button variant="outline" size="sm" type="button" onClick={() => retryPrior(value => value + 1)}>Retry</Button>
          </div>}
        </div>
        {!record && <label className="flex items-center gap-2 self-end py-2 text-sm">
          <input type="checkbox" checked={transfer} onChange={event => setTransfer(event.target.checked)} /> Transferred from a previous employer
        </label>}
      </fieldset>
      {!months.length && <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
        Set the Government Loans open month before saving an enrollment.
        <Button type="button" variant="outline" size="sm" onClick={refreshMonth}>Reload months</Button>
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">A second person verifies the enrollment before deductions start.</p>
        <Button type="submit" disabled={Boolean(pending) || !months.length || Boolean(unusual && !fields.referenceConfirmed)}>
          {pending === "enroll" ? "Saving…" : "Save & send for verification"}
        </Button>
      </div>
    </form>}
  </div>;
}
