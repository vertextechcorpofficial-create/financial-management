import { portfolioSchema, type Asset, type Portfolio } from "../types";

export function saveSale(portfolio: Portfolio, asset: Asset, sale: NonNullable<Asset["sale"]>, allocations: Record<string, number>): Portfolio {
  const lock = portfolio.policies.lockThrough;
  if (lock && (sale.date <= lock || (asset.sale && asset.sale.date <= lock))) throw new Error(`Books are locked through ${lock}.`);
  return portfolioSchema.parse({
    ...portfolio,
    assets: portfolio.assets.map(a => {
      if (a.id === asset.id) return { ...a, sale };
      if (asset.kind !== "land" || a.kind !== "building" || a.landId !== asset.id || a.sale || a.acquired > sale.date || !Object.hasOwn(allocations, a.id)) return a;
      return { ...a, sale: { date: sale.date, price: allocations[a.id], note: `Sold with ${asset.name}` } };
    }),
  });
}
