import { NextResponse } from "next/server";
import type {
  AssetDashboardData,
  ComplianceAlert,
  RecentAccountingEvent,
} from "@/modules/financial-management/asset-management/dashboard/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusAsset {
  id: number;
  asset_tag?: string | null;
  item_id?: number | null;
  condition?: string | null;
  date_acquired?: string | null;
  available_for_use_date?: string | null;
  cost_per_item?: number | string | null;
  acquisition_cost?: number | string | null;
  residual_value?: number | string | null;
  life_span?: number | string | null;
  life_months?: number | string | null;
  warranty_until?: string | null;
  record_status_id?: number | null;
  is_active?: number | boolean | null;
}

interface DirectusItem {
  id: number;
  item_name?: string | null;
  item_classification?: number | null;
}

interface DirectusClassification {
  id: number;
  classification_name?: string | null;
}

interface DirectusEvent {
  id: number;
  asset_id: number;
  event_type_id: number;
  event_date?: string | null;
  status_id: number;
  impact?: number | string | null;
  amount?: number | string | null;
  remarks?: string | null;
}

interface DirectusEventType {
  id: number;
  code?: string | null;
  name?: string | null;
}

interface DirectusPosting {
  id: number;
  depreciation?: number | string | null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function ymDiffInclusive(startYm: string, endYm: string): number {
  const [sy, sm] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return 0;
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

function firstDepYm(dateStr?: string | null): string | null {
  if (!dateStr || dateStr.length < 7) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const d = dateStr.length >= 10 ? parseInt(dateStr.slice(8, 10), 10) : 1;
  if (!y || !m) return null;
  if (d <= 15) return `${y}-${String(m).padStart(2, "0")}`;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function basisForEventType(eventTypeId: number): string {
  switch (eventTypeId) {
    case 1:
      return "IAS 36";
    case 2:
      return "IAS 16.31";
    case 3:
      return "IAS 16.51 / IAS 8";
    case 4:
      return "IAS 16.7";
    case 5:
      return "PFRS 5 / IFRS 5";
    case 6:
      return "IAS 16.67";
    default:
      return "IAS 16";
  }
}

async function safeList<T>(path: string): Promise<T[]> {
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

export async function GET() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const currentYear = String(today.getFullYear());
    const currentYm = todayStr.slice(0, 7);
    const janYm = `${currentYear}-01`;

    const [assets, items, classifications, allEvents, eventTypes, postings] = await Promise.all([
      safeList<DirectusAsset>("/items/assets_and_equipment?limit=500&sort=-id"),
      safeList<DirectusItem>("/items/items?limit=1000"),
      safeList<DirectusClassification>("/items/item_classification?limit=500"),
      safeList<DirectusEvent>("/items/asset_events?sort=-event_date,-id&limit=500"),
      safeList<DirectusEventType>("/items/asset_event_types?limit=50"),
      safeList<DirectusPosting>(
        `/items/asset_depreciation_postings?filter[period][_starts_with]=${currentYear}&limit=1000`
      ),
    ]);

    const itemMap = new Map<number, DirectusItem>(items.map((i) => [i.id, i]));
    const classMap = new Map<number, string>(
      classifications.map((c) => [c.id, c.classification_name || "Unclassified"])
    );
    const eventTypeMap = new Map<number, string>(
      eventTypes.map((t) => [t.id, t.name || t.code || "Accounting Event"])
    );
    const assetTagMap = new Map<number, string>(
      assets.map((a) => [a.id, a.asset_tag || `AST-${String(a.id).padStart(4, "0")}`])
    );

    const approvedEvents = allEvents.filter((e) => e.status_id === 2);
    const pendingEvents = allEvents.filter((e) => e.status_id === 1);

    const eventsByAsset = new Map<number, DirectusEvent[]>();
    for (const ev of approvedEvents) {
      const list = eventsByAsset.get(ev.asset_id) || [];
      list.push(ev);
      eventsByAsset.set(ev.asset_id, list);
    }

    let costValuation = 0;
    let accumulatedDepreciationAndImpairment = 0;
    let carryingAmountPPE = 0;
    let computedYtdDepreciation = 0;
    let heldForSaleTotal = 0;
    let assetsInUse = 0;

    const classCarryingMap = new Map<string, number>();
    const expiredWarranties: { id: number; tag: string; warranty: string }[] = [];
    const impairedAssets: { id: number; tag: string }[] = [];

    for (const asset of assets) {
      const tag = assetTagMap.get(asset.id) || `AST-${String(asset.id).padStart(4, "0")}`;
      const cost = Number(asset.acquisition_cost ?? asset.cost_per_item ?? 0);
      const residual = Number(asset.residual_value ?? 0);
      const lifeMonths =
        Number(asset.life_months) > 0
          ? Number(asset.life_months)
          : Math.max(12, Number(asset.life_span || 5) * 12);
      const depreciable = Math.max(0, cost - residual);
      const monthlyDep = lifeMonths > 0 ? depreciable / lifeMonths : 0;
      const startYm = firstDepYm(asset.available_for_use_date || asset.date_acquired);

      const aEvents = eventsByAsset.get(asset.id) || [];
      const isDisposed = aEvents.some((e) => e.event_type_id === 6);
      const isHfs = !isDisposed && aEvents.some((e) => e.event_type_id === 5);
      const isDeactivated = asset.record_status_id === 2 || asset.is_active === 0;

      let accumImp = 0;
      for (const ev of aEvents) {
        if (ev.event_type_id === 1) accumImp += Number(ev.impact || 0);
      }
      accumImp = Math.max(0, r2(accumImp));

      let accumDep = 0;
      if (startYm && startYm <= currentYm && depreciable > 0 && !isDisposed) {
        const elapsed = Math.min(lifeMonths, ymDiffInclusive(startYm, currentYm));
        accumDep = r2(Math.min(depreciable, elapsed * monthlyDep));

        // YTD months in current year
        const ytdStart = startYm > janYm ? startYm : janYm;
        if (ytdStart <= currentYm) {
          const ytdMonths = Math.min(elapsed, ymDiffInclusive(ytdStart, currentYm));
          computedYtdDepreciation = r2(computedYtdDepreciation + ytdMonths * monthlyDep);
        }
      }

      const carrying = isDisposed ? 0 : Math.max(0, r2(cost - accumDep - accumImp));

      if (isHfs) {
        heldForSaleTotal = r2(heldForSaleTotal + carrying);
      } else if (!isDisposed && !isDeactivated) {
        assetsInUse += 1;
        costValuation = r2(costValuation + cost);
        accumulatedDepreciationAndImpairment = r2(
          accumulatedDepreciationAndImpairment + accumDep + accumImp
        );
        carryingAmountPPE = r2(carryingAmountPPE + carrying);

        const item = asset.item_id ? itemMap.get(asset.item_id) : undefined;
        const clsName = item?.item_classification
          ? classMap.get(item.item_classification) || "Unclassified"
          : "Unclassified";
        classCarryingMap.set(clsName, r2((classCarryingMap.get(clsName) || 0) + carrying));
      }

      if (
        asset.condition === "Poor" ||
        asset.condition === "Discontinued" ||
        asset.condition === "Damaged" ||
        asset.condition === "For repair"
      ) {
        impairedAssets.push({ id: asset.id, tag });
      }

      if (asset.warranty_until) {
        const wDate = new Date(asset.warranty_until);
        if (!Number.isNaN(wDate.getTime()) && wDate <= today) {
          expiredWarranties.push({
            id: asset.id,
            tag,
            warranty: asset.warranty_until.slice(0, 10),
          });
        }
      }
    }

    const postedYtdDep = r2(
      postings.reduce((sum, p) => sum + Number(p.depreciation || 0), 0)
    );
    const depreciationYTD = postedYtdDep > 0 ? postedYtdDep : computedYtdDepreciation;

    // Carrying amount by real classification (sorted largest first)
    const carryingByClass = Array.from(classCarryingMap.entries())
      .map(([className, carryingAmount]) => ({
        className,
        carryingAmount,
        percentage: carryingAmountPPE > 0 ? (carryingAmount / carryingAmountPPE) * 100 : 0,
      }))
      .sort((a, b) => b.carryingAmount - a.carryingAmount);

    // Recent accounting events (real rows from asset_events)
    const recentEvents: RecentAccountingEvent[] = approvedEvents.slice(0, 15).map((e) => {
      const typeLabel = eventTypeMap.get(e.event_type_id) || "Accounting Event";
      const label = e.remarks ? `${typeLabel} — ${e.remarks}` : typeLabel;
      return {
        id: e.id,
        date: e.event_date ? String(e.event_date).slice(0, 10) : todayStr,
        assetTag: assetTagMap.get(e.asset_id) || `AST-${String(e.asset_id).padStart(4, "0")}`,
        assetId: e.asset_id,
        event: label,
        basis: basisForEventType(e.event_type_id),
        amount: Number(e.impact ?? e.amount ?? 0),
      };
    });

    const pendingApprovalsCount = pendingEvents.length;
    const pendingApprovalsAmount = r2(
      pendingEvents.reduce((sum, p) => sum + Number(p.impact ?? p.amount ?? 0), 0)
    );

    // Build real actionable compliance alerts with navigation links
    const complianceAlerts: ComplianceAlert[] = [
      {
        id: "alert-yearend",
        type: "warning",
        message:
          "Financial year-end approaching: review residual values, useful lives and depreciation methods for every asset (IAS 16.51, 16.61) and assess impairment indicators (IAS 36.9).",
        href: "/fm/asset-management/impairment-review",
      },
    ];

    if (pendingApprovalsCount > 0) {
      complianceAlerts.push({
        id: "alert-approvals",
        type: "approval",
        message: `${pendingApprovalsCount} entry(ies) waiting for approval (₱${pendingApprovalsAmount.toLocaleString(
          "en-US",
          { minimumFractionDigits: 2 }
        )}) – see Approvals.`,
        href: "/fm/asset-management/approvals",
      });
    }

    if (impairedAssets.length > 0) {
      complianceAlerts.push({
        id: "alert-impairment",
        type: "impairment",
        message: `${impairedAssets.length} asset(s) show signs of impairment (${impairedAssets
          .map((a) => a.tag)
          .slice(0, 3)
          .join(", ")}) – conclude them in the Impairment review (IAS 36.9).`,
        href: "/fm/asset-management/impairment-review",
      });
    }

    if (expiredWarranties.length > 0) {
      const first = expiredWarranties[0];
      complianceAlerts.push({
        id: "alert-warranty",
        type: "info",
        assetTag: first.tag,
        message: `Warranty expired ${first.warranty}.`,
        href: `/fm/asset-management/registration/${first.id}`,
      });
    }

    complianceAlerts.push({
      id: "alert-count",
      type: "count",
      message: `${assets.length} asset(s) registered in system – schedule regular RFID physical count verification.`,
      href: "/fm/asset-management/physical-count",
    });

    const payload: AssetDashboardData = {
      asOfDate: todayStr,
      standard: "PFRS (PAS 16 / IAS 16)",
      currency: "PHP",
      metrics: {
        costValuation,
        accumulatedDepreciationAndImpairment,
        carryingAmountPPE,
        depreciationYTD,
        heldForSale: heldForSaleTotal > 0 ? heldForSaleTotal : null,
        assetsInUse,
      },
      carryingByClass,
      complianceAlerts,
      recentEvents,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("GET /api/fm/asset-management/dashboard error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
