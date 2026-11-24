export const AGENCY_TYPES = {
  GOVERNMENT: "Government",
  BANK: "Bank",
  OTHER: "Other",
} as const;

export const DEADLINE_RULES = {
  END_OF_MONTH: "End of following month",
  FIXED_DAY: "Fixed day, following month",
} as const;

export const PENALTY_BASES = {
  NONE: "None / per agreement",
  MONTHLY: "Per month, prorated daily",
  DAILY: "Per day",
} as const;

export const AGENCY_PAGE_SIZE = 50;

export type AgencySettings = {
  displayName: string;
  fullName: string;
  agencyType: keyof typeof AGENCY_TYPES;
  programs: string[];
  referenceExample: string | null;
  paymentReferenceLabel: string;
  payoutOptions: string[];
  employerNumber: string | null;
  deadlineRule: keyof typeof DEADLINE_RULES;
  deadlineDay: number | null;
  penaltyBasis: keyof typeof PENALTY_BASES;
  penaltyRatePercent: string | null;
  reminderDays: number;
  catchUp: boolean;
  sendsBilling: boolean;
};

export type Agency = AgencySettings & {
  id: number;
  shortCode: string;
  isActive: boolean;
  revision: number;
};

export type AgencyPage = { agencies: Agency[]; hasMore: boolean };

export const AGENCY_HISTORY_FIELDS = {
  displayName: "Display name",
  fullName: "Full name",
  agencyType: "Agency type",
  programs: "Loan programs",
  referenceExample: "Reference example",
  paymentReferenceLabel: "Payment reference label",
  payoutOptions: "Payout options",
  employerNumber: "Employer number",
  deadlineRule: "Remittance deadline",
  deadlineDay: "Deadline day",
  penaltyBasis: "Late-payment penalty",
  penaltyRatePercent: "Penalty rate",
  reminderDays: "Reminder days",
  catchUp: "Add missed deductions to next month",
  sendsBilling: "Sends a monthly billing",
  isActive: "Status",
} as const satisfies Record<keyof AgencySettings | "isActive", string>;

export const AGENCY_HISTORY_ACTIONS = {
  CREATED: "Agency added",
  UPDATED: "Agency settings changed",
  ACTIVATED: "Agency activated",
  DEACTIVATED: "Agency deactivated",
} as const;

export type AgencyHistoryField = keyof typeof AGENCY_HISTORY_FIELDS;
export type AgencyHistoryValue = string | number | boolean | string[] | null;
export type AgencyHistoryValues = Partial<Record<AgencyHistoryField, AgencyHistoryValue>>;

export type AgencyHistoryEntry = {
  id: number;
  agencyCode: string;
  revision: number;
  action: keyof typeof AGENCY_HISTORY_ACTIONS;
  actorId: number;
  actorName: string;
  actorRole: string | null;
  occurredAt: string;
  before: AgencyHistoryValues | null;
  after: AgencyHistoryValues;
};

export type AgencyHistoryPage = { entries: AgencyHistoryEntry[]; hasMore: boolean };

export function parseAgencyList(text: string) {
  return text.split(",").map(item => item.trim()).filter(Boolean);
}
