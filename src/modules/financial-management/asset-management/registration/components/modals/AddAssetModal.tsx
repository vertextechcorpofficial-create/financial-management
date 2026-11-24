"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import imageCompression from "browser-image-compression";
import Image from "next/image";
import React, { useEffect, useState, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "../../utils/lib";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  assetFormSchema,
  AssetFormValues,
  AssetTableData,
  Department,
  ItemClassification,
  ItemType,
  User,
  AssetCondition,
} from "../../types";

interface AddAssetModalProps {
  onSuccess: () => void;
  onLocalAppend: (asset: AssetTableData) => void;
}

interface AssetItem {
  id: number;
  item_name: string;
  item_type?: { type_name?: string };
  item_classification?: { classification_name?: string };
  brand?: string;
  model?: string;
  default_cost?: number;
  default_life?: number;
}

export default function AddAssetModal({
  onSuccess,
  onLocalAppend,
}: AddAssetModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [types, setTypes] = useState<ItemType[]>([]);
  const [classifications, setClassifications] = useState<ItemClassification[]>([]);
  const [conditions, setConditions] = useState<AssetCondition[]>([]);
  const [items, setItems] = useState<AssetItem[]>([]);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Collapsible sections
  const [purchaseDetailsOpen, setPurchaseDetailsOpen] = useState(false);
  const [depreciationOpen, setDepreciationOpen] = useState(false);

  // Date picker popovers
  const [dateAcquiredOpen, setDateAcquiredOpen] = useState(false);
  const [availDateOpen, setAvailDateOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema) as unknown as Resolver<AssetFormValues, unknown, AssetFormValues>,
    defaultValues: {
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
      employee: null,
      location: "",
      date_acquired: new Date(),
      available_for_use_date: new Date(),
      warranty_until: null,
      cost_per_item: 0,
      life_span: 5,
      condition: "Good",
      security_tag: "Deactivated",
      supplier_name: "",
      invoice_no: "",
      po_no: "",
      remarks: "",
      depreciation_method: "Straight-line",
      residual_value: 0,
      total_units: null,
      units_per_year: null,
      is_active_warning: 0,
    },
  });

  const watchValues = form.watch();
  const cost = Number(watchValues.cost_per_item || 0);
  const residual = Number(watchValues.residual_value || 0);
  const lifeSpan = Number(watchValues.life_span || 1);

  // Derived financial metrics
  const depreciableAmount = Math.max(0, cost - residual);
  const annualDepreciation = lifeSpan > 0 ? depreciableAmount / lifeSpan : 0;

  // Track required fields remaining
  const requiredCount = useMemo(() => {
    let missing = 0;
    if (!watchValues.item_name?.trim()) missing++;
    if (!watchValues.item_type?.trim()) missing++;
    if (!watchValues.item_classification?.trim()) missing++;
    if (!watchValues.rfid_code?.trim()) missing++;
    if (!watchValues.department || Number(watchValues.department) === 0) missing++;
    if (!watchValues.date_acquired) missing++;
    if (!watchValues.available_for_use_date) missing++;
    if (!watchValues.cost_per_item || Number(watchValues.cost_per_item) <= 0) missing++;
    if (!watchValues.life_span || Number(watchValues.life_span) <= 0) missing++;
    return missing;
  }, [watchValues]);

  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        try {
          const [depData, userData, typeData, classData, itemData, condData] =
            await Promise.all([
              assetService.getDepartments(),
              assetService.getUsers(),
              assetService.getItemTypes(),
              assetService.getItemClassifications(),
              assetService.getItems(),
              assetService.getConditions(),
            ]);

          setDepartments(Array.isArray(depData) ? depData : []);
          setUsers(Array.isArray(userData) ? userData : []);
          setTypes(Array.isArray(typeData) ? typeData : []);
          setClassifications(Array.isArray(classData) ? classData : []);
          setItems(Array.isArray(itemData) ? itemData : []);
          setConditions(Array.isArray(condData) ? condData : []);
        } catch (error) {
          console.error("Failed to load dropdown options", error);
        }
      };
      fetchData();
    }
  }, [open]);

  // When classification changes, auto-generate tag prefix & default life span
  const handleClassificationChange = async (classVal: string) => {
    form.setValue("item_classification", classVal);
    const foundClass = classifications.find(
      (c) => c.classification_name.toLowerCase() === classVal.toLowerCase()
    );
    if (foundClass) {
      if (foundClass.default_life_months) {
        form.setValue("life_span", Math.round(foundClass.default_life_months / 12));
      }
      if (foundClass.residual_percent && cost > 0) {
        form.setValue("residual_value", (cost * foundClass.residual_percent) / 100);
      }
    }
    try {
      const res = await assetService.getAssetTag(classVal);
      if (res?.tag) {
        form.setValue("asset_tag", res.tag);
      }
    } catch (err) {
      console.warn("Could not fetch next tag", err);
    }
  };

  // When item name is selected or typed, pre-fill template values if matched
  const handleItemSelect = (name: string) => {
    form.setValue("item_name", name);
    const matched = items.find((i) => i.item_name.toLowerCase() === name.toLowerCase());
    if (matched) {
      if (matched.item_type?.type_name) form.setValue("item_type", matched.item_type.type_name);
      if (matched.item_classification?.classification_name) {
        handleClassificationChange(matched.item_classification.classification_name);
      }
      if (matched.brand) form.setValue("brand", matched.brand);
      if (matched.model) form.setValue("model", matched.model);
      if (matched.default_cost) form.setValue("cost_per_item", matched.default_cost);
      if (matched.default_life) form.setValue("life_span", matched.default_life);
    }
  };

  const handleGenBarcode = () => {
    const tag = form.getValues("asset_tag");
    const rfid = form.getValues("rfid_code");
    const classification = form.getValues("item_classification");

    if (tag && tag.trim()) {
      // Rule from spec: "Gen" sets it to the tag without the hyphen (e.g., ITE-0001 -> ITE0001)
      const cleaned = tag.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      form.setValue("barcode", cleaned, { shouldValidate: true, shouldDirty: true });
      toast.success(`Generated barcode: ${cleaned}`);
    } else if (rfid && rfid.trim()) {
      const cleaned = rfid.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      form.setValue("barcode", cleaned, { shouldValidate: true, shouldDirty: true });
      toast.success(`Generated barcode: ${cleaned}`);
    } else {
      // Fallback: Generate standard 12-digit numeric barcode (Code 128 / EAN compatible)
      const prefix = classification ? classification.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "AST") : "AST";
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const generated = `${prefix}${randomDigits}`;
      form.setValue("barcode", generated, { shouldValidate: true, shouldDirty: true });
      toast.success(`Generated barcode: ${generated}`);
    }
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
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await fetch("/api/fm/asset-management/registration/asset-image-upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const result = await res.json();
      return result?.data?.id;
    } catch {
      return null;
    }
  };

  const onSubmit = async (values: AssetFormValues) => {
    // 1. Check Land / Building rejection rule
    const nameLower = values.item_name.toLowerCase();
    const classLower = values.item_classification.toLowerCase();
    if (nameLower.startsWith("land") || nameLower.startsWith("building") ||
        classLower.startsWith("land") || classLower.startsWith("building")) {
      toast.error("Land and buildings must be registered in a separate real-property module. This system must reject them.");
      return;
    }

    // 2. Capitalisation threshold check
    if (values.cost_per_item < 15000) {
      toast.error("Acquisition cost is below ₱15,000 threshold. It must be expensed and cannot be capitalized as PPE.");
      return;
    }

    // 3. Date check: Available for use >= Date Acquired
    if (values.available_for_use_date < values.date_acquired) {
      toast.error("Available for Use date must be on or after Date Acquired.");
      return;
    }

    setLoading(true);
    try {
      let uploadedImageId = null;
      if (selectedFile) {
        uploadedImageId = await uploadToDirectus(selectedFile);
      }

      const payload = {
        ...values,
        quantity: 1, // 1:1 RFID granularity
        date_acquired: format(values.date_acquired, "yyyy-MM-dd"),
        available_for_use_date: format(values.available_for_use_date, "yyyy-MM-dd"),
        warranty_until: values.warranty_until ? format(values.warranty_until, "yyyy-MM-dd") : null,
        item_image: uploadedImageId,
      };

      const res = await fetch("/api/fm/asset-management/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to create asset");
      }

      toast.success("Asset registered successfully");
      onLocalAppend(json.data);
      onSuccess();
      setOpen(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Failed to register asset";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
          <Plus className="mr-2 h-4 w-4" /> Add New Asset
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl w-full max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold">Create New Asset</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Fill in the details below to add a new asset to the inventory.
          </p>
        </DialogHeader>

        {/* Upload Container */}
        <div className="px-6 py-2">
          <label className="border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors bg-muted/10 relative">
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
                <UploadCloud className="h-9 w-9 text-muted-foreground/80 mb-2 stroke-[1.5]" />
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 pt-2 space-y-4">
            {/* Row 1: Item Name */}
            <FormField
              control={form.control}
              name="item_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">
                    Item Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="Search or type asset name..."
                        {...field}
                        onChange={(e) => handleItemSelect(e.target.value)}
                        className="h-10 text-sm"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Row 2: Item Type & Classification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="item_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">
                      Item Type <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={types.map((t) => ({ label: t.type_name, value: t.type_name }))}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Search or type new..."
                        searchPlaceholder="Search item type..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="item_classification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">
                      Classification <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={classifications.map((c) => ({
                          label: c.classification_name,
                          value: c.classification_name,
                          subLabel: c.tag_prefix ? `Prefix: ${c.tag_prefix}` : undefined,
                        }))}
                        value={field.value}
                        onChange={handleClassificationChange}
                        placeholder="Search or type new..."
                        searchPlaceholder="Search classification..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Row 3: Asset Tag, RFID Tag (EPC), Barcode */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="asset_tag"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Asset Tag</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Auto-generated"
                        {...field}
                        value={field.value || ""}
                        className="h-10 text-sm"
                      />
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground h-4 leading-4">Unique register ID</p>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rfid_code"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">
                      RFID Tag (EPC) <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Scan or type tag ID"
                        {...field}
                        value={field.value || ""}
                        className="h-10 text-sm"
                      />
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground h-4 leading-4">One tag per asset</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Barcode</FormLabel>
                    <div className="flex gap-1.5">
                      <FormControl>
                        <Input
                          placeholder="Optional"
                          {...field}
                          value={field.value || ""}
                          className="h-10 text-sm"
                        />
                      </FormControl>
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
                  </FormItem>
                )}
              />
            </div>

            {/* Row 4: Serial Number, Brand / Manufacturer, Model */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="serial"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Serial Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional"
                        {...field}
                        value={field.value || ""}
                        className="h-10 text-sm"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Brand / Manufacturer</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional"
                        {...field}
                        value={field.value || ""}
                        className="h-10 text-sm"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Model</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Optional"
                        {...field}
                        value={field.value || ""}
                        className="h-10 text-sm"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Row 5: Department, Assigned To, Location */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">
                      Department <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={departments.map((d) => ({
                          label: d.department_name,
                          value: String(d.department_id),
                        }))}
                        value={field.value ? String(field.value) : ""}
                        onChange={(val) => field.onChange(Number(val))}
                        placeholder="Select department"
                        searchPlaceholder="Search department..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="employee"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Assigned To</FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={[
                          { label: "Unassigned", value: "unassigned" },
                          ...users.map((u) => ({
                            label: `${u.user_fname} ${u.user_lname}`.trim(),
                            value: String(u.user_id),
                          })),
                        ]}
                        value={field.value ? String(field.value) : "unassigned"}
                        onChange={(val) =>
                          field.onChange(val === "unassigned" ? null : Number(val))
                        }
                        placeholder="Unassigned"
                        searchPlaceholder="Search employee..."
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. 3F Data room"
                        {...field}
                        value={field.value || ""}
                        className="h-10 text-sm"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Row 6: Date Acquired, Available for Use, Warranty Until */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="date_acquired"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">
                      Date Acquired <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover open={dateAcquiredOpen} onOpenChange={setDateAcquiredOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-10 px-3 justify-between text-left font-normal text-sm",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "MM/dd/yyyy") : "mm/dd/yyyy"}
                            <CalendarIcon className="h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(d) => {
                            if (d) field.onChange(d);
                            setDateAcquiredOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="h-4" />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="available_for_use_date"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">
                      Available for Use <span className="text-destructive">*</span>
                    </FormLabel>
                    <Popover open={availDateOpen} onOpenChange={setAvailDateOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-10 px-3 justify-between text-left font-normal text-sm",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "MM/dd/yyyy") : "mm/dd/yyyy"}
                            <CalendarIcon className="h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(d) => {
                            if (d) field.onChange(d);
                            setAvailDateOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-[10px] text-muted-foreground h-4 leading-4">
                      Depreciation starts here (IAS 16.55)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="warranty_until"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Warranty Until</FormLabel>
                    <Popover open={warrantyOpen} onOpenChange={setWarrantyOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full h-10 px-3 justify-between text-left font-normal text-sm",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "MM/dd/yyyy") : "mm/dd/yyyy"}
                            <CalendarIcon className="h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={(d) => {
                            field.onChange(d || null);
                            setWarrantyOpen(false);
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="h-4" />
                  </FormItem>
                )}
              />
            </div>

            {/* Row 7: Acquisition Cost, Life Span, Condition, Security Tag */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <FormField
                control={form.control}
                name="cost_per_item"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">
                      Acquisition Cost <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="h-10 text-sm"
                      />
                    </FormControl>
                    <p className="text-[10px] text-muted-foreground h-4 leading-4">Invoice price, net of VAT</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="life_span"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">
                      Life Span (yrs) <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="h-10 text-sm"
                      />
                    </FormControl>
                    <div className="h-4" />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="condition"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Condition</FormLabel>
                    <FormControl>
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
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select condition"
                        searchPlaceholder="Search condition..."
                      />
                    </FormControl>
                    <div className="h-4" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="security_tag"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs font-semibold">Security Tag</FormLabel>
                    <Select
                      value={field.value || "Deactivated"}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className="h-10 text-sm w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Activated">Activated</SelectItem>
                        <SelectItem value="Deactivated">Deactivated</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="h-4" />
                  </FormItem>
                )}
              />
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
                  <FormField
                    control={form.control}
                    name="supplier_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Supplier / Vendor</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} className="h-9 text-xs" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="invoice_no"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Invoice / OR No.</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} className="h-9 text-xs" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="po_no"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">PO No.</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} className="h-9 text-xs" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Remarks</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Optional"
                          {...field}
                          value={field.value || ""}
                          className="h-9 text-xs"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
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
                  Straight-line · {lifeSpan * 12} mo
                </span>
              </div>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="depreciation_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Method</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Straight-line">Straight-line</SelectItem>
                            <SelectItem value="Double-declining">Double-declining</SelectItem>
                            <SelectItem value="Sum-of-years digits">Sum-of-years digits</SelectItem>
                            <SelectItem value="Units of production">Units of production</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="residual_value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Residual Value</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            className="h-9 text-xs"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Footer with Summary metrics and Actions */}
            <div className="pt-4 border-t flex flex-wrap items-center justify-between gap-4">
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
                    ₱{cost.toFixed(2)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight block">
                    Depreciable Amount
                  </span>
                  <span className="text-base font-bold font-mono">
                    ₱{depreciableAmount.toFixed(2)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight block">
                    Annual Depreciation
                  </span>
                  <span className="text-base font-bold font-mono">
                    ₱{annualDepreciation.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="h-9 text-xs px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="h-9 text-xs px-5 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >
                  {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Save Asset
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
