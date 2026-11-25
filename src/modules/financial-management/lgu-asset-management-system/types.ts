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
  disposed_at: string | null;
  disposal_reason: string | null;
  book_value_at_disposal: number | null;
  unit_of_measure: string;
  is_bulk_child: boolean;
  bulk_batch_id: string | null;
  batch_total: number | null;
  rounding_remainder: number | null;
  voucher_no: string | null;
  status: string;
}

/** One voucher, many units. The voucher total is the source of truth. */
export interface BulkAssetInput {
  description: string;
  class_id: number;
  quantity: number;
  batch_total: number;
  acquisition_date: string;
  life_months?: number | null;
  office_id?: number | null;
  condition_id?: number | null;
  mode_of_acquisition?: ModeOfAcquisition;
  fund_source_id?: number | null;
  supplier?: string | null;
  voucher_no?: string | null;
  brand?: string | null;
  model?: string | null;
  unit_of_measure?: string | null;
  remarks?: string | null;
}

export interface BulkCreateResult {
  batchId: string;
  unitCost: number;
  remainder: number;
  created: LguAsset[];
}

/** Splits a voucher total across units and reports the unallocated centavos. */
export function splitBatchTotal(batchTotal: number, quantity: number): { unitCost: number; remainder: number } {
  const safeQty = Math.max(1, Math.floor(quantity));
  const total = Number(batchTotal) || 0;
  const unitCost = Math.round((total / safeQty) * 100) / 100;
  const remainder = Math.round((total - unitCost * safeQty) * 100) / 100;
  return { unitCost, remainder };
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
  unit_of_measure?: string | null;
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
  page: number;
  pageSize: number;
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

/* ---------- physical count ---------- */

export type CountStatus = "draft" | "counting" | "locked" | "submitted";

export type CountResolution = "pending" | "confirmed" | "moved" | "missing";

export interface LguCountSession {
  id: number;
  count_no: string;
  as_of_date: string | null;
  office_id: number | null;
  class_id: number | null;
  session_status: CountStatus;
  counted_by: string | null;
  verified_by: string | null;
  witnessed_by: string | null;
  remarks: string | null;
  total_lines: number;
  counted_lines: number;
  not_found_lines: number;
  pending_lines: number;
  status: string;
}

export interface LguCountLine {
  id: number;
  count_id: number;
  asset_id: number | null;
  expected_property_no: string | null;
  expected_description: string | null;
  expected_officer: string | null;
  expected_office_id: number | null;
  found: boolean | null;
  condition_id: number | null;
  location_seen: string | null;
  resolution: CountResolution;
  remarks: string | null;
  counted_at: string | null;
  counted_by: string | null;
  is_found_at_station: boolean;
  station_description: string | null;
  station_cost: number | null;
  station_location: string | null;
  approved_by: string | null;
  status: string;
}

export interface CountSessionSummary {
  session: LguCountSession;
  totalLines: number;
  counted: number;
  notFound: number;
  pendingResolution: number;
}

export interface CountLookups {
  offices: LguOffice[];
  classes: LguAssetClass[];
  conditions: LguCondition[];
}

export interface CountSessionsResponse {
  sessions: CountSessionSummary[];
  lookups: CountLookups;
}

export interface CountSessionInput {
  as_of_date: string;
  office_id?: number | null;
  class_id?: number | null;
  counted_by?: string | null;
  verified_by?: string | null;
  witnessed_by?: string | null;
  remarks?: string | null;
}

export interface CountLineRow {
  line: LguCountLine;
  asset: LguAsset | null;
}

export interface CountStats {
  total: number;
  counted: number;
  found: number;
  notFound: number;
  pendingResolution: number;
  foundAtStation: number;
  readyToLock: boolean;
}

export interface CountSessionDetail {
  session: LguCountSession;
  lines: CountLineRow[];
  stats: CountStats;
  lookups: CountLookups;
}

export interface CountLinesResponse {
  session: LguCountSession;
  lines: CountLineRow[];
  stats: CountStats;
}

export const COUNT_STATUS_LABELS: Record<CountStatus, string> = {
  draft: "Draft",
  counting: "Counting",
  locked: "Locked",
  submitted: "Submitted",
};

export const RESOLUTION_LABELS: Record<CountResolution, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  moved: "Moved",
  missing: "Missing",
};

/** PC-YEAR-SEQ, the count session identity. */
export function countPrefix(year: number): string {
  return "PC-" + year + "-";
}

/* ---------- count reconciliation and report ---------- */

export interface CountReportRow {
  propertyNo: string;
  article: string;
  description: string;
  unit: string;
  unitValue: number;
  dateAcquired: string | null;
  balanceQty: number;
  onHandQty: number;
  shortageQty: number;
  shortageValue: number;
  remarks: string;
}

export interface CountReportGroup {
  className: string;
  rows: CountReportRow[];
  totalQty: number;
  totalValue: number;
  totalShortageQty: number;
  totalShortageValue: number;
}

export interface CountReportSummary {
  totalLines: number;
  found: number;
  missing: number;
  moved: number;
  notCounted: number;
  totalValue: number;
  totalShortageValue: number;
}

export interface CountReport {
  form: "rpcppe" | "rpcsp";
  session: LguCountSession;
  groups: CountReportGroup[];
  summary: CountReportSummary;
}

export interface ResolveLineInput {
  countId: number;
  lineId: number;
  resolution: "missing" | "moved";
  toOfficeId?: number | null;
  toOfficer?: string | null;
  locationSeen?: string | null;
  remarks?: string | null;
  encoder?: string | null;
}

/* ---------- disposal ---------- */

export interface DisposalCandidate {
  asset: LguAsset;
  documents: number;
  bookValue: number;
}

export interface DisposalResponse {
  candidates: DisposalCandidate[];
  total: number;
  page: number;
  pageSize: number;
  offices: LguOffice[];
  conditions: LguCondition[];
}

export interface DisposalInput {
  assetId: number;
  docNo: string;
  docDate: string;
  reason: string;
  remarks?: string | null;
  encoder?: string | null;
}

/** Straight line, straight from the GAM: 5 percent residual, life in months. */
export function monthlyDepreciation(cost: number, residual: number, lifeMonths: number | null): number {
  const life = Number(lifeMonths ?? 0);
  if (!Number.isFinite(life) || life <= 0) return 0;
  const depreciable = Math.max(0, cost - residual);
  return Math.round((depreciable / life) * 100) / 100;
}

function monthsBetween(from: string | null, to: string): number {
  if (!from) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return Math.max(0, months);
}

export function bookValueAt(asset: Pick<LguAsset, "cost" | "residual_value" | "life_months" | "available_for_use_date" | "acquisition_date">, at: string): number {
  const cost = Number(asset.cost ?? 0);
  const residual = Number(asset.residual_value ?? 0);
  const monthly = monthlyDepreciation(cost, residual, asset.life_months);
  const elapsed = Math.min(monthsBetween(asset.available_for_use_date ?? asset.acquisition_date, at), Number(asset.life_months ?? 0));
  const value = cost - monthly * elapsed;
  return Math.round(Math.max(residual, value) * 100) / 100;
}

export interface DepreciationRow {
  asset: LguAsset;
  monthly: number;
  monthsElapsed: number;
  accumulated: number;
  bookValue: number;
}

export interface LedgerRow {
  className: string;
  count: number;
  cost: number;
  accumulated: number;
  bookValue: number;
}

export interface ReportsResponse {
  asOf: string;
  classes: LguAssetClass[];
  ledger: LedgerRow[];
  schedule: DepreciationRow[];
  totals: { count: number; cost: number; accumulated: number; bookValue: number };
}
