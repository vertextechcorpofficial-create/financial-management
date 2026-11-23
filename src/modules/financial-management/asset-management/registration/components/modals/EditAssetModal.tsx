"use client";

import imageCompression from "browser-image-compression";
import Image from "next/image";
import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SearchableSelect } from "../SearchableSelect";
import { assetService } from "../../services/assetService";
import {
  AssetTableData,
  Department,
  ItemClassification,
  ItemType,
  User,
  AssetCondition,
} from "../../types";

interface EditAssetModalProps {
  asset: AssetTableData | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onLocalUpdate: (updated: Partial<AssetTableData> & { id: number }) => void;
}

export default function EditAssetModal({
  asset,
  isOpen,
  onClose,
  onSuccess,
  onLocalUpdate,
}: EditAssetModalProps) {
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [types, setTypes] = useState<ItemType[]>([]);
  const [classifications, setClassifications] = useState<ItemClassification[]>([]);
  const [conditions, setConditions] = useState<AssetCondition[]>([]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Collapsibles
  const [purchaseDetailsOpen, setPurchaseDetailsOpen] = useState(false);
  const [depreciationOpen, setDepreciationOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  // Popover calendar states
  const [dateAcquiredOpen, setDateAcquiredOpen] = useState(false);
  const [availDateOpen, setAvailDateOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);

  // Form Fields State matching AddAssetModal
  const [formData, setFormData] = useState({
    item_name: "",
    item_type: "",
    item_classification: "",
    asset_tag: "",
    rfid_code: "",
    barcode: "",
    serial: "",
    brand: "",
    model: "",
    department: 0,
    employee: null as number | null,
    location: "",
    date_acquired: new Date(),
    available_for_use_date: new Date(),
    warranty_until: null as Date | null,
    cost_per_item: 0,
    life_span: 5,
    condition: "Good",
    security_tag: "Activated",
    supplier_name: "",
    invoice_no: "",
    po_no: "",
    remarks: "",
    depreciation_method: "Straight-line",
    residual_value: 0,
    total_units: null as number | null,
    units_per_year: null as number | null,
  });

  useEffect(() => {
    if (isOpen && asset) {
      const acqDate = asset.date_acquired ? new Date(asset.date_acquired) : new Date();
      const availDate = asset.available_for_use_date
        ? new Date(asset.available_for_use_date)
        : acqDate;
      const warranty = asset.warranty_until ? new Date(asset.warranty_until) : null;

      setFormData({
        item_name: asset.item_name || "",
        item_type: asset.item_type_name || "Hardware",
        item_classification: asset.classification_name || "IT Equipment",
        asset_tag: asset.asset_tag || "",
        rfid_code: asset.rfid_code || "",
        barcode: asset.barcode || "",
        serial: asset.serial || "",
        brand: asset.brand || "",
        model: asset.model || "",
        department: asset.department || 0,
        employee: asset.employee || null,
        location: asset.location || "",
        date_acquired: acqDate,
        available_for_use_date: availDate,
        warranty_until: warranty,
        cost_per_item: Number(asset.cost_per_item || 0),
        life_span: Number(asset.life_span || 5),
        condition: asset.condition || "Good",
        security_tag: asset.security_tag || "Activated",
        supplier_name: asset.supplier_name || "",
        invoice_no: asset.invoice_no || "",
        po_no: asset.po_no || "",
        remarks: asset.remarks || "",
        depreciation_method: "Straight-line",
        residual_value: Number(asset.residual_value || 0),
        total_units: asset.total_units ? Number(asset.total_units) : null,
        units_per_year: asset.units_per_year ? Number(asset.units_per_year) : null,
      });

      setPreviewUrl(
        asset.item_image
          ? `/api/fm/asset-management/registration/asset-image-view?id=${asset.item_image}`
          : null
      );
      setSelectedFile(null);

      // Fetch options
      const fetchOptions = async () => {
        try {
          const [depData, userData, typeData, classData, condData] =
            await Promise.all([
              assetService.getDepartments(),
              assetService.getUsers(),
              assetService.getItemTypes(),
              assetService.getItemClassifications(),
              assetService.getConditions(),
            ]);
          setDepartments(Array.isArray(depData) ? depData : []);
          setUsers(Array.isArray(userData) ? userData : []);
          setTypes(Array.isArray(typeData) ? typeData : []);
          setClassifications(Array.isArray(classData) ? classData : []);
          setConditions(Array.isArray(condData) ? condData : []);
        } catch (err) {
          console.warn("Failed loading options:", err);
        }
      };
      fetchOptions();
    }
  }, [isOpen, asset]);

  const cost = Number(formData.cost_per_item || 0);
  const residual = Number(formData.residual_value || 0);
  const lifeSpan = Number(formData.life_span || 1);
  const depreciableAmount = Math.max(0, cost - residual);
  const annualDepreciation = lifeSpan > 0 ? depreciableAmount / lifeSpan : 0;

  // Closed period check (IAS 8 / PFRS)
  const isAcquiredInClosedPeriod = useMemo(() => {
    if (!formData.date_acquired) return false;
    const closedThrough = new Date("2026-10-31T23:59:59");
    const acq = new Date(formData.date_acquired);
    return acq <= closedThrough;
  }, [formData.date_acquired]);

  // Track required fields remaining
  const requiredCount = useMemo(() => {
    let missing = 0;
    if (!formData.item_name?.trim()) missing++;
    if (!formData.item_type?.trim()) missing++;
    if (!formData.item_classification?.trim()) missing++;
    if (!formData.rfid_code?.trim()) missing++;
    if (!formData.department || Number(formData.department) === 0) missing++;
    if (!formData.date_acquired) missing++;
    if (!formData.available_for_use_date) missing++;
    if (!formData.cost_per_item || Number(formData.cost_per_item) <= 0) missing++;
    if (!formData.life_span || Number(formData.life_span) <= 0) missing++;
    return missing;
  }, [formData]);

  const handleGenBarcode = () => {
    if (formData.asset_tag && formData.asset_tag.trim()) {
      const cleaned = formData.asset_tag.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      setFormData((prev) => ({ ...prev, barcode: cleaned }));
      toast.success(`Generated barcode: ${cleaned}`);
    } else if (formData.rfid_code && formData.rfid_code.trim()) {
      const cleaned = formData.rfid_code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      setFormData((prev) => ({ ...prev, barcode: cleaned }));
      toast.success(`Generated barcode: ${cleaned}`);
    } else {
      const prefix = formData.item_classification
        ? formData.item_classification.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "AST")
        : "AST";
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const generated = `${prefix}${randomDigits}`;
      setFormData((prev) => ({ ...prev, barcode: generated }));
      toast.success(`Generated barcode: ${generated}`);
    }
  };

  const handleClassificationChange = (classVal: string) => {
    setFormData((prev) => {
      const foundClass = classifications.find(
        (c) => c.classification_name.toLowerCase() === classVal.toLowerCase()
      );
      let updatedLife = prev.life_span;
      let updatedResidual = prev.residual_value;

      if (foundClass) {
        if (foundClass.default_life_months) {
          updatedLife = Math.round(foundClass.default_life_months / 12);
        }
        if (foundClass.residual_percent && cost > 0) {
          updatedResidual = (cost * foundClass.residual_percent) / 100;
        }
      }

      return {
        ...prev,
        item_classification: classVal,
        life_span: updatedLife,
        residual_value: updatedResidual,
      };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("File size exceeds 2MB limit.");
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const uploadToDirectus = async (file: File) => {
    try {
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true };
      const compressed = await imageCompression(file, options);
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch(
        "/api/fm/asset-management/registration/asset-image-upload",
        { method: "POST", body: fd }
      );
      if (!res.ok) throw new Error("Upload failed");
      const json = await res.json();
      return json?.data?.id;
    } catch {
      return null;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;

    if (!formData.item_name.trim()) {
      toast.error("Item Name is required");
      return;
    }

    if (!formData.rfid_code.trim()) {
      toast.error("RFID Tag (EPC) is required");
      return;
    }

    // 1. Check Land / Building rejection rule
    const nameLower = formData.item_name.toLowerCase();
    const classLower = formData.item_classification.toLowerCase();
    if (
      nameLower.startsWith("land") ||
      nameLower.startsWith("building") ||
      classLower.startsWith("land") ||
      classLower.startsWith("building")
    ) {
      toast.error(
        "Land and buildings must be registered in a separate real-property module. This system must reject them."
      );
      return;
    }

    // 2. Capitalisation threshold check
    if (formData.cost_per_item < 15000) {
      toast.error(
        "Acquisition cost is below ₱15,000 threshold. It must be expensed and cannot be capitalized as PPE."
      );
      return;
    }

    // 3. Date check: Available for use >= Date Acquired
    if (formData.available_for_use_date < formData.date_acquired) {
      toast.error("Available for Use date must be on or after Date Acquired.");
      return;
    }

    setLoading(true);
    try {
      let finalImageId = asset.item_image;
      if (selectedFile) {
        finalImageId = await uploadToDirectus(selectedFile);
      } else if (previewUrl === null) {
        finalImageId = null;
      }

      const payload = {
        id: asset.id,
        item_id: asset.item_id,
        ...formData,
        date_acquired: format(formData.date_acquired, "yyyy-MM-dd"),
        available_for_use_date: format(formData.available_for_use_date, "yyyy-MM-dd"),
        warranty_until: formData.warranty_until
          ? format(formData.warranty_until, "yyyy-MM-dd")
          : null,
        item_image: finalImageId,
      };

      const res = await fetch("/api/fm/asset-management/registration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update asset");

      toast.success("Asset updated successfully");
      onLocalUpdate({
        ...payload,
        id: asset.id,
        item_type_name: formData.item_type,
        classification_name: formData.item_classification,
        condition: formData.condition,
        cost_per_item: formData.cost_per_item,
        total: formData.cost_per_item,
        item_image: finalImageId,
      });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to update asset";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl w-full max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            Edit Asset · {asset?.asset_tag || "ITE-0007"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Changes recalculate the depreciation schedule and journal entries.
          </p>
        </DialogHeader>

        {/* Upload Container */}
        <div className="px-6 py-2">
          <label className="border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors bg-muted/10 relative">
            {previewUrl ? (
              <div className="relative h-28 w-full flex items-center justify-center">
                <Image
                  src={previewUrl}
                  alt="Preview"
                  width={140}
                  height={110}
                  className="h-28 w-auto object-contain rounded-md"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  className="absolute top-0 right-0 p-1 bg-background rounded-full border shadow-sm hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-muted-foreground/80 mb-2" />
                <span className="text-sm font-semibold text-foreground">
                  Click to upload or drag and drop
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  PNG, JPG or WebP (max. 2MB)
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        <form onSubmit={handleSave} className="p-6 pt-2 space-y-4">
          {/* Row 1: Item Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">
              Item Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={formData.item_name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, item_name: e.target.value }))
              }
              placeholder="Search or type asset name..."
              className="h-10 text-sm"
              required
            />
          </div>

          {/* Row 2: Item Type & Classification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Item Type <span className="text-destructive">*</span>
              </label>
              <SearchableSelect
                options={types.map((t) => ({ label: t.type_name, value: t.type_name }))}
                value={formData.item_type}
                onChange={(val) => setFormData((prev) => ({ ...prev, item_type: val }))}
                placeholder="Search or type new..."
                searchPlaceholder="Search item type..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Classification <span className="text-destructive">*</span>
              </label>
              <SearchableSelect
                options={classifications.map((c) => ({
                  label: c.classification_name,
                  value: c.classification_name,
                  subLabel: c.tag_prefix ? `Prefix: ${c.tag_prefix}` : undefined,
                }))}
                value={formData.item_classification}
                onChange={handleClassificationChange}
                placeholder="Search or type new..."
                searchPlaceholder="Search classification..."
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Straight-line · {formData.life_span} yrs · residual {cost > 0 ? Math.round((residual / cost) * 100) : 0}%
              </p>
            </div>
          </div>

          {/* Row 3: Asset Tag, RFID Tag (EPC), Barcode */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Asset Tag</label>
              <Input
                value={formData.asset_tag}
                readOnly
                className="h-10 text-sm bg-muted/40 font-mono"
              />
              <p className="text-[10px] text-muted-foreground h-4 leading-4">Unique register ID</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                RFID Tag (EPC) <span className="text-destructive">*</span>
              </label>
              <Input
                value={formData.rfid_code}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, rfid_code: e.target.value }))
                }
                placeholder="Scan or type tag ID"
                className="h-10 text-sm font-mono"
                required
              />
              <p className="text-[10px] text-muted-foreground h-4 leading-4">One tag per asset</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Barcode</label>
              <div className="flex gap-1.5">
                <Input
                  value={formData.barcode}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, barcode: e.target.value }))
                  }
                  placeholder="Optional"
                  className="h-10 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenBarcode}
                  className="h-10 px-3 text-xs shrink-0"
                >
                  Gen
                </Button>
              </div>
              <div className="h-4" />
            </div>
          </div>

          {/* Row 4: Serial Number, Brand / Manufacturer, Model */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Serial Number</label>
              <Input
                value={formData.serial}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, serial: e.target.value }))
                }
                placeholder="Optional"
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Brand / Manufacturer</label>
              <Input
                value={formData.brand}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, brand: e.target.value }))
                }
                placeholder="Optional"
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Model</label>
              <Input
                value={formData.model}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, model: e.target.value }))
                }
                placeholder="Optional"
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Row 5: Department, Assigned To, Location */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Department <span className="text-destructive">*</span>
              </label>
              <SearchableSelect
                options={departments.map((d) => ({
                  label: d.department_name,
                  value: String(d.department_id),
                }))}
                value={formData.department ? String(formData.department) : ""}
                onChange={(val) =>
                  setFormData((prev) => ({ ...prev, department: Number(val) }))
                }
                placeholder="Select department"
                searchPlaceholder="Search department..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Assigned To</label>
              <SearchableSelect
                options={[
                  { label: "Unassigned", value: "unassigned" },
                  ...users.map((u) => ({
                    label: `${u.user_fname} ${u.user_lname}`.trim(),
                    value: String(u.user_id),
                  })),
                ]}
                value={formData.employee ? String(formData.employee) : "unassigned"}
                onChange={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    employee: val === "unassigned" ? null : Number(val),
                  }))
                }
                placeholder="Unassigned"
                searchPlaceholder="Search employee..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Location</label>
              <Input
                value={formData.location}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, location: e.target.value }))
                }
                placeholder="e.g. 3F Data room"
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Row 6: Date Acquired, Available for Use, Warranty Until */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Date Acquired <span className="text-destructive">*</span>
              </label>
              <Popover open={dateAcquiredOpen} onOpenChange={setDateAcquiredOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-10 px-3 justify-between text-left font-normal text-sm"
                  >
                    {formData.date_acquired ? format(formData.date_acquired, "MM/dd/yyyy") : "mm/dd/yyyy"}
                    <CalendarIcon className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.date_acquired}
                    onSelect={(d) => {
                      if (d) setFormData((prev) => ({ ...prev, date_acquired: d }));
                      setDateAcquiredOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <div className="h-4" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Available for Use <span className="text-destructive">*</span>
              </label>
              <Popover open={availDateOpen} onOpenChange={setAvailDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-10 px-3 justify-between text-left font-normal text-sm"
                  >
                    {formData.available_for_use_date
                      ? format(formData.available_for_use_date, "MM/dd/yyyy")
                      : "mm/dd/yyyy"}
                    <CalendarIcon className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.available_for_use_date}
                    onSelect={(d) => {
                      if (d) setFormData((prev) => ({ ...prev, available_for_use_date: d }));
                      setAvailDateOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-[10px] text-muted-foreground h-4 leading-4">
                Depreciation starts here (IAS 16.55)
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Warranty Until</label>
              <Popover open={warrantyOpen} onOpenChange={setWarrantyOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-10 px-3 justify-between text-left font-normal text-sm"
                  >
                    {formData.warranty_until
                      ? format(formData.warranty_until, "MM/dd/yyyy")
                      : "mm/dd/yyyy"}
                    <CalendarIcon className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.warranty_until || undefined}
                    onSelect={(d) => {
                      setFormData((prev) => ({ ...prev, warranty_until: d || null }));
                      setWarrantyOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <div className="h-4" />
            </div>
          </div>

          {/* Row 7: Acquisition Cost, Life Span, Condition, Security Tag */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Acquisition Cost <span className="text-destructive">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                value={formData.cost_per_item}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, cost_per_item: Number(e.target.value) }))
                }
                className="h-10 text-sm font-mono"
              />
              <p className="text-[10px] text-muted-foreground h-4 leading-4">
                Invoice price, net of VAT
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Life Span (yrs) <span className="text-destructive">*</span>
              </label>
              <Input
                type="number"
                value={formData.life_span}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, life_span: Number(e.target.value) }))
                }
                className="h-10 text-sm"
              />
              <div className="h-4" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Condition</label>
              <SearchableSelect
                options={
                  conditions.length > 0
                    ? conditions.map((c) => ({
                        label: c.condition_name,
                        value: c.condition_name,
                      }))
                    : [
                        { label: "New", value: "New" },
                        { label: "Good", value: "Good" },
                        { label: "Under Maintenance", value: "Under Maintenance" },
                        { label: "Poor", value: "Poor" },
                        { label: "Damaged", value: "Damaged" },
                        { label: "For repair", value: "For repair" },
                      ]
                }
                value={formData.condition}
                onChange={(val) => setFormData((prev) => ({ ...prev, condition: val }))}
                placeholder="Select condition"
                searchPlaceholder="Search condition..."
              />
              <div className="h-4" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Security Tag</label>
              <SearchableSelect
                options={[
                  { label: "Activated", value: "Activated" },
                  { label: "Deactivated", value: "Deactivated" },
                ]}
                value={formData.security_tag}
                onChange={(val) => setFormData((prev) => ({ ...prev, security_tag: val }))}
                placeholder="Select status"
                searchPlaceholder="Search status..."
              />
              <div className="h-4" />
            </div>
          </div>

          {/* Collapsible: Purchase details */}
          <Collapsible
            open={purchaseDetailsOpen}
            onOpenChange={setPurchaseDetailsOpen}
            className="border rounded-xl p-3 bg-muted/10 space-y-3"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-bold text-foreground w-full select-none"
              >
                {purchaseDetailsOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Purchase details
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-foreground">Supplier / Vendor</label>
                  <Input
                    value={formData.supplier_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, supplier_name: e.target.value }))
                    }
                    placeholder="e.g. Columbia Tech"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-foreground">Invoice / OR No.</label>
                  <Input
                    value={formData.invoice_no}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, invoice_no: e.target.value }))
                    }
                    placeholder="e.g. SI-58203"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-foreground">PO No.</label>
                  <Input
                    value={formData.po_no}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, po_no: e.target.value }))
                    }
                    placeholder="Optional"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-foreground">Remarks</label>
                <Input
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, remarks: e.target.value }))
                  }
                  placeholder="Optional"
                  className="h-9 text-xs"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Collapsible: Depreciation & measurement */}
          <Collapsible
            open={depreciationOpen}
            onOpenChange={setDepreciationOpen}
            className="border rounded-xl p-3 bg-muted/10 space-y-3"
          >
            <div className="flex items-center justify-between w-full">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs font-bold text-foreground select-none"
                >
                  {depreciationOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  Depreciation & measurement
                </button>
              </CollapsibleTrigger>
              <span className="text-[11px] text-muted-foreground font-mono">
                {formData.depreciation_method} · {formData.life_span * 12} mo
              </span>
            </div>
            <CollapsibleContent className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-foreground">Depreciation Method</label>
                  <SearchableSelect
                    options={[
                      { label: "Straight-line", value: "Straight-line" },
                      { label: "Double-declining", value: "Double-declining" },
                      { label: "Sum-of-years digits", value: "Sum-of-years digits" },
                      { label: "Units of production", value: "Units of production" },
                    ]}
                    value={formData.depreciation_method}
                    onChange={(val) =>
                      setFormData((prev) => ({ ...prev, depreciation_method: val }))
                    }
                    placeholder="Select method"
                    searchPlaceholder="Search method..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-foreground">Residual Value (total)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.residual_value}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        residual_value: Number(e.target.value),
                      }))
                    }
                    className="h-9 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Expected net disposal amount at end of life (IAS 16.6)
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-foreground">Measurement Model</label>
                  <Input
                    value="Cost model"
                    readOnly
                    className="h-9 text-xs bg-muted/40"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Set per class (IAS 16.29, 16.36)
                  </p>
                </div>
              </div>

              {/* Units of production conditional fields */}
              {formData.depreciation_method === "Units of production" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                  <div className="space-y-1">
                    <label className="text-xs text-foreground">Total Expected Units</label>
                    <Input
                      type="number"
                      value={formData.total_units || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          total_units: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      placeholder="e.g. 100,000 units"
                      className="h-9 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Total capacity over useful life
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-foreground">Estimated Units / Year</label>
                    <Input
                      type="number"
                      value={formData.units_per_year || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          units_per_year: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      placeholder="e.g. 20,000 units"
                      className="h-9 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Annual production estimate
                    </p>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                Method must reflect how benefits are consumed; revenue-based methods are not allowed (IAS 16.60, 16.62A). Review life, residual and method every year-end (IAS 16.51, 16.61).
              </p>
            </CollapsibleContent>
          </Collapsible>

          {/* Footer with Summary metrics, Journal Preview, and Actions */}
          <div className="pt-4 border-t space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                {requiredCount > 0 ? (
                  <span className="px-3.5 py-1.5 bg-rose-50 text-rose-600 rounded-full text-xs font-semibold border border-rose-200">
                    {requiredCount} required fields left
                  </span>
                ) : (
                  <span className="px-3.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-semibold border border-emerald-200">
                    Ready to save
                  </span>
                )}
              </div>

              <div className="flex items-center gap-6 sm:gap-8">
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight block">
                    Cost
                  </span>
                  <span className="text-base font-bold font-mono">
                    ₱{cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight block">
                    Depreciable Amount
                  </span>
                  <span className="text-base font-bold font-mono">
                    ₱{depreciableAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight block">
                    Annual Depreciation
                  </span>
                  <span className="text-base font-bold font-mono">
                    ₱{annualDepreciation.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Collapsible Journal entry preview on save */}
            <Collapsible open={journalOpen} onOpenChange={setJournalOpen} className="pt-1">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline select-none"
                >
                  {journalOpen ? "▼" : "▶"} Journal entry on save
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="rounded-lg border bg-muted/20 p-3 text-xs font-mono space-y-1">
                  <div className="flex justify-between items-center text-foreground font-semibold">
                    <span>PPE – {formData.item_classification || "IT Equipment"}</span>
                    <span>{cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-muted-foreground pl-6">
                    <span>Cash / Accounts Payable</span>
                    <span>{cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Action buttons */}
            <div className="flex justify-end items-center gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
                className="h-9 text-xs px-4"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || requiredCount > 0}
                className="h-9 text-xs px-5 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save Asset
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
