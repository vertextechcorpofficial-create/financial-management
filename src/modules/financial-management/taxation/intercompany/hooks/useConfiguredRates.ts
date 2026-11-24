"use client";

import { useEffect, useState } from "react";

import { fetchConfiguredRates } from "../providers/intercompanyApi";
import type { ConfiguredWithholdingRate } from "../withholding";

/**
 * The selected company's configured withholding rates.
 *
 * A rate the configuration cannot settle is a fact the withholding tab has to state, so a failed
 * read is kept as a sentence to show beside the table instead of being swallowed into a default.
 */
export function useConfiguredRates(companyId: number | null): {
  rates: ConfiguredWithholdingRate[] | null;
  error: string | null;
} {
  const [rates, setRates] = useState<ConfiguredWithholdingRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    void fetchConfiguredRates(companyId).then((result) => {
      if (cancelled) return;
      setRates(result.rates);
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { rates, error };
}
