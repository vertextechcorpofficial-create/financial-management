/**
 * Known PAS 8 Retrospective Restatements
 * Used when the system does not have a dedicated prior_period_adjustments table.
 */
export interface PAS8RestatementConfig {
  id: string;
  sourceJeNo: string;
  description: string;
  relatesFrom: string; // "2025-01-01"
  relatesTo: string;   // "2025-12-31"
  affectedLine: "profit_loss" | "oci" | "equity_direct";
  affectedGlCode: string;
  totalAmount: number; // e.g. -180000 (net of tax)
  spread: "monthly" | "single_date";
}

export const KNOWN_PAS8_RESTATEMENTS: PAS8RestatementConfig[] = [
  {
    id: "PPA-2026-0001",
    sourceJeNo: "JE-2026-0007",
    description: "Unrecorded 2025 depreciation, net of tax",
    relatesFrom: "2025-01-01",
    relatesTo: "2025-12-31",
    affectedLine: "profit_loss",
    affectedGlCode: "3900", // Current Net Income
    totalAmount: -180000,
    spread: "monthly", // -15,000 per month across 12 months of 2025
  },
];
