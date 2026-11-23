"use client";

import { cloneElement, useEffect, useId, useState, type ReactElement } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConsoleDialog, Kv, Panel } from "../console/components/ui";
import { fieldErrorsFrom, MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, peso } from "../members/format";
import type { Product } from "../policies/policy-types";
import type { LoanEnrollmentChoices, LoanEnrollmentPreview } from "../server/loan-enrollment";
import type { LoanEnrollmentResult } from "../server/loan-enrollment-save";

type Member = LoanEnrollmentChoices["members"][number];
type Draft = {
  productId: number;
  principal: string;
  itemId: string;
  quantity: string;
  rate: string;
  method: Product["methods"][number];
  term: number;
  frequency: Product["frequencies"][number];
  mode: Product["modes"][number];
  releaseMethod: "CASH" | "PAYROLL" | "VENDOR";
  purpose: string;
};

const endpoint = "/api/fm/cooperative/loans/enrollment";
const methodLabels = { diminishing: "Diminishing balance", flat: "Flat", markup: "Markup" };
const frequencyLabels = { cutoff: "Every cutoff", monthly: "Monthly" };
const modeLabels = { payroll: "Salary deduction", otc: "Over the counter" };

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1 text-sm">
      <label htmlFor={id} className="block font-medium">{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}

function requestMessage(error: unknown) {
  return Object.values(fieldErrorsFrom(error))[0] ?? (error instanceof Error ? error.message : "Unable to check the loan.");
}

export function LoanEnrollmentDialog({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (result: LoanEnrollmentResult, release: { requested: boolean; reviewDocuments: boolean }) => void;
}) {
  const [member, setMember] = useState<Member>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [choices, setChoices] = useState<{ key: string; result?: LoanEnrollmentChoices; error?: string }>();
  const [lookupAttempt, setLookupAttempt] = useState(0);

  const [draft, setDraft] = useState<Draft>();
  const [signed, setSigned] = useState(false);
  const [releaseNow, setReleaseNow] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [evaluation, setEvaluation] = useState<{ key: string; preview?: LoanEnrollmentPreview; error?: string }>();
  const [requestKey, setRequestKey] = useState(() => newRequestKey());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const lookup = new URLSearchParams({ q: search, page: String(page) }).toString();
  const lookupKey = lookup + ":" + lookupAttempt;
  const currentChoices = choices?.key === lookupKey ? choices : undefined;
  const products = choices?.result?.products;
  const selectedProduct = products?.find(row => row.id === draft?.productId);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      memberFetch<LoanEnrollmentChoices>(endpoint + "?" + lookup, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setChoices({ key: lookupKey, result }); })
        .catch(error => { if (!controller.signal.aborted) setChoices({ key: lookupKey, error: requestMessage(error) }); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [lookup, lookupKey]);

  const payload = member && draft && selectedProduct && (selectedProduct.kind === "CASH" ? draft.principal && draft.rate : draft.itemId && draft.quantity)
    ? JSON.stringify({
        ...draft, memberId: member.id, principal: selectedProduct.kind === "CASH" ? draft.principal : undefined,
        rate: selectedProduct.kind === "CASH" ? draft.rate : undefined,
        itemId: selectedProduct.kind === "GOODS" ? Number(draft.itemId) : undefined,
        quantity: selectedProduct.kind === "GOODS" ? Number(draft.quantity) : undefined,
      })
    : "";
  const assessmentKey = payload + ":" + previewAttempt;
  const assessed = evaluation?.key === assessmentKey ? evaluation : undefined;
  const preview = assessed?.preview;

  useEffect(() => {
    if (!payload) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      memberFetch<LoanEnrollmentPreview>(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: controller.signal,
      })
        .then(result => { if (!controller.signal.aborted) setEvaluation({ key: assessmentKey, preview: result }); })
        .catch(error => { if (!controller.signal.aborted) setEvaluation({ key: assessmentKey, error: requestMessage(error) }); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [assessmentKey, payload]);

  function edit() {
    setSigned(false);
    setRequestKey(newRequestKey());
    setSaveError("");
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => current && { ...current, [key]: value });
    edit();
  }

  function chooseProduct(id: string) {
    const product = products?.find(row => row.id === Number(id));
    setDraft(product ? {
      productId: product.id, principal: "", itemId: "", quantity: "1", rate: product.rateDefault ?? "",
      method: product.methods[0], term: product.termsMonths[0], frequency: product.frequencies[0], mode: product.modes[0],
      releaseMethod: product.kind === "GOODS" ? "VENDOR" : "PAYROLL", purpose: "",
    } : undefined);
    edit();
  }

  async function save() {
    if (!preview?.canEnroll || !signed || saving) return;
    setSaveError("");
    setSaving(true);
    try {
      const result = await memberFetch<LoanEnrollmentResult>("/api/fm/cooperative/loans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: JSON.parse(payload), signed, fingerprint: preview.fingerprint, requestKey }),
      });
      onSaved(result, { requested: releaseNow, reviewDocuments: preview.snapshot.documents.length > 0 });
    } catch (error) {
      setSaveError(requestMessage(error));
      if (error instanceof MemberApiError && ["STALE_ASSESSMENT", "NOT_ELIGIBLE", "PRODUCT_CLOSED", "MEMBER_INACTIVE"].includes(error.payload?.code ?? "")) {
        edit();
        setSaveError(requestMessage(error));
        setPreviewAttempt(current => current + 1);
        setLookupAttempt(current => current + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConsoleDialog
      open
      onOpenChange={open => { if (!open && !saving) onClose(); }}
      title="Enroll loan"
      description="Record a signed loan agreement and send it to Approvals."
      wide
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => void save()} disabled={!preview?.canEnroll || !signed || saving}>
          {saving ? "Enrolling…" : releaseNow ? "Enroll and review release" : "Enroll loan"}
        </Button>
      </>}
    >
      <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Member</p>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" disabled={saving} aria-label="Choose member" className="h-auto min-h-9 w-full justify-between gap-2 whitespace-normal text-left">
                  {member ? member.name + " · " + member.employeeNumber : "Select member"}<ChevronDown className="size-4 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(23rem,calc(100vw-2rem))] p-2">
                <Input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Name, employee number, or department" aria-label="Search members" />
                <div className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
                  {!currentChoices && <p role="status" className="p-2 text-sm text-muted-foreground">Loading members…</p>}
                  {currentChoices?.error && <p role="alert" className="p-2 text-sm text-destructive">{currentChoices.error}</p>}
                  {currentChoices?.result?.members.length === 0 && <p className="p-2 text-sm text-muted-foreground">No active members match.</p>}
                  {currentChoices?.result?.members.map(choice => (
                    <Button key={choice.id} variant="ghost" size="sm" type="button"
                      className="h-auto min-h-10 w-full justify-start whitespace-normal text-left"
                      onClick={() => { setMember(choice); setPickerOpen(false); edit(); }}>
                      <span className="min-w-0"><span className="block">{choice.name}</span><span className="block text-xs text-muted-foreground">{choice.employeeNumber} · {choice.department ?? "No department"}</span></span>
                    </Button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1 || !currentChoices} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="text-xs text-muted-foreground">Page {page}</span>
                  <Button size="sm" variant="outline" disabled={!currentChoices?.result?.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </PopoverContent>
            </Popover>
            {currentChoices?.error && <Button size="sm" variant="outline" onClick={() => setLookupAttempt(value => value + 1)}>Retry choices</Button>}
          </div>

          <Field label="Loan product">
            <NativeSelect className="w-full" value={draft?.productId ?? ""} onChange={event => chooseProduct(event.target.value)} disabled={!products?.length || saving}>
              <option value="">{!products ? "Loading products…" : products.length ? "Select product" : "No open products"}</option>
              {products?.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
            </NativeSelect>
          </Field>

          {draft && selectedProduct && (
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedProduct.kind === "CASH" ? <>
                <Field label="Loan amount (₱)"><Input inputMode="decimal" value={draft.principal} onChange={event => update("principal", event.target.value)} disabled={saving} /></Field>
                <Field label="Interest per month (%)"><Input inputMode="decimal" value={draft.rate} onChange={event => update("rate", event.target.value)} disabled={saving} /></Field>
                <Field label="Interest method"><NativeSelect className="w-full" disabled={saving} value={draft.method} onChange={event => update("method", event.target.value as Draft["method"])}>
                  {selectedProduct.methods.map(method => <option key={method} value={method}>{methodLabels[method]}</option>)}
                </NativeSelect></Field>
                <Field label="Release to"><NativeSelect className="w-full" disabled={saving} value={draft.releaseMethod} onChange={event => update("releaseMethod", event.target.value as Draft["releaseMethod"])}>
                  <option value="PAYROLL">Payroll bank account</option><option value="CASH">Cash at the office</option>
                </NativeSelect></Field>
              </> : <>
                <Field label="Item"><NativeSelect className="w-full" disabled={saving} value={draft.itemId} onChange={event => update("itemId", event.target.value)}>
                  <option value="">Select item</option>
                  {selectedProduct.items.map(item => <option key={item.id} value={item.id}>{item.name} · {peso(item.price)}</option>)}
                </NativeSelect></Field>
                <Field label="Quantity"><Input type="number" min={1} max={10} step={1} value={draft.quantity} onChange={event => update("quantity", event.target.value)} disabled={saving} /></Field>
              </>}
              <Field label="Term"><NativeSelect className="w-full" disabled={saving} value={draft.term} onChange={event => update("term", Number(event.target.value))}>
                {selectedProduct.termsMonths.map(months => <option key={months} value={months}>{months} months</option>)}
              </NativeSelect></Field>
              <Field label="Payment frequency"><NativeSelect className="w-full" disabled={saving} value={draft.frequency} onChange={event => update("frequency", event.target.value as Draft["frequency"])}>
                {selectedProduct.frequencies.map(value => <option key={value} value={value}>{frequencyLabels[value]}</option>)}
              </NativeSelect></Field>
              <Field label="Repayment mode"><NativeSelect className="w-full" disabled={saving} value={draft.mode} onChange={event => update("mode", event.target.value as Draft["mode"])}>
                {selectedProduct.modes.map(value => <option key={value} value={value}>{modeLabels[value]}</option>)}
              </NativeSelect></Field>
              <Field label="Purpose (optional)"><Input maxLength={200} value={draft.purpose} onChange={event => update("purpose", event.target.value)} disabled={saving} /></Field>
            </div>
          )}

          <Panel title="Loan agreement">
            <Kv rows={[
              ["Agreement no.", "Assigned on save"],
              ["Signing date", preview ? date(preview.snapshot.signingDate) : "Today, Manila time"],
            ]} />
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={signed} disabled={saving || !preview?.canEnroll} onChange={event => setSigned(event.target.checked)} />
              The member signed the loan agreement and promissory note.
            </label>
            {preview && preview.snapshot.documents.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Collect {preview.snapshot.documents.map(rule => rule.name).join(", ")} in Documents after saving.</p>
            )}
            {currentChoices?.result?.releaseAvailable && <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={releaseNow} disabled={saving} onChange={event => setReleaseNow(event.target.checked)} />
              <span>Approve and release now <span className="block text-xs text-muted-foreground">The loan is filed as Pending before you add documents and confirm payout.</span></span>
            </label>}
          </Panel>
        </div>

        <Panel title="Loan assessment">
          {!payload && <p className="text-sm text-muted-foreground">Choose a member and enter the loan details.</p>}
          {payload && !assessed && <p role="status" className="text-sm text-muted-foreground">Checking eligibility…</p>}
          {assessed?.error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{assessed.error}</p>
            <Button size="sm" variant="outline" onClick={() => setPreviewAttempt(value => value + 1)}>Retry assessment</Button></div>}
          {preview && <Assessment preview={preview} />}
        </Panel>
      </div>
      {saveError && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{saveError}</p>}
    </ConsoleDialog>
  );
}

function Assessment({ preview }: { preview: LoanEnrollmentPreview }) {
  const { snapshot, payroll } = preview;
  const { pricing } = snapshot;
  return (
    <div className="space-y-3">
      <Kv rows={[
        ["Principal", peso(snapshot.principal)], ["Payments", pricing.paymentCount], ["Regular installment", peso(pricing.regularPayment)],
        ["Final installment", peso(pricing.finalPayment)], ["Interest or markup", peso(pricing.totalInterest)],
        ["Processing fee on release", peso(snapshot.processingFee)], ["Total payable", peso(pricing.totalPayable), "total"],
      ]} />
      <details className="rounded-md border p-2 text-sm">
        <summary className="cursor-pointer font-medium">Installment preview</summary>
        <p className="my-2 text-xs text-muted-foreground">Dates are assigned when the loan is released.</p>
        <ol className="max-h-48 space-y-1 overflow-auto">
          {preview.installments.map((row, index) => <li key={index} className="flex justify-between gap-2"><span>Payment {index + 1}</span><span>{peso(row.total)}</span></li>)}
        </ol>
      </details>
      <ul className="space-y-1.5 text-sm">
        {preview.checks.map(check => <li key={check.key} className="rounded-md border p-2">
          <p className={check.ok ? "font-medium" : "font-medium text-destructive"}>{check.ok ? "Passed" : "Needs attention"} · {check.label}</p>
          <p className="text-xs text-muted-foreground">{check.detail}</p>
        </li>)}
      </ul>
      {payroll.state === "verified" && <Kv rows={payroll.cutoffs.map(row => [
        date(row.cutoff), peso(row.payment) + " / " + peso(row.headroom) + " headroom",
      ])} />}
    </div>
  );
}
