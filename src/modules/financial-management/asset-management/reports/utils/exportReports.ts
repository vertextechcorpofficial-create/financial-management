import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { renderElement, drawPageNumbers } from "@/components/pdf-layout-design/PdfGenerator";
import type { PdfTemplate } from "@/components/pdf-layout-design/services/pdf-template";
import type { PdfData } from "@/components/pdf-layout-design/types";
import type { AssetReportsPayload, ActivityLogRow, ReportTabKey } from "../types";

export interface ExportSpec {
  title: string;
  subtitle: string;
  fileName: string;
  landscape?: boolean;
  columns: { header: string; numeric?: boolean }[];
  rows: { cells: (string | number)[]; isSection?: boolean; isTotal?: boolean; isGrand?: boolean }[];
}

const fmtNum = (val: number | null | undefined): string => {
  if (val === null || val === undefined || Math.abs(val) < 0.005) return "—";
  const abs = Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return val < 0 ? `(${abs})` : abs;
};

const MONTHS_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function buildExportSpec(
  tab: ReportTabKey,
  data: AssetReportsPayload,
  filteredActivityRows: ActivityLogRow[]
): ExportSpec {
  switch (tab) {
    case "register":
      return {
        title: "Asset Register",
        subtitle: `As at ${data.assetRegister.asOf}`,
        fileName: `asset-register-${data.asOf}`,
        landscape: true,
        columns: [
          { header: "Asset Tag" },
          { header: "RFID" },
          { header: "Asset" },
          { header: "Item Type" },
          { header: "Classification" },
          { header: "Department" },
          { header: "Assigned To" },
          { header: "Condition" },
          { header: "Acquired" },
          { header: "Cost", numeric: true },
          { header: "Accum. Dep.", numeric: true },
          { header: "Accum. Imp.", numeric: true },
          { header: "Projected Value", numeric: true },
          { header: "Status" },
        ],
        rows: [
          ...data.assetRegister.rows.map((r) => ({
            cells: [
              r.assetTag,
              r.rfid,
              r.assetName,
              r.itemType,
              r.classification,
              r.department,
              r.assignedTo,
              r.condition,
              r.acquired,
              r.cost,
              r.accumDep,
              r.accumImp,
              r.projectedValue,
              r.status,
            ],
          })),
          ...(data.assetRegister.rows.length > 0
            ? [
                {
                  isTotal: true,
                  cells: [
                    "Total (in use)",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    data.assetRegister.totals.cost,
                    data.assetRegister.totals.accumDep,
                    data.assetRegister.totals.accumImp,
                    data.assetRegister.totals.projectedValue,
                    "",
                  ],
                },
              ]
            : []),
        ],
      };

    case "rollforward":
      return {
        title: `PPE Movement Schedule — FY ${data.ppeMovement.year}`,
        subtitle: "IAS 16.73(e) Reconciliation · Amounts in PHP",
        fileName: `ppe-movement-fy${data.ppeMovement.year}`,
        landscape: true,
        columns: [
          { header: "Particulars" },
          ...data.ppeMovement.classifications.map((c) => ({ header: c, numeric: true })),
          { header: "Total", numeric: true },
        ],
        rows: data.ppeMovement.rows.map((r) =>
          r.type === "section"
            ? { isSection: true, cells: [r.particulars] }
            : {
                isTotal: r.type === "subtotal" || r.type === "grand",
                isGrand: r.type === "grand",
                cells: [
                  r.particulars,
                  ...data.ppeMovement.classifications.map((c) => r.values[c] ?? 0),
                  r.total,
                ],
              }
        ),
      };

    case "pl":
      return {
        title: `Financial Statement Impact — FY ${data.fsImpact.year}`,
        subtitle: "Debit / (Credit) · Amounts in PHP",
        fileName: `fs-impact-fy${data.fsImpact.year}`,
        landscape: false,
        columns: [
          { header: "Account" },
          { header: "Dr / (Cr)", numeric: true },
        ],
        rows: data.fsImpact.rows.map((r) =>
          r.type === "section"
            ? { isSection: true, cells: [r.account] }
            : {
                isTotal: r.type === "total",
                cells: [r.account, r.amount === null ? "" : r.amount],
              }
        ),
      };

    case "deptdep":
      return {
        title: `Depreciation by Department — FY ${data.depreciationByDept.year}`,
        subtitle: "Monthly depreciation allocation by cost centre · Amounts in PHP",
        fileName: `depreciation-by-dept-fy${data.depreciationByDept.year}`,
        landscape: true,
        columns: [
          { header: "Department" },
          ...MONTHS_SHORT.map((m) => ({ header: m, numeric: true })),
          { header: "Total", numeric: true },
        ],
        rows: [
          ...data.depreciationByDept.rows.map((r) => ({
            cells: [r.department, ...r.months, r.total],
          })),
          ...(data.depreciationByDept.rows.length > 0
            ? [
                {
                  isTotal: true,
                  cells: ["Total", ...data.depreciationByDept.totals, data.depreciationByDept.grandTotal],
                },
              ]
            : []),
        ],
      };

    case "forecast":
      return {
        title: "Depreciation Forecast",
        subtitle: `5-Year Projection from FY ${data.depreciationForecast.years[0] || data.year} · Existing assets only`,
        fileName: `depreciation-forecast-${data.asOf}`,
        landscape: true,
        columns: [
          { header: "Classification" },
          ...data.depreciationForecast.years.map((y) => ({ header: `FY ${y}`, numeric: true })),
        ],
        rows: [
          ...data.depreciationForecast.rows.map((r) => ({
            cells: [r.classification, ...data.depreciationForecast.years.map((y) => r.years[y] ?? 0)],
          })),
          ...(data.depreciationForecast.rows.length > 0
            ? [
                {
                  isTotal: true,
                  cells: [
                    "Total depreciation",
                    ...data.depreciationForecast.years.map((y) => data.depreciationForecast.totals[y] ?? 0),
                  ],
                },
              ]
            : []),
        ],
      };

    case "maint":
      return {
        title: "Maintenance Log",
        subtitle: `As at ${data.asOf} · Amounts in PHP`,
        fileName: `maintenance-log-${data.asOf}`,
        landscape: true,
        columns: [
          { header: "Date" },
          { header: "Tag" },
          { header: "Asset" },
          { header: "Department" },
          { header: "Type" },
          { header: "Description" },
          { header: "Vendor" },
          { header: "Downtime (d)", numeric: true },
          { header: "Cost", numeric: true },
          { header: "Treatment" },
          { header: "Next Due" },
        ],
        rows: [
          ...data.maintenanceLog.rows.map((r) => ({
            cells: [
              r.date,
              r.assetTag,
              r.assetName,
              r.department,
              r.type,
              r.description,
              r.vendor,
              r.downtimeDays !== null ? String(r.downtimeDays) : "—",
              r.cost ?? 0,
              r.treatment,
              r.nextDue,
            ],
          })),
          ...(data.maintenanceLog.rows.length > 0
            ? [
                {
                  isTotal: true,
                  cells: [
                    "Total",
                    "",
                    "",
                    "",
                    "",
                    `Expensed PHP ${fmtNum(data.maintenanceLog.expensedTotal)} · Capitalised PHP ${fmtNum(data.maintenanceLog.capitalisedTotal)}`,
                    "",
                    "",
                    data.maintenanceLog.totalCost,
                    "",
                    "",
                  ],
                },
              ]
            : []),
        ],
      };

    case "activity":
      return {
        title: "Activity Log",
        subtitle: `Append-only audit trail · As at ${data.asOf}`,
        fileName: `activity-log-${data.asOf}`,
        landscape: true,
        columns: [
          { header: "When" },
          { header: "User" },
          { header: "Role" },
          { header: "Action" },
          { header: "Asset" },
          { header: "Details" },
        ],
        rows: filteredActivityRows.map((r) => ({
          cells: [
            r.whenFormatted,
            r.userName,
            r.roleName || "—",
            r.actionName,
            r.assetTag || "—",
            r.details,
          ],
        })),
      };
  }
}

export function exportReportCSV(
  tab: ReportTabKey,
  data: AssetReportsPayload,
  filteredActivityRows: ActivityLogRow[]
) {
  const spec = buildExportSpec(tab, data, filteredActivityRows);
  const escapeCsv = (val: string | number) => {
    const str = typeof val === "number" ? val.toFixed(2) : String(val ?? "");
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines: string[] = [
    escapeCsv(spec.title),
    escapeCsv(spec.subtitle),
    "",
    spec.columns.map((c) => escapeCsv(c.header)).join(","),
    ...spec.rows.map((r) => r.cells.map(escapeCsv).join(",")),
  ];

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${spec.fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchPdfCompanyData(): Promise<PdfData | null> {
  try {
    const res = await fetch("/api/pdf/company", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: PdfData[] | PdfData };
    if (Array.isArray(json.data)) return json.data[0] ?? null;
    return json.data ?? null;
  } catch {
    return null;
  }
}

export async function buildReportPdfDocument(
  tab: ReportTabKey,
  data: AssetReportsPayload,
  filteredActivityRows: ActivityLogRow[],
  selectedTemplate: PdfTemplate | null,
  companyData: PdfData | null
): Promise<{ doc: jsPDF; fileName: string; title: string }> {
  const spec = buildExportSpec(tab, data, filteredActivityRows);
  const tplConfig = selectedTemplate?.config;

  const orientation =
    tplConfig?.orientation || (spec.landscape || spec.columns.length > 6 ? "landscape" : "portrait");
  let format: string | [number, number] = tplConfig?.paperSize?.toLowerCase() || "a4";
  if (format === "custom" && tplConfig?.customSize) {
    format = [tplConfig.customSize.width, tplConfig.customSize.height];
  }

  const margins = tplConfig?.margins || { top: 12, right: 12, bottom: 12, left: 12 };

  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let startY = margins.top;

  if (selectedTemplate?.config?.elements) {
    const elements = Object.values(selectedTemplate.config.elements);
    let lowestY = margins.top || 10;
    for (const el of elements) {
      if (!el.visible) continue;
      try {
        renderElement(doc, el, companyData);
      } catch {
        // Skip malformed element safely
      }
      const elementBottom = el.y + el.height;
      if (elementBottom > lowestY) lowestY = elementBottom;
    }
    startY = (selectedTemplate.config.bodyStart ?? lowestY) + 4;
  } else {
    // Fallback header if no PDF Layout template exists in DB
    const compName =
      typeof companyData?.company_name === "string" && companyData.company_name.trim()
        ? companyData.company_name
        : "FINANCIAL MANAGEMENT SYSTEM";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(compName, margins.left, startY + 5);
    startY += 10;
  }

  // Report Title & Subtitle below PDF Layout Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(spec.title, margins.left, startY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(spec.subtitle, margins.left, startY + 9);
  doc.text(`Generated ${new Date().toLocaleString("en-PH")}`, pageWidth - margins.right, startY + 4, {
    align: "right",
  });

  const tableStartY = startY + 13;

  const body = spec.rows.map((row) => {
    if (row.isSection) {
      return [
        {
          content: String(row.cells[0] || ""),
          colSpan: spec.columns.length,
          styles: {
            fontStyle: "bold" as const,
            fillColor: [241, 245, 249] as [number, number, number],
            textColor: [71, 85, 105] as [number, number, number],
          },
        },
      ];
    }
    return row.cells.map((cell, idx) => {
      const col = spec.columns[idx];
      const text = typeof cell === "number" ? fmtNum(cell) : String(cell ?? "");
      return {
        content: text,
        styles: {
          halign: (col?.numeric ? "right" : "left") as "right" | "left",
          fontStyle: (row.isTotal ? "bold" : "normal") as "bold" | "normal",
          fillColor: row.isGrand
            ? ([236, 253, 245] as [number, number, number])
            : row.isTotal
            ? ([248, 250, 252] as [number, number, number])
            : undefined,
        },
      };
    });
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [
      spec.columns.map((c) => ({
        content: c.header,
        styles: { halign: (c.numeric ? "right" : "left") as "right" | "left" },
      })),
    ],
    body: body.length > 0 ? body : [[{ content: "No records found.", colSpan: spec.columns.length }]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: spec.columns.length > 10 ? 6.2 : 7.8,
      cellPadding: 1.8,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [27, 67, 50],
      textColor: 255,
      fontStyle: "bold",
    },
    margin: {
      left: margins.left,
      right: margins.right,
      bottom: margins.bottom + 6,
    },
    didDrawPage: () => {
      if (!tplConfig?.pageNumber?.show) {
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${doc.getNumberOfPages()}`,
          pageWidth - margins.right,
          pageHeight - Math.max(6, margins.bottom / 2),
          { align: "right" }
        );
      }
    },
  });

  if (tplConfig?.pageNumber?.show) {
    drawPageNumbers(doc, tplConfig);
  }

  return { doc, fileName: `${spec.fileName}.pdf`, title: spec.title };
}
