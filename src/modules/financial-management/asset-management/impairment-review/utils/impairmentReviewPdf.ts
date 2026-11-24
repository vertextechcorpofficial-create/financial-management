import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { ReviewLineItem, ImpairmentKPIData } from "../types";

export interface CompanyProfile {
  companyName: string | null;
  address: string | null;
  tin: string | null;
  logoDataUrl: string | null;
}

export async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  try {
    const res = await fetch("/api/fm/company-profile", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: CompanyProfile | null };
    return json.data ?? null;
  } catch {
    return null;
  }
}

const formatCurrency = (val?: number | null) => {
  if (val === null || val === undefined) return "—";
  return `PHP ${Number(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export async function generateImpairmentReviewPDF({
  reviewTitle,
  reviewDate,
  kpis,
  lines,
}: {
  reviewTitle: string;
  reviewDate: string;
  kpis?: ImpairmentKPIData;
  lines: ReviewLineItem[];
}) {
  const profile = await fetchCompanyProfile();

  // Create A4 Landscape document for clean tabular data presentation
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let currentY = 35;

  // 1. Company Logo (if available)
  if (profile?.logoDataUrl) {
    try {
      doc.addImage(profile.logoDataUrl, "PNG", margin, currentY, 45, 45);
    } catch {
      // Ignore logo loading failures gracefully
    }
  }

  // 2. Company Profile & Report Header (Centered layout)
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(profile?.companyName || "FINANCIAL MANAGEMENT SYSTEM", pageWidth / 2, currentY + 12, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);

  let subHeaderY = currentY + 24;
  if (profile?.address) {
    doc.text(profile.address, pageWidth / 2, subHeaderY, { align: "center" });
    subHeaderY += 10;
  }
  if (profile?.tin) {
    doc.text(`TIN: ${profile.tin}`, pageWidth / 2, subHeaderY, { align: "center" });
    subHeaderY += 10;
  }

  // Report Title
  subHeaderY += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("IMPAIRMENT REVIEW REPORT (IAS 36)", pageWidth / 2, subHeaderY, { align: "center" });

  subHeaderY += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${reviewTitle} · Reporting Date: ${reviewDate}`,
    pageWidth / 2,
    subHeaderY,
    { align: "center" }
  );

  currentY = subHeaderY + 20;

  // Metadata Bar (Printed On, Total Assets Reviewed)
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 12;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Printed On: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, margin, currentY);
  doc.text(
    `Assets Reviewed: ${lines.length} | Indicators Found: ${kpis?.assetsWithIndicators ?? lines.filter((l) => l.indicators.length > 0).length} | Total Flagged: ${formatCurrency(kpis?.carryingAmountFlagged)}`,
    pageWidth - margin,
    currentY,
    { align: "right" }
  );

  currentY += 12;

  // 3. Structured Data Table with proper columns
  const tableRows = lines.map((l, index) => {
    const indicatorsStr =
      l.indicators.length > 0
        ? l.indicators.map((ind) => ind.label).join(", ")
        : "None";

    let conclusionStr = l.conclusion_name || "Unconcluded";
    if (l.loss_amount && l.loss_amount > 0) {
      conclusionStr += ` (Loss: ${formatCurrency(l.loss_amount)})`;
    }

    return [
      String(index + 1),
      l.asset_tag,
      l.item_name,
      l.classification_name,
      l.department_name,
      l.condition_name,
      formatCurrency(l.carrying_amount),
      indicatorsStr,
      conclusionStr,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        "#",
        "Asset Tag",
        "Item Description",
        "Classification",
        "Department",
        "Condition",
        "Carrying Amount",
        "Indicators Found",
        "Conclusion / Test Result",
      ],
    ],
    body: tableRows,
    theme: "striped",
    styles: {
      fontSize: 8,
      cellPadding: 4.5,
      textColor: [30, 41, 59],
      overflow: "linebreak",
      font: "helvetica",
    },
    headStyles: {
      fillColor: [27, 67, 50], // Deep Emerald Green theme matching app
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: 20, halign: "center" },
      1: { cellWidth: 55, fontStyle: "bold" },
      2: { cellWidth: 140 },
      3: { cellWidth: 80 },
      4: { cellWidth: 80 },
      5: { cellWidth: 60 },
      6: { cellWidth: 90, halign: "right", fontStyle: "bold" },
      7: { cellWidth: 110 },
      8: { cellWidth: 120 },
    },
    margin: { left: margin, right: margin, bottom: 40 },
    didDrawPage: (data) => {
      // Clean Footer with Page Number
      const pageStr = `Page ${data.pageNumber} of {total_pages_count_string}`;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(pageStr, pageWidth / 2, pageHeight - 20, { align: "center" });
      doc.text("Official Record - Financial Management", margin, pageHeight - 20);
      doc.text("Confidential", pageWidth - margin, pageHeight - 20, { align: "right" });
    },
  });

  // Calculate total pages for footer placeholder
  const docWithPages = doc as jsPDF & { putTotalPages?: (placeholder: string) => void };
  if (typeof docWithPages.putTotalPages === "function") {
    docWithPages.putTotalPages("{total_pages_count_string}");
  }

  // Save the document with clean filename
  const safeDate = reviewDate.replace(/[^0-9a-zA-Z_-]/g, "_");
  doc.save(`Impairment_Review_${safeDate}.pdf`);
}
