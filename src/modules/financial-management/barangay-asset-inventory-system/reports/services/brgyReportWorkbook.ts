import ExcelJS from "exceljs";
import type { ReportAsset } from "./brgyReports";

const MONEY = "#,##0.00";

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function stampRow(sheet: ExcelJS.Worksheet, from: number, label: string, value: string) {
  const row = sheet.addRow([label, value]);
  row.font = { bold: true };
  for (let c = from; c <= sheet.columnCount; c += 1) sheet.getCell(row.number, c).border = { top: { style: "thin" } };
}

/** Section 4.8: the asset masterlist as a file. */
export async function buildMasterlistWorkbook(input: {
  barangay: string;
  asOf: string;
  rows: ReportAsset[];
  totalValue: number;
}): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Barangay Asset Inventory";
  const sheet = book.addWorksheet("Asset masterlist");

  sheet.columns = [
    { header: "Asset ID", key: "code", width: 18 },
    { header: "Description", key: "name", width: 34 },
    { header: "Office", key: "office", width: 24 },
    { header: "Custodian", key: "custodian", width: 26 },
    { header: "Condition", key: "condition", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Cost", key: "cost", width: 14 },
    { header: "Projected value", key: "projected", width: 16 },
    { header: "Total value", key: "total", width: 16 },
  ];

  for (const row of input.rows) {
    sheet.addRow({
      code: row.asset.asset_code,
      name: row.asset.name,
      office: row.office,
      custodian: row.custodian || "Unassigned",
      condition: row.asset.condition,
      status: row.asset.status,
      qty: row.asset.quantity,
      cost: row.asset.cost,
      projected: row.projected,
      total: row.total,
    });
  }
  sheet.getColumn("cost").numFmt = MONEY;
  sheet.getColumn("projected").numFmt = MONEY;
  sheet.getColumn("total").numFmt = MONEY;

  styleHeader(sheet);
  sheet.addRow([]);
  stampRow(sheet, 9, "Barangay", input.barangay);
  stampRow(sheet, 9, "As of", input.asOf);
  stampRow(sheet, 9, "Assets", String(input.rows.length));
  stampRow(sheet, 9, "Total value", input.totalValue.toFixed(2));

  return Buffer.from(await book.xlsx.writeBuffer());
}

/** Section 4.8: the property accountability list, grouped by custodian and ready for signing. */
export async function buildAccountabilityWorkbook(input: {
  barangay: string;
  asOf: string;
  groups: { custodian: string; rows: ReportAsset[]; total: number }[];
}): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Barangay Asset Inventory";
  const sheet = book.addWorksheet("Accountability");

  sheet.columns = [
    { header: "Custodian", key: "custodian", width: 28 },
    { header: "Asset ID", key: "code", width: 18 },
    { header: "Description", key: "name", width: 34 },
    { header: "Office", key: "office", width: 24 },
    { header: "Condition", key: "condition", width: 16 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Total value", key: "total", width: 16 },
  ];

  for (const group of input.groups) {
    const heading = sheet.addRow([group.custodian]);
    heading.font = { bold: true };
    for (const row of group.rows) {
      sheet.addRow({
        custodian: group.custodian,
        code: row.asset.asset_code,
        name: row.asset.name,
        office: row.office,
        condition: row.asset.condition,
        qty: row.asset.quantity,
        total: row.total,
      });
    }
    const subtotal = sheet.addRow(["", "", "", "", "Subtotal", "", group.total]);
    subtotal.font = { bold: true };
  }
  sheet.getColumn("total").numFmt = MONEY;
  styleHeader(sheet);
  sheet.addRow([]);
  stampRow(sheet, 7, "Barangay", input.barangay);
  stampRow(sheet, 7, "As of", input.asOf);

  return Buffer.from(await book.xlsx.writeBuffer());
}

/** Section 4.8: municipal consolidation, totals per barangay. */
export async function buildConsolidationWorkbook(input: {
  asOf: string;
  rows: { barangay: string; code: string; assets: number; cost: number; totalValue: number }[];
  totals: { assets: number; cost: number; totalValue: number };
}): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Barangay Asset Inventory";
  const sheet = book.addWorksheet("Consolidation");

  sheet.columns = [
    { header: "Code", key: "code", width: 12 },
    { header: "Barangay", key: "barangay", width: 28 },
    { header: "Assets", key: "assets", width: 10 },
    { header: "Cost", key: "cost", width: 16 },
    { header: "Projected total", key: "total", width: 18 },
  ];

  for (const row of input.rows) {
    sheet.addRow({ code: row.code, barangay: row.barangay, assets: row.assets, cost: row.cost, total: row.totalValue });
  }
  const total = sheet.addRow({ code: "", barangay: "Total", assets: input.totals.assets, cost: input.totals.cost, total: input.totals.totalValue });
  total.font = { bold: true };
  sheet.getColumn("cost").numFmt = MONEY;
  sheet.getColumn("total").numFmt = MONEY;
  styleHeader(sheet);
  sheet.addRow([]);
  stampRow(sheet, 5, "As of", input.asOf);

  return Buffer.from(await book.xlsx.writeBuffer());
}

/** Section 4.8: the count summary. */
export async function buildCountSummaryWorkbook(input: {
  barangay: string;
  year: number;
  status: string;
  found: number;
  notFound: number;
  notYetRecorded: number;
  conditionChanges: { assetCode: string; name: string; condition: string }[];
}): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Barangay Asset Inventory";
  const sheet = book.addWorksheet("Count summary");

  sheet.columns = [
    { header: "Result", key: "label", width: 30 },
    { header: "Count", key: "count", width: 12 },
  ];
  sheet.addRow({ label: "Found", count: input.found });
  sheet.addRow({ label: "Not found", count: input.notFound });
  sheet.addRow({ label: "Not yet recorded", count: input.notYetRecorded });
  styleHeader(sheet);
  sheet.addRow([]);
  stampRow(sheet, 2, "Barangay", input.barangay);
  stampRow(sheet, 2, "Year", String(input.year));
  stampRow(sheet, 2, "Count status", input.status);

  if (input.conditionChanges.length) {
    const changes = book.addWorksheet("Condition changes");
    changes.columns = [
      { header: "Asset ID", key: "code", width: 18 },
      { header: "Description", key: "name", width: 34 },
      { header: "Condition at count", key: "condition", width: 20 },
    ];
    for (const row of input.conditionChanges) changes.addRow({ code: row.assetCode, name: row.name, condition: row.condition });
    styleHeader(changes);
  }

  return Buffer.from(await book.xlsx.writeBuffer());
}
