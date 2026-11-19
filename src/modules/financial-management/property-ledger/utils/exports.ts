import type { Asset, Portfolio } from "../types";
import { round, snapshot, type Snapshot } from "./engine";

export function registerRows(portfolio: Portfolio, month: string) {
  return portfolio.assets.map(a => {
    const value = snapshot(a, portfolio.policies, month);
    return { Name: a.name, Type: a.kind, Entity: portfolio.entities.find(e => e.id === a.entityId)?.name ?? "", Location: a.location, Acquired: a.acquired, Cost: round(value.cost), "Book value": round(value.book), "Market projection": round(value.market), "Carrying value": round(value.carrying), Status: value.status, Tags: a.tags.join(", ") };
  });
}
export function scheduleRows(rows: Snapshot[]) {
  return rows.map(r => ({ Period: r.month, Additions: round(r.additions), Depreciation: round(r.depreciation), "Accumulated depreciation": round(r.accumulated), "Building book value": round(r.book), "Land projection": round(r.market), "Projected appreciation": round(r.appreciation), "Total carrying value": round(r.carrying), Impairment: round(r.impairment), Revaluation: round(r.revaluation), "Revaluation P&L loss": round(r.revaluationLoss), Repairs: round(r.repairs), Disposals: round(r.disposals), Proceeds: round(r.proceeds), "Gain / loss": round(r.gain) }));
}
export async function exportExcel(portfolio: Portfolio, month: string, rows: Snapshot[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(registerRows(portfolio, month)), "Property register");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleRows(rows)), "Schedule");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ ...portfolio.policies, asOf: month, note: "Projections only. No general ledger posting or FX conversion." }]), "Policies");
  XLSX.writeFile(wb, `property-ledger-${month}.xlsx`);
}
export async function exportPdf(portfolio: Portfolio, month: string, rows: Snapshot[], asset?: Asset) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape" });
  pdf.setFontSize(18); pdf.text(asset ? `Property Ledger: ${asset.name}` : "Property Ledger", 14, 17);
  pdf.setFontSize(10); pdf.text(`As of ${month} | ${portfolio.policies.currency} | Projections only — not posted to the general ledger`, 14, 25);
  autoTable(pdf, { startY: 32, head: [["Property", "Type", "Acquired", "Carrying value", "Market projection", "Status"]], body: registerRows(portfolio, month).map(r => [r.Name, r.Type, r.Acquired, r["Carrying value"], r["Market projection"], r.Status]), styles: { fontSize: 8 } });
  pdf.addPage(); pdf.text("Property schedule", 14, 17);
  autoTable(pdf, { startY: 24, head: [["Period", "Depreciation", "Book value", "Land projection", "Carrying value", "Proceeds", "Gain / loss"]], body: rows.map(r => [r.month, round(r.depreciation), round(r.book), round(r.market), round(r.carrying), round(r.proceeds), round(r.gain)]), styles: { fontSize: 8 } });
  pdf.save(`property-ledger-${month}.pdf`);
}
