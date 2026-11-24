import { AssetTableData } from "../registration/types";

export interface AssetSummaryKPIs {
  groupCount: number;
  unitsInUse: number;
  disposedOrHeldForSale: number;
  projectedValue: number;
}

export interface AssetSummaryGroupRow {
  groupKey: string;
  itemName: string;
  itemType: string;
  classification: string;
  inUseCount: number;
  outCount: number;
  byDepartmentText: string;
  byConditionText: string;
  totalCost: number;
  accumDepAndImp: number;
  projectedValue: number;
  units: AssetTableData[];
}

export interface AssetSummaryData {
  asOfDate: string;
  kpis: AssetSummaryKPIs;
  groups: AssetSummaryGroupRow[];
  totalUnitsInUse: number;
  totalUnitsOut: number;
  totalCost: number;
  totalAccumDep: number;
  totalProjectedValue: number;
}
