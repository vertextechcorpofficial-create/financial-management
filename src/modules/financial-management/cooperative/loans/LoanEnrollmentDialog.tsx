"use client";

import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { AlertTriangle, HandCoins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ConsoleDialog, Kv } from "../console/components/ui";
import { SectionHeading } from "../members/components";
import { fieldErrorsFrom, MemberApiError, memberFetch, newRequestKey } from "../members/client";
import { date, peso } from "../members/format";
import type { Product } from "../policies/policy-types";
import type { LoanEnrollmentChoices, LoanEnrollmentPreview } from "../server/loan-enrollment";
import type { LoanEnrollmentResult } from "../server/loan-enrollment-save";
import { AssessmentCheck } from "./components";
import { LoanMemberSelect } from "./LoanMemberSelect";

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
const methodLabels = { diminishing: "Diminishing balance", flat: "Flat", upfront: "Upfront interest", markup: "Markup" };
const frequencyLabels = { cutoff: "Every cutoff", monthly: "Monthly" };
const modeLabels = { payroll: "Salary deduction", otc: "Over the counter" };

function Field({ label, required = false, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactElement<{ id?: string; "aria-required"?: boolean }>;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1 text-sm">
      <label htmlFor={id} className="block font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
      </label>
      {cloneElement(children, { id, ...(required ? { "aria-required": true } : {}) })}
      {hint && <p className="text-xs text-destructive">{hint}</p>}
    </div>
  );
}

const ratePattern = /^\d{1,3}(?:\.\d{1,6})?$/;
const amountPattern = /^\d{1,10}(?:\.\d{1,2})?$/;
const normalizeNumeric = (value: string) => value.replace(/[\s,]/g, "");
const rateText = (value: string | null) => value === null ? "" : String(Number(value));

function principalProblem(value: string) {
  if (!value) return "Enter the loan amount.";
  if (!amountPattern.test(value) || Number(value) <= 0) {
    return "Enter an amount up to 10 digits with 2 decimals, e.g. 10000.00.";
  }
  return "";
}

function rateProblem(value: string, product: Product) {
  if (!value) return "Enter the interest rate.";
  if (!ratePattern.test(value)) return "Enter a rate with up to 3 digits and 6 decimals, e.g. 1.25.";
  const rate = Number(value);
  const minimum = product.rateMin === null ? null : Number(product.rateMin);
  const maximum = product.rateMax === null ? null : Number(product.rateMax);
  if (minimum !== null && rate < minimum) return `The product minimum is ${rateText(product.rateMin)}%.`;
  if (maximum !== null && rate > maximum) return `The product maximum is ${rateText(product.rateMax)}%.`;
  return "";
}

const fieldLabels: Record<string, string> = {
  memberId: "member", productId: "loan product", principal: "loan amount", itemId: "item", quantity: "quantity",
  rate: "interest rate", method: "interest method", term: "term", frequency: "payment frequency",
  mode: "repayment mode", releaseMethod: "release method", purpose: "purpose",
};

function requestMessage(error: unknown) {
  const fields = fieldErrorsFrom(error);
  const [field, message] = Object.entries(fields)[0] ?? [];
  if (!field || !message) return error instanceof Error ? error.message : "Unable to check the loan.";
  if (/must match pattern|invalid input/i.test(message)) return `Enter a valid ${fieldLabels[field] ?? "value"}.`;
  return message;
}

export function LoanEnrollmentDialog({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (result: LoanEnrollmentResult, release: { requested: boolean; reviewDocuments: boolean }) => void;
}) {
  const [member, setMember] = useState<Member>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [choices, setChoices] = useState<{ key: string; result?: LoanEnrollmentChoices; error?: string }>();
  const [lookupAttempt, setLookupAttempt] = useState(0);

  const [draft, setDraft] = useState<Draft>();
  const [signed, setSigned] = useState(false);
  const [releaseNow, setReleaseNow] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [evaluation, setEvaluation] = useState<{ key: string; preview?: LoanEnrollmentPreview; error?: string; code?: string }>();
  const [requestKey, setRequestKey] = useState(() => newRequestKey());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const lookup = new URLSearchParams({ q: search, page: String(page) }).toString();
  const lookupKey = lookup + ":" + lookupAttempt;
  const currentChoices = choices?.key === lookupKey ? choices : undefined;
  const products = currentChoices?.result?.products;
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

  const principalValue = draft ? normalizeNumeric(draft.principal) : "";
  const rateValue = draft ? normalizeNumeric(draft.rate) : "";
  const cashProduct = selectedProduct?.kind === "CASH";
  const principalHint = cashProduct && draft?.principal.trim() && !principalValue.endsWith(".")
    ? principalProblem(principalValue) : "";
  const rateHint = cashProduct && draft?.rate.trim() && !rateValue.endsWith(".")
    ? rateProblem(rateValue, selectedProduct!) : "";
  const cashReady = cashProduct && Boolean(principalValue && rateValue)
    && !principalProblem(principalValue) && !rateProblem(rateValue, selectedProduct!);
  const goodsReady = Boolean(draft?.itemId) && Number(draft?.quantity) >= 1;
  const detailsReady = Boolean(draft && selectedProduct) && (cashProduct ? cashReady : goodsReady);
  const payload = member && draft && selectedProduct && detailsReady
    ? JSON.stringify({
        ...draft, memberId: member.id,
        principal: cashProduct ? principalValue : undefined,
        rate: cashProduct ? rateValue : undefined,
        itemId: selectedProduct.kind === "GOODS" ? Number(draft.itemId) : undefined,
        quantity: selectedProduct.kind === "GOODS" ? Number(draft.quantity) : undefined,
      })
    : "";
  const payloadRef = useRef("");
  payloadRef.current = payload;
  const assessmentKey = payload && draft && selectedProduct
    ? JSON.stringify({
        memberId: member?.id, productId: draft.productId,
        principal: cashProduct ? principalValue : undefined,
        itemId: draft.itemId || undefined, quantity: draft.quantity || undefined,
        rate: cashProduct ? rateValue : undefined,
        method: draft.method, term: draft.term, frequency: draft.frequency, mode: draft.mode,
      }) + ":" + previewAttempt
    : "";
  const assessed = evaluation?.key === assessmentKey ? evaluation : undefined;
  const preview = assessed?.preview;

  useEffect(() => {
    const body = payloadRef.current;
    if (!assessmentKey || !body) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      memberFetch<LoanEnrollmentPreview>(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
      })
        .then(result => { if (!controller.signal.aborted) setEvaluation({ key: assessmentKey, preview: result }); })
        .catch(error => { if (!controller.signal.aborted) setEvaluation({ key: assessmentKey, error: requestMessage(error), code: error instanceof MemberApiError ? error.payload?.code ?? undefined : undefined }); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [assessmentKey]);

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
      footerClassName="backdrop-blur"
      footer={(
        <div className="w-full space-y-2">
          {preview
            ? <AssessmentSummary preview={preview} />
            : <AssessmentStatus payload={payload} assessed={assessed} onRetry={() => setPreviewAttempt(value => value + 1)} />}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="mr-auto hidden max-w-xs text-left text-[11px] leading-4 text-muted-foreground sm:block">
              Enrolling files the signed agreement and sends the loan to Approvals.
            </p>
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={!preview?.canEnroll || !signed || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <HandCoins className="size-4" />}
              {saving ? "Enrolling..." : releaseNow ? "Enroll and review release" : "Enroll loan"}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="min-w-0 space-y-5">
        <section className="space-y-3">
          <SectionHeading
            step="1"
            title="Member"
            description="Only active Cooperative members appear here."
            required
          />
          <LoanMemberSelect
            member={member}
            members={currentChoices?.result?.members ?? []}
            page={currentChoices?.result?.page ?? page}
            hasMore={currentChoices?.result?.hasMore ?? false}
            loading={!currentChoices}
            error={currentChoices?.error}
            search={search}
            onSearchChange={value => { setSearch(value); setPage(1); }}
            onPageChange={setPage}
            onRetry={() => setLookupAttempt(value => value + 1)}
            onSelect={choice => { setMember(choice); edit(); }}
            disabled={saving}
            required
          />
          {currentChoices?.error && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-xs text-destructive">{currentChoices.error}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setLookupAttempt(value => value + 1)}>Retry choices</Button>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeading
            step="2"
            title="Loan terms"
            description="Choose the product and repayment details."
          />
          <Field label="Loan product" required>
            <NativeSelect className="w-full" value={draft?.productId ?? ""} onChange={event => chooseProduct(event.target.value)} disabled={!products?.length || saving}>
              <option value="">{!products ? "Loading products..." : products.length ? "Select product" : "No open products"}</option>
              {products?.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
            </NativeSelect>
          </Field>

          {draft && selectedProduct && (
            <div className="grid gap-3 sm:grid-cols-2">
              {selectedProduct.kind === "CASH" ? <>
                <Field label="Loan amount (₱)" required hint={principalHint || undefined}><Input inputMode="decimal" value={draft.principal} onChange={event => update("principal", normalizeNumeric(event.target.value))} disabled={saving} /></Field>
                <Field label={draft.method === "upfront" ? "Upfront interest for the full term (%)" : "Interest per month (%)"} required hint={rateHint || undefined}><Input inputMode="decimal" value={draft.rate} onChange={event => update("rate", normalizeNumeric(event.target.value))} disabled={saving} /></Field>
                <Field label="Interest method" required>
                  <NativeSelect className="w-full" disabled={saving} value={draft.method} onChange={event => update("method", event.target.value as Draft["method"])}>
                    {selectedProduct.methods.map(method => <option key={method} value={method}>{methodLabels[method]}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Release to" required>
                  <NativeSelect className="w-full" disabled={saving} value={draft.releaseMethod} onChange={event => update("releaseMethod", event.target.value as Draft["releaseMethod"])}>
                    <option value="PAYROLL">Payroll bank account</option><option value="CASH">Cash at the office</option>
                  </NativeSelect>
                </Field>
              </> : <>
                <Field label="Item" required>
                  <NativeSelect className="w-full" disabled={saving} value={draft.itemId} onChange={event => update("itemId", event.target.value)}>
                    <option value="">Select item</option>
                    {selectedProduct.items.map(item => <option key={item.id} value={item.id}>{item.name} · {peso(item.price)}</option>)}
                  </NativeSelect>
                </Field>
                <Field label="Quantity" required><Input type="number" min={1} max={10} step={1} value={draft.quantity} onChange={event => update("quantity", event.target.value)} disabled={saving} /></Field>
              </>}
              <Field label="Term" required>
                <NativeSelect className="w-full" disabled={saving} value={draft.term} onChange={event => update("term", Number(event.target.value))}>
                  {selectedProduct.termsMonths.map(months => <option key={months} value={months}>{months} months</option>)}
                </NativeSelect>
              </Field>
              <Field label="Payment frequency" required>
                <NativeSelect className="w-full" disabled={saving} value={draft.frequency} onChange={event => update("frequency", event.target.value as Draft["frequency"])}>
                  {selectedProduct.frequencies.map(value => <option key={value} value={value}>{frequencyLabels[value]}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Repayment mode" required>
                <NativeSelect className="w-full" disabled={saving} value={draft.mode} onChange={event => update("mode", event.target.value as Draft["mode"])}>
                  {selectedProduct.modes.map(value => <option key={value} value={value}>{modeLabels[value]}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Purpose (optional)"><Input maxLength={200} value={draft.purpose} onChange={event => update("purpose", event.target.value)} disabled={saving} /></Field>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeading
            step="3"
            title="Agreement"
            description="Confirm the signed agreement before enrolling."
          />
          <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
            <Kv rows={[
              ["Agreement no.", "Assigned on save"],
              ["Signing date", preview ? date(preview.snapshot.signingDate) : "Today, Manila time"],
            ]} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={signed} disabled={saving || !preview?.canEnroll} aria-required="true" onChange={event => setSigned(event.target.checked)} />
              <span><span className="text-destructive" aria-hidden="true">*</span> The member signed the loan agreement and promissory note.</span>
            </label>
            {preview && preview.snapshot.documents.length > 0 && (
              <p className="text-xs text-muted-foreground">Collect {preview.snapshot.documents.map(rule => rule.name).join(", ")} in Documents after saving.</p>
            )}
            {currentChoices?.result?.releaseAvailable && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={releaseNow} disabled={saving} onChange={event => setReleaseNow(event.target.checked)} />
                <span>Approve and release now <span className="block text-xs text-muted-foreground">The loan is filed as Pending before you add documents and confirm payout.</span></span>
              </label>
            )}
          </div>
        </section>

        {preview && (
          <section className="space-y-3">
            <SectionHeading
              title="Checks"
              description="Eligibility and take-home review from the current assessment."
            />
            <div className="space-y-4 rounded-xl border bg-card p-4">
              <AssessmentChecks preview={preview} />
            </div>
          </section>
        )}
      </div>
      {saveError && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{saveError}</p>
        </div>
      )}
    </ConsoleDialog>
  );
}

function AssessmentSummary({ preview }: { preview: LoanEnrollmentPreview }) {
  const { snapshot } = preview;
  const { pricing } = snapshot;
  const interest = snapshot.method === "upfront" ? pricing.upfrontInterest : pricing.totalInterest;
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total payable</p>
          <p className="font-mono text-xl font-semibold tabular-nums">{peso(pricing.totalPayable)}</p>
        </div>
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-1 text-xs sm:grid-cols-3 xl:grid-cols-6">
          <div><dt className="text-muted-foreground">Principal</dt><dd className="font-mono tabular-nums">{peso(snapshot.principal)}</dd></div>
          <div><dt className="text-muted-foreground">Regular</dt><dd className="font-mono tabular-nums">{peso(pricing.regularPayment)}</dd></div>
          <div><dt className="text-muted-foreground">Final</dt><dd className="font-mono tabular-nums">{peso(pricing.finalPayment)}</dd></div>
          <div><dt className="text-muted-foreground">{snapshot.method === "upfront" ? "Upfront interest" : "Interest / markup"}</dt><dd className="font-mono tabular-nums">{peso(interest)}</dd></div>
          <div><dt className="text-muted-foreground">Processing fee</dt><dd className="font-mono tabular-nums">{peso(snapshot.processingFee)}</dd></div>
          <div><dt className="text-muted-foreground">Payments</dt><dd className="font-mono tabular-nums">{pricing.paymentCount}</dd></div>
        </dl>
      </div>
      <details className="rounded-md border bg-muted/20 px-2 py-1 text-xs">
        <summary className="cursor-pointer font-medium">Installment preview</summary>
        <p className="my-1 text-[11px] text-muted-foreground">Dates are assigned when the loan is released.</p>
        <ol className="max-h-32 space-y-1 overflow-auto">
          {preview.installments.map((row, index) => (
            <li key={index} className="flex justify-between gap-2">
              <span>Payment {index + 1}</span><span className="font-mono tabular-nums">{peso(row.total)}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function AssessmentChecks({ preview }: { preview: LoanEnrollmentPreview }) {
  const { payroll } = preview;
  return (
    <div className="space-y-4">
      <ul className="space-y-1.5">
        {preview.checks.map(({ key, ...check }) => <AssessmentCheck key={key} {...check} />)}
      </ul>
      {payroll.state === "verified" && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payroll headroom</p>
          <Kv rows={payroll.cutoffs.map(row => [
            date(row.cutoff), peso(row.payment) + " / " + peso(row.headroom) + " headroom",
          ])} />
        </div>
      )}
    </div>
  );
}

function AssessmentStatus({ payload, assessed, onRetry }: {
  payload: string;
  assessed?: { error?: string; code?: string };
  onRetry: () => void;
}) {
  if (!payload) return <p className="text-xs text-muted-foreground">Enter the loan amount and terms to see the total payable.</p>;
  if (!assessed) {
    return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Checking eligibility...
    </p>;
  }
  if (!assessed.error) return null;
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <p role="alert" className="text-destructive">{assessed.error}</p>
    {assessed.code !== "LOAN_INPUT" && <Button size="sm" variant="outline" onClick={onRetry}>Retry assessment</Button>}
  </div>;
}
