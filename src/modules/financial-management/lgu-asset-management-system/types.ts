/**
 * LGU Asset Management System: module level types.
 * Owned by this module. Nothing here is imported from another module.
 */

/* ---------- workspace scaffold types (landing page) ---------- */

export type WorkspaceLayer = "route" | "api" | "module";

export interface WorkspaceLayerStatus {
  layer: WorkspaceLayer;
  label: string;
  path: string;
  online: boolean;
}

/* ---------- lookup types ---------- */

export interface LguAssetClass {
  id: number;
  code: string;
  name: string;
  property_prefix: string;
  default_life_months: number | null;
  depreciable: boolean;
  sort: number | null;
  status: string;
}

export interface LguOffice {
  id: number;
  code: string;
  name: string;
  sort: number | null;
  status: string;
}

export interface LguFundSource {
  id: number;
  code: string;
  name: string;
  sort: number | null;
  status: string;
}

export interface LguCondition {
  id: number;
  name: string;
  is_serviceable: boolean;
  sort: number | null;
  status: string;
}

export interface RegistryLookups {
  classes: LguAssetClass[];
  offices: LguOffice[];
  fundSources: LguFundSource[];
  conditions: LguCondition[];
}

/* ---------- asset record ---------- */

export type ModeOfAcquisition =
  | "purchase"
  | "donation"
  | "transfer"
  | "confiscation"
  | "others";

export type AssetRecordStatus =
  | "active"
  | "transferred"
  | "unserviceable"
  | "disposed"
  | "missing";

export interface LguAsset {
  id: number;
  property_no: string;
  description: string;
  class_id: number | null;
  is_semi_expendable: boolean;
  cost: number | null;
  acquisition_date: string | null;
  available_for_use_date: string | null;
  life_months: number | null;
  residual_value: number | null;
  office_id: number | null;
  accountable_officer_id: number | null;
  accountable_officer_name: string | null;
  location: string | null;
  condition_id: number | null;
  mode_of_acquisition: ModeOfAcquisition;
  fund_source_id: number | null;
  donor_name: string | null;
  supplier: string | null;
  po_no: string | null;
  invoice_no: string | null;
  iar_no: string | null;
  par_no: string | null;
  ics_no: string | null;
  serial_no: string | null;
  brand: string | null;
  model: string | null;
  remarks: string | null;
  record_status: AssetRecordStatus;
  status: string;
}

/** Fields a clerk may write. The property number is never user supplied. */
export interface LguAssetInput {
  description: string;
  class_id: number;
  cost: number;
  acquisition_date: string;
  available_for_use_date?: string | null;
  life_months?: number | null;
  office_id?: number | null;
  accountable_officer_id?: number | null;
  accountable_officer_name?: string | null;
  location?: string | null;
  condition_id?: number | null;
  mode_of_acquisition?: ModeOfAcquisition;
  fund_source_id?: number | null;
  donor_name?: string | null;
  supplier?: string | null;
  po_no?: string | null;
  invoice_no?: string | null;
  iar_no?: string | null;
  serial_no?: string | null;
  brand?: string | null;
  model?: string | null;
  remarks?: string | null;
  /** Legacy numbers from paper records. When given, it is used verbatim. */
  property_no?: string | null;
}

export interface AssetRegistryQuery {
  q?: string;
  classId?: number | null;
  officeId?: number | null;
  recordStatus?: AssetRecordStatus | null;
  page?: number;
  pageSize?: number;
}

export interface AssetRegistryResponse {
  assets: LguAsset[];
  total: number;
  page: number;
  pageSize: number;
  lookups: RegistryLookups;
}

/* ---------- rules ---------- */

/** GAM for LGUs, Section 4 (ee): PPE at 15000 and above with a life over one year. */
export const PPE_THRESHOLD = 15000;

/** Residual value is five percent of cost, GAM for LGUs Section 4 (ff). */
export const RESIDUAL_PERCENT = 0.05;

export function isSemiExpendable(cost: number | null | undefined, lifeMonths: number | null | undefined): boolean {
  const value = Number(cost ?? 0);
  const life = Number(lifeMonths ?? 0);
  if (!Number.isFinite(value) || value <= 0) return true;
  const moreThanOneYear = life > 12;
  return !(value >= PPE_THRESHOLD && moreThanOneYear);
}

export function computeResidual(cost: number | null | undefined): number {
  const value = Number(cost ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * RESIDUAL_PERCENT * 100) / 100;
}

export const MODE_LABELS: Record<ModeOfAcquisition, string> = {
  purchase: "Purchase",
  donation: "Donation",
  transfer: "Transfer",
  confiscation: "Confiscation",
  others: "Others",
};

export const RECORD_STATUS_LABELS: Record<AssetRecordStatus, string> = {
  active: "Active",
  transferred: "Transferred",
  unserviceable: "Unserviceable",
  disposed: "Disposed",
  missing: "Missing",
};

/* ---------- custody ---------- */

export type DocType = "PAR" | "ICS" | "IAR" | "PCV" | "IIRUP";

export type MovementType = "issue" | "transfer" | "return" | "dispose" | "count_adjust";

export interface LguAssetDocument {
  id: number;
  asset_id: number;
  doc_type: DocType;
  doc_no: string;
  doc_date: string | null;
  issued_to: string | null;
  issued_to_office_id: number | null;
  remarks: string | null;
  status: string;
}

export interface LguAssetMovement {
  id: number;
  asset_id: number;
  movement: MovementType;
  movement_date: string | null;
  from_office_id: number | null;
  to_office_id: number | null;
  from_officer: string | null;
  to_officer: string | null;
  document_id: number | null;
  remarks: string | null;
  created_by: string | null;
  status: string;
}

export interface CustodyRow {
  asset: LguAsset;
  lastMovementDate: string | null;
  documentCount: number;
}

export interface CustodyResponse {
  rows: CustodyRow[];
  total: number;
  officers: string[];
  offices: LguOffice[];
}

export interface AssetHistory {
  asset: LguAsset;
  documents: LguAssetDocument[];
  movements: LguAssetMovement[];
}

export interface CustodyTransferInput {
  assetId: number;
  toOfficer: string;
  toOfficeId: number | null;
  docDate: string;
  /** Number printed on the paper PAR or ICS. Never generated by the system. */
  docNo: string;
  remarks?: string | null;
  encoder?: string | null;
}

export interface CustodyReturnInput {
  assetId: number;
  remarks?: string | null;
  encoder?: string | null;
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  PAR: "Property Acknowledgment Receipt",
  ICS: "Inventory Custodian Slip",
  IAR: "Inspection and Acceptance Report",
  PCV: "Property Clearance Voucher",
  IIRUP: "Inventory and Inspection Report of Unserviceable Property",
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  issue: "Issued",
  transfer: "Transferred",
  return: "Returned",
  dispose: "Disposed",
  count_adjust: "Count adjustment",
};

/** PPE gets a PAR, semi-expendable gets an ICS. GAM for LGUs. */
export function custodyFormFor(asset: Pick<LguAsset, "is_semi_expendable">): DocType {
  return asset.is_semi_expendable ? "ICS" : "PAR";
}
