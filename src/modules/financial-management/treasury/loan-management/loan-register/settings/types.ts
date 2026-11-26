export type AccountKind = "BANK" | "CASH" | "EWALLET";
export type HolidayKind = "REGULAR" | "SPECIAL" | "LOCAL";

/** A `loan_payment_account` row with its GL account resolved. */
export interface SettingsAccount {
  id: number;
  name: string;
  kind: AccountKind;
  coaId: number;
  glCode: string;
  glTitle: string;
  chargePct: number;
  isActive: boolean;
  sort: number;
  /** Payments already recorded against this account; a hint, never a delete blocker. */
  paymentCount: number;
}

export interface SettingsHoliday {
  id: number;
  holidayDate: string;
  name: string;
  kind: HolidayKind;
}

/** A chart-of-accounts row the pickers offer. */
export interface GlAccountOption {
  coaId: number;
  glCode: string;
  accountTitle: string;
}

export interface SettingsMapping {
  mappingKey: string;
  coaId: number | null;
  glCode: string | null;
  accountTitle: string | null;
  /** The card this line sits under, from `mapping_group`; null until the column carries a value. */
  mappingGroup: string | null;
  mappingLabel: string | null;
  /** The deck's "Usage Description", from `usage_description`. */
  description: string | null;
  updatedAt: string | null;
}

export interface SettingsLock {
  id: number;
  lockedThrough: string;
  note: string;
  lockedByName: string | null;
  lockedAt: string | null;
  reopenedAt: string | null;
}

export interface SettingsValue {
  settingKey: string;
  settingValue: string;
  updatedAt: string | null;
}

export interface SettingsData {
  accounts: SettingsAccount[];
  holidays: SettingsHoliday[];
  mappings: SettingsMapping[];
  chartAccounts: GlAccountOption[];
  locks: SettingsLock[];
  values: SettingsValue[];
  /** The open lock, or null when the books are open. */
  currentLock: SettingsLock | null;
  unmappedKeys: string[];
}
