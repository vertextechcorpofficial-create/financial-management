import { NextResponse } from "next/server";
import type {
  AssetReportsPayload,
  AssetRegisterRow,
  PpeMovementRow,
  FsImpactRow,
  DeptDepRow,
  ForecastRow,
  MaintenanceLogRow,
  ActivityLogRow,
  ActivityLogChange,
} from "@/modules/financial-management/asset-management/reports/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusAsset {
  id: number;
  asset_tag?: string | null;
  rfid_code?: string | null;
  item_id?: number | null;
  department?: number | null;
  employee?: number | null;
  condition?: string | null;
  condition_id?: number | null;
  date_acquired?: string | null;
  available_for_use_date?: string | null;
  cost_per_item?: number | string | null;
  acquisition_cost?: number | string | null;
  residual_value?: number | string | null;
  life_span?: number | string | null;
  life_months?: number | string | null;
  record_status_id?: number | null;
  is_active?: number | boolean | null;
}

interface DirectusItem {
  id: number;
  item_name?: string | null;
  item_type?: number | null;
  item_classification?: number | null;
}

interface DirectusItemType {
  id: number;
  type_name?: string | null;
}

interface DirectusClassification {
  id: number;
  classification_name?: string | null;
}

interface DirectusDepartment {
  department_id: number;
  department_name?: string | null;
}

interface DirectusUser {
  user_id: number;
  user_fname?: string | null;
  user_lname?: string | null;
}

interface DirectusEvent {
  id: number;
  asset_id: number;
  event_type_id: number;
  event_date?: string | null;
  period?: string | null;
  status_id: number;
  carrying_amount_before?: number | string | null;
  impact?: number | string | null;
  proceeds?: number | string | null;
  costs_of_disposal?: number | string | null;
  amount?: number | string | null;
  capitalize?: number | boolean | null;
  replaced_carrying_amount?: number | string | null;
  remarks?: string | null;
}

interface DirectusMaintOrder {
  id: number;
  asset_id?: number | null;
  description?: string | null;
  generated_at?: string | null;
  completed_at?: string | null;
  performed_date?: string | null;
  maintenance_type_id?: number | null;
  vendor?: string | null;
  cost?: number | string | null;
  downtime_days?: number | string | null;
  treatment_id?: number | null;
  warranty_covered?: number | boolean | null;
  next_service_due?: string | null;
}

interface DirectusLookup {
  id: number;
  code?: string | null;
  name?: string | null;
}

interface DirectusAuditLog {
  id: number;
  logged_at?: string | null;
  user_id?: number | null;
  user_name?: string | null;
  role_name?: string | null;
  action_id?: number | null;
  asset_id?: number | null;
  details?: unknown;
  changes?: unknown;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function formatDateTime(dtStr?: string | null): string {
  if (!dtStr) return "—";
  try {
    const d = new Date(dtStr);
    if (Number.isNaN(d.getTime())) return dtStr;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dtStr;
  }
}

function toDateOnly(dtStr?: string | null): string {
  if (!dtStr) return "";
  return dtStr.slice(0, 10);
}

function ymDiffInclusive(startYm: string, endYm: string): number {
  const [sy, sm] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return 0;
  const diff = (ey - sy) * 12 + (em - sm) + 1;
  return Math.max(0, diff);
}

/**
 * Mid-month convention (PFRS / PAS 16):
 * Available on or before the 15th -> depreciation starts in that month.
 * After the 15th -> starts in the next month.
 */
function firstDepYm(dateStr?: string | null): string | null {
  if (!dateStr || dateStr.length < 7) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const d = dateStr.length >= 10 ? parseInt(dateStr.slice(8, 10), 10) : 1;
  if (!y || !m) return null;
  if (d <= 15) {
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

async function safeFetchList<T>(path: string): Promise<T[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: T[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const asOf = now.toISOString().slice(0, 10);
    const asOfYm = asOf.slice(0, 7);
    const defaultYear = asOf.slice(0, 4);
    const requestedYear = searchParams.get("year") || defaultYear;

    const [
      assets,
      items,
      itemTypes,
      classifications,
      departments,
      users,
      events,
      maintOrders,
      maintTypes,
      maintTreatments,
      auditLogs,
      auditActions,
    ] = await Promise.all([
      safeFetchList<DirectusAsset>("/items/assets_and_equipment?limit=500&sort=id"),
      safeFetchList<DirectusItem>("/items/items?limit=1000"),
      safeFetchList<DirectusItemType>("/items/item_type?limit=500"),
      safeFetchList<DirectusClassification>("/items/item_classification?limit=500"),
      safeFetchList<DirectusDepartment>("/items/department?limit=200"),
      safeFetchList<DirectusUser>("/items/user?limit=500"),
      safeFetchList<DirectusEvent>("/items/asset_events?limit=1000"),
      safeFetchList<DirectusMaintOrder>("/items/maintenance_work_orders?limit=500&sort=-id"),
      safeFetchList<DirectusLookup>("/items/asset_maintenance_types?limit=50"),
      safeFetchList<DirectusLookup>("/items/asset_maintenance_treatments?limit=50"),
      safeFetchList<DirectusAuditLog>("/items/asset_audit_log?limit=500&sort=-id"),
      safeFetchList<DirectusLookup>("/items/asset_audit_actions?limit=100"),
    ]);

    // Build lookup maps
    const itemMap = new Map<number, DirectusItem>(items.map((i) => [i.id, i]));
    const itemTypeMap = new Map<number, string>(
      itemTypes.map((t) => [t.id, t.type_name || "General"])
    );
    const classMap = new Map<number, string>(
      classifications.map((c) => [c.id, c.classification_name || "Unclassified"])
    );
    const deptMap = new Map<number, string>(
      departments.map((d) => [d.department_id, d.department_name || "Unassigned"])
    );
    const userMap = new Map<number, string>(
      users.map((u) => [u.user_id, `${u.user_fname || ""} ${u.user_lname || ""}`.trim() || `User #${u.user_id}`])
    );
    const maintTypeMap = new Map<number, string>(
      maintTypes.map((t) => [t.id, t.name || t.code || "Maintenance"])
    );
    const maintTreatmentMap = new Map<number, { code: string; name: string }>(
      maintTreatments.map((t) => [t.id, { code: t.code || "", name: t.name || t.code || "—" }])
    );
    const auditActionMap = new Map<number, { code: string; name: string }>(
      auditActions.map((a) => [a.id, { code: a.code || String(a.id), name: a.name || a.code || "Action" }])
    );

    // Group approved events by asset
    const approvedEvents = events.filter((e) => e.status_id === 2);
    const eventsByAsset = new Map<number, DirectusEvent[]>();
    for (const ev of approvedEvents) {
      const list = eventsByAsset.get(ev.asset_id) || [];
      list.push(ev);
      eventsByAsset.set(ev.asset_id, list);
    }

    // Collect available years from real data
    const yearSet = new Set<string>([defaultYear]);
    for (const a of assets) {
      const d = toDateOnly(a.available_for_use_date || a.date_acquired);
      if (d && d.length >= 4) yearSet.add(d.slice(0, 4));
    }
    for (const ev of approvedEvents) {
      const d = toDateOnly(ev.event_date);
      if (d && d.length >= 4) yearSet.add(d.slice(0, 4));
    }
    const availableYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));
    const selectedYear = yearSet.has(requestedYear) ? requestedYear : defaultYear;

    // Enrich assets with real computed accounting metrics
    interface EnrichedAsset {
      id: number;
      tag: string;
      rfid: string;
      name: string;
      itemType: string;
      classification: string;
      department: string;
      assignedTo: string;
      condition: string;
      acquiredDate: string;
      startDepYm: string | null;
      cost: number;
      residual: number;
      lifeMonths: number;
      monthlyDep: number;
      disposedDate: string | null;
      hfsDate: string | null;
      accumDepAsOf: number;
      accumImpAsOf: number;
      carryingAsOf: number;
      statusLabel: string;
      isInUse: boolean;
    }

    const assetLookupById = new Map<number, EnrichedAsset>();
    const enrichedAssets: EnrichedAsset[] = [];

    for (const a of assets) {
      const item = a.item_id ? itemMap.get(a.item_id) : undefined;
      const itemName = item?.item_name || `Asset #${a.id}`;
      const itemTypeName = item?.item_type ? itemTypeMap.get(item.item_type) || "General" : "General";
      const classificationName = item?.item_classification
        ? classMap.get(item.item_classification) || "Unclassified"
        : "Unclassified";
      const departmentName = a.department ? deptMap.get(a.department) || "Unassigned" : "Unassigned";
      const assignedToName = a.employee ? userMap.get(a.employee) || "Unassigned" : "Unassigned";
      const tag = a.asset_tag || `AST-${String(a.id).padStart(4, "0")}`;
      const acquiredDate = toDateOnly(a.date_acquired);
      const availDate = toDateOnly(a.available_for_use_date || a.date_acquired);
      const cost = Number(a.acquisition_cost ?? a.cost_per_item ?? 0);
      const residual = Number(a.residual_value ?? 0);
      const lifeMonths =
        Number(a.life_months) > 0
          ? Number(a.life_months)
          : Math.max(12, Number(a.life_span || 5) * 12);
      const depreciable = Math.max(0, cost - residual);
      const monthlyDep = lifeMonths > 0 ? depreciable / lifeMonths : 0;
      const startYm = firstDepYm(availDate);

      const aEvents = eventsByAsset.get(a.id) || [];
      const dispEvent = aEvents.find((e) => e.event_type_id === 6);
      const hfsEvent = aEvents.find((e) => e.event_type_id === 5);
      const disposedDate = dispEvent ? toDateOnly(dispEvent.event_date) : null;
      const hfsDate = hfsEvent ? toDateOnly(hfsEvent.event_date) : null;

      // Accumulated impairment as of asOf
      let accumImpAsOf = 0;
      for (const ev of aEvents) {
        if (ev.event_type_id === 1 && toDateOnly(ev.event_date) <= asOf) {
          accumImpAsOf += Number(ev.impact || 0);
        }
      }
      accumImpAsOf = Math.max(0, r2(accumImpAsOf));

      // Accumulated depreciation as of asOf (stop at disposal/hfs month if earlier)
      let stopYm = asOfYm;
      if (disposedDate && disposedDate.slice(0, 7) < stopYm) stopYm = disposedDate.slice(0, 7);
      if (hfsDate && hfsDate.slice(0, 7) < stopYm) stopYm = hfsDate.slice(0, 7);

      let accumDepAsOf = 0;
      if (startYm && startYm <= stopYm && depreciable > 0) {
        const elapsedMonths = Math.min(lifeMonths, ymDiffInclusive(startYm, stopYm));
        accumDepAsOf = r2(Math.min(depreciable, elapsedMonths * monthlyDep));
      }

      const isDisposed = Boolean(disposedDate && disposedDate <= asOf);
      const isHfs = !isDisposed && Boolean(hfsDate && hfsDate <= asOf);
      const isDeactivated = a.record_status_id === 2 || a.is_active === 0;

      let statusLabel = "In use";
      if (isDisposed) statusLabel = "Derecognised";
      else if (isHfs) statusLabel = "Held for sale";
      else if (isDeactivated) statusLabel = "Deactivated";

      const isInUse = !isDisposed && !isHfs && !isDeactivated;
      const carryingAsOf = isDisposed ? 0 : Math.max(0, r2(cost - accumDepAsOf - accumImpAsOf));

      const enriched: EnrichedAsset = {
        id: a.id,
        tag,
        rfid: a.rfid_code || "—",
        name: itemName,
        itemType: itemTypeName,
        classification: classificationName,
        department: departmentName,
        assignedTo: assignedToName,
        condition: a.condition || "Good",
        acquiredDate: acquiredDate || "—",
        startDepYm: startYm,
        cost: r2(cost),
        residual: r2(residual),
        lifeMonths,
        monthlyDep,
        disposedDate,
        hfsDate,
        accumDepAsOf: isDisposed ? 0 : accumDepAsOf,
        accumImpAsOf: isDisposed ? 0 : accumImpAsOf,
        carryingAsOf,
        statusLabel,
        isInUse,
      };
      enrichedAssets.push(enriched);
      assetLookupById.set(a.id, enriched);
    }

    // Helper: monthly depreciation of an asset in a given YYYY-MM
    function assetDepInMonth(a: EnrichedAsset, ym: string): number {
      if (!a.startDepYm || a.monthlyDep <= 0) return 0;
      if (ym < a.startDepYm) return 0;
      if (a.disposedDate && ym > a.disposedDate.slice(0, 7)) return 0;
      if (a.hfsDate && ym > a.hfsDate.slice(0, 7)) return 0;
      const endYm = addMonths(a.startDepYm, a.lifeMonths - 1);
      if (ym > endYm) return 0;
      return a.monthlyDep;
    }

    // =========================================================================
    // 1. ASSET REGISTER
    // =========================================================================
    const registerRows: AssetRegisterRow[] = enrichedAssets
      .slice()
      .sort((a, b) => a.tag.localeCompare(b.tag))
      .map((a) => ({
        id: a.id,
        assetTag: a.tag,
        rfid: a.rfid,
        assetName: a.name,
        itemType: a.itemType,
        classification: a.classification,
        department: a.department,
        assignedTo: a.assignedTo,
        condition: a.condition,
        acquired: a.acquiredDate,
        cost: a.cost,
        accumDep: a.accumDepAsOf,
        accumImp: a.accumImpAsOf,
        projectedValue: a.carryingAsOf,
        status: a.statusLabel,
        isInUse: a.isInUse,
      }));

    const regTotals = { cost: 0, accumDep: 0, accumImp: 0, projectedValue: 0 };
    for (const r of registerRows) {
      if (r.isInUse) {
        regTotals.cost = r2(regTotals.cost + r.cost);
        regTotals.accumDep = r2(regTotals.accumDep + r.accumDep);
        regTotals.accumImp = r2(regTotals.accumImp + r.accumImp);
        regTotals.projectedValue = r2(regTotals.projectedValue + r.projectedValue);
      }
    }

    // =========================================================================
    // 2. PPE MOVEMENT SCHEDULE (IAS 16.73(e)) for selectedYear
    // =========================================================================
    const activeClasses = Array.from(new Set(enrichedAssets.map((a) => a.classification))).sort();
    const yearStart = `${selectedYear}-01-01`;
    const yearEnd = `${selectedYear}-12-31`;
    const prevYearEndYm = `${Number(selectedYear) - 1}-12`;

    interface ClassBucket {
      og: number; // Opening gross (At 1 Jan)
      add: number; // Additions
      rvg: number; // Revaluation gross
      dg: number; // Disposals gross (negative)
      hg: number; // Transferred to HFS gross (negative)
      oa: number; // Opening accum dep & imp (At 1 Jan)
      dep: number; // Depreciation charge for the year
      imp: number; // Impairment losses
      rev: number; // Reversal of impairment losses (negative)
      rva: number; // Eliminated on revaluation
      da: number; // Disposals accum dep (negative)
      ha: number; // HFS accum dep (negative)
    }

    const emptyBucket = (): ClassBucket => ({
      og: 0,
      add: 0,
      rvg: 0,
      dg: 0,
      hg: 0,
      oa: 0,
      dep: 0,
      imp: 0,
      rev: 0,
      rva: 0,
      da: 0,
      ha: 0,
    });

    const ppeBuckets: Record<string, ClassBucket> = {};
    for (const c of activeClasses) ppeBuckets[c] = emptyBucket();

    for (const a of enrichedAssets) {
      const b = ppeBuckets[a.classification];
      if (!b) continue;

      const acq = a.acquiredDate !== "—" ? a.acquiredDate : `${selectedYear}-01-01`;
      if (acq > yearEnd) continue;

      // Gross cost opening vs additions
      if (acq < yearStart) {
        if (!a.disposedDate || a.disposedDate >= yearStart) {
          b.og = r2(b.og + a.cost);
        }
      } else {
        b.add = r2(b.add + a.cost);
      }

      // Opening accum dep before Jan 1 of selectedYear
      if (a.startDepYm && a.startDepYm <= prevYearEndYm && (!a.disposedDate || a.disposedDate >= yearStart)) {
        const preMonths = Math.min(a.lifeMonths, ymDiffInclusive(a.startDepYm, prevYearEndYm));
        b.oa = r2(b.oa + Math.min(Math.max(0, a.cost - a.residual), preMonths * a.monthlyDep));
      }

      // Depreciation charge during selectedYear (Jan..Dec)
      let yrDep = 0;
      for (let m = 1; m <= 12; m++) {
        const ym = `${selectedYear}-${String(m).padStart(2, "0")}`;
        yrDep += assetDepInMonth(a, ym);
      }
      b.dep = r2(b.dep + yrDep);

      // Events in selectedYear
      const aEvents = eventsByAsset.get(a.id) || [];
      for (const ev of aEvents) {
        const evDate = toDateOnly(ev.event_date);
        if (!evDate) continue;

        if (evDate < yearStart && ev.event_type_id === 1 && (!a.disposedDate || a.disposedDate >= yearStart)) {
          b.oa = r2(b.oa + Number(ev.impact || 0));
          continue;
        }
        if (evDate < yearStart || evDate > yearEnd) continue;

        const impact = Number(ev.impact || 0);
        if (ev.event_type_id === 1) {
          if (impact >= 0) b.imp = r2(b.imp + impact);
          else b.rev = r2(b.rev + impact);
        } else if (ev.event_type_id === 2) {
          b.rvg = r2(b.rvg + impact);
        } else if (ev.event_type_id === 4 && ev.capitalize) {
          b.add = r2(b.add + Number(ev.amount || impact || 0));
        } else if (ev.event_type_id === 5) {
          b.hg = r2(b.hg - a.cost);
          b.ha = r2(b.ha - a.accumDepAsOf);
        } else if (ev.event_type_id === 6) {
          b.dg = r2(b.dg - a.cost);
          b.da = r2(b.da - a.accumDepAsOf);
        }
      }
    }

    const closingGross = (b: ClassBucket) => r2(b.og + b.add + b.rvg + b.dg + b.hg);
    const closingAccum = (b: ClassBucket) => r2(b.oa + b.dep + b.imp + b.rev + b.rva + b.da + b.ha);

    const makePpeRow = (
      type: PpeMovementRow["type"],
      particulars: string,
      getter?: (b: ClassBucket) => number
    ): PpeMovementRow => {
      const values: Record<string, number> = {};
      let total = 0;
      if (getter) {
        for (const c of activeClasses) {
          const val = r2(getter(ppeBuckets[c]));
          values[c] = val;
          total = r2(total + val);
        }
      }
      return { type, particulars, values, total };
    };

    const ppeRows: PpeMovementRow[] =
      activeClasses.length === 0
        ? []
        : [
            makePpeRow("section", "COST OR VALUATION"),
            makePpeRow("row", "At 1 January", (b) => b.og),
            makePpeRow("row", "Additions", (b) => b.add),
            makePpeRow("row", "Revaluation", (b) => b.rvg),
            makePpeRow("row", "Disposals / derecognised parts", (b) => b.dg),
            makePpeRow("row", "Transferred to held for sale", (b) => b.hg),
            makePpeRow("subtotal", "At 31 December", closingGross),
            makePpeRow("section", "ACCUMULATED DEPRECIATION AND IMPAIRMENT"),
            makePpeRow("row", "At 1 January", (b) => b.oa),
            makePpeRow("row", "Depreciation charge for the year", (b) => b.dep),
            makePpeRow("row", "Impairment losses", (b) => b.imp),
            makePpeRow("row", "Reversal of impairment losses", (b) => b.rev),
            makePpeRow("row", "Eliminated on revaluation", (b) => b.rva),
            makePpeRow("row", "Disposals / derecognised parts", (b) => b.da),
            makePpeRow("row", "Transferred to held for sale", (b) => b.ha),
            makePpeRow("subtotal", "At 31 December", closingAccum),
            makePpeRow("section", "CARRYING AMOUNT"),
            makePpeRow("row", "At 1 January", (b) => r2(b.og - b.oa)),
            makePpeRow("grand", "At 31 December", (b) => r2(closingGross(b) - closingAccum(b))),
          ];

    // =========================================================================
    // 3. FINANCIAL STATEMENT IMPACT for selectedYear
    // =========================================================================
    let plDepExpense = 0;
    let plImpLoss = 0;
    let plImpReversal = 0;
    let plDisposalGain = 0;
    let plDisposalLoss = 0;
    let plRepairsExpense = 0;
    let ociRevalSurplus = 0;

    const bsMovements: Record<string, number> = {};
    const addBs = (acct: string, delta: number) => {
      if (Math.abs(delta) < 0.005) return;
      bsMovements[acct] = r2((bsMovements[acct] || 0) + delta);
    };

    for (const c of activeClasses) {
      const b = ppeBuckets[c];
      plDepExpense = r2(plDepExpense + b.dep);
      plImpLoss = r2(plImpLoss + b.imp);
      plImpReversal = r2(plImpReversal + b.rev);
      ociRevalSurplus = r2(ociRevalSurplus - b.rvg);

      // Net BS movements for the year (Dr positive, Cr negative)
      addBs(`Accumulated Depreciation – ${c}`, -b.dep - b.da - b.ha);
      addBs(`Accumulated Impairment – ${c}`, -b.imp - b.rev);
      addBs(`PPE – ${c} (Cost/Valuation)`, b.add + b.rvg + b.dg + b.hg);
    }

    // Disposal gains/losses & Cash from events in selectedYear
    for (const ev of approvedEvents) {
      const evDate = toDateOnly(ev.event_date);
      if (!evDate || evDate < yearStart || evDate > yearEnd) continue;
      if (ev.event_type_id === 6) {
        const proceeds = Number(ev.proceeds || 0);
        const cod = Number(ev.costs_of_disposal || 0);
        const ca = Number(ev.carrying_amount_before || 0);
        const netProceeds = proceeds - cod;
        if (netProceeds > 0) addBs("Cash / Accounts Payable", netProceeds);
        const gl = netProceeds - ca;
        if (gl >= 0) plDisposalGain = r2(plDisposalGain - gl);
        else plDisposalLoss = r2(plDisposalLoss + Math.abs(gl));
      }
    }

    // Repairs & Maintenance expense from maintenance_work_orders in selectedYear
    for (const m of maintOrders) {
      const mDate = toDateOnly(m.performed_date || m.completed_at || m.generated_at);
      if (!mDate || mDate < yearStart || mDate > yearEnd) continue;
      const cost = Number(m.cost || 0);
      if (cost <= 0) continue;
      const tr = m.treatment_id ? maintTreatmentMap.get(m.treatment_id) : undefined;
      if (tr?.code === "EXPENSE") {
        plRepairsExpense = r2(plRepairsExpense + cost);
        addBs("Cash / Accounts Payable", -cost);
      } else if (tr?.code === "CAPITALISE") {
        addBs("Cash / Accounts Payable", -cost);
      }
    }

    const plLines: FsImpactRow[] = [];
    if (plDepExpense !== 0) plLines.push({ type: "row", account: "Depreciation Expense", amount: plDepExpense });
    if (plImpLoss !== 0) plLines.push({ type: "row", account: "Impairment Loss (P&L)", amount: plImpLoss });
    if (plImpReversal !== 0) plLines.push({ type: "row", account: "Reversal of Impairment Loss (P&L)", amount: plImpReversal });
    if (plDisposalGain !== 0) plLines.push({ type: "row", account: "Gain on Disposal of PPE", amount: plDisposalGain });
    if (plDisposalLoss !== 0) plLines.push({ type: "row", account: "Loss on Disposal / Derecognition of PPE", amount: plDisposalLoss });
    if (plRepairsExpense !== 0) plLines.push({ type: "row", account: "Repairs & Maintenance Expense", amount: plRepairsExpense });

    const netPlCharge = r2(
      plDepExpense + plImpLoss + plImpReversal + plDisposalGain + plDisposalLoss + plRepairsExpense
    );

    const fsRows: FsImpactRow[] = [
      { type: "section", account: "PROFIT OR LOSS", amount: null },
      ...(plLines.length > 0 ? plLines : [{ type: "muted" as const, account: "No movement", amount: null }]),
      { type: "section", account: "OTHER COMPREHENSIVE INCOME", amount: null },
      ...(ociRevalSurplus !== 0
        ? [{ type: "row" as const, account: "Revaluation Surplus (OCI)", amount: ociRevalSurplus }]
        : [{ type: "muted" as const, account: "No movement", amount: null }]),
      { type: "section", account: "EQUITY (DIRECT)", amount: null },
      { type: "muted", account: "No movement", amount: null },
      { type: "total", account: "Net charge to profit or loss", amount: netPlCharge },
      { type: "section", account: "BALANCE SHEET ACCOUNTS — NET MOVEMENT", amount: null },
      ...Object.entries(bsMovements)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([account, amount]) => ({ type: "row" as const, account, amount })),
    ];

    if (Object.keys(bsMovements).length === 0) {
      fsRows.push({ type: "muted", account: "No movement", amount: null });
    }

    // =========================================================================
    // 4. DEPRECIATION BY DEPARTMENT for selectedYear
    // =========================================================================
    const deptNames = Array.from(new Set(enrichedAssets.map((a) => a.department))).sort();
    const deptDepRows: DeptDepRow[] = deptNames.map((dept) => {
      const months = Array<number>(12).fill(0);
      for (const a of enrichedAssets) {
        if (a.department !== dept) continue;
        for (let m = 0; m < 12; m++) {
          const ym = `${selectedYear}-${String(m + 1).padStart(2, "0")}`;
          months[m] = r2(months[m] + assetDepInMonth(a, ym));
        }
      }
      const total = r2(months.reduce((s, v) => s + v, 0));
      return { department: dept, months, total };
    });

    const deptMonthTotals = Array<number>(12).fill(0);
    for (const row of deptDepRows) {
      for (let m = 0; m < 12; m++) {
        deptMonthTotals[m] = r2(deptMonthTotals[m] + row.months[m]);
      }
    }
    const deptGrandTotal = r2(deptMonthTotals.reduce((s, v) => s + v, 0));

    // =========================================================================
    // 5. DEPRECIATION FORECAST (5 years starting from current year)
    // =========================================================================
    const y0 = parseInt(defaultYear, 10);
    const forecastYears = [0, 1, 2, 3, 4].map((offset) => String(y0 + offset));
    const forecastRows: ForecastRow[] = activeClasses.map((cls) => {
      const yearsMap: Record<string, number> = {};
      for (const fy of forecastYears) {
        let sum = 0;
        for (const a of enrichedAssets) {
          if (a.classification !== cls) continue;
          for (let m = 1; m <= 12; m++) {
            const ym = `${fy}-${String(m).padStart(2, "0")}`;
            sum += assetDepInMonth(a, ym);
          }
        }
        yearsMap[fy] = r2(sum);
      }
      return { classification: cls, years: yearsMap };
    });

    const forecastTotals: Record<string, number> = {};
    for (const fy of forecastYears) {
      forecastTotals[fy] = r2(forecastRows.reduce((s, r) => s + (r.years[fy] || 0), 0));
    }

    // =========================================================================
    // 6. MAINTENANCE LOG (from maintenance_work_orders)
    // =========================================================================
    let expensedTotal = 0;
    let capitalisedTotal = 0;
    let totalMaintCost = 0;

    const maintRows: MaintenanceLogRow[] = maintOrders.map((m) => {
      const asset = m.asset_id ? assetLookupById.get(m.asset_id) : undefined;
      const dateStr = toDateOnly(m.performed_date || m.completed_at || m.generated_at) || "—";
      const typeName = m.maintenance_type_id
        ? maintTypeMap.get(m.maintenance_type_id) || "Maintenance"
        : "Preventive maintenance";
      const tr = m.treatment_id ? maintTreatmentMap.get(m.treatment_id) : undefined;
      const treatmentLabel = tr
        ? tr.name
        : m.warranty_covered
        ? "Warranty"
        : "—";
      const costVal = m.cost !== null && m.cost !== undefined && m.cost !== "" ? Number(m.cost) : null;
      const downtimeVal =
        m.downtime_days !== null && m.downtime_days !== undefined && m.downtime_days !== ""
          ? Number(m.downtime_days)
          : null;

      if (costVal !== null && !Number.isNaN(costVal)) {
        totalMaintCost = r2(totalMaintCost + costVal);
        if (tr?.code === "EXPENSE") expensedTotal = r2(expensedTotal + costVal);
        else if (tr?.code === "CAPITALISE") capitalisedTotal = r2(capitalisedTotal + costVal);
      }

      return {
        id: m.id,
        date: dateStr,
        assetId: m.asset_id || 0,
        assetTag: asset?.tag || (m.asset_id ? `AST-${String(m.asset_id).padStart(4, "0")}` : "—"),
        assetName: asset?.name || "—",
        department: asset?.department || "Unassigned",
        type: typeName,
        description: m.description || "—",
        vendor: m.vendor || "—",
        downtimeDays: downtimeVal,
        cost: costVal,
        treatment: treatmentLabel,
        nextDue: toDateOnly(m.next_service_due) || "—",
      };
    });

    // =========================================================================
    // 7. ACTIVITY LOG (from asset_audit_log — ZERO mock data!)
    // =========================================================================
    const activityUsersSet = new Set<string>();
    const activityActionsMap = new Map<string, string>();

    const activityRows: ActivityLogRow[] = auditLogs.map((log) => {
      const uName =
        log.user_name || (log.user_id ? userMap.get(log.user_id) : undefined) || "System";
      const rName = log.role_name || "";
      const act = log.action_id ? auditActionMap.get(log.action_id) : undefined;
      const actionCode = act?.code || "EVENT";
      const actionName = act?.name || "Event";
      const asset = log.asset_id ? assetLookupById.get(log.asset_id) : undefined;

      activityUsersSet.add(uName);
      activityActionsMap.set(actionCode, actionName);

      let detailsText = "";
      if (typeof log.details === "string") {
        detailsText = log.details;
      } else if (log.details && typeof log.details === "object") {
        detailsText = JSON.stringify(log.details);
      }

      const changesList: ActivityLogChange[] = [];
      if (Array.isArray(log.changes)) {
        for (const ch of log.changes) {
          if (ch && typeof ch === "object") {
            const cObj = ch as Record<string, unknown>;
            changesList.push({
              field: String(cObj.field || cObj.label || ""),
              from: String(cObj.from ?? cObj.old ?? "—"),
              to: String(cObj.to ?? cObj.new ?? "—"),
            });
          }
        }
      }

      return {
        id: log.id,
        when: log.logged_at || "",
        whenFormatted: formatDateTime(log.logged_at),
        userName: uName,
        roleName: rName,
        actionCode,
        actionName,
        assetId: log.asset_id || null,
        assetTag: asset?.tag || (log.asset_id ? `AST-${String(log.asset_id).padStart(4, "0")}` : null),
        details: detailsText || "—",
        changes: changesList,
      };
    });

    // Include all lookup actions in dropdown even if no logs yet
    for (const a of auditActions) {
      if (a.code && !activityActionsMap.has(a.code)) {
        activityActionsMap.set(a.code, a.name || a.code);
      }
    }

    const payload: AssetReportsPayload = {
      year: selectedYear,
      asOf,
      availableYears,
      assetRegister: {
        asOf,
        rows: registerRows,
        totals: regTotals,
      },
      ppeMovement: {
        year: selectedYear,
        classifications: activeClasses,
        rows: ppeRows,
      },
      fsImpact: {
        year: selectedYear,
        rows: fsRows,
      },
      depreciationByDept: {
        year: selectedYear,
        rows: deptDepRows,
        totals: deptMonthTotals,
        grandTotal: deptGrandTotal,
      },
      depreciationForecast: {
        years: forecastYears,
        asOf,
        rows: forecastRows,
        totals: forecastTotals,
      },
      maintenanceLog: {
        rows: maintRows,
        expensedTotal,
        capitalisedTotal,
        totalCost: totalMaintCost,
      },
      activityLog: {
        rows: activityRows,
        users: Array.from(activityUsersSet).sort(),
        actions: Array.from(activityActionsMap.entries()).map(([code, name]) => ({ code, name })),
      },
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("GET /api/fm/asset-management/reports error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load asset reports" },
      { status: 500 }
    );
  }
}
