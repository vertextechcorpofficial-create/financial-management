export interface LookupOption {
  id: number;
  code: string;
  name: string;
  description?: string | null;
}

export interface ApprovalEventTypeOption {
  id: number;
  code: string;
  name: string;
  requires_approval: boolean;
}

export interface AssetClassRow {
  id: number | null; // null for newly added unsaved rows
  tempId?: string;
  name: string;
  tag_prefix: string;
  measurement_model_id: number;
  depreciation_method_id: number;
  useful_life_years: number; // stored as default_life_months = years * 12 in DB
  residual_percent: number;
  in_use: boolean;
}

export interface GeneralSettingsData {
  id: number;
  capitalisation_threshold: number;
  depreciation_convention_id: number;
  transfer_revaluation_surplus: boolean; // false = on derecognition only, true = as asset is used
  approval_enabled: boolean;
  approval_threshold: number;
}

export interface AssetSettingsPayload {
  hasClosedPeriod: boolean;
  closedThrough: string | null;
  settings: GeneralSettingsData;
  classes: AssetClassRow[];
  eventTypes: ApprovalEventTypeOption[];
  conventions: LookupOption[];
  measurementModels: LookupOption[];
  depreciationMethods: LookupOption[];
}

export interface SaveAssetSettingsRequest {
  settings: {
    capitalisation_threshold: number;
    depreciation_convention_id: number;
    transfer_revaluation_surplus: boolean;
    approval_enabled: boolean;
    approval_threshold: number;
  };
  classes: {
    id: number | null;
    name: string;
    tag_prefix?: string;
    measurement_model_id: number;
    depreciation_method_id: number;
    useful_life_years: number;
    residual_percent: number;
  }[];
  deletedClassIds: number[];
  eventTypes: {
    id: number;
    requires_approval: boolean;
  }[];
}
