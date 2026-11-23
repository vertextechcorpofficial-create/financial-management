import type { Asset, Portfolio } from "../types";
import { assetSeries, round, snapshot, type Snapshot } from "./engine";
import type { jsPDF } from "jspdf";

type PdfWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY?: number };
};

export function registerRows(portfolio: Portfolio, month: string) {
  return portfolio.assets.map(a => {
    const value = snapshot(a, portfolio.policies, month);
    return { Name: a.name, Type: a.kind, Entity: portfolio.entities.find(e => e.id === a.entityId)?.name ?? "", Location: a.location, Acquired: a.acquired, Cost: round(value.cost), "Book value": round(value.book), "Market projection": round(value.market), "Carrying value": round(value.carrying), Status: value.status, Tags: a.tags.join(", ") };
  });
}
export function scheduleRows(rows: Snapshot[]) {
  return rows.map(r => ({ Period: r.month, Additions: round(r.additions), Depreciation: round(r.depreciation), "Accumulated depreciation": round(r.accumulated), "Building book value": round(r.book), "Land projection": round(r.market), "Projected appreciation": round(r.appreciation), "Total carrying value": round(r.carrying), Impairment: round(r.impairment), Revaluation: round(r.revaluation), "Revaluation P&L loss": round(r.revaluationLoss), Repairs: round(r.repairs), Disposals: round(r.disposals), Proceeds: round(r.proceeds), "Gain / loss": round(r.gain) }));
}
export type ExportSchedule = { headers: string[]; body: (string | number | undefined)[][] };
export async function exportExcel(portfolio: Portfolio, month: string, rows: Snapshot[], schedule?: ExportSchedule) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([["Property Ledger"], ["Valuation date", month], ["Entities", portfolio.entities.map(e => e.name).join(", ")], ["Currency", portfolio.policies.currency], ["Fiscal year start", portfolio.policies.fyStart], ["Land model", portfolio.policies.landModel], ["Building model", portfolio.policies.buildingModel], ["Locked through", portfolio.policies.lockThrough], ["Generated", new Date().toISOString()], ["Land market estimates are planning projections."]]);
  XLSX.utils.sheet_add_json(summary, registerRows(portfolio, month).map((r, i) => ({ ...r, ...portfolio.assets[i].details })), { origin: "A12" });
  XLSX.utils.book_append_sheet(wb, summary, "Summary");
  XLSX.utils.book_append_sheet(wb, schedule ? XLSX.utils.aoa_to_sheet([schedule.headers, ...schedule.body]) : XLSX.utils.json_to_sheet(scheduleRows(rows)), "Schedule");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(portfolio.assets.flatMap(a => {
    if (!a.parts.length) return [];
    const balances = new Map<string, { book: number; accumulated: number }>();
    const held = assetSeries(a, portfolio.policies, month, balances).at(-1)?.status === "Held";
    return a.parts.map(p => ({ Property: a.name, Part: p.name, "In service": p.date, Cost: p.cost, "Life (years)": p.life, "Salvage (%)": p.salvage, "Accumulated depreciation": held ? round(balances.get(p.id)?.accumulated ?? 0) : 0, "Book value": held ? round(balances.get(p.id)?.book ?? 0) : 0 }));
  })), "Components");
  const events = portfolio.assets.flatMap(a => [
    ...a.events.map(e => ({ Property: a.name, Event: e.kind, Month: e.date, Amount: e.amount, Note: e.note, Vendor: e.vendor, Treatment: e.kind === "repair" ? (e.improvementId ? "Capitalized" : "Expensed") : "" })),
    ...(a.sale ? [{ Property: a.name, Event: "sale", Month: a.sale.date, Amount: a.sale.price, Note: a.sale.note, "Carrying value": round(a.sale.price - snapshot(a, portfolio.policies, a.sale.date).gain), "Gain / loss": round(snapshot(a, portfolio.policies, a.sale.date).gain) }] : []),
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(events), "Appraisals & sales");
  XLSX.writeFile(wb, `property-ledger-${month}.xlsx`);
}
export async function exportPdf(portfolio: Portfolio, month: string, rows: Snapshot[], asset?: Asset) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape" });
  const amount = (value: number) => `${portfolio.policies.currency} ${round(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  pdf.setFontSize(18); pdf.text(asset ? `Property Ledger: ${asset.name}` : "Property Ledger", 14, 17);
  pdf.setFontSize(10); pdf.text(`As of ${month} | Currency: ${portfolio.policies.currency} | Planning projections — not posted to the general ledger`, 14, 25);
  if (asset) {
    const value = snapshot(asset, portfolio.policies, month);
    autoTable(pdf, { startY: 32, head: [["Asset", "Type", "Acquired", "Cost", "Book / carrying", "Market projection", "Status"]], body: [[asset.name, asset.kind, asset.acquired, amount(value.cost), amount(asset.kind === "building" ? value.book : value.carrying), amount(value.market), value.status]], styles: { fontSize: 8 } });
    let y = ((pdf as PdfWithAutoTable).lastAutoTable?.finalY ?? 32) + 8;
    pdf.setFontSize(11); pdf.text("Property details", 14, y); y += 4;
    autoTable(pdf, { startY: y, head: [["Field", "Value"]], body: Object.entries(asset.details).filter(([, v]) => v).map(([key, value]) => [key, value]), styles: { fontSize: 8 } });
    y = ((pdf as PdfWithAutoTable).lastAutoTable?.finalY ?? y) + 8;
    const parts = asset.parts.map(part => [part.name, part.date, amount(part.cost), `${part.life} years`, `${part.salvage}%`]);
    if (parts.length) { pdf.text(asset.kind === "building" ? "Components and improvements" : "Appraisals", 14, y); autoTable(pdf, { startY: y + 4, head: [["Name", "Month", "Amount", "Life", "Salvage"]], body: parts, styles: { fontSize: 8 } }); }
    if (asset.events.length || asset.sale) {
      pdf.addPage(); pdf.text("Events and disposal", 14, 17);
      autoTable(pdf, { startY: 24, head: [["Kind", "Month", "Amount", "Note", "Treatment"]], body: [
        ...asset.events.map(e => [e.kind, e.date, amount(e.amount), e.note, e.kind === "repair" ? (e.improvementId ? "Capitalized" : "Expensed") : ""]),
        ...(asset.sale ? [["sale", asset.sale.date, amount(asset.sale.price), asset.sale.note, "Proceeds"]] : []),
      ], styles: { fontSize: 8 } });
    }
  } else {
    autoTable(pdf, { startY: 32, head: [["Property", "Type", "Acquired", "Carrying value", "Market projection", "Status"]], body: registerRows(portfolio, month).map(r => [r.Name, r.Type, r.Acquired, amount(Number(r["Carrying value"])), amount(Number(r["Market projection"])), r.Status]), styles: { fontSize: 8 } });
  }
  pdf.addPage(); pdf.text("Property schedule", 14, 17);
  autoTable(pdf, { startY: 24, head: [["Period", "Depreciation", "Book value", "Land projection", "Carrying value", "Proceeds", "Gain / loss"]], body: rows.map(r => [r.month, amount(r.depreciation), amount(r.book), amount(r.market), amount(r.carrying), amount(r.proceeds), amount(r.gain)]), styles: { fontSize: 8 } });
  pdf.save(`property-ledger-${month}.pdf`);
}
