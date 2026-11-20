import type sample from "../fixtures/malaya.json";

export const registerKeys = ["corp", "policy", "classes", "securities", "priceHist", "lots", "debts", "holders",
  "subs", "certs", "transfers", "dividends", "charities", "grants", "periods", "recons", "review"] as const;
export type LedgerRegisters = Omit<Pick<typeof sample, typeof registerKeys[number]>, "periods"> & {
  periods: Record<string, { closedAt: string | null; accruedAt?: string; closedBy?: string }>;
};
