"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { consignmentRequestId } from "@/modules/financial-management/consignment/utils/request-id";
import { date, peso } from "@/modules/financial-management/cooperative/members/format";
import { employeeRequestApi, RequestApiError, staffRequestApi } from "./request-api";
import { changeRequestField } from "./request-rules";
import { RequestCapacity } from "./RequestCapacity";
import { RequestEmployeePicker } from "./RequestEmployeePicker";
import { RequestReview, RequestSection as Section } from "./RequestReview";
import {
  applicationTypes, documentKinds, emptyRequest, purposes,
  type AgencyChoice, type DocumentKind, type EmployeeChoice, type EmployeeSummary, type FieldErrors,
  type LoanRequest, type RequestAssessment, type RequestForm, type RequestView,
} from "./types";

type PendingFile = { file: File; key: string };
type Option = { value: string; label: string };

function MissingField({ text }: { text?: string }) {
  return text ? <p className="text-xs font-medium text-destructive">{text}</p> : null;
}

function SelectField({ label, value, onChange, options, placeholder = "— choose —", required, disabled, error }: {
  label: string; value: string; onChange: (value: string) => void; options: Option[]; placeholder?: string;
  required?: boolean; disabled?: boolean; error?: string;
}) {
  return <label className="min-w-0 space-y-1.5 text-sm [&_[data-slot=native-select-wrapper]]:w-full">
    <span className="block font-medium">{label}{required && <span aria-hidden="true" className="text-destructive"> *</span>}</span>
    <NativeSelect value={value} onChange={event => onChange(event.target.value)} disabled={disabled}
      aria-required={required} aria-invalid={Boolean(error)}>
      <option value="">{placeholder}</option>
      {value && !options.some(option => option.value === value) && <option value={value}>Saved selection unavailable</option>}
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </NativeSelect>
    <MissingField text={error} />
  </label>;
}

function EmployeeDetails({ employee }: { employee: EmployeeSummary }) {
  const details = [
    ["Employee ID", employee.id], ["Department", employee.department], ["Position", employee.position],
    ["Employment status", employee.status], ["Date hired", employee.hiredOn ? date(employee.hiredOn) : null],
    ["SSS no.", employee.sssNumber], ["Pag-IBIG MID", employee.pagIbigNumber],
    ["Basic monthly pay", employee.basicPay ? peso(employee.basicPay) : null], ["Mobile", employee.phone], ["Email", employee.email],
  ];
  return <dl className="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
    {details.map(([label, value]) => <div key={label}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value ?? "—"}</dd>
    </div>)}
  </dl>;
}

export function RequestEditor({ initial, agencies, applicant, onBack, onReload }: {
  initial: LoanRequest | null; agencies: AgencyChoice[];
  applicant?: Pick<EmployeeChoice, "id" | "name">;
  onBack: (view?: RequestView, notice?: string) => void; onReload: (id: number) => void;
}) {
  const api = applicant ? employeeRequestApi : staffRequestApi;
  const { assess, requestDocumentUrl, saveDraft, submitDraft, uploadRequestDocument } = api;
  const initialForm = initial?.form ?? (applicant ? { ...emptyRequest, employeeId: applicant.id } : emptyRequest);
  const [form, setForm] = useState(initialForm);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialForm));
  const [record, setRecord] = useState(initial);
  const [selectedEmployee, setEmployee] = useState<EmployeeChoice | null>(null);
  const [selectedCoMaker, setCoMaker] = useState<EmployeeChoice | null>(null);
  const [preview, setPreview] = useState<{ key: string; data?: RequestAssessment; error?: string }>();
  const [previewAttempt, retryPreview] = useState(0);
  const [files, setFiles] = useState<Partial<Record<DocumentKind, PendingFile>>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const actionLock = useRef(false);
  const keys = useRef<{ save?: { input: string; key: string }; submit?: { input: string; key: string } }>({});
  const formId = useId();
  const readOnly = record !== null && record.status !== "DRAFT";
  const serialized = JSON.stringify(form);
  const dirty = serialized !== savedSnapshot || Object.keys(files).length > 0;
  const previewKey = previewAttempt + ":" + serialized;
  const currentPreview = preview?.key === previewKey ? preview : undefined;

  useEffect(() => {
    if (!dirty || readOnly) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      assess(JSON.parse(serialized) as RequestForm, controller.signal).then(data => {
        if (!controller.signal.aborted) setPreview({ key: previewKey, data });
      }).catch(error => {
        if (!controller.signal.aborted) setPreview({ key: previewKey, error: error instanceof Error ? error.message : "Request checks failed." });
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [assess, previewKey, readOnly, serialized]);

  const data = currentPreview?.data;
  const employeeDetails = (data ?? preview?.data)?.employee;
  const agency = data?.agency ?? agencies.find(item => item.id === form.agencyId) ?? null;
  const bank = agency?.agencyType === "BANK";
  const employee = data?.employee ?? (selectedEmployee?.id === form.employeeId ? selectedEmployee : null) ??
    (record?.form.employeeId === form.employeeId && record.employeeName && form.employeeId
      ? { id: form.employeeId, name: record.employeeName, department: null } : null);
  const coMaker = data?.coMaker ?? (selectedCoMaker?.id === form.coMakerId ? selectedCoMaker : null);
  const missing = data?.fieldErrors ?? (initial && JSON.stringify(initial.form) === serialized ? initial.missing : {});
  const shownErrors = { ...fieldErrors };
  const missingCount = Object.keys(missing).length;
  const documentCount = (record?.documents.length ?? 0) + Object.keys(files).length;
  const ready = data && Object.keys(data.fieldErrors).length === 0;

  function change<K extends keyof RequestForm>(key: K, value: RequestForm[K]) {
    setForm(current => changeRequestField(current, key, value));
    setFeedback("");
    setActionError("");
    setFieldErrors({});
  }

  function actionKey(kind: "save" | "submit", input: string) {
    const current = keys.current[kind];
    if (current?.input === input) return current.key;
    const key = consignmentRequestId();
    keys.current[kind] = { input, key };
    return key;
  }

  async function finish(submit: boolean) {
    if (actionLock.current || readOnly) return;
    if (submit && !ready) {
      setFieldErrors(missing);
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setActionError("");
    setFeedback("");
    try {
      let saved = record;
      if (!saved || JSON.stringify(saved.form) !== serialized) {
        const key = actionKey("save", (saved?.revision ?? 0) + ":" + serialized);
        saved = await saveDraft(form, saved, key);
        setRecord(saved);
        setForm(saved.form);
        setSavedSnapshot(JSON.stringify(saved.form));
      }
      for (const kind of Object.keys(files) as DocumentKind[]) {
        const pending = files[kind]!;
        saved = await uploadRequestDocument(saved, kind, pending.file, pending.key);
        setRecord(saved);
        setSavedSnapshot(JSON.stringify(saved.form));
        setFiles(current => {
          const next = { ...current };
          delete next[kind];
          return next;
        });
      }
      if (submit) {
        await submitDraft(saved, actionKey("submit", saved.id + ":" + saved.revision));
        onBack("in-progress", `${saved.reference} submitted for approval.`);
      } else {
        setFeedback("Draft saved.");
        setFieldErrors(saved.missing);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The request could not be saved.");
      if (error instanceof RequestApiError) setFieldErrors(error.fieldErrors ?? {});
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }

  function textField(key: "amount" | "term" | "agencyAmortization" | "agencyReference" | "agencyFiledOn" | "coMakerRelationship",
    label: string, props: { max?: number; type?: string; inputMode?: "decimal" | "numeric"; placeholder?: string; required?: boolean } = {}) {
    const { max, required, ...inputProps } = props;
    return <label className="min-w-0 space-y-1.5 text-sm">
      <span className="block font-medium">{label}{required && <span aria-hidden="true" className="text-destructive"> *</span>}</span>
      <Input value={form[key]} onChange={event => change(key, event.target.value)} maxLength={max}
        aria-required={required} aria-invalid={Boolean(shownErrors[key])} {...inputProps} />
      <MissingField text={shownErrors[key]} />
    </label>;
  }

  function backToRequests() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onBack(record ? "drafts" : undefined);
  }

  if (readOnly) return <RequestReview key={record.revision} record={record} api={api} onBack={() => onBack()}
    onCancelled={() => onBack("decided", `${record.reference} cancelled.`)} onReload={() => onReload(record.id)} />;

  const options = (values: readonly string[]) => values.map(value => ({ value, label: value }));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button type="button" variant="ghost" disabled={busy} onClick={backToRequests}><ArrowLeft /> Back to requests</Button>
      <h2 className="font-semibold">{record ? record.reference + " · Draft" : applicant ? "Apply for a loan" : "New loan request"}</h2>
    </div>
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <Section title="Employee">
        <div className="max-w-lg">
          {applicant ? <p className="text-sm font-medium">{employee?.name ?? applicant.name} · {applicant.id}</p>
            : <RequestEmployeePicker label="Employee" value={employee} disabled={busy} invalid={Boolean(shownErrors.employeeId)}
              onChange={choice => { setEmployee(choice); change("employeeId", choice.id); }} />}
          <MissingField text={shownErrors.employeeId} />
        </div>
        {employeeDetails?.id === form.employeeId && <EmployeeDetails employee={employeeDetails} />}
      </Section>
      <Section title="Loan applied for">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField label="Agency / lender" value={form.agencyId?.toString() ?? ""}
            options={agencies.map(item => ({ value: String(item.id), label: item.name }))}
            onChange={value => change("agencyId", value ? Number(value) : null)} required error={shownErrors.agencyId} />
          <SelectField label="Loan program" value={form.program} onChange={value => change("program", value)} required
            options={options(agency?.programs ?? [])} disabled={!agency} error={shownErrors.program} />
          <SelectField label="Application type" value={form.applicationType} required
            onChange={value => change("applicationType", value as RequestForm["applicationType"])}
            options={Object.entries(applicationTypes).map(([value, label]) => ({ value, label }))} error={shownErrors.applicationType} />
          {form.applicationType === "RENEWAL" && <div className="space-y-1">
            <SelectField label="Loan being renewed" value={form.renewalLoanId?.toString() ?? ""} required
              onChange={value => change("renewalLoanId", value ? Number(value) : null)} error={shownErrors.renewalLoanId}
              options={(data?.loans ?? []).map(loan => ({ value: String(loan.id),
                label: (loan.reference ?? "Loan " + loan.id) + " · " + peso(loan.amortization) + "/mo · " + loan.paid + "/" + loan.installments + " paid" }))}
              disabled={!data?.loans.length} />
            {data?.renewalUnavailable && <p className="text-xs text-muted-foreground">Payroll renewal loans could not be verified for this agency.</p>}
            {data && !data.renewalUnavailable && !data.loans.length && <p className="text-xs text-muted-foreground">No active loans found for this employee and agency.</p>}
          </div>}
          {textField("amount", "Amount applied for (₱)", { inputMode: "decimal", placeholder: "0.00", max: 13, required: true })}
          {textField("term", "Term (months)", { inputMode: "numeric", placeholder: "e.g. 24", max: 5, required: true })}
          {textField("agencyReference", "Agency application no.", { max: 120 })}
          {textField("agencyFiledOn", "Date filed with the agency", { type: "date" })}
          <SelectField label="Purpose" value={form.purpose} onChange={value => change("purpose", value)} options={options(purposes)} />
          <SelectField label="Payout method" value={form.payout} onChange={value => change("payout", value)} disabled={!agency}
            options={options(agency?.payoutOptions ?? [])} error={shownErrors.payout} />
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="block font-medium">Remarks</span>
          <Textarea value={form.remarks} maxLength={500} onChange={event => change("remarks", event.target.value)} />
        </label>
      </Section>

      {bank && <Section title="Co-maker">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <RequestEmployeePicker label="Co-maker" value={coMaker} exclude={form.employeeId} disabled={busy}
              lookup={api.employeeOptions} invalid={Boolean(shownErrors.coMakerId)}
              onChange={choice => { setCoMaker(choice); change("coMakerId", choice.id); }} />
            <MissingField text={shownErrors.coMakerId} />
          </div>
          {textField("coMakerRelationship", "Relationship", { max: 160 })}
        </div>
      </Section>}
      <Section title="Deduction capacity and checks">
        {form.employeeId && agency && form.program && <div className="max-w-sm">
          {textField("agencyAmortization", "Monthly amortization from agency", { inputMode: "decimal", max: 13 })}
        </div>}
        {currentPreview?.error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          {currentPreview.error}<Button type="button" size="sm" variant="outline" onClick={() => retryPreview(value => value + 1)}>Retry checks</Button>
        </div> : <RequestCapacity capacity={data?.capacity ?? null} checks={data?.checks ?? []} />}
        {!currentPreview && form.employeeId && form.agencyId && form.program &&
          <p role="status" className="text-sm text-muted-foreground">Updating request checks…</p>}
      </Section>

      <Section title="Documents">
        <p className="text-xs text-muted-foreground">Optional. One PDF, JPG, or PNG per document, up to 5 MB.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(documentKinds) as DocumentKind[]).map(kind => {
            const document = record?.documents.find(item => item.kind === kind);
            const pending = files[kind];
            const inputId = formId + "-" + kind;
            return <div key={kind} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><FileText className="size-4" />
                <label htmlFor={inputId}>{documentKinds[kind]}</label>
              </div>
              {document && record && <a href={requestDocumentUrl(record.id, kind)} className="block break-words text-sm text-primary underline">{document.name}</a>}
              {pending && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="break-all">{pending.file.name} · Ready to attach</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setFiles(current => {
                  const next = { ...current };
                  delete next[kind];
                  return next;
                })}>Clear selection</Button>
              </div>}
              <Input type="file" id={inputId} accept=".pdf,.png,.jpg,.jpeg" onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  setActionError("Choose a file of 5 MB or less.");
                  return;
                }
                setActionError("");
                setFiles(current => ({ ...current, [kind]: { file, key: consignmentRequestId() } }));
              }} />
            </div>;
          })}
        </div>
      </Section>

      <Section title="Employee consent">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.deductionConsent} className="mt-1 accent-primary"
            onChange={event => change("deductionConsent", event.target.checked)} />
          <span>{applicant ? "I authorize deduction of the loan amortization from my pay and of any unpaid balance from final pay if I separate."
            : "The employee authorizes deduction of the loan amortization from their pay and of any unpaid balance from final pay if they separate."}</span>
        </label>
        <MissingField text={shownErrors.deductionConsent} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.dataSharingConsent} className="mt-1 accent-primary"
            onChange={event => change("dataSharingConsent", event.target.checked)} />
          <span>{applicant ? "I consent to sharing my employment and pay information with" : "The employee consents to sharing their employment and pay information with"} {agency?.name ?? "the agency or lender"} for this loan.</span>
        </label>
        <MissingField text={shownErrors.dataSharingConsent} />
      </Section>
    </fieldset>

    <section className="sticky bottom-0 z-10 space-y-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className={dirty ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
          {dirty ? "Unsaved changes" : "All changes saved"}
        </p>
        <p className="text-muted-foreground">{missingCount
          ? `${missingCount} required field${missingCount === 1 ? "" : "s"} remaining`
          : "Ready to submit"}</p>
      </div>
      {missingCount > 0 && <div className="max-h-24 space-y-1 overflow-y-auto text-sm">
        <h3 className="font-medium">Required before submission</h3>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {Object.entries(missing).map(([key, error]) => <li key={key}>{error}</li>)}
        </ul>
      </div>}
      {feedback && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{feedback}</p>}
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void finish(false)}>Save draft</Button>
        <Button type="button" disabled={busy || !ready} onClick={() => setConfirmSubmit(true)}>{busy ? "Saving…" : "Submit for approval"}</Button>
      </div>
    </section>

    <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Submit this loan request?</AlertDialogTitle>
          <AlertDialogDescription>The request will be sent to Loan Approval. You can still cancel it before enrollment.</AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Employee</dt><dd className="text-right font-medium">{employee?.name ?? "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Agency / program</dt><dd className="text-right font-medium">{agency?.name ?? "—"} · {form.program || "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Amount / term</dt><dd className="text-right font-medium">{form.amount ? peso(form.amount) : "—"} · {form.term || "—"} months</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Estimated monthly</dt><dd className="text-right font-medium">{data?.capacity?.estimatedAmortization ? peso(data.capacity.estimatedAmortization) : "—"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Documents</dt><dd className="text-right font-medium">{documentCount ? documentCount + " attached or pending" : "None attached"}</dd></div>
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Back to request</AlertDialogCancel>
          <Button type="button" disabled={busy} onClick={() => { setConfirmSubmit(false); void finish(true); }}>Confirm and submit</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
