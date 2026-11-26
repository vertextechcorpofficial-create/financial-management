import ExcelJS from "exceljs";
import type { LguAsset, LguOffice } from "../types";
import { bookValueAt, monthlyDepreciation } from "../types";

const MONEY = '#,##0.00';

function header(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function stamp(sheet: ExcelJS.Worksheet, from: number, label: string, value: string) {
  const row = sheet.addRow([label, value]);
  row.font = { bold: true };
  for (let c = from; c <= sheet.columnCount; c += 1) sheet.getCell(row.number, c).border = { top: { style: "thin" } };
}

export interface RegistryExportInput {
  assets: LguAsset[];
  classes: { id: number; name: string }[];
  offices: LguOffice[];
  conditions: { id: number; name: string }[];
  asOf: string;
}

export async function buildRegistryWorkbook(input: RegistryExportInput): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "LGU Asset Management";
  const sheet = book.addWorksheet("Property register");

  const className = new Map(input.classes.map((c) => [c.id, c.name]));
  const officeName = new Map(input.offices.map((o) => [o.id, o.name]));
  const conditionName = new Map(input.conditions.map((c) => [c.id, c.name]));

  sheet.columns = [
    { header: "Property No.", key: "property_no", width: 18 },
    { header: "Description", key: "description", width: 34 },
    { header: "Class", key: "class", width: 22 },
    { header: "Office", key: "office", width: 28 },
    { header: "Condition", key: "condition", width: 14 },
    { header: "Status", key: "status", width: 13 },
    { header: "Cost", key: "cost", width: 14, style: { numFmt: MONEY } },
    { header: "Acquired", key: "acquired", width: 12 },
    { header: "Life in months", key: "life", width: 14 },
    { header: "Monthly depreciation", key: "monthly", width: 21, style: { numFmt: MONEY } },
    { header: "Accumulated depreciation", key: "accumulated", width: 22, style: { numFmt: MONEY } },
    { header: "Book value", key: "book", width: 16, style: { numFmt: MONEY } },
    { header: "Accountable officer", key: "officer", width: 24 },
    { header: "Location", key: "location", width: 22 },
    { header: "Serial No.", key: "serial", width: 18 },
    { header: "Remarks", key: "remarks", width: 30 },
  ];

  let cost = 0;
  let accumulated = 0;
  let bookValue = 0;

  for (const asset of input.assets) {
    const monthly = monthlyDepreciation(Number(asset.cost ?? 0), Number(asset.residual_value ?? 0), asset.life_months);
    const life = Number(asset.life_months ?? 0);
    const value = bookValueAt(asset, input.asOf);
    const dep = Math.round((Number(asset.cost ?? 0) - value) * 100) / 100;
    cost = Math.round((cost + Number(asset.cost ?? 0)) * 100) / 100;
    accumulated = Math.round((accumulated + (Number(asset.cost ?? 0) - value)) * 100) / 100;
    bookValue = Math.round((bookValue + value) * 100) / 100;

    sheet.addRow({
      property_no: asset.property_no,
      description: asset.description,
      class: asset.class_id ? className.get(asset.class_id) ?? "" : "",
      office: asset.office_id ? officeName.get(asset.office_id) ?? "" : "",
      condition: asset.condition_id ? conditionName.get(asset.condition_id) ?? "" : "",
      status: asset.record_status,
      cost: Number(asset.cost ?? 0),
      acquired: asset.acquisition_date ?? "",
      life: life || "",
      monthly,
      accumulated: dep,
      book: value,
      officer: asset.accountable_officer_name ?? "unassigned",
      location: asset.location ?? "",
      serial: asset.serial_no ?? "",
      remarks: asset.remarks ?? "",
    });
  }

  header(sheet);
  stamp(sheet, 1, "Total cost", cost.toFixed(2));
  sheet.getCell(sheet.rowCount, 2).numFmt = MONEY;
  stamp(sheet, 1, "Total book value as of " + input.asOf, bookValue.toFixed(2));
  sheet.getCell(sheet.rowCount, 2).numFmt = MONEY;
  stamp(sheet, 1, "Accumulated depreciation", accumulated.toFixed(2));
  sheet.getCell(sheet.rowCount, 2).numFmt = MONEY;
  stamp(sheet, 1, "Assets listed", String(input.assets.length));

  const out = await book.xlsx.writeBuffer();
  return Buffer.from(out);
}

export interface CustodyExportInput {
  rows: {
    asset: LguAsset;
    documents: number;
    lastMovement: string | null;
  }[];
  offices: LguOffice[];
}

export async function buildCustodyWorkbook(input: CustodyExportInput): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "LGU Asset Management";
  const sheet = book.addWorksheet("Custody");

  const officeName = new Map(input.offices.map((o) => [o.id, o.name]));

  sheet.columns = [
    { header: "Property No.", key: "property_no", width: 18 },
    { header: "Description", key: "description", width: 34 },
    { header: "Form", key: "form", width: 8 },
    { header: "Cost", key: "cost", width: 14, style: { numFmt: MONEY } },
    { header: "Accountable officer", key: "officer", width: 26 },
    { header: "Office", key: "office", width: 30 },
    { header: "Documents", key: "documents", width: 12 },
    { header: "Last movement", key: "last", width: 16 },
    { header: "Location", key: "location", width: 22 },
  ];

  let total = 0;
  let assigned = 0;
  for (const row of input.rows) {
    total = Math.round((total + Number(row.asset.cost ?? 0)) * 100) / 100;
    if (row.asset.accountable_officer_name) assigned += 1;
    sheet.addRow({
      property_no: row.asset.property_no,
      description: row.asset.description,
      form: row.asset.is_semi_expendable ? "ICS" : "PAR",
      cost: Number(row.asset.cost ?? 0),
      officer: row.asset.accountable_officer_name ?? "unassigned",
      office: row.asset.office_id ? officeName.get(row.asset.office_id) ?? "" : "",
      documents: row.documents,
      last: row.lastMovement ?? "",
      location: row.asset.location ?? "",
    });
  }

  header(sheet);
  stamp(sheet, 1, "Assets listed", String(input.rows.length));
  stamp(sheet, 1, "Assigned to an officer", String(assigned));
  stamp(sheet, 1, "Unassigned", String(input.rows.length - assigned));
  stamp(sheet, 1, "Total cost", total.toFixed(2));
  sheet.getCell(sheet.rowCount, 2).numFmt = MONEY;

  const out = await book.xlsx.writeBuffer();
  return Buffer.from(out);
}
