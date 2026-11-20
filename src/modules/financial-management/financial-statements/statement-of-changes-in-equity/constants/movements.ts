import { SCEMovementTag } from "../types";

export interface MovementRowConfig {
  id: string;
  tag: SCEMovementTag;
  label: string;
  indent: number;
  standardRef?: string;
  isGroupHeader?: boolean;
  isSubtotal?: boolean;
  isEnding?: boolean;
  isExpandableParent?: boolean;
}

export const STATEMENT_ROWS_STRUCTURE: MovementRowConfig[] = [
  // ─── Group 1: Beginning Balance ───
  {
    id: "group-beginning",
    tag: "beginning_balance",
    label: "Beginning balance",
    indent: 0,
    isGroupHeader: true,
    isExpandableParent: true,
  },
  {
    id: "row-balance-reported",
    tag: "beginning_balance",
    label: "Balance as previously reported",
    indent: 1,
  },
  {
    id: "row-ppa",
    tag: "prior_period_adjustment",
    label: "Prior period adjustments / correction of errors",
    indent: 1,
    standardRef: "PAS 8",
  },
  {
    id: "row-balance-restated",
    tag: "balance_restated",
    label: "Balance as restated",
    indent: 0,
    isSubtotal: true,
  },

  // ─── Group 2: Changes in Equity ───
  {
    id: "group-changes",
    tag: "total_changes",
    label: "Changes in equity for the period",
    indent: 0,
    isGroupHeader: true,
    isExpandableParent: true,
  },
  {
    id: "row-profit",
    tag: "net_income",
    label: "Profit / (Loss) for the period",
    indent: 1,
    standardRef: "Income Statement",
  },
  {
    id: "row-oci",
    tag: "oci_revaluation",
    label: "Other comprehensive income",
    indent: 1,
  },
  {
    id: "row-tci",
    tag: "total_comprehensive_income",
    label: "Total comprehensive income for the period",
    indent: 0,
    isSubtotal: true,
    standardRef: "PAS 1 ¶106(a)",
  },
  {
    id: "row-issuance",
    tag: "share_issuance",
    label: "Issuance of share capital",
    indent: 1,
  },
  {
    id: "row-dividends",
    tag: "dividends_cash",
    label: "Dividends declared",
    indent: 1,
  },
  {
    id: "row-appropriation",
    tag: "appropriation_transfer",
    label: "Appropriation / (Reversal) of retained earnings",
    indent: 1,
    standardRef: "Nets to ₱0.00",
  },
  {
    id: "row-treasury",
    tag: "treasury_acquisition",
    label: "Acquisition / (Reissuance) of treasury shares",
    indent: 1,
  },
  {
    id: "row-total-changes",
    tag: "total_changes",
    label: "Total changes in equity for the period",
    indent: 0,
    isSubtotal: true,
  },

  // ─── Group 3: Ending Balance ───
  {
    id: "group-ending",
    tag: "ending_balance",
    label: "Ending balance",
    indent: 0,
    isGroupHeader: true,
    isExpandableParent: true,
  },
  {
    id: "row-ending-balance",
    tag: "ending_balance",
    label: "Ending balance",
    indent: 0,
    isEnding: true,
  },
];
