"use client";

import { useState } from "react";
import { AlertTriangle, Banknote, FileText, Pencil, Plus, Search, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "../../console/components/ui";
import { calculateLoanExample } from "../loan-terms";
import { money, productSchema, repaymentFrequencies, repaymentModes, type Product, type ProductDraft } from "../policy-types";
import { policyValue } from "../policy-labels";
import { type PolicyContext, usePolicyEditor } from "../policy-client";
import { PolicyEmpty, PolicyStatusChip } from "./PolicyUi";
import { PolicyDialog, PolicyInput, PolicyPager, PolicySelect, PolicyTextarea } from "./PolicyForm";

type DocumentRules = ProductDraft["documentRules"];
type GoodsItem = Extract<ProductDraft, { kind: "GOODS" }>["items"][number];
type Limit = ProductDraft["limitType"];

function MultiChoice<T extends string>({ title, options, values, set, error, required }: {
  title: string; options: Record<T, string>; values: T[]; set: (values: T[]) => void; error?: string; required?: boolean;
}) {
  return <fieldset className="space-y-1.5">
    <legend className="mb-1 text-sm font-medium">{title}{required && <span aria-hidden="true" className="text-destructive"> *</span>}</legend>
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {(Object.keys(options) as T[]).map(key => <label key={key} className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary" checked={values.includes(key)}
          onChange={event => set((Object.keys(options) as T[]).filter(option =>
            option === key ? event.target.checked : values.includes(option)))} />
        {options[key]}
      </label>)}
    </div>
    {error && <p className="text-sm text-destructive">{error}</p>}
  </fieldset>;
}

function friendlyIssue(field: string, message?: string) {
  if (!message) return undefined;
  if (field === "name" && message.includes("Too small")) return "Enter at least 3 characters.";
  if (field === "name" && message.includes("Too big")) return "Enter no more than 80 characters.";
  if (field === "prefix") return "Use 2–4 uppercase letters.";
  if (field === "description" && message.includes("Too big")) return "Enter no more than 4,000 characters.";
  return message;
}

function ProductEditor({ context, product, close }: { context: PolicyContext; product: Product | null; close: () => void }) {
  const initial = product;
  const editor = usePolicyEditor(context, latest => {
    const row = latest.products.find(row => row.id === initial?.id);
    return row ? {
      ...row,
      items: row.items.map(item => `${item.name} · ₱${item.price}`),
      documentRules: row.documentRules.map(rule => `${latest.documentTypes.find(type => type.id === rule.documentTypeId)?.name ??
        "Document type"} · ${policyValue("enforcement", rule.enforcement)}`),
    } : null;
  });
  const [draft, setDraft] = useState({
    name: initial?.name ?? "", shortName: initial?.shortName ?? "", prefix: initial?.prefix ?? "",
    kind: initial?.kind ?? "CASH", isOpen: initial?.isOpen ?? true, description: initial?.description ?? "",
    rateMin: initial?.rateMin ?? "", rateDefault: initial?.rateDefault ?? "", rateMax: initial?.rateMax ?? "",
    methods: initial?.kind === "CASH" ? initial.methods : [] as ("diminishing" | "flat")[],
    markup: initial?.markup ?? "", items: initial?.kind === "GOODS" ? initial.items : [] as GoodsItem[],
    terms: initial?.termsMonths.join(", ") ?? "", frequencies: initial?.frequencies ?? [],
    modes: initial?.modes ?? [], limitType: initial?.limitType ?? "NONE",
    multiple: initial?.savingsMultiple ?? "", ceiling: initial?.fixedCeiling ?? "",
    membership: String(initial?.minimumMembershipMonths ?? 0), penalty: initial?.penaltyPercent ?? "0",
    grace: String(initial?.graceDays ?? 0), fee: initial?.processingFee ?? "0",
    documentRules: initial?.documentRules ?? [] as DocumentRules,
  });
  const [documentId, setDocumentId] = useState("");
  const [sampleAmount, setSampleAmount] = useState("20000");
  const [sampleTerm, setSampleTerm] = useState("");
  const [edited, setEdited] = useState<Partial<Record<keyof typeof draft, true>>>({});
  const [submitted, setSubmitted] = useState(false);
  const cash = draft.kind === "CASH";
  function update<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setEdited(current => current[key] ? current : { ...current, [key]: true });
  }
  const whole = (value: string) => /^\d+$/.test(value.trim()) ? Number(value) : -1;
  const common = {
    id: initial?.id, name: draft.name, shortName: draft.shortName, prefix: draft.prefix,
    isOpen: draft.isOpen, description: draft.description, termsMonths: draft.terms.split(",").map(whole),
    frequencies: draft.frequencies, modes: draft.modes, limitType: draft.limitType,
    savingsMultiple: draft.limitType === "SAVINGS_MULTIPLE" ? draft.multiple : null,
    fixedCeiling: draft.limitType === "FIXED" ? draft.ceiling : null,
    minimumMembershipMonths: whole(draft.membership), penaltyPercent: draft.penalty,
    graceDays: whole(draft.grace), processingFee: draft.fee, documentRules: draft.documentRules,
  };
  const data: ProductDraft = cash
    ? { ...common, kind: "CASH", rateMin: draft.rateMin, rateMax: draft.rateMax,
        rateDefault: draft.rateDefault, methods: draft.methods, markup: null, items: [] }
    : { ...common, kind: "GOODS", rateMin: null, rateMax: null, rateDefault: null,
        methods: ["markup"], markup: draft.markup, items: draft.items };
  const valid = productSchema.safeParse(data);
  const nameInUse = context.state.products.some(row => row.id !== initial?.id &&
    row.name.normalize("NFKC").trim().toLowerCase() === draft.name.normalize("NFKC").trim().toLowerCase());
  const prefixInUse = context.state.products.some(row => row.id !== initial?.id && row.prefix === draft.prefix);
  function errorFor(field: string, ...inputs: (keyof typeof draft)[]) {
    if (!submitted && !inputs.some(input => edited[input])) return undefined;
    if (field === "name" && nameInUse) return "Another product already uses this name.";
    if (field === "prefix" && prefixInUse) return "Another product already uses this prefix.";
    return friendlyIssue(field, valid.error?.issues.find(issue => issue.path[0] === field)?.message);
  }
  const availableTerms = valid.success ? valid.data.termsMonths : [];
  const chosenTerm = availableTerms.includes(Number(sampleTerm)) ? Number(sampleTerm) : availableTerms[0];
  const examplePrincipal = valid.success ? money.safeParse(cash ? sampleAmount : valid.data.items[0]?.price) : null;
  const preview = valid.success && examplePrincipal?.success && Number(examplePrincipal.data) > 0
    ? calculateLoanExample(examplePrincipal.data, valid.data.rateDefault ?? valid.data.markup ?? "0",
        valid.data.methods[0], chosenTerm, valid.data.frequencies[0])
    : null;
  const availableDocs = context.state.documentTypes.filter(type =>
    type.isActive && !draft.documentRules.some(rule => rule.documentTypeId === type.id));

  return <PolicyDialog title={initial ? "Edit loan product" : "New loan product"}
    description="Set the terms offered to members for new loans." editor={editor} onClose={close} wide
    onSubmit={event => {
      event.preventDefault();
      setSubmitted(true);
      if (!valid.success || nameInUse || prefixInUse) return;
      void editor.save({ section: "product", data: valid.data }).then(saved => { if (saved) close(); });
    }}>
    {submitted && !valid.success && <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>Check the highlighted fields before saving.</p>
    </div>}

    <div className="grid gap-3 sm:grid-cols-2">
      <PolicyInput label="Product name" maxLength={80} required value={draft.name} error={errorFor("name", "name")}
        onChange={e => update("name", e.target.value)} />
      <PolicyInput label="Short name" maxLength={50} value={draft.shortName} onChange={e => update("shortName", e.target.value)} />
      <PolicyInput label="Loan number prefix" maxLength={4} required disabled={!!initial} value={draft.prefix}
        helper="2–4 uppercase letters used in loan numbers." error={errorFor("prefix", "prefix")}
        onChange={e => update("prefix", e.target.value.toUpperCase())} />
      <PolicySelect label="Product type" disabled={!!initial} value={draft.kind} onChange={e => update("kind", e.target.value as ProductDraft["kind"])}>
        <option value="CASH">Cash loan</option><option value="GOODS">Goods on installment</option>
      </PolicySelect>
      <PolicySelect label="Status" value={draft.isOpen ? "open" : "closed"} onChange={e => update("isOpen", e.target.value === "open")}>
        <option value="open">Open for new loans</option><option value="closed">Closed to new loans</option>
      </PolicySelect>
      <div className="sm:col-span-2">
        <PolicyTextarea label="Description for members" rows={3} maxLength={4000} value={draft.description}
          onChange={e => update("description", e.target.value)} />
      </div>
    </div>

    <section className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold">Pricing</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Rates are monthly unless the product uses a markup.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cash ? <>
          <PolicyInput label="Minimum rate (% per month)" inputMode="decimal" required value={draft.rateMin}
            error={errorFor("rateMin", "rateMin")} onChange={e => update("rateMin", e.target.value)} />
          <PolicyInput label="Maximum rate (% per month)" inputMode="decimal" required value={draft.rateMax}
            error={errorFor("rateMax", "rateMax")} onChange={e => update("rateMax", e.target.value)} />
          <PolicyInput label="Default rate (% per month)" inputMode="decimal" required value={draft.rateDefault}
            error={errorFor("rateDefault", "rateMin", "rateMax", "rateDefault")} onChange={e => update("rateDefault", e.target.value)} />
        </> : <PolicyInput label="Markup on invoice (%)" inputMode="decimal" required value={draft.markup}
          error={errorFor("markup", "markup")} onChange={e => update("markup", e.target.value)} />}
        <PolicyInput label="Processing fee (₱)" inputMode="decimal" value={draft.fee}
          error={errorFor("processingFee", "fee")} onChange={e => update("fee", e.target.value)} />
      </div>
      {cash ? <MultiChoice title="Interest methods" required options={{ diminishing: "Diminishing balance", flat: "Flat" }}
        values={draft.methods} set={value => update("methods", value)} error={errorFor("methods", "methods") && "Select at least one interest method."} /> : <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Goods items <span aria-hidden="true" className="text-destructive">*</span></h4>
          <Button type="button" variant="outline" size="sm" onClick={() => update("items", [...draft.items, { name: "", price: "" }])}>
            <Plus className="size-3.5" /> Add item
          </Button>
        </div>
        {draft.items.map((item, index) => <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end" key={item.id ?? `item-${index}`}>
          <PolicyInput label={`Item ${index + 1} name`} value={item.name} onChange={e =>
            update("items", draft.items.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
          <PolicyInput label={`Item ${index + 1} price (₱)`} inputMode="decimal" value={item.price} error={item.price && (submitted || edited.items) && (
            !money.safeParse(item.price).success || Number(item.price) <= 0) ? "Enter a positive price with up to two decimal places." : undefined} onChange={e =>
            update("items", draft.items.map((row, i) => i === index ? { ...row, price: e.target.value } : row))} />
          <Button type="button" size="sm" variant="outline" aria-label={`Remove item ${index + 1}`} onClick={() =>
            update("items", draft.items.filter((_, i) => i !== index))}>Remove</Button>
        </div>)}
        {draft.items.length === 0 && <p className={submitted
          ? "rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          : "rounded-xl border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground"}>Add at least one priced item.</p>}
      </div>}
    </section>

    <section className="space-y-3 border-t pt-4">
      <div>
        <h3 className="text-sm font-semibold">Terms &amp; eligibility</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Choose the terms and repayment options available to members.</p>
      </div>
      <PolicyInput label="Terms offered (months, comma-separated)" required value={draft.terms} helper="Example: 6, 9, 12, 18, 24"
        error={errorFor("termsMonths", "terms") && "Enter distinct whole terms from 1 to 120 months."} onChange={e => update("terms", e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <MultiChoice title="Payment frequencies" required options={repaymentFrequencies} values={draft.frequencies}
          set={value => update("frequencies", value)} error={errorFor("frequencies", "frequencies") && "Select at least one frequency."} />
        <MultiChoice title="Repayment methods" required options={repaymentModes} values={draft.modes}
          set={value => update("modes", value)} error={errorFor("modes", "modes") && "Select at least one repayment method."} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <PolicySelect label="Loan limit" value={draft.limitType} onChange={e => update("limitType", e.target.value as Limit)}>
          <option value="NONE">No limit</option><option value="SAVINGS_MULTIPLE">Multiple of savings</option><option value="FIXED">Fixed ceiling</option>
        </PolicySelect>
        {draft.limitType === "SAVINGS_MULTIPLE" && <PolicyInput label="Savings multiple" inputMode="decimal" required value={draft.multiple}
          error={errorFor("savingsMultiple", "multiple")} onChange={e => update("multiple", e.target.value)} />}
        {draft.limitType === "FIXED" && <PolicyInput label="Fixed ceiling (₱)" inputMode="decimal" required value={draft.ceiling}
          error={errorFor("fixedCeiling", "ceiling")} onChange={e => update("ceiling", e.target.value)} />}
        <PolicyInput label="Minimum membership (months)" inputMode="numeric" value={draft.membership} onChange={e => update("membership", e.target.value)} />
        <PolicyInput label="One-time late penalty (%)" inputMode="decimal" value={draft.penalty} onChange={e => update("penalty", e.target.value)} />
        <PolicyInput label="Grace period (days)" inputMode="numeric" value={draft.grace} onChange={e => update("grace", e.target.value)} />
      </div>
    </section>

    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Required documents</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Choose what must be submitted with a new loan.</p>
        </div>
        <Badge variant="outline">{draft.documentRules.length} required</Badge>
      </div>
      {draft.documentRules.map(rule => {
        const label = context.state.documentTypes.find(type => type.id === rule.documentTypeId)?.name ?? "Document type";
        return <div key={rule.documentTypeId} className="flex flex-wrap items-end justify-between gap-2 rounded-xl border bg-muted/20 p-3">
          <span className="self-center text-sm font-medium">{label}</span>
          <div className="flex flex-wrap items-end gap-2">
            <PolicySelect label={`Enforcement for ${label}`} value={rule.enforcement} onChange={e =>
              update("documentRules", draft.documentRules.map(row => row.documentTypeId === rule.documentTypeId
                ? { ...row, enforcement: e.target.value as "WARN" | "BLOCK" } : row))}>
              <option value="WARN">Warn</option><option value="BLOCK">Block</option>
            </PolicySelect>
            <Button type="button" size="sm" variant="outline" onClick={() =>
              update("documentRules", draft.documentRules.filter(row => row.documentTypeId !== rule.documentTypeId))}>Remove</Button>
          </div>
        </div>;
      })}
      {draft.documentRules.length === 0 && <p className="rounded-xl border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">No required documents yet.</p>}
      <div className="flex flex-wrap items-end gap-2">
        <PolicySelect label="Add required document" value={documentId} onChange={e => setDocumentId(e.target.value)}>
          <option value="">Select a document type</option>
          {availableDocs.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
        </PolicySelect>
        <Button type="button" variant="outline" disabled={!documentId} onClick={() => {
          update("documentRules", [...draft.documentRules, { documentTypeId: Number(documentId), enforcement: "WARN" }]);
          setDocumentId("");
        }}>Add</Button>
      </div>
    </section>

    <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold">Installment preview</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Check the payment shape before saving.</p>
      </div>
      {valid.success ? <>
        <div className="flex flex-wrap items-end gap-3">
          {cash && <PolicyInput label="Example principal (₱)" inputMode="decimal" value={sampleAmount} onChange={e => setSampleAmount(e.target.value)} />}
          <PolicySelect label="Example term" value={chosenTerm} onChange={e => setSampleTerm(e.target.value)}>
            {availableTerms.map(term => <option key={term} value={term}>{term} months</option>)}
          </PolicySelect>
        </div>
        <p className="text-sm text-muted-foreground">
          {cash ? policyValue("methods", valid.data.methods[0]) : valid.data.items[0]?.name} · {policyValue("frequencies", valid.data.frequencies[0])}
        </p>
        {preview ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Payments", preview.paymentCount], ["Regular payment", `₱${preview.regularPayment}`],
            ["Final payment", `₱${preview.finalPayment}`], ["Total payable", `₱${preview.totalPayable}`],
          ].map(([label, value]) => <div key={label} className="rounded-lg border bg-card p-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</p>
          </div>)}
        </div> : <p className="text-sm text-muted-foreground">Enter a positive example principal.</p>}
      </> : <p className="text-sm text-muted-foreground">Complete the product fields to calculate an example.</p>}
    </section>
  </PolicyDialog>;
}

function productType(product: Product) {
  return product.kind === "GOODS" ? "Goods on installment" : "Cash loan";
}

function productRate(product: Product) {
  return product.kind === "GOODS"
    ? `${policyValue("markup", product.markup)} markup`
    : `${policyValue("rateMin", product.rateMin)}–${policyValue("rateMax", product.rateMax)} / mo`;
}

function productLimit(product: Product) {
  return product.limitType === "SAVINGS_MULTIPLE" ? `${Number(product.savingsMultiple)}× savings`
    : product.limitType === "FIXED" ? policyValue("fixedCeiling", product.fixedCeiling) : "No limit";
}

export function LoanProducts({ context }: { context: PolicyContext }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null | undefined>();
  const pageSize = 50;
  const matches = context.state.products.filter(product => {
    const query = search.trim().toLowerCase();
    return (status === "all" || product.isOpen === (status === "open")) &&
      `${product.name} ${product.shortName} ${product.prefix}`.toLowerCase().includes(query);
  });
  const hasFilters = Boolean(search.trim() || status !== "all");
  const currentPage = Math.min(page, Math.max(1, Math.ceil(matches.length / pageSize)));
  const rows = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = matches.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = first ? first + rows.length - 1 : 0;

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setPage(1);
  }

  return <Panel title="Loan products" description="Set the terms offered to members for new loans."
    actions={<Button type="button" onClick={() => setEditing(null)}><Plus className="size-4" /> New loan product</Button>}>
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_auto]">
        <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
          Search products
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 pl-8" value={search} placeholder="Name or prefix"
              onChange={event => { setSearch(event.target.value); setPage(1); }} />
          </div>
        </label>
        <label className="space-y-1.5 text-[11px] font-medium text-muted-foreground">
          Status
          <NativeSelect className="h-9 w-full" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">All statuses</option><option value="open">Open</option><option value="closed">Closed</option>
          </NativeSelect>
        </label>
        <div className="flex items-end">
          <Button type="button" variant="ghost" size="sm" className="h-9" disabled={!hasFilters} onClick={clearFilters}>Clear filters</Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
        <span>{matches.length} of {context.state.products.length} products</span>
        {hasFilters && <span>Filtered view</span>}
      </div>
    </div>

    <div className="mt-3 rounded-xl border">
      <Table aria-label="Loan products">
        <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead scope="col" className="min-w-48 border-r lg:sticky lg:left-0 lg:z-20 bg-muted">Product</TableHead>
          <TableHead scope="col" className="hidden md:table-cell">Type</TableHead>
          <TableHead scope="col" className="hidden text-right sm:table-cell">Rate</TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">Terms</TableHead>
          <TableHead scope="col" className="hidden lg:table-cell">Limit</TableHead>
          <TableHead scope="col" className="hidden xl:table-cell">Documents</TableHead>
          <TableHead scope="col" className="hidden sm:table-cell">Status</TableHead>
          <TableHead scope="col" className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {!rows.length && <TableRow className="hover:bg-transparent"><TableCell colSpan={8}>
            <PolicyEmpty icon={Search} title={context.state.products.length ? "No products match these filters" : "No loan products yet"}
              description={context.state.products.length ? "Try a different name, prefix, or status." : "Create a product to set the terms offered to members."}
              action={hasFilters ? <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined} />
          </TableCell></TableRow>}
          {rows.map(product => <TableRow key={product.id} className="group">
            <TableCell className="whitespace-normal border-r bg-card group-hover:bg-muted/50 lg:sticky lg:left-0 lg:z-10">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  {product.kind === "GOODS" ? <ShoppingBag className="size-4" /> : <Banknote className="size-4" />}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{product.name}</span>
                    <span className="sm:hidden"><PolicyStatusChip active={product.isOpen} activeLabel="Open" inactiveLabel="Closed" /></span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{product.prefix}-YYYY-NNNN</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground xl:hidden">
                    <span className="md:hidden">{productType(product)}</span>
                    <span className="md:hidden">·</span>
                    <span className="sm:hidden">{productRate(product)}</span>
                    <span className="sm:hidden">·</span>
                    <span className="lg:hidden">{product.termsMonths.join(", ")} mo</span>
                    <span className="lg:hidden">·</span>
                    <span className="lg:hidden">{productLimit(product)}</span>
                    <span className="xl:hidden">·</span>
                    <span>{product.documentRules.length} {product.documentRules.length === 1 ? "doc" : "docs"}</span>
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell className="hidden md:table-cell">
              <Badge variant="outline" className="whitespace-nowrap font-normal">{productType(product)}</Badge>
            </TableCell>
            <TableCell className="hidden text-right sm:table-cell">
              <p className="whitespace-nowrap font-mono text-sm tabular-nums">{product.kind === "GOODS" ? `${policyValue("markup", product.markup)} markup` : `${policyValue("rateMin", product.rateMin)}–${policyValue("rateMax", product.rateMax)}`}</p>
              {product.kind === "CASH" && <p className="whitespace-nowrap text-xs text-muted-foreground">per month · default {policyValue("rateDefault", product.rateDefault)}</p>}
            </TableCell>
            <TableCell className="hidden lg:table-cell">{product.termsMonths.join(", ")} mo</TableCell>
            <TableCell className="hidden lg:table-cell">{productLimit(product)}</TableCell>
            <TableCell className="hidden xl:table-cell">
              <span className="inline-flex items-center gap-1.5 text-sm"><FileText className="size-3.5 text-muted-foreground" />{product.documentRules.length}</span>
            </TableCell>
            <TableCell className="hidden sm:table-cell"><PolicyStatusChip active={product.isOpen} activeLabel="Open" inactiveLabel="Closed" /></TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" aria-label={`Edit ${product.name}`} onClick={() => setEditing(product)}>
                <Pencil className="size-3.5" /><span className="hidden sm:inline">Edit</span>
              </Button>
            </TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>
    {matches.length > 0 && <div className="mt-3">
      <PolicyPager page={currentPage} more={matches.length > currentPage * pageSize} onPage={setPage}
        from={first} to={last} total={matches.length} noun="products" />
    </div>}
    {editing !== undefined && <ProductEditor context={context} product={editing} close={() => setEditing(undefined)} />}
  </Panel>;
}
