import type { Asset, Portfolio } from "../types";
import { assetSeries, monthIndex, monthString, portfolioSeries, schedule, snapshot, type Snapshot } from "./engine";

export type ScheduleKind = "land" | "building" | "all";
export type ScheduleRow = Snapshot & { assetName?: string; assetKind?: "land" | "building"; total: number };
export function reportRows(portfolio: Portfolio, kind: ScheduleKind, through: string, granularity: "monthly" | "quarterly" | "annual", from: string, assetId: string, breakdown: "totals" | "asset"): ScheduleRow[] {
  const assets = portfolio.assets.filter(a => (kind === "all" || a.kind === kind) && (!assetId || a.id === assetId));
  const group = (rows: Snapshot[]) => schedule(rows.filter(r => !from || r.month >= from), granularity, portfolio.policies.fyStart);
  if (!assets.length) return [];
  if (breakdown === "asset") return assets.flatMap(asset => {
    const months = assetSeries(asset, portfolio.policies, through).filter(r => r.status === "Held" || r.month === asset.sale?.date);
    return group(months).map(row => ({ ...row, assetName: asset.name, assetKind: asset.kind, total: row.book + row.market }));
  }).sort((a, b) => {
    const period = (label: string) => granularity === "monthly" ? monthIndex(label) : Number(label.match(/\d{4}$/)?.[0]) * 4 + Number(label.match(/^Q(\d)/)?.[1] ?? 0);
    return period(a.month) - period(b.month) || (a.assetName ?? "").localeCompare(b.assetName ?? "");
  });
  return group(portfolioSeries({ ...portfolio, assets }, through)).map(row => ({ ...row, total: row.book + row.market }));
}
export function heldValue(asset: Asset, portfolio: Portfolio, month: string) {
  const value = snapshot(asset, portfolio.policies, month);
  return asset.kind === "land" ? value.market : value.book;
}
export function fiscalDepreciation(portfolio: Portfolio, month: string) {
  const index = monthIndex(month), start = Math.floor((index - portfolio.policies.fyStart + 1) / 12) * 12 + portfolio.policies.fyStart - 1;
  return portfolio.assets.filter(a => a.kind === "building").reduce((sum, a) => sum + assetSeries(a, portfolio.policies, monthString(start + 11)).filter(r => r.month >= monthString(start)).reduce((s, r) => s + r.depreciation, 0), 0);
}
export function reviewFlags(portfolio: Portfolio, month: string) {
  const flags = portfolio.assets.flatMap(asset => {
    if (snapshot(asset, portfolio.policies, month).status !== "Held") return [];
    const flags: { asset: Asset; level: string; note: string }[] = [];
    if (asset.kind === "land") {
      const latest = asset.events.filter(e => e.kind === "appraisal" && e.date <= month).map(e => e.date).sort().at(-1) ?? asset.acquired;
      if (monthIndex(month) - monthIndex(latest) >= 36) flags.push({ asset, level: "Due soon", note: `Appraisal ${latest === asset.acquired ? "not recorded since acquisition" : "last recorded"} ${latest}` });
      if (!Number(asset.details.area)) flags.push({ asset, level: "Missing info", note: "No lot area recorded" });
    } else {
      const due: string[] = [];
      const expired: string[] = [];
      for (const part of asset.parts) {
        if (part.date > month) continue;
        const remaining = part.life * 12 - (monthIndex(month) - monthIndex(part.date) + 1);
        if (remaining <= 0) expired.push(part.name);
        else if (remaining <= 12) due.push(`${part.name} (${remaining} mo.)`);
      }
      if (due.length) flags.push({ asset, level: "Due soon", note: `Useful life ending: ${due.join(", ")}` });
      if (expired.length) flags.push({ asset, level: "Review", note: `Fully depreciated: ${expired.join(", ")}` });
      if (!Number(asset.details.floorArea)) flags.push({ asset, level: "Missing info", note: "No floor area recorded" });
    }
    return flags;
  });
  const priority = ["Due soon", "Review", "Missing info"];
  return flags.sort((a, b) => priority.indexOf(a.level) - priority.indexOf(b.level));
}
