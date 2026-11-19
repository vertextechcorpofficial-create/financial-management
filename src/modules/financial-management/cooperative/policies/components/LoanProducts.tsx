"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateLoanExample } from "../loan-terms";
import { money, productSchema, repaymentFrequencies, repaymentModes, type Product, type ProductDraft } from "../policy-types";
import { policyValue } from "../policy-labels";
import { type PolicyContext, usePolicyEditor } from "../policy-client";
import { PolicyDialog, PolicyInput, PolicyPager, PolicySelect } from "./PolicyForm";

type DocumentRules = ProductDraft["documentRules"];
type GoodsItem = Extract<ProductDraft, { kind: "GOODS" }>["items"][number];
type Limit = ProductDraft["limitType"];

function MultiChoice<T extends string>({ title, options, values, set, error }: {
  title: string; options: Record<T, string>; values: T[]; set: (values: T[]) => void; error?: string;
}) {
  return <fieldset className="space-y-1.5">
    <legend className="mb-1 text-sm font-medium">{title}</legend>
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
    if (!inputs.some(input => edited[input])) return undefined;
    if (field === "name" && nameInUse) return "Another product already uses this name.";
    if (field === "prefix" && prefixInUse) return "Another product already uses this prefix.";
    return valid.error?.issues.find(issue => issue.path[0] === field)?.message;
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
      void editor.save({ section: "product", data }).then(saved => { if (saved) close(); });
    }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <PolicyInput label="Product name" maxLength={80} value={draft.name} error={errorFor("name", "name")} onChange={e => update("name", e.target.value)} />
      <PolicyInput label="Short name" maxLength={50} value={draft.shortName} onChange={e => update("shortName", e.target.value)} />
      <PolicyInput label="Loan number prefix" maxLength={4} disabled={!!initial} value={draft.prefix}
        error={errorFor("prefix", "prefix")} onChange={e => update("prefix", e.target.value.toUpperCase())} />
      <PolicySelect label="Product type" disabled={!!initial} value={draft.kind} onChange={e => update("kind", e.target.value as ProductDraft["kind"])}>
        <option value="CASH">Cash loan</option><option value="GOODS">Goods on installment</option>
      </PolicySelect>
      <PolicySelect label="Status" value={draft.isOpen ? "open" : "closed"} onChange={e => update("isOpen", e.target.value === "open")}>
        <option value="open">Open for new loans</option><option value="closed">Closed to new loans</option>
      </PolicySelect>
      <PolicyInput label="Description for members" value={draft.description} onChange={e => update("description", e.target.value)} />
    </div>

    <section className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold">Pricing</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {cash ? <>
          <PolicyInput label="Minimum rate (% per month)" inputMode="decimal" value={draft.rateMin}
            error={errorFor("rateMin", "rateMin")} onChange={e => update("rateMin", e.target.value)} />
          <PolicyInput label="Maximum rate (% per month)" inputMode="decimal" value={draft.rateMax}
            error={errorFor("rateMax", "rateMax")} onChange={e => update("rateMax", e.target.value)} />
          <PolicyInput label="Default rate (% per month)" inputMode="decimal" value={draft.rateDefault}
            error={errorFor("rateDefault", "rateMin", "rateMax", "rateDefault")} onChange={e => update("rateDefault", e.target.value)} />
        </> : <PolicyInput label="Markup on invoice (%)" inputMode="decimal" value={draft.markup}
          error={errorFor("markup", "markup")} onChange={e => update("markup", e.target.value)} />}
        <PolicyInput label="Processing fee (₱)" inputMode="decimal" value={draft.fee}
          error={errorFor("processingFee", "fee")} onChange={e => update("fee", e.target.value)} />
      </div>
      {cash ? <MultiChoice title="Interest methods" options={{ diminishing: "Diminishing balance", flat: "Flat" }}
        values={draft.methods} set={value => update("methods", value)} error={errorFor("methods", "methods")} /> : <div className="space-y-2">
        {draft.items.map((item, index) => <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end" key={item.id ?? `item-${index}`}>
          <PolicyInput label={`Item ${index + 1} name`} value={item.name} onChange={e =>
            update("items", draft.items.map((row, i) => i === index ? { ...row, name: e.target.value } : row))} />
          <PolicyInput label={`Item ${index + 1} price (₱)`} inputMode="decimal" value={item.price} error={item.price && edited.items && (
            !money.safeParse(item.price).success || Number(item.price) <= 0) ? "Enter a positive price with up to two decimal places." : undefined} onChange={e =>
            update("items", draft.items.map((row, i) => i === index ? { ...row, price: e.target.value } : row))} />
          <Button type="button" size="sm" variant="outline" aria-label={`Remove item ${index + 1}`} onClick={() =>
            update("items", draft.items.filter((_, i) => i !== index))}>Remove</Button>
        </div>)}
        <Button type="button" variant="outline" size="sm" onClick={() => update("items", [...draft.items, { name: "", price: "" }])}>Add item</Button>
        {draft.items.length === 0 && <p className="text-sm text-muted-foreground">Add at least one priced item.</p>}
      </div>}
    </section>

    <section className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold">Terms &amp; eligibility</h3>
      <PolicyInput label="Terms offered (months, comma-separated)" value={draft.terms}
        error={errorFor("termsMonths", "terms") && "Enter distinct whole terms from 1 to 120 months."} onChange={e => update("terms", e.target.value)} />
      <MultiChoice title="Payment frequencies" options={repaymentFrequencies} values={draft.frequencies}
        set={value => update("frequencies", value)} error={errorFor("frequencies", "frequencies") && "Select at least one frequency."} />
      <MultiChoice title="Repayment methods" options={repaymentModes} values={draft.modes}
        set={value => update("modes", value)} error={errorFor("modes", "modes") && "Select at least one repayment method."} />
      <div className="grid gap-3 sm:grid-cols-2">
        <PolicySelect label="Loan limit" value={draft.limitType} onChange={e => update("limitType", e.target.value as Limit)}>
          <option value="NONE">No limit</option><option value="SAVINGS_MULTIPLE">Multiple of savings</option><option value="FIXED">Fixed ceiling</option>
        </PolicySelect>
        {draft.limitType === "SAVINGS_MULTIPLE" && <PolicyInput label="Savings multiple" inputMode="decimal" value={draft.multiple}
          error={errorFor("savingsMultiple", "multiple")} onChange={e => update("multiple", e.target.value)} />}
        {draft.limitType === "FIXED" && <PolicyInput label="Fixed ceiling (₱)" inputMode="decimal" value={draft.ceiling}
          error={errorFor("fixedCeiling", "ceiling")} onChange={e => update("ceiling", e.target.value)} />}
        <PolicyInput label="Minimum membership (months)" inputMode="numeric" value={draft.membership} onChange={e => update("membership", e.target.value)} />
        <PolicyInput label="One-time late penalty (%)" inputMode="decimal" value={draft.penalty} onChange={e => update("penalty", e.target.value)} />
        <PolicyInput label="Grace period (days)" inputMode="numeric" value={draft.grace} onChange={e => update("grace", e.target.value)} />
      </div>
    </section>

    <section className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold">Required documents</h3>
      {draft.documentRules.map(rule => {
        const label = context.state.documentTypes.find(type => type.id === rule.documentTypeId)?.name ?? "Document type";
        return <div key={rule.documentTypeId} className="flex flex-wrap items-end justify-between gap-2 rounded-md border p-2">
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

    <section className="space-y-3 rounded-lg bg-muted/50 p-4">
      <h3 className="text-sm font-semibold">Installment preview</h3>
      {valid.success ? <>
        <div className="flex flex-wrap gap-3">
          {cash && <PolicyInput label="Example principal (₱)" inputMode="decimal" value={sampleAmount} onChange={e => setSampleAmount(e.target.value)} />}
          <PolicySelect label="Example term" value={chosenTerm} onChange={e => setSampleTerm(e.target.value)}>
            {availableTerms.map(term => <option key={term} value={term}>{term} months</option>)}
          </PolicySelect>
        </div>
        <p className="text-sm text-muted-foreground">
          {cash ? policyValue("methods", valid.data.methods[0]) : valid.data.items[0]?.name} · {policyValue("frequencies", valid.data.frequencies[0])}
        </p>
        {preview ? <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ["Payments", preview.paymentCount], ["Regular payment", `₱${preview.regularPayment}`],
            ["Final payment", `₱${preview.finalPayment}`], ["Total payable", `₱${preview.totalPayable}`],
          ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
        </dl> : <p className="text-sm text-muted-foreground">Enter a positive example principal.</p>}
      </> : <p className="text-sm text-muted-foreground">Complete the product fields to calculate an example.</p>}
    </section>
  </PolicyDialog>;
}

export function LoanProducts({ context }: { context: PolicyContext }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null | undefined>();
  const matches = context.state.products.filter(product => {
    const query = search.trim().toLowerCase();
    return (status === "all" || product.isOpen === (status === "open")) &&
      `${product.name} ${product.shortName} ${product.prefix}`.toLowerCase().includes(query);
  });
  const currentPage = Math.min(page, Math.max(1, Math.ceil(matches.length / 50)));
  return <section className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <PolicyInput label="Search products" placeholder="Name or prefix" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <PolicySelect label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="all">All statuses</option><option value="open">Open</option><option value="closed">Closed</option>
        </PolicySelect>
      </div>
      <Button onClick={() => setEditing(null)}>New loan product</Button>
    </div>
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/60"><TableRow>
          <TableHead>Product</TableHead><TableHead>Type</TableHead><TableHead>Rate</TableHead>
          <TableHead>Terms</TableHead><TableHead>Limit</TableHead><TableHead>Documents</TableHead>
          <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {!matches.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
            {context.state.products.length ? "No products match your filters." : "Add a loan product to begin."}
          </TableCell></TableRow>}
          {matches.slice((currentPage - 1) * 50, currentPage * 50).map(product => <TableRow key={product.id}>
            <TableCell><span className="font-medium">{product.name}</span><div className="font-mono text-xs text-muted-foreground">{product.prefix}-YYYY-NNNN</div></TableCell>
            <TableCell>{policyValue("kind", product.kind)}</TableCell>
            <TableCell>{product.kind === "GOODS" ? `${policyValue("markup", product.markup)} markup`
              : `${policyValue("rateMin", product.rateMin)}–${policyValue("rateMax", product.rateMax)} / mo`}</TableCell>
            <TableCell>{product.termsMonths.join(", ")} mo</TableCell>
            <TableCell>{product.limitType === "SAVINGS_MULTIPLE" ? `${Number(product.savingsMultiple)}× savings`
              : product.limitType === "FIXED" ? policyValue("fixedCeiling", product.fixedCeiling) : "No limit"}</TableCell>
            <TableCell>{product.documentRules.length}</TableCell>
            <TableCell><Badge variant={product.isOpen ? "secondary" : "outline"}>{product.isOpen ? "Open" : "Closed"}</Badge></TableCell>
            <TableCell className="text-right"><Button size="sm" variant="outline" aria-label={`Edit ${product.name}`} onClick={() => setEditing(product)}>Edit</Button></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>
    <PolicyPager page={currentPage} more={matches.length > currentPage * 50} onPage={setPage} />
    {editing !== undefined && <ProductEditor context={context} product={editing} close={() => setEditing(undefined)} />}
  </section>;
}
