import { centavos } from "./ledger";

/** Preview only: never posts or reserves cash. All splits are in centavos. */
export function planDeployment(amount: number, threshold: number, tranches: number,
  classes: readonly { value: number; target: number }[]) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12 ||
      classes.some(row => !Number.isFinite(row.value) || row.value < 0 || !Number.isFinite(row.target) || row.target < 0) ||
      !classes.some(row => row.target > 0)) return [];
  const total = centavos(amount);
  const count = Math.min(total, amount > threshold ? Math.max(1, Math.min(120, Math.trunc(tranches) || 1)) : 1);
  const values = classes.map(row => centavos(row.value));
  const targetTotal = classes.reduce((sum, row) => sum + row.target, 0);
  return Array.from({ length: count }, (_, index) => {
    const budget = Math.floor(total / count) + Number(index < total % count);
    const projected = values.reduce((sum, value) => sum + value, budget);
    const gaps = classes.map((row, i) => Math.max(0, projected * row.target / targetTotal - values[i]));
    const gapTotal = gaps.reduce((sum, gap) => sum + gap, 0);
    const ideal = gaps.map((gap, i) => gapTotal >= budget ? budget * gap / gapTotal :
      gap + (budget - gapTotal) * classes[i].target / targetTotal);
    const split = ideal.map(Math.floor);
    const order = ideal.map((value, i) => ({ i, remainder: value - split[i] })).sort((a, b) => b.remainder - a.remainder);
    const remainder = budget - split.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < remainder; i++) split[order[i].i]++;
    split.forEach((value, i) => { values[i] += value; });
    return { amount: budget / 100, split: split.map(value => value / 100) };
  });
}
