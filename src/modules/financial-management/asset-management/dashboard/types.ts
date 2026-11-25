export interface AssetDashboardMetrics {
  costValuation: number;
  accumulatedDepreciationAndImpairment: number;
  carryingAmountPPE: number;
  depreciationYTD: number;
  heldForSale: number | null;
  assetsInUse: number;
}

export interface ClassCarryingAmount {
  className: string;
  carryingAmount: number;
  percentage: number;
}

export interface ComplianceAlert {
  id: string;
  type: "warning" | "approval" | "impairment" | "info" | "urgent" | "count";
  message: string;
  badge?: string;
  assetTag?: string;
}

export interface RecentAccountingEvent {
  id: string | number;
  date: string;
  assetTag: string;
  assetId: number | string;
  event: string;
  basis: string;
  amount: number;
}

export interface AssetDashboardData {
  asOfDate: string;
  standard: string;
  currency: string;
  metrics: AssetDashboardMetrics;
  carryingByClass: ClassCarryingAmount[];
  complianceAlerts: ComplianceAlert[];
  recentEvents: RecentAccountingEvent[];
}
