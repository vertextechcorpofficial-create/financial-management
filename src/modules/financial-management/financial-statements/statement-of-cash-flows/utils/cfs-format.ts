export function formatPHP(value: number | null | undefined, options?: { showDashForNull?: boolean; parenthesesForNegative?: boolean }): string {
  const { showDashForNull = true, parenthesesForNegative = true } = options || {};

  if (value === null || value === undefined) {
    return showDashForNull ? "—" : "0.00";
  }

  const isNeg = value < 0;
  const absVal = Math.abs(value);
  const formatted = absVal.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (isNeg) {
    return parenthesesForNegative ? `(${formatted})` : `-${formatted}`;
  }
  return formatted;
}

export function formatPHPWithSign(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return "—";
  const absVal = Math.abs(value);
  const formatted = absVal.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-₱${formatted}` : `₱${formatted}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
