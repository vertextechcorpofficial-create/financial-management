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
import type { LguAsset, LguAssetInput, ModeOfAcquisition, RegistryLookups } from "../../types";
import { computeResidual, isSemiExpendable, MODE_LABELS, PPE_THRESHOLD } from "../../types";
import { SearchableSelect } from "./SearchableSelect";

interface AssetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookups: RegistryLookups;
  initial: LguAsset | null;
  busy: boolean;
  onSubmit: (input: LguAssetInput) => Promise<void>;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AssetFormDialog({ open, onOpenChange, lookups, initial, busy, onSubmit }: AssetFormDialogProps) {
  const [description, setDescription] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [acquisitionDate, setAcquisitionDate] = React.useState(today());
  const [lifeMonths, setLifeMonths] = React.useState("");
  const [officeId, setOfficeId] = React.useState("");
  const [conditionId, setConditionId] = React.useState("");
  const [mode, setMode] = React.useState<ModeOfAcquisition>("purchase");
  const [fundSourceId, setFundSourceId] = React.useState("");
  const [officer, setOfficer] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [supplier, setSupplier] = React.useState("");
  const [poNo, setPoNo] = React.useState("");
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [iarNo, setIarNo] = React.useState("");
  const [serialNo, setSerialNo] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [legacyNo, setLegacyNo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setDescription(initial.description);
      setClassId(initial.class_id ? String(initial.class_id) : "");
      setCost(initial.cost !== null ? String(initial.cost) : "");
      setAcquisitionDate(initial.acquisition_date ?? today());
      setLifeMonths(initial.life_months !== null ? String(initial.life_months) : "");
      setOfficeId(initial.office_id ? String(initial.office_id) : "");
      setConditionId(initial.condition_id ? String(initial.condition_id) : "");
      setMode(initial.mode_of_acquisition);
      setFundSourceId(initial.fund_source_id ? String(initial.fund_source_id) : "");
      setOfficer(initial.accountable_officer_name ?? "");
      setLocation(initial.location ?? "");
      setSupplier(initial.supplier ?? "");
      setPoNo(initial.po_no ?? "");
      setInvoiceNo(initial.invoice_no ?? "");
      setIarNo(initial.iar_no ?? "");
      setSerialNo(initial.serial_no ?? "");
      setBrand(initial.brand ?? "");
      setModel(initial.model ?? "");
      setRemarks(initial.remarks ?? "");
      setLegacyNo("");
    } else {
      setDescription("");
      setClassId("");
      setCost("");
      setAcquisitionDate(today());
      setLifeMonths("");
      setOfficeId("");
      setConditionId("");
      setMode("purchase");
      setFundSourceId("");
      setOfficer("");
      setLocation("");
      setSupplier("");
      setPoNo("");
      setInvoiceNo("");
      setIarNo("");
      setSerialNo("");
      setBrand("");
      setModel("");
      setRemarks("");
      setLegacyNo("");
    }
  }, [open, initial]);

  const numericCost = Number(cost || 0);
  const numericLife = lifeMonths ? Number(lifeMonths) : null;
  const semi = isSemiExpendable(numericCost, numericLife);
  const residual = computeResidual(numericCost);

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
    if (cls && cls.default_life_months !== null && !lifeMonths) {
      setLifeMonths(String(cls.default_life_months));
    }
  }

  async function submit() {
    setError(null);
    if (!description.trim()) return setError("Description is required");
    if (!classId) return setError("Asset class is required");
    if (!acquisitionDate) return setError("Acquisition date is required");
    if (!Number.isFinite(numericCost) || numericCost < 0) return setError("Cost must be a number");

    const payload: LguAssetInput = {
      description: description.trim(),
      class_id: Number(classId),
      cost: numericCost,
      acquisition_date: acquisitionDate,
      life_months: numericLife,
      office_id: officeId ? Number(officeId) : null,
      condition_id: conditionId ? Number(conditionId) : null,
      mode_of_acquisition: mode,
      fund_source_id: fundSourceId ? Number(fundSourceId) : null,
      accountable_officer_name: officer.trim() || null,
      location: location.trim() || null,
      supplier: supplier.trim() || null,
      po_no: poNo.trim() || null,
      invoice_no: invoiceNo.trim() || null,
      iar_no: iarNo.trim() || null,
      serial_no: serialNo.trim() || null,
      brand: brand.trim() || null,
      model: model.trim() || null,
      remarks: remarks.trim() || null,
    };
    if (!initial && legacyNo.trim()) payload.property_no = legacyNo.trim();

    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit asset" : "Register asset"}</DialogTitle>
          <DialogDescription>
            {initial
              ? "The property number never changes. Correct the details, not the identity."
              : "The property number is generated from the class and the year acquired."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 grid gap-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Monobloc table, steel frame" />
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
            <Label>Cost</Label>
            <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </div>

          <div className="grid gap-2">
            <Label>Useful life, months</Label>
            <Input inputMode="numeric" value={lifeMonths} onChange={(e) => setLifeMonths(e.target.value)} placeholder="e.g. 60" />
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
            <Label>Accountable officer</Label>
            <Input value={officer} onChange={(e) => setOfficer(e.target.value)} placeholder="Name on the PAR or ICS" />
          </div>

          <div className="grid gap-2">
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room, floor, building" />
          </div>

          <div className="grid gap-2">
            <Label>Serial number</Label>
            <Input value={serialNo} onChange={(e) => setSerialNo(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Model</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Supplier</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>PO number</Label>
            <Input value={poNo} onChange={(e) => setPoNo(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>Invoice or OR number</Label>
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label>IAR number</Label>
            <Input value={iarNo} onChange={(e) => setIarNo(e.target.value)} />
          </div>

          {!initial ? (
            <div className="grid gap-2 sm:col-span-2">
              <Label>Legacy property number, optional</Label>
              <Input value={legacyNo} onChange={(e) => setLegacyNo(e.target.value)} placeholder="Only for assets already numbered on paper" />
            </div>
          ) : null}

          <div className="sm:col-span-2 grid gap-2">
            <Label>Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>

          <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>
                Classification:{" "}
                <span className="font-medium">{semi ? "Semi-expendable, ICS" : "PPE, PAR"}</span>
              </span>
              <span>
                Threshold: <span className="font-medium">PHP {PPE_THRESHOLD.toLocaleString("en-PH")}</span>
              </span>
              <span>
                Residual at 5 percent: <span className="font-medium">PHP {residual.toLocaleString("en-PH")}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              PPE requires a cost at or above the threshold and a life over one year. Everything else is semi-expendable.
            </p>
          </div>

          {error ? (
            <div className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving..." : initial ? "Save changes" : "Register asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
