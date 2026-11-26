import type {
  DepreciationRow,
  LedgerRow,
  LguAsset,
  LguAssetClass,
  ReportsResponse,
} from "../../types";
import { monthlyDepreciation } from "../../types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

function auth(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: "Bearer " + (TOKEN ?? "") };
}
function url(path: string): string {
  if (!BASE) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  return BASE.replace(/\/+$/, "") + path;
}
function text(v: unknown): string { return typeof v === "string" ? v : ""; }
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function bool(v: unknown): boolean { return v === true || v === 1 || v === "1"; }

interface JsonResult { data?: unknown }

async function get(path: string): Promise<JsonResult> {
  const res = await fetch(url(path), { headers: auth(), cache: "no-store" });
  const body = await res.text();
  if (!res.ok) throw new Error("GET " + res.status + ": " + body.slice(0, 250));
  return JSON.parse(body) as JsonResult;
}

function mapAsset(row: Record<string, unknown>): LguAsset {
  return {
    id: Number(row.id),
    property_no: text(row.property_no),
    description: text(row.description),
    class_id: num(row.class_id),
    is_semi_expendable: bool(row.is_semi_expendable),
    cost: num(row.cost),
    acquisition_date: (row.acquisition_date as string) ?? null,
    available_for_use_date: (row.available_for_use_date as string) ?? null,
    life_months: num(row.life_months),
    residual_value: num(row.residual_value),
    office_id: num(row.office_id),
    accountable_officer_id: null,
    accountable_officer_name: (row.accountable_officer_name as string) ?? null,
    location: (row.location as string) ?? null,
    condition_id: num(row.condition_id),
    mode_of_acquisition: ((row.mode_of_acquisition as string) ?? "purchase") as LguAsset["mode_of_acquisition"],
    fund_source_id: num(row.fund_source_id),
    donor_name: (row.donor_name as string) ?? null,
    supplier: (row.supplier as string) ?? null,
    po_no: (row.po_no as string) ?? null,
    invoice_no: (row.invoice_no as string) ?? null,
    iar_no: (row.iar_no as string) ?? null,
    par_no: (row.par_no as string) ?? null,
    ics_no: (row.ics_no as string) ?? null,
    serial_no: (row.serial_no as string) ?? null,
    brand: (row.brand as string) ?? null,
    model: (row.model as string) ?? null,
    remarks: (row.remarks as string) ?? null,
    record_status: ((row.record_status as string) ?? "active") as LguAsset["record_status"],
    disposed_at: (row.disposed_at as string) ?? null,
    disposal_reason: (row.disposal_reason as string) ?? null,
    book_value_at_disposal: num(row.book_value_at_disposal),
    unit_of_measure: text(row.unit_of_measure) || "pc",
    is_bulk_child: bool(row.is_bulk_child),
    bulk_batch_id: (row.bulk_batch_id as string) ?? null,
    batch_total: num(row.batch_total),
    rounding_remainder: num(row.rounding_remainder),
    voucher_no: (row.voucher_no as string) ?? null,
    status: text(row.status) || "active",
  };
}

function monthsBetween(from: string | null, to: string): number {
  if (!from) return 0;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

export function depreciationFor(asset: LguAsset, asOf: string): DepreciationRow {
  const cost = Number(asset.cost ?? 0);
  const residual = Number(asset.residual_value ?? 0);
  const life = Number(asset.life_months ?? 0);
  const monthly = monthlyDepreciation(cost, residual, asset.life_months);
  const elapsed = Math.min(monthsBetween(asset.available_for_use_date ?? asset.acquisition_date, asOf), life);
  const accumulated = Math.round(Math.min(cost - residual, monthly * elapsed) * 100) / 100;
  const bookValue = Math.round(Math.max(residual, cost - accumulated) * 100) / 100;
  return { asset, monthly, monthsElapsed: elapsed, accumulated, bookValue };
}

/** One computation feeds the screen, the ledger and any export. */
export async function buildReports(asOfInput?: string): Promise<ReportsResponse> {
  const asOf = asOfInput && /^\d{4}-\d{2}-\d{2}$/.test(asOfInput) ? asOfInput : new Date().toISOString().slice(0, 10);

  const [assetsJson, classesJson] = await Promise.all([
    get("/items/lgu_asset?filter=" + encodeURIComponent(JSON.stringify({ _and: [{ status: { _eq: "active" } }, { record_status: { _neq: "disposed" } }] })) + "&sort=property_no&limit=-1&fields=id,property_no,description,class_id,is_semi_expendable,cost,acquisition_date,available_for_use_date,life_months,residual_value,office_id,accountable_officer_name,location,condition_id,mode_of_acquisition,record_status,unit_of_measure,status"),
    get("/items/lgu_asset_class?sort=sort&limit=-1&fields=id,code,name,property_prefix,default_life_months,depreciable,sort,status"),
  ]);

  const assets = ((assetsJson.data ?? []) as Record<string, unknown>[]).map(mapAsset);
  const classes: LguAssetClass[] = ((classesJson.data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: Number(c.id),
    code: text(c.code),
    name: text(c.name),
    property_prefix: text(c.property_prefix),
    default_life_months: num(c.default_life_months),
    depreciable: bool(c.depreciable),
    sort: num(c.sort),
    status: text(c.status),
  }));

  const schedule: DepreciationRow[] = assets.map((asset) => depreciationFor(asset, asOf));

  const byClass = new Map<string, LedgerRow>();
  for (const row of schedule) {
    const cls = classes.find((c) => c.id === row.asset.class_id);
    const key = cls ? cls.name : "Unclassified";
    const current = byClass.get(key) ?? { className: key, count: 0, cost: 0, accumulated: 0, bookValue: 0 };
    current.count += 1;
    current.cost = Math.round((current.cost + Number(row.asset.cost ?? 0)) * 100) / 100;
    current.accumulated = Math.round((current.accumulated + row.accumulated) * 100) / 100;
    current.bookValue = Math.round((current.bookValue + row.bookValue) * 100) / 100;
    byClass.set(key, current);
  }

  const ledger = Array.from(byClass.values()).sort((a, b) => a.className.localeCompare(b.className));
  const totals = ledger.reduce(
    (acc, row) => ({
      count: acc.count + row.count,
      cost: Math.round((acc.cost + row.cost) * 100) / 100,
      accumulated: Math.round((acc.accumulated + row.accumulated) * 100) / 100,
      bookValue: Math.round((acc.bookValue + row.bookValue) * 100) / 100,
    }),
    { count: 0, cost: 0, accumulated: 0, bookValue: 0 }
  );

  const disposedJson = (((await get(
    "/items/lgu_asset?filter=" +
      encodeURIComponent(JSON.stringify({ record_status: { _eq: "disposed" } })) +
      "&fields=book_value_at_disposal,disposed_at&limit=-1"
  )).data ?? []) as { book_value_at_disposal?: string | number | null; disposed_at?: string | null }[]);
  let writtenOff = 0;
  let latestDate: string | null = null;
  for (const row of disposedJson) {
    writtenOff = Math.round((writtenOff + Number(row.book_value_at_disposal ?? 0)) * 100) / 100;
    if (row.disposed_at && (!latestDate || row.disposed_at > latestDate)) latestDate = row.disposed_at;
  }

  return { asOf, classes, ledger, schedule, totals, disposed: { count: disposedJson.length, writtenOff, latestDate } };
}
