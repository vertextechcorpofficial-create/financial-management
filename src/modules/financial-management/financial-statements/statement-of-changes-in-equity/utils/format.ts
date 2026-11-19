/**
 * Format amounts according to Philippine PFRS statement specifications:
 * Positive: ₱15,075,000.00
 * Negative: -₱780,000.00
 * Nil: — (em-dash)
 */
export function formatCurrency(
  val: number | null | undefined,
  options?: {
    showCurrencySymbol?: boolean;
    omitDashForZero?: boolean;
    decimals?: number;
  }
): string {
  if (val === null || val === undefined || isNaN(val)) {
    return options?.omitDashForZero ? "0.00" : "—";
  }

  const decimals = options?.decimals ?? 2;
  const showSymbol = options?.showCurrencySymbol ?? true;
  const symbol = showSymbol ? "₱" : "";

  // Check if effectively zero
  if (Math.abs(val) < 0.005) {
    return options?.omitDashForZero ? `${symbol}0.00` : "—";
  }

  const isNegative = val < 0;
  const absVal = Math.abs(val);

  const formattedNum = absVal.toLocaleString("en-PH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (isNegative) {
    return `-${symbol}${formattedNum}`;
  }

  return `${symbol}${formattedNum}`;
}

export function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return "0.0%";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}
