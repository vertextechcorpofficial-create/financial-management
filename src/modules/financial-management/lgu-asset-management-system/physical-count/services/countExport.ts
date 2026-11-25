import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CountReport } from "../../types";
import { buildCountReport } from "./assetCount";

function title(report: CountReport): string {
  return report.form === "rpcppe"
    ? "REPORT ON THE PHYSICAL COUNT OF PROPERTY, PLANT AND EQUIPMENT"
    : "REPORT ON THE PHYSICAL COUNT OF SEMI-EXPENDABLE PROPERTY";
}

function fileBase(report: CountReport): string {
  const form = report.form === "rpcppe" ? "RPCPPE" : "RPCSP";
  return form + "-" + report.session.count_no;
}

const HEADERS = [
  "Property No.",
  "Description",
  "Unit",
  "Unit value",
  "Date acquired",
  "Balance",
  "On hand",
  "Shortage",
  "Shortage value",
  "Remarks",
];

export async function exportCountReportXlsx(id: number, form: "rpcppe" | "rpcsp"): Promise<{ buffer: Buffer; filename: string }> {
  const report = await buildCountReport(id, form);
  const wb = new ExcelJS.Workbook();
  wb.creator = "LGU Asset Management, Municipality of Mapandan";
  const ws = wb.addWorksheet(report.form === "rpcppe" ? "RPCPPE" : "RPCSP");

  ws.columns = [
    { width: 20 }, { width: 46 }, { width: 8 }, { width: 14 }, { width: 14 },
    { width: 9 }, { width: 9 }, { width: 10 }, { width: 14 }, { width: 34 },
  ];

  const titleRow = ws.addRow([title(report)]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, HEADERS.length);
  titleRow.font = { bold: true, size: 12 };
  titleRow.alignment = { horizontal: "center" };

  const subRow = ws.addRow(["(Types of Property, Plant and Equipment)"]);
  ws.mergeCells(subRow.number, 1, subRow.number, HEADERS.length);
  subRow.alignment = { horizontal: "center" };

  const asOf = ws.addRow(["As of " + (report.session.as_of_date ?? "")]);
  ws.mergeCells(asOf.number, 1, asOf.number, HEADERS.length);
  asOf.alignment = { horizontal: "center" };

  const entity = ws.addRow([
    "Municipality of Mapandan. For which the accountable officers shown below are answerable, having assumed such accountability on the dates the register records.",
  ]);
  ws.mergeCells(entity.number, 1, entity.number, HEADERS.length);
  entity.alignment = { wrapText: true };

  const signatories = ws.addRow([
    "Fund cluster:",
    "",
    "Counted by: " + (report.session.counted_by ?? ""),
    "",
    "Verified by: " + (report.session.verified_by ?? ""),
    "",
    "Witnessed by: " + (report.session.witnessed_by ?? ""),
  ]);
  ws.mergeCells(signatories.number, 3, signatories.number, 4);
  ws.mergeCells(signatories.number, 5, signatories.number, 6);
  ws.mergeCells(signatories.number, 7, signatories.number, HEADERS.length);

  ws.addRow([]);

  let grandValue = 0;
  let grandShortage = 0;

  for (const group of report.groups) {
    const groupRow = ws.addRow([group.className]);
    ws.mergeCells(groupRow.number, 1, groupRow.number, HEADERS.length);
    groupRow.font = { bold: true };
    groupRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };

    const header = ws.addRow(HEADERS);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });

    for (const row of group.rows) {
      const r = ws.addRow([
        row.propertyNo,
        row.description,
        row.unit,
        row.unitValue,
        row.dateAcquired ?? "",
        row.balanceQty,
        row.onHandQty,
        row.shortageQty || "",
        row.shortageValue || "",
        row.remarks,
      ]);
      r.getCell(4).numFmt = "#,##0.00";
      r.getCell(9).numFmt = "#,##0.00";
    }

    const totals = ws.addRow([
      "Totals", "", "", "", "",
      group.totalQty, group.totalQty, group.totalShortageQty, group.totalShortageValue,
      "PHP " + group.totalValue.toFixed(2),
    ]);
    totals.font = { bold: true };
    totals.getCell(9).numFmt = "#,##0.00";

    grandValue += group.totalValue;
    grandShortage += group.totalShortageValue;
  }

  ws.addRow([]);
  const grand = ws.addRow(["Grand totals", "", "", "", "", "", "", "", grandShortage, "Total cost PHP " + grandValue.toFixed(2)]);
  grand.font = { bold: true };
  grand.getCell(9).numFmt = "#,##0.00";

  ws.addRow([]);
  ws.addRow([]);
  ws.addRow(["Prepared by: " + (report.session.counted_by ?? "____________")]);
  ws.addRow(["Verified by: " + (report.session.verified_by ?? "____________")]);
  ws.addRow(["Witnessed by: " + (report.session.witnessed_by ?? "____________")]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: fileBase(report) + ".xlsx" };
}

export async function exportCountReportPdf(id: number, form: "rpcppe" | "rpcsp"): Promise<{ buffer: Buffer; filename: string }> {
  const report = await buildCountReport(id, form);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(12);
  doc.text(title(report), pageWidth / 2, 36, { align: "center" });
  doc.setFontSize(9);
  doc.text("(Types of Property, Plant and Equipment)", pageWidth / 2, 50, { align: "center" });
  doc.text("As of " + (report.session.as_of_date ?? ""), pageWidth / 2, 62, { align: "center" });
  doc.text("Municipality of Mapandan", pageWidth / 2, 74, { align: "center" });
  doc.text(
    "Counted by: " + (report.session.counted_by ?? "___") +
    "   Verified by: " + (report.session.verified_by ?? "___") +
    "   Witnessed by: " + (report.session.witnessed_by ?? "___"),
    40, 90
  );

  let cursor = 104;
  for (const group of report.groups) {
    doc.setFontSize(10);
    doc.text(group.className, 40, cursor);
    cursor += 6;

    autoTable(doc, {
      startY: cursor,
      head: [HEADERS],
      body: group.rows.map((row) => [
        row.propertyNo,
        row.description,
        row.unit,
        row.unitValue.toFixed(2),
        row.dateAcquired ?? "",
        String(row.balanceQty),
        String(row.onHandQty),
        row.shortageQty ? String(row.shortageQty) : "",
        row.shortageValue ? row.shortageValue.toFixed(2) : "",
        row.remarks,
      ]),
      foot: [[
        "Totals", "", "", "", "",
        String(group.totalQty), String(group.totalQty), String(group.totalShortageQty),
        group.totalShortageValue.toFixed(2),
        "PHP " + group.totalValue.toFixed(2),
      ]],
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: "bold" },
      footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: "bold" },
      columnStyles: { 1: { cellWidth: 180 }, 9: { cellWidth: 130 } },
      margin: { left: 40, right: 40 },
    });

    const table = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    cursor = (table?.finalY ?? cursor) + 24;
  }

  doc.setFontSize(8);
  doc.text(
    "Grand total value: PHP " + report.summary.totalValue.toFixed(2) +
    "   Shortage value: PHP " + report.summary.totalShortageValue.toFixed(2),
    40, cursor
  );

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.text("Page " + p + " of " + pages, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return { buffer, filename: fileBase(report) + ".pdf" };
}
