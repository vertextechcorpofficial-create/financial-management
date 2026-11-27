/**
 * Barangay Asset Inventory System.
 *
 * The source of truth is the Barangay Asset Inventory System Developer Guide v1.2.
 * Where the guide and the LGU module disagree, the guide wins here: this system uses
 * the guide's projected value model, its condition and status sets, and its roles.
 */

import { monthsBetween } from "./shared/dates";

export type BrgyRole = "barangay_admin" | "property_custodian" | "encoder" | "viewer" | "municipal" | "system_admin";

export const BRGY_ROLE_LABELS: Record<BrgyRole, string> = {
  barangay_admin: "Barangay Admin",
  property_custodian: "Property Custodian",
  encoder: "Encoder",
  viewer: "Auditor / Viewer",
  municipal: "Municipal Property and Accounting",
  system_admin: "System Admin",
};

export type BrgyCondition = "Good" | "Fair" | "Needs Repair" | "Unserviceable";
export const BRGY_CONDITIONS: BrgyCondition[] = ["Good", "Fair", "Needs Repair", "Unserviceable"];

export type BrgyStatus =
  | "Unassigned"
  | "Active"
  | "Under Repair"
  | "Missing"
  | "For Disposal"
  | "Disposed"
  | "For Receiving"
  | "For Return";

export const BRGY_STATUSES: BrgyStatus[] = [
  "Unassigned",
  "Active",
  "Under Repair",
  "Missing",
  "For Disposal",
  "Disposed",
  "For Receiving",
  "For Return",
];

/** Section 6, the allowed moves. Anything else is refused. */
export const BRGY_STATUS_MOVES: Record<BrgyStatus, BrgyStatus[]> = {
  Unassigned: ["Active"],
  Active: ["Under Repair", "Missing", "For Disposal", "Unassigned"],
  "Under Repair": ["Active", "For Disposal"],
  Missing: ["Active", "For Disposal"],
  "For Disposal": ["Disposed", "Active"],
  Disposed: [],
  "For Receiving": ["Unassigned"],
  "For Return": ["Active", "Unassigned"],
};

/** Statuses that cannot be assigned, per section 4.2 and rule 14. */
export const UNASSIGNABLE: BrgyStatus[] = ["Missing", "For Disposal", "Disposed", "For Receiving", "For Return"];

/** Statuses that need a written reason before the change is allowed. */
export const REASON_REQUIRED: BrgyStatus[] = ["Missing", "For Disposal", "Disposed"];

export interface Brgy {
  id: number;
  code: string;
  name: string;
  district: string | null;
  contact_person: string | null;
  status: string;
}

export interface BrgyClassification {
  id: number;
  name: string;
  life_span_years: number | null;
  sort: number;
  status: string;
}

/** Table 2: item type belongs to one classification. */
export interface BrgyItemType {
  id: number;
  name: string;
  classification_id: number | null;
  status: string;
}

export interface BrgyOffice {
  id: number;
  barangay_id: number;
  name: string;
  sort: number;
  status: string;
}

export interface BrgyCustodian {
  id: number;
  barangay_id: number;
  full_name: string;
  position: string | null;
  status: string;
}

export interface BrgyAsset {
  id: number;
  asset_code: string;
  barangay_id: number;
  owner_type: "barangay" | "lgu";
  name: string;
  classification_id: number | null;
  item_type_id: number | null;
  barcode: string | null;
  tag_no: string | null;
  security_tag: string | null;
  serial_no: string | null;
  office_id: number | null;
  custodian_id: number | null;
  date_acquired: string | null;
  cost: number;
  quantity: number;
  life_span_years: number;
  condition: BrgyCondition;
  status: BrgyStatus;
  photo: string | null;
  remarks: string | null;
  is_draft: boolean;
  cancelled: boolean;
  cancel_reason: string | null;
  source: string | null;
  created_by: string | null;
}

export interface BrgyAssignment {
  id: number;
  asset_id: number;
  custodian_id: number | null;
  office_id: number | null;
  start_date: string | null;
  end_date: string | null;
  remarks: string | null;
  created_by: string | null;
}

export interface BrgyHistoryEntry {
  id: number;
  asset_id: number;
  action: string;
  from_value: string | null;
  to_value: string | null;
  remarks: string | null;
  actor: string | null;
  date_created: string | null;
}

export interface BrgyCount {
  id: number;
  barangay_id: number;
  year: number;
  status: "open" | "closed";
  opened_by: string | null;
  closed_by: string | null;
  remarks: string | null;
}

export interface BrgyCountLine {
  id: number;
  count_id: number;
  asset_id: number | null;
  result: "found" | "not_found" | "not_yet_recorded";
  condition: BrgyCondition | null;
  remarks: string | null;
  marked_by: string | null;
  pending_asset_name: string | null;
}

export interface BrgyDisposal {
  id: number;
  asset_id: number;
  requested_by: string | null;
  reason: string;
  status: "pending" | "approved" | "returned" | "completed";
  approved_by: string | null;
  decision_remark: string | null;
  method: string | null;
  disposal_note: string | null;
}

export interface BrgyTransfer {
  id: number;
  asset_id: number;
  direction: "lgu_to_barangay" | "barangay_to_lgu";
  from_barangay_id: number | null;
  to_barangay_id: number | null;
  status: "for_receiving" | "received" | "rejected" | "for_return" | "returned" | "declined";
  remark: string | null;
  defect: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decision_remark: string | null;
  /** the LGU asset this transfer came from, kept so the link survives their edits */
  lgu_asset_id?: number | null;
  source_system?: string | null;
}

export interface BrgySettings {
  id: number;
  barangay_id: number | null;
  salvage_percent: number;
  approval_required: boolean;
  valuation_method: string;
  life_equipment: number | null;
  life_machinery: number | null;
  life_furniture: number | null;
  life_other: number | null;
}

/**
 * Section 7: projected value = cost x (1 - years used / life span), never below zero.
 * The salvage percent from settings is the floor, defaulting to zero per the guide.
 */
/** Whole months between two dates, the way a year of use is counted on paper. */
function monthsUsed(from: string | null, to: string): number {
  if (!from) return 0;
  // string arithmetic, so a machine in another time zone cannot shift a month boundary
  return monthsBetween(from, to);
}

export function projectedValue(asset: Pick<BrgyAsset, "cost" | "life_span_years" | "date_acquired">, asOf: string, salvagePercent = 0): number {
  const cost = Number(asset.cost ?? 0);
  const life = Number(asset.life_span_years ?? 0);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  const floor = Math.round(cost * (Number(salvagePercent) / 100) * 100) / 100;
  if (!Number.isFinite(life) || life <= 0) return Math.max(floor, cost);
  // two calendar years is exactly two years, not 1.9986 of them
  const yearsUsed = monthsUsed(asset.date_acquired, asOf) / 12;
  const value = cost * (1 - yearsUsed / life);
  return Math.round(Math.max(floor, value, 0) * 100) / 100;
}

/** Section 7: the total value of a record is the projected value times the quantity. */
export function projectedTotal(asset: BrgyAsset, asOf: string, salvagePercent = 0): number {
  return Math.round(projectedValue(asset, asOf, salvagePercent) * Math.max(1, Number(asset.quantity ?? 1)) * 100) / 100;
}

export function canAssign(status: BrgyStatus): boolean {
  return !UNASSIGNABLE.includes(status);
}

export function canMove(from: BrgyStatus, to: BrgyStatus): boolean {
  return BRGY_STATUS_MOVES[from]?.includes(to) ?? false;
}

/** Section 5: names are compared ignoring case and extra spaces. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}
