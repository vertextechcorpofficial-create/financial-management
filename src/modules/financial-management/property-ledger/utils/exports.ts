import type { Asset, Portfolio } from "../types";
import type { Snapshot } from "./engine";
import { buildReport, type ReportCell, type ReportSection } from "./reports";
import { formatMonth } from "./dates";

export type ExportSchedule = { headers: string[]; body: (string | number | undefined)[][] };
export async function buildWorkbook(portfolio: Portfolio, month: string, rows: Snapshot[], schedule?: ExportSchedule) {
  const XLSX = await import("xlsx");
  const report = buildReport(portfolio, month, rows);
  const wb = XLSX.utils.book_new();
  const add = (name: string, sections: ReportSection[], metadata: ReportCell[][] = []) => {
    const data: ReportCell[][] = [...metadata];
    for (const s of sections) data.push([], [s.title], s.headers, ...s.rows);
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet["!cols"] = Array.from({ length: Math.max(2, ...data.map(row => row.length)) }, () => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, sheet, name);
  };
  const get = (title: string) => report.sections.filter(s => s.title === title);
  add("Summary", [...get("Summary"), ...get("Land register"), ...get("Building register")], [[report.title], ...report.metadata]);
  add("Land register", get("Land register"));
  add("Building register", get("Building register"));
  add("Schedule", schedule ? [{ title: "Schedule", headers: schedule.headers, rows: schedule.body.map(row => row.map(v => v ?? "")) }] : get("Schedule"));
  add("Components", [...get("Components"), ...get("Improvements")]);
  add("Improvements", get("Improvements"));
  add("Appraisals & sales", [...get("Land appraisals"), ...get("Sales"), ...get("Impairments"), ...get("Revaluations"), ...get("Repairs & maintenance")]);
  add("Repairs & valuations", [...get("Impairments"), ...get("Revaluations"), ...get("Repairs & maintenance")]);
  return wb;
}
export async function exportExcel(portfolio: Portfolio, month: string, rows: Snapshot[], schedule?: ExportSchedule) {
  const XLSX = await import("xlsx");
  XLSX.writeFile(await buildWorkbook(portfolio, month, rows, schedule), `property-ledger-${month}.xlsx`);
}
export async function buildPdf(portfolio: Portfolio, month: string, rows: Snapshot[], asset?: Asset, schedule?: ExportSchedule) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const report = buildReport(portfolio, month, rows, asset);
  if (!asset && schedule) {
    const section = report.sections.find(s => s.title === "Schedule")!;
    section.headers = schedule.headers;
    section.rows = schedule.body.map(row => row.map(value => value ?? ""));
  }
  const pdf = new jsPDF({ orientation: "landscape" });
  pdf.setFontSize(16); pdf.text(report.title, 14, 17);
  pdf.setFontSize(9); pdf.text(`As of ${formatMonth(month)} | ${portfolio.policies.currency} | Estimates only; not general-ledger postings`, 14, 25);
  autoTable(pdf, { startY: 30, head: [["Report setting", "Value"]], body: report.metadata, styles: { fontSize: 8 } });
  for (const section of report.sections) {
    pdf.addPage(); pdf.setFontSize(12); pdf.text(section.title, 14, 17);
    autoTable(pdf, {
      startY: 24, head: [section.headers],
      body: section.rows.length ? section.rows.map(row => row.map(v => typeof v === "number" ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v)) : [["None recorded."]],
      styles: { fontSize: 7, overflow: "linebreak" }, rowPageBreak: "avoid",
      didDrawPage: () => { pdf.setFontSize(8); pdf.text(`${portfolio.policies.currency} | Property Ledger | Estimates only`, 14, 202); },
    });
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { pdf.setPage(page); pdf.setFontSize(8); pdf.text(`Page ${page} of ${pages}`, 260, 202); }
  return pdf;
}
export async function exportPdf(portfolio: Portfolio, month: string, rows: Snapshot[], asset?: Asset, schedule?: ExportSchedule) {
  const pdf = await buildPdf(portfolio, month, rows, asset, schedule);
  const name = asset ? `${asset.name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 60)}-` : "";
  pdf.save(`property-ledger-${name}${month}.pdf`);
}
