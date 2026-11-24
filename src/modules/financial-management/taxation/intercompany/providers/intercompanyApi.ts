import type { ConfiguredWithholdingRate } from "../withholding";
import type { IntercompanyPayload } from "../types";

/** Talks to this module's one route. Components never fetch. */

export class IntercompanyApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntercompanyApiError";
  }
}

interface Envelope {
  success?: boolean;
  data?: IntercompanyPayload;
  error?: string;
}

export async function fetchIntercompany(
  companyId: number | null,
  year: number,
  fresh = false,
): Promise<IntercompanyPayload> {
  const params = new URLSearchParams({ year: String(year) });
  if (companyId !== null) params.set("companyId", String(companyId));
  if (fresh) params.set("refresh", "1");

  const response = await fetch(`/api/fm/taxation/intercompany?${params.toString()}`, { cache: "no-store" });
  const text = await response.text().catch(() => "");

  let payload: Envelope = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Envelope;
    } catch {
      throw new IntercompanyApiError(`The intercompany endpoint returned a non-JSON response (${response.status}).`);
    }
  }

  if (!response.ok || !payload.success || !payload.data) {
    throw new IntercompanyApiError(
      payload.error ?? `The intercompany endpoint failed (${response.status}).`,
    );
  }
  return payload.data;
}

/** One row of `tax_withholding_rates` as the rates desk returns it. */
interface RatesWithholdingRow {
  incomeType: ConfiguredWithholdingRate["incomeType"];
  rateTier: string | null;
  rate: number;
  requiresTopWithholdingAgent: boolean;
}

/**
 * The payer company's configured withholding rates. Failing here is expected sometimes, so it
 * returns null with the server's own sentence rather than throwing into the ledger view.
 */
export async function fetchConfiguredRates(
  companyId: number,
): Promise<{ rates: ConfiguredWithholdingRate[]; error: null } | { rates: null; error: string }> {
  try {
    const response = await fetch(`/api/fm/taxation/rates-references?companyId=${companyId}`, { cache: "no-store" });
    const text = await response.text().catch(() => "");
    const payload = text
      ? (JSON.parse(text) as { success?: boolean; data?: { withholding?: RatesWithholdingRow[] }; error?: string })
      : {};
    if (!response.ok || !payload.success || !payload.data) {
      return { rates: null, error: payload.error ?? `The rate table could not be read (${response.status}).` };
    }
    return {
      rates: (payload.data.withholding ?? []).map((row) => ({
        incomeType: row.incomeType,
        tier: row.rateTier,
        rate: row.rate,
        requiresTopWithholdingAgent: row.requiresTopWithholdingAgent,
      })),
      error: null,
    };
  } catch {
    return { rates: null, error: "The rate table could not be reached." };
  }
}

