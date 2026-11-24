import { z } from "zod";

// --- 1. Base / Lookup Schemas ---

export const departmentSchema = z.object({
  department_id: z.number(),
  department_name: z.string(),
});

export const userSchema = z.object({
  user_id: z.number(),
  user_fname: z.string(),
  user_mname: z.string().optional().nullable(),
  user_lname: z.string(),
  department_id: z.number().optional().nullable(),
});

export const itemTypeSchema = z.object({
  id: z.number(),
  type_name: z.string(),
});

export const itemClassificationSchema = z.object({
  id: z.number(),
  classification_name: z.string(),
  tag_prefix: z.string().optional(),
  default_life_months: z.number().optional(),
  residual_percent: z.number().optional(),
  depreciation_method_id: z.number().optional(),
});

export const assetClassSchema = z.object({
  id: z.number(),
  name: z.string(),
  tag_prefix: z.string(),
  depreciation_method_id: z.number(),
  default_life_months: z.number(),
  residual_percent: z.number(),
});

export const assetConditionSchema = z.object({
  id: z.number(),
  condition_name: z.string(),
  is_impairment_indicator: z.number().optional(),
  sort_order: z.number().optional(),
  is_active: z.number().optional(),
});

export const assetSettingsSchema = z.object({
  id: z.number().optional(),
  capitalisation_threshold: z.number().default(15000),
  approval_enabled: z.number().default(1),
  approval_threshold: z.number().default(50000),
  depreciation_convention_id: z.number().default(1), // 1 = MID, 2 = NEXT
  transfer_revaluation_surplus: z.number().default(0),
});

// --- 2. Form Schema (Client-side form values) ---

export const assetFormSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  item_type: z.string().min(1, "Item type is required"),
  item_classification: z.string().min(1, "Classification is required"),
  asset_tag: z.string().optional().nullable().or(z.literal("")),
  rfid_code: z.string().min(1, "RFID Tag (EPC) is required"),
  barcode: z.string().optional().nullable().or(z.literal("")),
  serial: z.string().optional().nullable().or(z.literal("")),
  brand: z.string().optional().nullable().or(z.literal("")),
  model: z.string().optional().nullable().or(z.literal("")),
  department: z.number().min(1, "Department is required"),
  employee: z.number().nullable().optional(),
  location: z.string().optional().nullable().or(z.literal("")),
  date_acquired: z.date(),
  available_for_use_date: z.date(),
  warranty_until: z.date().optional().nullable(),
  cost_per_item: z.number().min(0, "Acquisition cost is required"),
  life_span: z.number().min(1, "Life span in years is required"),
  condition: z.string().min(1, "Condition is required"),
  quantity: z.number().default(1).optional(),
  security_tag: z.string().optional().nullable().or(z.literal("")),
  
  // Purchase details
  supplier_name: z.string().optional().nullable().or(z.literal("")),
  invoice_no: z.string().optional().nullable().or(z.literal("")),
  po_no: z.string().optional().nullable().or(z.literal("")),
  remarks: z.string().optional().nullable().or(z.literal("")),
  
  // Depreciation & measurement details
  depreciation_method: z.string().default("Straight-line"),
  residual_value: z.number().default(0),
  total_units: z.number().optional().nullable(),
  units_per_year: z.number().optional().nullable(),

  is_active_warning: z.number().default(0),
  item_image: z.any().optional(),
});

// --- 3. API Submission Schema ---

export const assetSubmissionSchema = z.object({
  item_name: z.string(),
  item_type: z.union([z.string(), z.number()]),
  item_classification: z.union([z.string(), z.number()]),
  asset_tag: z.string().optional().nullable(),
  rfid_code: z.string(),
  barcode: z.string().optional().nullable(),
  serial: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  department: z.number(),
  employee: z.number().optional().nullable(),
  location: z.string().optional().nullable(),
  date_acquired: z.string(),
  available_for_use_date: z.string(),
  warranty_until: z.string().optional().nullable(),
  cost_per_item: z.number(),
  acquisition_cost: z.number().optional(),
  quantity: z.literal(1).default(1),
  life_span: z.number(),
  life_months: z.number().optional(),
  condition: z.string(),
  condition_id: z.number().optional(),
  security_tag: z.string().optional().nullable(),
  supplier_name: z.string().optional().nullable(),
  invoice_no: z.string().optional().nullable(),
  po_no: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  residual_value: z.number().default(0),
  depreciation_method_id: z.number().optional(),
  total_units: z.number().optional().nullable(),
  units_per_year: z.number().optional().nullable(),
  encoder: z.number().default(133),
  item_image: z.string().optional().nullable(),
});

// --- 4. Table Schema (For API GET responses) ---

export const assetTableDataSchema = z.object({
  id: z.number(),
  asset_tag: z.string().nullable().optional(),
  barcode: z.string().nullable(),
  rfid_code: z.string().nullable(),
  serial: z.string().nullable(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  security_tag: z.string().nullable().optional(),
  is_active_warning: z.number().default(0),
  condition: z.string(),
  condition_id: z.number().optional(),
  quantity: z.number().default(1),
  cost_per_item: z.number(),
  acquisition_cost: z.number().optional(),
  total: z.number(),
  residual_value: z.number().default(0),
  total_units: z.number().nullable().optional(),
  units_per_year: z.number().nullable().optional(),
  projected_value: z.number().optional(),
  date_acquired: z.string(),
  available_for_use_date: z.string().optional().nullable(),
  warranty_until: z.string().optional().nullable(),
  life_span: z.number(),
  life_months: z.number().optional(),
  record_status: z.enum(["active", "voided", "archived"]).default("active"),
  supplier_name: z.string().nullable().optional(),
  invoice_no: z.string().nullable().optional(),
  po_no: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),

  // Virtual fields from JOINs
  item_name: z.string(),
  item_image: z.string().nullable(),
  item_type_name: z.string(),
  classification_name: z.string(),
  department_name: z.string(),
  assigned_to_name: z.string(),

  // Raw IDs
  item_id: z.number(),
  department: z.number().nullable(),
  employee: z.number().nullable(),
  encoder: z.number().nullable(),
});

// --- 5. Exported Types ---

export type Department = z.infer<typeof departmentSchema>;
export type User = z.infer<typeof userSchema>;
export type AssetFormValues = z.infer<typeof assetFormSchema>;
export type AssetSubmissionData = z.infer<typeof assetSubmissionSchema>;
export type AssetTableData = z.infer<typeof assetTableDataSchema>;
export type ItemType = z.infer<typeof itemTypeSchema>;
export type ItemClassification = z.infer<typeof itemClassificationSchema>;
export type AssetClass = z.infer<typeof assetClassSchema>;
export type AssetCondition = z.infer<typeof assetConditionSchema>;
export type AssetSettings = z.infer<typeof assetSettingsSchema>;

// --- 6. Assignment Schemas ---

export const assetAssignmentSchema = z.object({
  assignment_id: z.number(),
  asset_id: z.number(),
  user_id: z.number(),
  assigned_by: z.number().nullable(),
  assigned_date: z.string(),
  expected_return_date: z.string().nullable(),
  actual_return_date: z.string().nullable(),
  assignment_status: z.enum(["Assigned", "Returned", "Lost", "Damaged"]),
  condition_on_assignment: z.string().nullable(),
  condition_on_return: z.string().nullable(),
  notes: z.string().nullable(),
  user_name: z.string().optional(),
  assigned_by_name: z.string().optional(),
});

export type AssetAssignment = z.infer<typeof assetAssignmentSchema>;

export const assignAssetFormSchema = z.object({
  user_id: z.number(),
  expected_return_date: z.date().optional().nullable(),
  condition_on_assignment: z.string(),
  notes: z.string().optional(),
});

export type AssignAssetFormValues = z.infer<typeof assignAssetFormSchema>;

export const returnAssetFormSchema = z.object({
  actual_return_date: z.date(),
  condition_on_return: z.string(),
  assignment_status: z.enum(["Returned", "Lost", "Damaged"]),
  notes: z.string().optional(),
});

export type ReturnAssetFormValues = z.infer<typeof returnAssetFormSchema>;

// --- 7. Detail Page Types for Ledger & Postings ---

export interface DepreciationPostingRow {
  id?: number;
  asset_id?: number;
  period: string;
  carrying_amount_before?: number;
  depreciation: number;
  surplus_transfer?: number;
  cost_valuation?: number;
  accumulated_depreciation?: number;
  accumulated_impairment?: number;
  carrying_amount_after?: number;
}

export interface CustodyTransferRow {
  id?: number;
  asset_id?: number;
  effective_date: string;
  from_department_id?: number;
  from_department_name?: string;
  to_department_id?: number;
  to_department_name?: string;
  to_user_id?: number;
  to_user_name?: string;
  condition?: string;
  reason?: string;
  recorded_by_name?: string;
}

export interface AccountingEventRow {
  id?: number;
  asset_id?: number;
  event_date: string;
  event_type: string;
  status?: string;
  impact?: number;
  fvlcd?: number;
  viu?: number;
  remarks?: string;
}

export interface JournalEntryRow {
  id?: number;
  asset_id?: number;
  entry_date: string;
  description: string;
  account_name: string;
  debit?: number;
  credit?: number;
}

export interface AuditLogRow {
  id?: number | string;
  logged_at: string;
  user_name: string;
  action: string;
  details: string;
}

export interface CostLineRow {
  id?: number;
  component_name?: string;
  amount: number;
  treatment?: string;
}

