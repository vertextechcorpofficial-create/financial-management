import { NextResponse } from "next/server";
import { fetchAssets } from "@/modules/financial-management/asset-management/registration/services/asset";
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

export async function GET() {
  try {
    // 1. Fetch live assets from database
    const assets = await fetchAssets();

    let costValuation = 0;
    let carryingAmountPPE = 0;
    let assetsInUse = 0;
    const classMap = new Map<string, number>();

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Collect dynamic alert candidates from assets
    const expiredWarranties: any[] = [];
    const overdueMaintenance: any[] = [];
    const upcomingMaintenance: any[] = [];
    const impairedAssets: any[] = [];

    assets.forEach((asset) => {
      const cost = Number(asset.cost_per_item || asset.acquisition_cost || 0);
      const carrying = Number(asset.projected_value || cost);
      costValuation += cost;
      carryingAmountPPE += carrying;

      if (asset.record_status === "active") {
        assetsInUse += 1;
      }

      const cls = asset.classification_name || "General";
      classMap.set(cls, (classMap.get(cls) || 0) + carrying);

      // Check condition for impairment indicators
      if (
        asset.condition === "Discontinued" ||
        asset.condition === "Damaged" ||
        asset.condition === "For repair"
      ) {
        impairedAssets.push(asset);
      }

      // Check warranty
      if (asset.warranty_until) {
        const wDate = new Date(asset.warranty_until);
        if (wDate <= today) {
          expiredWarranties.push(asset);
        }
      }
    });

    const accumulatedDepreciationAndImpairment = Math.max(0, costValuation - carryingAmountPPE);

    // 2. Class Carrying Breakdown (100% Real from current assets)
    const carryingByClass = Array.from(classMap.entries()).map(([className, carryingAmount]) => ({
      className,
      carryingAmount,
      percentage: costValuation > 0 ? (carryingAmount / costValuation) * 100 : 0,
    }));

    // 3. Query Directus for live Events, Depreciation Postings, Approvals
    let recentEvents: RecentAccountingEvent[] = [];
    let pendingApprovalsCount = 0;
    let pendingApprovalsAmount = 0;
    let liveYtdDepreciation = 0;

    if (API_BASE_URL) {
      try {
        const [eventsRes, postingsRes, pendingRes] = await Promise.all([
          fetch(`${API_BASE_URL}/items/asset_events?sort=-event_date&limit=15`, {
            headers: AUTH_HEADERS,
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/items/asset_depreciation_postings?filter[period][_starts_with]=${today.getFullYear()}`, {
            headers: AUTH_HEADERS,
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/items/asset_events?filter[status][_eq]=draft`, {
            headers: AUTH_HEADERS,
            cache: "no-store",
          }),
        ]);

        if (eventsRes.ok) {
          const eventsJson = await eventsRes.json();
          if (Array.isArray(eventsJson.data) && eventsJson.data.length > 0) {
            recentEvents = eventsJson.data.map((e: any) => ({
              id: e.id,
              date: e.event_date ? e.event_date.split("T")[0] : todayStr,
              assetTag: e.asset_tag || (assets.find((a) => a.id === e.asset_id)?.asset_tag) || `AST-${String(e.asset_id).padStart(4, "0")}`,
              assetId: e.asset_id,
              event: e.event_type || e.description || "Accounting Event",
              basis: e.basis || "IAS 16",
              amount: Number(e.impact || e.amount || 0),
            }));
          }
        }

        if (postingsRes.ok) {
          const postingsJson = await postingsRes.json();
          if (Array.isArray(postingsJson.data)) {
            liveYtdDepreciation = postingsJson.data.reduce(
              (sum: number, p: any) => sum + Number(p.depreciation || 0),
              0
            );
          }
        }

        if (pendingRes.ok) {
          const pendingJson = await pendingRes.json();
          if (Array.isArray(pendingJson.data)) {
            pendingApprovalsCount = pendingJson.data.length;
            pendingApprovalsAmount = pendingJson.data.reduce(
              (sum: number, p: any) => sum + Number(p.impact || 0),
              0
            );
          }
        }
      } catch (err) {
        console.warn("Directus query error:", err);
      }
    }

    // 4. Kung wala pang naipost na accounting events sa database,
    // bumuo ng real Initial Recognition events mula sa registered assets
    if (recentEvents.length === 0 && assets.length > 0) {
      recentEvents = assets.slice(0, 8).map((asset) => ({
        id: asset.id,
        date: asset.date_acquired ? asset.date_acquired.split("T")[0] : todayStr,
        assetTag: asset.asset_tag || `AST-${asset.id}`,
        assetId: asset.id,
        event: `Initial recognition at cost – ${asset.item_name}`,
        basis: "IAS 16.15-16",
        amount: Number(asset.cost_per_item || asset.acquisition_cost || 0),
      }));
    }

    // 5. Build REAL alerts dynamically from actual data
    const complianceAlerts: ComplianceAlert[] = [];

    // Alert 1: Approaching Year-end review
    complianceAlerts.push({
      id: "alert-yearend",
      type: "warning",
      message:
        "Financial year-end approaching: review residual values, useful lives and depreciation methods for every asset (IAS 16.51, 16.61) and assess impairment indicators (IAS 36.9).",
    });

    // Alert 2: Real Pending Approvals
    if (pendingApprovalsCount > 0) {
      complianceAlerts.push({
        id: "alert-approvals",
        type: "approval",
        message: `${pendingApprovalsCount} entry waiting for approval (₱${pendingApprovalsAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}) – see Approvals.`,
      });
    }

    // Alert 3: Real Impairment Candidates
    if (impairedAssets.length > 0) {
      complianceAlerts.push({
        id: "alert-impairment",
        type: "impairment",
        message: `${impairedAssets.length} asset(s) show signs of impairment (${impairedAssets.map(a => a.asset_tag).slice(0, 3).join(", ")}) – conclude them in the Impairment review (IAS 36.9).`,
      });
    }

    // Alert 4: Expired / Near Expiry Warranties
    if (expiredWarranties.length > 0) {
      const first = expiredWarranties[0];
      complianceAlerts.push({
        id: "alert-warranty",
        type: "info",
        message: `Warranty expires ${first.warranty_until ? first.warranty_until.split("T")[0] : "soon"}.`,
        assetTag: first.asset_tag,
      });
    }

    // Alert 5: Unverified physical count alert
    complianceAlerts.push({
      id: "alert-count",
      type: "count",
      message: `${assets.length} asset(s) registered in system – schedule regular RFID physical count verification.`,
    });

    const payload: AssetDashboardData = {
      asOfDate: todayStr,
      standard: "PFRS (PAS 16 / IAS 16)",
      currency: "PHP",
      metrics: {
        costValuation,
        accumulatedDepreciationAndImpairment,
        carryingAmountPPE,
        depreciationYTD: liveYtdDepreciation,
        heldForSale: null,
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
