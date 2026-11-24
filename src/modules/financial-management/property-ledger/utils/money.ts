/** UI amounts are pesos; accounting balances are integer centavos. */
export const MAX_MONEY = Math.floor(Number.MAX_SAFE_INTEGER / 100);
export function cents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Amount must be finite.");
  // Round the decimal representation, not value * 100 (10.075 is a classic binary tie).
  const [mantissa, exponent = "0"] = Math.abs(value).toString().split("e");
  const decimals = mantissa.split(".")[1]?.length ?? 0;
  const digits = BigInt(mantissa.replace(".", ""));
  const scale = Number(exponent) - decimals + 2;
  const divisor = scale < 0 ? 10n ** BigInt(-scale) : 1n;
  const integer = scale < 0 ? (digits + divisor / 2n) / divisor : digits * 10n ** BigInt(scale);
  const result = Math.sign(value) * Number(integer);
  if (!Number.isSafeInteger(result)) throw new Error("Amount exceeds safe centavo precision.");
  return result;
}
export function pesos(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Balance exceeds safe centavo precision.");
  return value / 100;
}
export const roundMoney = (value: number) => pesos(cents(value));
export const addMoney = (a: number, b: number) => pesos(cents(a) + cents(b));
/** Largest-remainder allocation, preserving the total exactly. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map(w => total * (w / sum));
  const result = raw.map(Math.floor);
  const order = raw.map((v, i) => ({ i, remainder: v - result[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const remaining = total - result.reduce((s, n) => s + n, 0);
  for (let i = 0; i < remaining; i++) result[order[i % order.length].i]++;
  return result;
}
