import { jsPDF } from "jspdf";
import type { BrgyAsset } from "../types";

/**
 * Code 39, so the printed label is a real barcode a scanner can read, not decoration.
 * Each character is nine elements, five bars and four spaces, alternating bar first.
 */
const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn",
  F: "nnwnwwnnn", G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn",
  P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn", S: "nnwnnnwwn", T: "nnnnwnwwn",
  U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn",
  Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
};

function drawCode39(doc: jsPDF, value: string, x: number, y: number, height: number, narrow = 0.32) {
  const wide = narrow * 2.4;
  const encoded = "*" + value.toUpperCase().split("").filter((c) => CODE39[c]).join("") + "*";
  let cursor = x;
  for (const char of encoded) {
    const pattern = CODE39[char];
    if (!pattern) continue;
    for (let i = 0; i < pattern.length; i += 1) {
      const width = pattern[i] === "w" ? wide : narrow;
      const isBar = i % 2 === 0;
      if (isBar) doc.rect(cursor, y, width, height, "F");
      cursor += width;
    }
    cursor += narrow; // the inter character gap
  }
  return cursor;
}

/** Section 4.1: an optional label with the asset's barcode and name to stick on the item. */
export function printAssetLabel(input: { asset: BrgyAsset; barangay: string }): void {
  const { asset, barangay } = input;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [100, 50] });

  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text(barangay, 4, 5);

  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  const name = asset.name.length > 46 ? asset.name.slice(0, 45) + "." : asset.name;
  doc.text(name, 4, 10);

  const printable = asset.barcode || asset.tag_no || asset.asset_code;
  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  const barsWidth = 92;
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);
  const end = drawCode39(doc, printable, 4, 14, 18);
  const scale = end > 4 + barsWidth ? barsWidth / (end - 4) : 1;
  if (scale !== 1) {
    // redraw narrower when the code is too wide for the label
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 12, 100, 22, "F");
    doc.setFillColor(0, 0, 0);
    drawCode39(doc, printable, 4, 14, 18, 0.32 * scale);
  }

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text(printable, 4, 37);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  doc.text(asset.asset_code + "  |  qty " + asset.quantity + "  |  " + asset.condition, 4, 42);

  doc.setFontSize(6);
  doc.text("Barangay Asset Inventory. Affix to the item.", 4, 47);

  const url = doc.output("bloburl");
  window.open(String(url), "_blank");
}
