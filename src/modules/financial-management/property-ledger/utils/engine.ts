import type { Asset, Part, Policies, Portfolio } from "../types";

export function monthIndex(value: string) { const [y, m] = value.split("-").map(Number); return y * 12 + m - 1; }
export function monthString(value: number) { return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, "0")}`; }
export const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export function depreciation(part: Part, method: Asset["method"]): number[] {
  const floor = part.cost * part.salvage / 100;
  let book = part.cost;
  const result: number[] = [];
  for (let y = 0; y < part.life; y++) {
    const base = part.cost - floor;
    const expense = Math.min(book - floor, method === "sl" ? base / part.life : method === "syd"
      ? base * (part.life - y) / (part.life * (part.life + 1) / 2)
      : Math.max(book * (method === "ddb" ? 2 : 1.5) / part.life, (book - floor) / (part.life - y)));
    for (let m = 0; m < 12; m++) result.push(Math.max(0, expense / 12));
    book -= expense;
  }
  return result;
}
export type Snapshot = {
  month: string; cost: number; book: number; market: number; carrying: number; depreciation: number;
  accumulated: number; repairs: number; impairment: number; revaluation: number; surplus: number;
  revaluationLoss: number; proceeds: number; gain: number; additions: number; disposals: number; appreciation: number;
  count: number; openingBook: number; openingMarket: number; landCost: number; buildingDisposals: number; landDisposals: number;
  status: "Not acquired" | "Held" | "Sold";
};
function blank(month: string): Snapshot {
  return { month, cost: 0, book: 0, market: 0, carrying: 0, depreciation: 0, accumulated: 0, repairs: 0, impairment: 0, revaluation: 0, surplus: 0, revaluationLoss: 0, proceeds: 0, gain: 0, additions: 0, disposals: 0, appreciation: 0, count: 0, openingBook: 0, openingMarket: 0, landCost: 0, buildingDisposals: 0, landDisposals: 0, status: "Not acquired" };
}
/** Events take effect at the start of a month; disposal uses the prior month close. Projections are not GL postings. */
export function assetSeries(asset: Asset, policies: Policies, through: string, partBalances?: Map<string, { book: number; accumulated: number }>): Snapshot[] {
  const start = monthIndex(asset.acquired), end = monthIndex(through);
  if (end < start) return [];
  const sale = asset.sale ? monthIndex(asset.sale.date) : Infinity;
  const parts = asset.parts.map(p => ({ ...p, start: monthIndex(p.date), schedule: depreciation(p, asset.method), book: 0, floor: p.cost * p.salvage / 100 }));
  let accumulated = 0, cost = 0, surplus = 0, previousBook = 0;
  let landBase = asset.cost, landBaseMonth = start, landCarry = asset.cost, previousMarket = asset.cost;
  const rows: Snapshot[] = [];
  for (let m = start; m <= end; m++) {
    const row = blank(monthString(m));
    if (m > start && m <= sale) {
      if (asset.kind === "building") row.openingBook = previousBook;
      else row.openingMarket = previousMarket;
    }
    row.status = m >= sale ? "Sold" : "Held";
    if (m >= sale) {
      if (m === sale) {
        const opening = asset.kind === "land" ? landCarry : (m === start ? asset.parts.filter(p => p.date === asset.acquired).reduce((s, p) => s + p.cost, 0) : previousBook);
        // Recognize both movements when there is no prior held month.
        if (m === start) row.additions = opening;
        row.proceeds = asset.sale!.price; row.gain = row.proceeds - opening; row.disposals = opening;
        if (asset.kind === "land") row.landDisposals = previousMarket;
        else row.buildingDisposals = opening;
      }
      rows.push(row); continue;
    }
    row.count = 1;
    if (asset.kind === "land") {
      const appraisal = asset.events.find(e => e.kind === "appraisal" && monthIndex(e.date) === m);
      if (appraisal) { landBase = appraisal.amount; landBaseMonth = m; if (policies.landModel === "reval") landCarry = appraisal.amount; }
      const years = (m - landBaseMonth) / 12;
      row.market = Math.max(0, landBase * (asset.growth === "simple" ? 1 + asset.rate / 100 * years : Math.pow(1 + asset.rate / 100, years)));
      row.appreciation = row.market - previousMarket; previousMarket = row.market;
      row.cost = asset.cost; row.carrying = landCarry; row.surplus = landCarry - asset.cost;
      row.landCost = asset.cost;
      if (m === start) row.additions = asset.cost;
    } else {
      for (const p of parts) if (p.start === m) { p.book = p.cost; cost += p.cost; row.additions += p.cost; }
      const active = parts.filter(p => p.start <= m);
      const events = asset.events.filter(e => monthIndex(e.date) === m).sort((a, b) => Number(b.kind === "revaluation") - Number(a.kind === "revaluation"));
      for (const event of events) {
        if (event.kind === "repair") { if (!event.improvementId) row.repairs += event.amount; continue; }
        if (event.kind === "revaluation" && policies.buildingModel !== "reval") continue;
        const total = active.reduce((s, p) => s + p.book, 0);
        if (!total) continue;
        const target = event.kind === "impairment" ? Math.max(0, total - event.amount) : event.amount;
        const delta = target - total;
        if (event.kind === "impairment") row.impairment += -delta;
        else {
          row.revaluation += delta;
          if (delta >= 0) surplus += delta;
          else { const used = Math.min(surplus, -delta); surplus -= used; row.revaluationLoss += -delta - used; }
        }
        for (const p of active) {
          const old = p.book, next = old * target / total;
          const oldBase = Math.max(0, old - p.floor);
          p.floor = Math.min(p.floor, next);
          const newBase = Math.max(0, next - p.floor), offset = m - p.start;
          if (oldBase > 1e-9) for (let k = offset; k < p.schedule.length; k++) p.schedule[k] *= newBase / oldBase;
          else if (offset < p.schedule.length) for (let k = offset; k < p.schedule.length; k++) p.schedule[k] = newBase / (p.schedule.length - offset);
          p.book = next;
        }
      }
      for (const p of active) {
        const expense = Math.max(0, Math.min(p.schedule[m - p.start] ?? 0, p.book - p.floor));
        p.book -= expense; row.depreciation += expense;
        if (partBalances) partBalances.set(p.id, { book: p.book, accumulated: (partBalances.get(p.id)?.accumulated ?? 0) + expense });
      }
      accumulated += row.depreciation;
      row.cost = cost; row.book = active.reduce((s, p) => s + p.book, 0); row.carrying = row.book;
      row.accumulated = accumulated; row.surplus = surplus; previousBook = row.book;
    }
    rows.push(row);
  }
  return rows;
}
export function snapshot(asset: Asset, policies: Policies, month: string): Snapshot {
  return assetSeries(asset, policies, month).at(-1) ?? blank(month);
}
export function portfolioSeries(portfolio: Portfolio, through: string): Snapshot[] {
  const series = portfolio.assets.map(a => assetSeries(a, portfolio.policies, through));
  const starts = portfolio.assets.map(a => monthIndex(a.acquired));
  const from = starts.length ? Math.min(...starts) : monthIndex(through);
  const keys = ["cost", "book", "market", "carrying", "depreciation", "accumulated", "repairs", "impairment", "revaluation", "surplus", "revaluationLoss", "proceeds", "gain", "additions", "disposals", "appreciation", "count", "openingBook", "openingMarket", "landCost", "buildingDisposals", "landDisposals"] as const;
  const rows: Snapshot[] = [];
  for (let m = from; m <= monthIndex(through); m++) {
    const row = blank(monthString(m));
    series.forEach((list, index) => { const v = list[m - starts[index]]; if (v) for (const k of keys) row[k] += v[k]; });
    rows.push(row);
  }
  return rows;
}
export function schedule(rows: Snapshot[], granularity: "monthly" | "quarterly" | "annual", fyStart: number) {
  const grouped = new Map<string, Snapshot>();
  for (const row of rows) {
    const m = monthIndex(row.month), shifted = m - fyStart + 1;
    const fy = Math.floor(shifted / 12) + (fyStart === 1 ? 0 : 1);
    const year = fyStart === 1 ? String(fy) : `FY${fy}`;
    const key = granularity === "monthly" ? row.month : granularity === "annual" ? year : `Q${Math.floor(((shifted % 12) + 12) % 12 / 3) + 1} ${year}`;
    const prev = grouped.get(key);
    const next = { ...row, month: key };
    if (prev) {
      next.openingBook = prev.openingBook; next.openingMarket = prev.openingMarket;
      for (const k of ["depreciation", "repairs", "impairment", "revaluation", "revaluationLoss", "proceeds", "gain", "additions", "disposals", "appreciation", "buildingDisposals", "landDisposals"] as const) next[k] += prev[k];
    }
    grouped.set(key, next);
  }
  return [...grouped.values()];
}
