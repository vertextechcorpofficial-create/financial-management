import type { DepositSlip, DepositSlipDetail, ResolvedJournalEntry, UndepositedAsset } from "../types";

export type DepositAccountOption = {
  bankId: number;
  label: string;
  /** The two halves of that label, so a picker can stack them. */
  bankName?: string | null;
  accountNumber?: string | null;
};

export type DepositAccountTotals = {
  /** Active accounts that carry a GL link, so a deposit can post. */
  eligible: number;
  /** Every active account, linked or not. */
  active: number;
};

export type DepositSnapshot = {
  assets: UndepositedAsset[];
  slips: DepositSlip[];
  accounts: DepositAccountOption[];
  accountTotals: DepositAccountTotals;
};

async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
    missingMappingKeys?: string[];
    fieldErrors?: Record<string, string[]>;
  };

  if (!response.ok || body.success === false) {
    const error = new Error(body.error || "Request failed.") as Error & {
      fieldErrors?: Record<string, string[]>;
      missingMappingKeys?: string[];
    };
    error.fieldErrors = body.fieldErrors;
    error.missingMappingKeys = body.missingMappingKeys;
    throw error;
  }
  return body.data as T;
}

export async function fetchDepositSnapshot(): Promise<DepositSnapshot> {
  return unwrap<DepositSnapshot>(await fetch("/api/fm/treasury/bank-management-v2/bank-deposit/assets", { cache: "no-store" }));
}

export type CreateSlipPayload = {
  bankAccountId: number;
  depositDate: string;
  slipNo: string;
  remarks: string | null;
  cashIds: number[];
  checkIds: number[];
};

export type CreateSlipResponse = {
  slip: DepositSlip;
  postingBlocked: { message: string; missingMappingKeys: string[] } | null;
  notice: string | null;
};

export async function createSlip(payload: CreateSlipPayload): Promise<CreateSlipResponse> {
  return unwrap<CreateSlipResponse>(
    await fetch("/api/fm/treasury/bank-management-v2/bank-deposit/slips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function cancelSlip(slipId: number, reason: string): Promise<DepositSlip> {
  return unwrap<DepositSlip>(
    await fetch(`/api/fm/treasury/bank-management-v2/bank-deposit/slips/${slipId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }),
  );
}

/** Prepared -> Deposited: the bank has the money, so cash lines are Deposited and checks For clearing. */
export type DepositConfirmation = { depositDate?: string; slipNo?: string };

export async function markSlipDeposited(slipId: number, confirmation: DepositConfirmation = {}): Promise<DepositSlip> {
  return unwrap<{ slip: DepositSlip }>(
    await fetch(`/api/fm/treasury/bank-management-v2/bank-deposit/slips/${slipId}/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmation),
    }),
  ).then((payload) => payload.slip);
}

/** Every line both dialogs will post (E07 for cash, E12 for cheques); the server resolves the Linked GL. */
export async function previewDepositSlip(payload: {
  bankAccountId: number;
  cashTotal: number;
  checkTotal: number;
}): Promise<DepositPreview> {
  return unwrap<DepositPreview>(
    await fetch("/api/fm/treasury/bank-management-v2/bank-deposit/slips/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export type DepositPreview = {
  entries: ResolvedJournalEntry[];
  account: { bankId: number; label: string; glCoaId: number | null; glCode: string | null; glTitle: string | null; glFallback: boolean };
};

/** Itemised contents for the read-only slip modal (P17). */
export async function fetchDepositSlip(slipId: number): Promise<DepositSlipDetail> {
  return unwrap<DepositSlipDetail>(
    await fetch(`/api/fm/treasury/bank-management-v2/bank-deposit/slips/${slipId}`, { cache: "no-store" }),
  );
}
