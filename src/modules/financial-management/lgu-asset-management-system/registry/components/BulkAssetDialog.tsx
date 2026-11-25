"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BulkAssetInput, ModeOfAcquisition, RegistryLookups } from "../../types";
import { isSemiExpendable, MODE_LABELS, splitBatchTotal } from "../../types";
import { SearchableSelect } from "./SearchableSelect";

interface BulkAssetDialogProps {
  open: boolean;
  lookups: RegistryLookups;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: BulkAssetInput) => Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function peso(value: number): string {
  return "PHP " + value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BulkAssetDialog({ open, lookups, busy, onClose, onSubmit }: BulkAssetDialogProps) {
  const [description, setDescription] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [quantity, setQuantity] = React.useState("2");
  const [batchTotal, setBatchTotal] = React.useState("");
  const [acquisitionDate, setAcquisitionDate] = React.useState(today());
  const [lifeMonths, setLifeMonths] = React.useState("");
  const [officeId, setOfficeId] = React.useState("");
  const [conditionId, setConditionId] = React.useState("");
  const [mode, setMode] = React.useState<ModeOfAcquisition>("purchase");
  const [fundSourceId, setFundSourceId] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [voucherNo, setVoucherNo] = React.useState("");
  const [unitOfMeasure, setUnitOfMeasure] = React.useState("pc");
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setDescription("");
    setClassId("");
    setQuantity("2");
    setBatchTotal("");
    setAcquisitionDate(today());
    setLifeMonths("");
    setOfficeId("");
    setConditionId("");
    setMode("purchase");
    setFundSourceId("");
    setSupplier("");
    setVoucherNo("");
    setUnitOfMeasure("pc");
    setBrand("");
    setModel("");
    setRemarks("");
  }, [open]);

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const total = Number(batchTotal || 0);
  const { unitCost, remainder } = splitBatchTotal(total, qty);
  const semi = isSemiExpendable(unitCost, lifeMonths ? Number(lifeMonths) : null);

  const classOptions = lookups.classes.map((c) => ({ label: c.name, value: String(c.id) }));
  const officeOptions = lookups.offices.map((o) => ({ label: o.name, value: String(o.id) }));
  const conditionOptions = lookups.conditions.map((c) => ({ label: c.name, value: String(c.id) }));
  const fundOptions = lookups.fundSources.map((f) => ({ label: f.name, value: String(f.id) }));
  const modeOptions = (Object.keys(MODE_LABELS) as ModeOfAcquisition[]).map((k) => ({
    label: MODE_LABELS[k],
    value: k,
  }));

  function pickClass(value: string) {
    setClassId(value);
    const cls = lookups.classes.find((c) => String(c.id) === value);
    if (cls && cls.default_life_months !== null && !lifeMonths) setLifeMonths(String(cls.default_life_months));
  }

  async function submit() {
    setError(null);
    if (!description.trim()) return setError("Description is required");
    if (!classId) return setError("Asset class is required");
    if (qty < 2) return setError("Bulk entry is for two or more units. Use Register asset for a single item");
    if (!(total > 0)) return setError("The voucher total must be greater than zero");
    if (!lifeMonths || Number(lifeMonths) <= 0) return setError("Useful life in months is required");

    try {
      await onSubmit({
        description: description.trim(),
        class_id: Number(classId),
        quantity: qty,
        batch_total: total,
        acquisition_date: acquisitionDate,
        life_months: Number(lifeMonths),
        office_id: officeId ? Number(officeId) : null,
        condition_id: conditionId ? Number(conditionId) : null,
        mode_of_acquisition: mode,
        fund_source_id: fundSourceId ? Number(fundSourceId) : null,
        supplier: supplier.trim() || null,
        voucher_no: voucherNo.trim() || null,
        brand: brand.trim() || null,
        model: model.trim() || null,
        unit_of_measure: unitOfMeasure.trim() || "pc",
        remarks: remarks.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk register</DialogTitle>
          <DialogDescription>
            One voucher, many units. Type the quantity and the total on the voucher, the unit cost is computed for you.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 grid gap-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Monobloc chair, white" />
          </div>

          <div className="grid gap-2">
            <Label>Asset class</Label>
            <SearchableSelect options={classOptions} value={classId} onChange={pickClass} placeholder="Select class" />
          </div>

          <div className="grid gap-2">
            <Label>Acquisition date</Label>
            <Input type="date" value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Quantity</Label>
            <Input inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Total on the voucher</Label>
            <Input inputMode="decimal" value={batchTotal} onChange={(e) => setBatchTotal(e.target.value)} placeholder="0.00" />
          </div>

          <div className="grid gap-2">
            <Label>Useful life, months</Label>
            <Input inputMode="numeric" value={lifeMonths} onChange={(e) => setLifeMonths(e.target.value)} placeholder="e.g. 60" />
          </div>

          <div className="grid gap-2">
            <Label>Unit of measure</Label>
            <Input value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} placeholder="pc" />
          </div>

          <div className="grid gap-2">
            <Label>Office</Label>
            <SearchableSelect options={officeOptions} value={officeId} onChange={setOfficeId} placeholder="Select office" />
          </div>

          <div className="grid gap-2">
            <Label>Condition</Label>
            <SearchableSelect options={conditionOptions} value={conditionId} onChange={setConditionId} placeholder="Select condition" />
          </div>

          <div className="grid gap-2">
            <Label>Mode of acquisition</Label>
            <SearchableSelect options={modeOptions} value={mode} onChange={(v) => setMode(v as ModeOfAcquisition)} />
          </div>

          <div className="grid gap-2">
            <Label>Fund source</Label>
            <SearchableSelect options={fundOptions} value={fundSourceId} onChange={setFundSourceId} placeholder="Select fund source" />
          </div>

          <div className="grid gap-2">
            <Label>Voucher or invoice number</Label>
            <Input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Supplier</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Model</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} />
          </div>

          <div className="sm:col-span-2 grid gap-2">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>

          <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>
                Unit cost: <span className="font-medium">{peso(unitCost)}</span>
              </span>
              <span>
                Units: <span className="font-medium">{qty}</span>
              </span>
              <span>
                Classification: <span className="font-medium">{semi ? "Semi-expendable, ICS" : "PPE, PAR"}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {peso(unitCost)} x {qty} = {peso(unitCost * qty)}
              {remainder !== 0 ? " plus " + peso(remainder) + " unallocated, kept on the batch" : ", which matches the voucher exactly"}
            </p>
          </div>

          {error ? (
            <div className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="sticky bottom-0 z-10 -mx-6 border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving..." : "Register " + qty + " units"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
