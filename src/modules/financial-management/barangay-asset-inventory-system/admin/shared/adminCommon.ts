import type { ReferenceKind } from "../services/brgyAdmin";

/**
 * The administration screens share these constants. Table 5 keeps user management and the
 * reference lists with the System Admin, so the rules that describe them live here once.
 */

export const ROLES: { value: string; label: string }[] = [
  { value: "barangay_admin", label: "Barangay Admin" },
  { value: "property_custodian", label: "Property Custodian" },
  { value: "encoder", label: "Encoder" },
  { value: "viewer", label: "Auditor / Viewer" },
  { value: "municipal", label: "Municipal Property and Accounting" },
  { value: "system_admin", label: "System Admin" },
];

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

/** The four barangay roles need a barangay. Municipal and System Admin stand above all barangays. */
export const BARANGAY_ROLES = ["barangay_admin", "property_custodian", "encoder", "viewer"];

export const JSON_HEADERS = { "Content-Type": "application/json" };

export const BRGY_CODE_HELP = "the code is used in the asset ID, for example AST-BRG01-0001";

export const keyOf = (email: string) => email.trim().toLowerCase();

export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface ReferenceColumn {
  field: string;
  label: string;
  kind: "text" | "select";
  options?: { value: string; label: string }[];
}

export interface ReferenceRow {
  id: number;
  values: Record<string, string>;
}

export interface ListSpec {
  kind: ReferenceKind;
  title: string;
  hint?: string;
  columns: ReferenceColumn[];
  rows: ReferenceRow[];
}
