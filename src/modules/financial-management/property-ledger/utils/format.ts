/** Normalize at display precision, including IEEE -0 and amounts rounding to zero. */
export function displayAmount(value: number, digits = 0) {
  return Number(value.toFixed(digits)) === 0 ? 0 : value;
}

export function formatMoney(value: number, currency: string, digits = 0) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(displayAmount(value, digits));
}

export function reduction(value: number) {
  return value === 0 ? 0 : -Math.abs(value);
}
