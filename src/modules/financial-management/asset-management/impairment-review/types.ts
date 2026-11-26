export interface IndicatorItem {
  id: number;
  code: string;
  label: string;
  type: "condition" | "idle" | "previously_impaired" | "obsolete" | "market" | "interest" | "other";
}

export interface ReviewLineItem {
  id: number;
  review_id: number;
  asset_id: number;
  asset_tag: string;
  item_name: string;
  classification_name: string;
  department_name: string;
  condition_name: string;
  carrying_amount: number;
  indicators: IndicatorItem[];
  is_obsolete: boolean;
  pending_approval_notice?: string | null;
  conclusion_id: number | null;
  conclusion_code?: string | null;
  conclusion_name?: string | null;
  fvlcd?: number | null;
  viu?: number | null;
  fvlcts?: number | null;
  cgu_name?: string | null;
  new_remaining_months?: number | null;
  new_residual_value?: number | null;
  loss_amount?: number | null;
  notes?: string | null;
}

export interface ImpairmentKPIData {
  reviewDate: string;
  reviewName: string;
  assetsWithIndicators: number;
  concludedCount: number;
  totalCount: number;
  carryingAmountFlagged: number;
}

export interface ImpairmentReviewData {
  hasActiveReview: boolean;
  review: {
    id: number;
    review_date: string;
    review_name: string;
    status_id: number; // 1 = OPEN, 2 = SIGNED
    status_code: string;
    interest_rates_increased: boolean;
    idle_months_threshold: number;
    maintenance_pct_threshold: number;
    market_classes: number[];
    market_class_names?: string[];
  } | null;
  kpis: ImpairmentKPIData | null;
  lines: ReviewLineItem[];
  conclusions: Array<{
    id: number;
    code: string;
    name: string;
    event_type_id: number | null;
  }>;
}

export interface StartReviewPayload {
  review_name: string;
  review_date: string;
}

export interface UpdateLinePayload {
  conclusion_id?: number | null;
  fvlcd?: number | null;
  viu?: number | null;
  fvlcts?: number | null;
  cgu_name?: string | null;
  notes?: string | null;
  new_remaining_months?: number | null;
  new_residual_value?: number | null;
  loss_amount?: number | null;
  is_obsolete?: boolean;
}
