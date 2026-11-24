import type sample from "../fixtures/malaya.json";
import type { CertificateEvent } from "../certificates";

export const registerKeys = ["corp", "policy", "classes", "securities", "priceHist", "lots", "debts", "holders",
  "subs", "certs", "transfers", "dividends", "charities", "grants", "periods", "recons", "review"] as const;
export type LedgerRegisters = Omit<Pick<typeof sample, typeof registerKeys[number]>, "periods" | "lots" | "dividends" | "transfers" | "certs"> & {
  periods: Record<string, { closedAt: string | null; accruedAt?: string; closedBy?: string }>;
  lots: (typeof sample.lots[number] & { openCost?: number })[];
  certs: (typeof sample.certs[number] & { cancelledAt?: string | null; voidedAt?: string; history?: CertificateEvent[] })[];
  transfers: (typeof sample.transfers[number] & { sourceCertId?: string; sourceCertIds?: string[]; voidedAt?: string; voidReason?: string })[];
  dividends: { id: string; date: string; recordDate: string; payDate: string; gross: number; perShare: number; paidAt?: string; cancelled?: boolean }[];
};
