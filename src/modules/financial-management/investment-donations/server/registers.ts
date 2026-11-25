import type sample from "../fixtures/malaya.json";
import type { CertificateEvent } from "../certificates";

export const registerKeys = ["corp", "policy", "classes", "securities", "priceHist", "lots", "debts", "holders",
  "subs", "certs", "transfers", "dividends", "charities", "grants", "periods", "recons", "review"] as const;
export type CapitalIncrease = { id: string; date: string; from: number; to: number; secRef: string; secApprovedDate?: string };
export type LedgerRegisters = Omit<Pick<typeof sample, typeof registerKeys[number]>, "periods" | "lots" | "dividends" | "transfers" | "certs" | "classes" | "securities" | "holders" | "charities" | "corp" | "priceHist" | "recons"> & {
  corp: Omit<typeof sample.corp, "increases"> & { increases: CapitalIncrease[] };
  priceHist: Record<string, { date: string; price: number; src: string; source?: string }[]>;
  recons: Record<string, { cash: Record<string, string | number | null>; units: Record<string, string | number | null>; notes: Record<string, string>; by?: string; at?: string; snap: Record<string, number> }>;
  periods: Record<string, { closedAt: string | null; accruedAt?: string; accruedBy?: string; closedBy?: string; reopenedAt?: string; reopenReason?: string | null }>;
  lots: (typeof sample.lots[number] & { openCost?: number })[];
  certs: (typeof sample.certs[number] & { cancelledAt?: string | null; voidedAt?: string; history?: CertificateEvent[] })[];
  transfers: (typeof sample.transfers[number] & { sourceCertId?: string; sourceCertIds?: string[]; voidedAt?: string; voidReason?: string })[];
  dividends: { id: string; date: string; recordDate: string; payDate: string; gross: number; perShare: number; paidAt?: string; cancelled?: boolean }[];
  classes: (typeof sample.classes[number] & { active?: boolean; inactive?: boolean; account?: string })[];
  securities: Record<string, typeof sample.securities.PHEQ & { active?: boolean; inactive?: boolean; account?: string; priceSource?: string }>;
  holders: (typeof sample.holders[number] & { active?: boolean; inactive?: boolean })[];
  charities: (typeof sample.charities[number] & { active?: boolean; inactive?: boolean })[];
  calls?: { id: string; subId: string; date: string; dueDate: string; boardRef: string }[];
  capitalIncreases?: CapitalIncrease[];
  accountMappings?: { id: string; account: string; coaCode?: string; description?: string }[];
  masterRevisions?: Record<string, number>;
  settingsLocks?: { fyStart: boolean; par: boolean };
  dataToolsEnabled?: boolean;
  canExportFullLedger?: boolean;
  periodEvents?: { id: number; month: string; actor: number; action: string; entryId: string | null; reason: string | null; occurredAt: string }[];
};
