import { jsPDF } from "jspdf";
import type { LguAsset, LguAssetDocument } from "../../types";

/**
 * A sample PAR or ICS, drawn from the record we already hold.
 *
 * It is deliberately marked as a sample: we do not have the municipality's official
 * blank, and a form that looks official but is not would be worse than handwriting,
 * because nobody would notice the difference until an auditor did.
 */
export interface DocumentPrintInput {
  asset: LguAsset;
  document: LguAssetDocument;
  officeName: string;
  className?: string | null;
  conditionName?: string | null;
}

const piso = (n: number) =>
  "PHP " + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildDocumentPdf(input: DocumentPrintInput): jsPDF {
  const { asset, document, officeName, className, conditionName } = input;
  const isIcs = document.doc_type === "ICS" || asset.is_semi_expendable;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = 595.28;
  const M = 48;
  let y = M;

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    doc.setDrawColor(120);
    doc.setLineWidth(0.6);
    doc.line(x1, y1, x2, y2);
  };
  const label = (text: string, x: number, yy: number, size = 8) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(90);
    doc.text(text, x, yy);
  };
  const value = (text: string, x: number, yy: number, size = 10, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(20);
    doc.text(text, x, yy);
  };

  // sample watermark, drawn first so the content sits on top
  doc.saveGraphicsState();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(64);
  doc.setTextColor(242);
  doc.text("SAMPLE TEMPLATE", W / 2, 430, { align: "center", angle: 34 });
  doc.restoreGraphicsState();

  // letterhead
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text("Republic of the Philippines", W / 2, y, { align: "center" });
  y += 12;
  doc.text("Province of Pangasinan", W / 2, y, { align: "center" });
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("MUNICIPALITY OF MAPANDAN", W / 2, y, { align: "center" });
  y += 13;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(officeName || "Office of the Municipal Accountant", W / 2, y, { align: "center" });
  y += 26;

  // title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(isIcs ? "INVENTORY CUSTODIAN SLIP" : "PROPERTY ACKNOWLEDGMENT RECEIPT", W / 2, y, { align: "center" });
  y += 12;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(isIcs ? "Sample layout for semi-expendable property" : "Sample layout for property, plant and equipment", W / 2, y, { align: "center" });
  y += 20;

  // form number and date
  doc.setDrawColor(160);
  doc.setLineWidth(0.7);
  doc.rect(M, y, W - M * 2, 26);
  label(isIcs ? "ICS No." : "PAR No.", M + 8, y + 10);
  value(document.doc_no, M + 58, y + 19, 11, true);
  label("Date", W - M - 130, y + 10);
  value(document.doc_date ?? "", W - M - 130, y + 19, 10);
  y += 26 + 16;

  // entity
  value("Entity Name: Municipality of Mapandan", M, y, 9);
  y += 20;

  // property table
  // 80 for the number, 170 for the description, 85 for money, 30 for qty, the rest for the total
  const cols = [M, M + 80, M + 250, M + 335, M + 365, W - M];
  const headers = ["Property No.", "Description", "Unit Cost", "Qty", "Total Cost"];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setDrawColor(120);
  doc.rect(M, y, W - M * 2, 18);
  doc.rect(M, y, W - M * 2, 46);
  headers.forEach((h, i) => doc.text(h, cols[i] + 5, y + 12));
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const desc = doc.splitTextToSize(asset.description ?? "", 162);
  doc.text(asset.property_no ?? "", cols[0] + 5, y + 11);
  doc.text(desc.slice(0, 2), cols[1] + 5, y + 11);
  doc.text(piso(Number(asset.cost ?? 0)), cols[2] + 5, y + 11);
  doc.text("1", cols[3] + 5, y + 11);
  doc.text(piso(Number(asset.cost ?? 0)), cols[4] + 5, y + 11);
  y += 45;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TOTAL", cols[2] - 40, y - 6);
  doc.text(piso(Number(asset.cost ?? 0)), cols[4] + 5, y - 6);
  y += 10;

  // details the office writes by hand today
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const details: [string, string][] = [
    ["Class", className ?? ""],
    ["Acquired", asset.acquisition_date ?? ""],
    ["Life, months", asset.life_months ? String(asset.life_months) : ""],
    ["Serial No.", asset.serial_no ?? ""],
    ["Model", asset.model ?? ""],
    ["Location", asset.location ?? ""],
    ["Condition", conditionName ?? ""],
    ["Remarks", asset.remarks ?? ""],
  ];
  const halfCol = (W - M * 2) / 2;
  const labelOffset = 84;
  details.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * halfCol;
    const yy = y + row * 13;
    label(k + ":", x, yy);
    // measure, do not guess: the value is cut to the space it actually has
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const room = halfCol - labelOffset - 10;
    const fitted = doc.splitTextToSize(v, room)[0] ?? "";
    value(fitted, x + labelOffset, yy, 9);
  });
  y += Math.ceil(details.length / 2) * 13 + 18;

  // acknowledgement body
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(20);
  const body = isIcs
    ? "I hereby acknowledge receipt of the semi-expendable property described above, which I shall hold in trust and for which I am accountable, and I undertake to report any loss, damage or transfer in accordance with the rules of the Commission on Audit."
    : "I hereby acknowledge to have received from the Municipality of Mapandan the property, plant and equipment described above, which I shall hold and use for the purpose intended, and for which I am accountable, and I undertake to report any loss, damage or transfer in accordance with the rules of the Commission on Audit.";
  doc.text(doc.splitTextToSize(body, W - M * 2), M, y);
  y += 52;

  // signatures
  const half = (W - M * 2) / 2;
  const sig = (title: string, name: string, x: number, yy: number) => {
    label(title, x, yy, 8);
    doc.setFont("helvetica", name ? "bold" : "normal");
    doc.setFontSize(10);
    const fittedName = name ? doc.splitTextToSize(name, half - 30)[0] : "";
    if (fittedName) value(fittedName, x, yy + 22, 10, true);
    line(x, yy + 26, x + half - 24, yy + 26);
    label(title.startsWith("Received") ? "Signature over printed name, date" : "Signature over printed name", x, yy + 38, 7);
  };
  sig("Received by:", document.issued_to ?? "", M, y);
  sig("Issued by:", "", M + half, y);
  y += 70;
  sig("Approved by:", "", M, y);

  // sample note, so nobody files this as the official blank
  y += 66;
  line(M, y, W - M, y);
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("SAMPLE TEMPLATE. Not the official municipal form.", M, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Generated by the LGU Asset Management System because the approved blank was not available.",
    M,
    y + 11
  );
  doc.text("Replace this layout once the official PAR or ICS is adopted.", M, y + 22);
  doc.setTextColor(60);
  doc.setFontSize(7);
  doc.text("Printed " + new Date().toISOString().slice(0, 10) + " from the LGU asset register for " + (asset.property_no ?? ""), M, y + 36);

  return doc;
}

/** Opens the browser print dialog for the generated form. */
export function printDocument(input: DocumentPrintInput): void {
  const pdf = buildDocumentPdf(input);
  const url = pdf.output("bloburl");
  const win = window.open(url as unknown as string, "_blank");
  if (!win) pdf.save((input.document.doc_no || "form") + ".pdf");
}
