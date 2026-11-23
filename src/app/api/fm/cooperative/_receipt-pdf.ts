import { jsPDF } from "jspdf";

export function cooperativeReceiptPdf(orNo: string, rows: [string, string][], reversed?: boolean) {
  const pdf = new jsPDF({ unit: "mm", format: "a5" });
  pdf.setProperties({ title: `Cooperative Official Receipt ${orNo}` });
  pdf.setFontSize(16);
  pdf.text("Employee Cooperative", 14, 21);
  pdf.setFontSize(12);
  pdf.text(`Official receipt ${orNo}`, 14, 30);
  if (reversed) pdf.text("Reversed", 134, 30, { align: "right" });
  pdf.line(14, 35, 134, 35);
  pdf.setFontSize(10);
  let y = 44;
  for (const [label, value] of rows) {
    const lines = pdf.splitTextToSize(value, 78) as string[];
    pdf.text(label, 14, y);
    pdf.text(lines, 55, y);
    y += 7 + (lines.length - 1) * 5;
  }
  return new Response(pdf.output("arraybuffer"), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${orNo.replace(/[^a-zA-Z0-9-]/g, "")}.pdf"`,
    "X-Content-Type-Options": "nosniff",
  } });
}
