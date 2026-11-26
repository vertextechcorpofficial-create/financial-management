import { NextResponse } from "next/server";
import { fetchAssets, fetchUsers } from "@/modules/financial-management/asset-management/registration/services/asset";
import type { AssetTableData } from "@/modules/financial-management/asset-management/registration/types";
import type { ApprovalsData, ApprovalEventItem } from "@/modules/financial-management/asset-management/approvals/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusAssetSettings {
  approval_threshold?: string | number | null;
  approval_enabled?: number | boolean | null;
}

interface DirectusEventType {
  id: number;
  code?: string;
  name: string;
  requires_approval?: number;
}

interface DirectusEventSource {
  id: number;
  code?: string;
  name: string;
}

interface DirectusAssetEvent {
  id: number;
  asset_id: number;
  event_type_id: number;
  event_source_id: number;
  event_date?: string | null;
  period?: string | null;
  status_id: number;
  carrying_amount_before?: number | string | null;
  impact?: number | string | null;
  amount?: number | string | null;
  remarks?: string | null;
  maker_id: number;
  made_at?: string | null;
  checker_id?: number | null;
  checked_at?: string | null;
  reject_reason?: string | null;
}

export async function GET() {
  try {
    const [assets, users] = await Promise.all([
      fetchAssets().catch(() => []),
      fetchUsers().catch(() => []),
    ]);

    const assetMap = new Map<number, AssetTableData>();
    assets.forEach((a) => assetMap.set(a.id, a));

    const userMap = new Map<number, string>();
    users.forEach((u) => userMap.set(u.user_id, `${u.user_fname} ${u.user_lname}`.trim()));

    // 1. Fetch settings from asset_settings table
    let approvalThreshold = 50000.0;
    if (API_BASE_URL) {
      try {
        const settingsRes = await fetch(`${API_BASE_URL}/items/asset_settings?limit=1`, {
          headers: AUTH_HEADERS,
          cache: "no-store",
        });
        if (settingsRes.ok) {
          const settingsJson = (await settingsRes.json()) as { data?: DirectusAssetSettings[] };
          if (Array.isArray(settingsJson.data) && settingsJson.data.length > 0) {
            const rawThreshold = settingsJson.data[0].approval_threshold;
            if (rawThreshold !== undefined && rawThreshold !== null) {
              approvalThreshold = Number(rawThreshold) || 50000.0;
            }
          }
        }
      } catch (err) {
        console.warn("Directus asset_settings fetch failed:", err);
      }
    }

    // 2. Fetch event types & sources for display names
    const eventTypeMap = new Map<number, string>();
    let appliesToList: string[] = [];

    if (API_BASE_URL) {
      try {
        const typesRes = await fetch(`${API_BASE_URL}/items/asset_event_types`, {
          headers: AUTH_HEADERS,
          cache: "no-store",
        });
        if (typesRes.ok) {
          const typesJson = (await typesRes.json()) as { data?: DirectusEventType[] };
          if (Array.isArray(typesJson.data)) {
            typesJson.data.forEach((t: DirectusEventType) => {
              eventTypeMap.set(t.id, t.name);
              if (t.requires_approval) {
                // Short name mapping according to standard PFRS terminology
                if (t.code === "DISPOSAL") appliesToList.push("Disposal");
                else if (t.code === "IMPAIRMENT") appliesToList.push("Impairment");
                else if (t.code === "REVALUATION") appliesToList.push("Revaluation");
                else if (t.code === "HELD_FOR_SALE") appliesToList.push("Held");
                else if (t.code === "SUBSEQUENT") appliesToList.push("Capitalised");
                else appliesToList.push(t.name);
              }
            });
          }
        }
      } catch (err) {
        console.warn("Directus asset_event_types fetch failed:", err);
      }
    }

    if (appliesToList.length === 0) {
      appliesToList = ["Disposal", "Impairment", "Revaluation", "Held", "Capitalised"];
    }

    const eventSourceMap = new Map<number, string>();
    if (API_BASE_URL) {
      try {
        const sourcesRes = await fetch(`${API_BASE_URL}/items/asset_event_sources`, {
          headers: AUTH_HEADERS,
          cache: "no-store",
        });
        if (sourcesRes.ok) {
          const sourcesJson = (await sourcesRes.json()) as { data?: DirectusEventSource[] };
          if (Array.isArray(sourcesJson.data)) {
            sourcesJson.data.forEach((s: DirectusEventSource) => {
              // User-friendly source display
              if (s.code === "MANUAL") eventSourceMap.set(s.id, "Manual entry");
              else if (s.code === "MAINTENANCE") eventSourceMap.set(s.id, "Maintenance log");
              else if (s.code === "CLEARANCE") eventSourceMap.set(s.id, "Clearance");
              else if (s.code === "COUNT") eventSourceMap.set(s.id, "Physical count");
              else if (s.code === "IMPAIRMENT_REVIEW") eventSourceMap.set(s.id, "Impairment review");
              else eventSourceMap.set(s.id, s.name);
            });
          }
        }
      } catch (err) {
        console.warn("Directus asset_event_sources fetch failed:", err);
      }
    }

    // 3. Query REAL asset_events from Directus
    const waitingApprovals: ApprovalEventItem[] = [];
    const recentlyDecided: ApprovalEventItem[] = [];

    if (API_BASE_URL) {
      try {
        const eventsRes = await fetch(`${API_BASE_URL}/items/asset_events?sort=-id&limit=100`, {
          headers: AUTH_HEADERS,
          cache: "no-store",
        });
        if (eventsRes.ok) {
          const eventsJson = (await eventsRes.json()) as { data?: DirectusAssetEvent[] };
          if (Array.isArray(eventsJson.data)) {
            eventsJson.data.forEach((ev: DirectusAssetEvent) => {
              const matchedAsset = assetMap.get(ev.asset_id);
              const eventDateStr = ev.event_date ? ev.event_date.split("T")[0] : "";
              const requestedAtStr = ev.made_at
                ? new Date(ev.made_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
              const decisionAtStr = ev.checked_at
                ? new Date(ev.checked_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null;

              const status: "draft" | "approved" | "rejected" =
                ev.status_id === 1 ? "draft" : ev.status_id === 2 ? "approved" : "rejected";

              const item: ApprovalEventItem = {
                id: ev.id,
                asset_id: ev.asset_id,
                asset_tag: matchedAsset?.asset_tag || `AST-${String(ev.asset_id).padStart(4, "0")}`,
                item_name: matchedAsset?.item_name || "Asset Item",
                department_name: matchedAsset?.department_name || "General",
                entry_source: eventSourceMap.get(ev.event_source_id) || "Manual entry",
                event_type: eventTypeMap.get(ev.event_type_id) || "Accounting event",
                event_date: eventDateStr,
                notes: ev.remarks || "",
                impact_amount: Number(ev.impact || ev.amount || 0),
                requested_by_name: userMap.get(ev.maker_id) || `User #${ev.maker_id}`,
                requested_at: requestedAtStr,
                maker_id: ev.maker_id,
                status,
                decision_by_name: ev.checker_id ? userMap.get(ev.checker_id) || `User #${ev.checker_id}` : null,
                decision_at: decisionAtStr,
                rejection_reason: ev.reject_reason || null,
              };

              if (status === "draft") {
                waitingApprovals.push(item);
              } else {
                recentlyDecided.push(item);
              }
            });
          }
        }
      } catch (err) {
        console.warn("Directus asset_events fetch failed:", err);
      }
    }

    // STRICTLY REAL DATA: No mock fallback!
    const valueWaiting = waitingApprovals.reduce((sum, item) => sum + item.impact_amount, 0);

    const payload: ApprovalsData = {
      kpis: {
        waitingCount: waitingApprovals.length,
        valueWaiting,
        approvalThreshold,
        appliesToText: appliesToList.join(", "),
      },
      waitingApprovals,
      recentlyDecided,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("GET /api/fm/asset-management/approvals error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
