import type { Asset, Portfolio } from "../types";
import { DETAIL_LABELS } from "../constants";
import { appraisalBefore, assetSeries, bookBefore, monthIndex, monthString, portfolioSeries, round, schedule, snapshot, type Snapshot } from "./engine";
import { METHODS } from "../types";
import { formatMonth } from "./dates";
import { addMoney } from "./money";

export type ReportCell = string | number;
export type ReportSection = { title: string; headers: string[]; rows: ReportCell[][] };
export type LedgerReport = { title: string; metadata: ReportCell[][]; sections: ReportSection[] };
export function scheduleSection(rows: Snapshot[], kind: Asset["kind"] | "all" = "all"): ReportSection {
  const byAsset = rows.some(row => "assetName" in row);
  const fields: [keyof Snapshot, string][] = kind === "land"
    ? [["openingMarket", "Opening market value"], ["additions", "Additions"], ["appreciation", "Appreciation"], ["landDisposals", "Disposals (market value)"], ["market", "Closing market value"], ["landCost", "Cost basis"], ["carrying", "Carrying amount"], ["surplus", "Revaluation surplus"], ["proceeds", "Sale proceeds"], ["gain", "Gain / loss"]]
    : kind === "building" ? [["openingBook", "Opening book value"], ["additions", "Additions"], ["depreciation", "Depreciation"], ["impairment", "Impairment"], ["revaluation", "Revaluation"], ["buildingDisposals", "Disposals (book value)"], ["book", "Closing book value"], ["accumulated", "Accumulated depreciation"], ["surplus", "Revaluation surplus"], ["revaluationLoss", "Revaluation P&L loss"], ["repairs", "Repairs expensed"], ["proceeds", "Sale proceeds"], ["gain", "Gain / loss"]]
      : [["openingBook", "Opening building book value"], ["openingMarket", "Opening land market value"], ["additions", "Additions"], ["depreciation", "Depreciation"], ["impairment", "Impairment"], ["revaluation", "Revaluation"], ["appreciation", "Appreciation"], ["buildingDisposals", "Building disposals"], ["landDisposals", "Land disposals"], ["book", "Building book value"], ["market", "Land market value"], ["carrying", "Carrying amount"], ["accumulated", "Accumulated depreciation"], ["repairs", "Repairs expensed"], ["proceeds", "Sale proceeds"], ["gain", "Gain / loss"]];
  const negative = ["depreciation", "impairment", "buildingDisposals", "landDisposals"];
  const body: ReportCell[][] = rows.map(row => [formatMonth(row.month), ...(byAsset ? [String((row as Snapshot & { assetName?: string }).assetName ?? "")] : []), ...fields.map(([key]) => {
    const n = Number(row[key]); return round(negative.includes(key) ? -Math.abs(n) : n);
  })]);
  if (rows.length && !byAsset) {
    const flows = ["additions", "depreciation", "impairment", "revaluation", "appreciation", "buildingDisposals", "landDisposals", "repairs", "proceeds", "gain", "revaluationLoss"];
    body.push(["Total / closing", ...fields.map(([key]) => {
      const n = flows.includes(key) ? rows.reduce((sum, row) => addMoney(sum, Number(row[key])), 0) : Number((key.startsWith("opening") ? rows[0] : rows.at(-1)!)[key]);
      return round(negative.includes(key) ? -Math.abs(n) : n);
    })]);
  }
  return { title: "Schedule", headers: ["Period", ...(byAsset ? ["Asset"] : []), ...fields.map(([, label]) => label)], rows: body };
}
export function buildReport(portfolio: Portfolio, month: string, rows: Snapshot[], asset?: Asset): LedgerReport {
  const assets = asset ? [asset] : portfolio.assets;
  const state = assets.map(a => ({ a, s: snapshot(a, portfolio.policies, month) }));
  const sum = (key: keyof Snapshot) => state.reduce((n, { s }) => typeof s[key] === "number" ? addMoney(n, Number(s[key])) : n, 0);
  const section = (title: string, headers: string[], body: ReportCell[][]): ReportSection => ({ title, headers, rows: body });
  const lands = state.filter(({ a }) => a.kind === "land"), buildings = state.filter(({ a }) => a.kind === "building");
  const metadata: ReportCell[][] = [["Valuation date", formatMonth(month)], ["Entities", [...new Set(assets.map(a => portfolio.entities.find(e => e.id === a.entityId)?.name ?? ""))].join(", ")], ["Groups", [...new Set(assets.flatMap(a => a.tags))].join(", ") || "All groups"], ["Currency", portfolio.policies.currency], ["Fiscal year start month", portfolio.policies.fyStart], ["Land model", portfolio.policies.landModel], ["Building model", portfolio.policies.buildingModel], ["Locked through", portfolio.policies.lockThrough || "Not locked"], ["Generated", new Date().toISOString()]];
  const sections: ReportSection[] = [section("Summary", ["Metric", "Value"], [
    ["Building book value", sum("book")], ["Accumulated depreciation", sum("accumulated")], ["Land market value", sum("market")], ["Total value", addMoney(sum("book"), sum("market"))], ["Carrying amount", sum("carrying")], ["Assets held", state.filter(({ s }) => s.status === "Held").length],
  ])];
  if (asset) sections.push(section("Property details", ["Field", "Value"], [["Name", asset.name], ["Location", asset.location], ["Acquired / in service", formatMonth(asset.acquired)], ["Method", asset.kind === "building" ? METHODS[asset.method] : `${asset.rate}% ${asset.growth}`], ["Notes", asset.notes], ...Object.entries(asset.details).map(([key, value]): ReportCell[] => [DETAIL_LABELS[key] ?? key, value])]));
  if (!asset) {
    sections.push(section("Land register", ["Land", "Entity", "Location", "Acquired", "Lot area (sq m)", "Title no.", "Cost", "Market value", "Carrying amount", "Unrealized gain", "Rate %", "Status", "Groups", "Zoning", "Tax declaration no.", "Owner", "Lot no.", "Zonal value per sq m", "Assessed value"], lands.map(({ a, s }) => [a.name, portfolio.entities.find(e => e.id === a.entityId)?.name ?? "", a.location, formatMonth(a.acquired), a.details.area ?? "", a.details.titleNo ?? "", a.cost, s.market, s.carrying, s.status === "Held" ? round(s.market - a.cost) : 0, a.rate, s.status, a.tags.join(", "), a.details.zoning ?? "", a.details.taxDecNo ?? "", a.details.owner ?? "", a.details.lotNo ?? "", a.details.zonal ?? "", a.details.assessed ?? ""])));
    sections.push(section("Building register", ["Building", "Land", "Entity", "In service", "Floor area (sq m)", "Method", "Cost basis", "Accumulated depreciation", "Book value", "Storeys", "Year built", "Status", "Groups", "Use", "Construction", "Condition", "Building permit no.", "Occupancy permit no.", "Tax declaration no."], buildings.map(({ a, s }) => [a.name, portfolio.assets.find(l => l.id === a.landId)?.name ?? "", portfolio.entities.find(e => e.id === a.entityId)?.name ?? "", formatMonth(a.acquired), a.details.floorArea ?? "", METHODS[a.method], s.cost, s.accumulated, s.book, a.details.storeys ?? "", a.details.yearBuilt ?? "", s.status, a.tags.join(", "), a.details.use ?? "", a.details.construction ?? "", a.details.condition ?? "", a.details.permitNo ?? "", a.details.occupancyNo ?? "", a.details.taxDecNo ?? ""])));
  }
  const components: ReportCell[][] = [], improvements: ReportCell[][] = [];
  for (const { a } of buildings) {
    const balances = new Map<string, { book: number; accumulated: number }>();
    assetSeries(a, portfolio.policies, a.sale && a.sale.date <= month ? monthString(monthIndex(a.sale.date) - 1) : month, balances);
    for (const p of a.parts) {
      const balance = balances.get(p.id);
      (p.date > a.acquired || a.events.some(e => e.improvementId === p.id) ? improvements : components).push([a.name, p.name, formatMonth(p.date), p.cost, p.life, p.salvage, balance?.accumulated ?? 0, balance?.book ?? 0, Math.max(0, p.life * 12 - Math.max(0, monthIndex(month) - monthIndex(p.date) + 1))]);
    }
  }
  const partHeaders = ["Building", "Name", "In service", "Cost", "Life (years)", "Salvage %", "Accumulated depreciation", "Book value", "Life left (months)"];
  sections.push(section("Components", partHeaders, components), section("Improvements", partHeaders, improvements));
  sections.push(section("Land appraisals", ["Land", "Month", "Appraised value", "Estimate before", "Appraisal difference", "Note"], lands.flatMap(({ a }) => a.events.filter(e => e.kind === "appraisal").sort((a, b) => a.date.localeCompare(b.date)).map(e => [a.name, formatMonth(e.date), e.amount, appraisalBefore(a, portfolio.policies, e.date), round(e.amount - appraisalBefore(a, portfolio.policies, e.date)), e.note]))));
  for (const kind of ["impairment", "revaluation", "repair"] as const) {
    sections.push(section(kind === "repair" ? "Repairs & maintenance" : kind === "impairment" ? "Impairments" : "Revaluations", ["Building", "Month", "Amount", "Book value before", "Description / note", "Vendor", "Treatment"], buildings.flatMap(({ a }) => a.events.filter(e => e.kind === kind).map(e => [a.name, formatMonth(e.date), e.kind === "impairment" ? -e.amount : e.amount, bookBefore(a, portfolio.policies, e.date), e.note, e.vendor, e.kind === "repair" ? (e.improvementId ? "Capitalized" : "Expensed") : ""]))));
  }
  if (asset?.kind === "land") sections.push(section("Buildings on this land", ["Building", "In service", "Book value", "Status"], portfolio.assets.filter(a => a.kind === "building" && a.landId === asset.id).map(a => [a.name, formatMonth(a.acquired), snapshot(a, portfolio.policies, month).book, snapshot(a, portfolio.policies, month).status])));
  sections.push(section("Sales", ["Asset", "Type", "Month", "Sale price", "Carrying amount at sale", "Gain / loss", "Note"], assets.filter(a => a.sale).map(a => {
    const s = snapshot(a, portfolio.policies, a.sale!.date);
    return [a.name, a.kind, formatMonth(a.sale!.date), a.sale!.price, round(a.sale!.price - s.gain), s.gain, a.sale!.note];
  })));
  // Asset reports always include the full fiscal-year schedule, not the currently selected portfolio range.
  const full = asset ? schedule(assetSeries(asset, portfolio.policies, `${portfolio.policies.projectionEndYear}-12`), "annual", portfolio.policies.fyStart) : rows;
  sections.push(scheduleSection(full, asset?.kind));
  const relevant = asset?.kind === "land" ? sections.filter(s => !["Components", "Improvements", "Impairments", "Revaluations", "Repairs & maintenance"].includes(s.title))
    : asset?.kind === "building" ? sections.filter(s => s.title !== "Land appraisals") : sections;
  return { title: asset ? `Property Ledger: ${asset.name}` : "Property Ledger portfolio", metadata, sections: relevant };
}

export function annualPortfolioRows(portfolio: Portfolio) {
  return schedule(portfolioSeries(portfolio, `${portfolio.policies.projectionEndYear}-12`), "annual", portfolio.policies.fyStart);
}
