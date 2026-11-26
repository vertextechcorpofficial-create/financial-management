import { NextResponse } from "next/server";
import {
  appendAuditLog,
  fetchAssetClasses,
  fetchAssets,
  fetchUsers,
  getDefaultUserId,
} from "@/modules/financial-management/asset-management/registration/services/asset";
import type { AssetTableData } from "@/modules/financial-management/asset-management/registration/types";
import type {
  ImpairmentReviewData,
  ReviewLineItem,
  IndicatorItem,
  StartReviewPayload,
} from "@/modules/financial-management/asset-management/impairment-review/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusImpairmentReview {
  id: number;
  review_date?: string | null;
  summary?: { name?: string } | string | null;
  status_id?: number | null;
  interest_rates_increased?: number | boolean | null;
  row_version?: number | null;
}

interface DirectusReviewLine {
  id: number;
  review_id: number;
  asset_id: number;
  carrying_amount?: number | string | null;
  conclusion_id?: number | null;
  note?: string | null;
  is_obsolete?: number | boolean | null;
  fvlcd?: number | string | null;
  viu?: number | string | null;
  fvlcts?: number | string | null;
  cgu_name?: string | null;
  new_remaining_months?: number | null;
  new_residual_value?: number | string | null;
  loss_amount?: number | string | null;
}

interface DirectusLineIndicator {
  id: number;
  line_id: number;
  indicator_id: number;
}

interface DirectusIndicatorType {
  id: number;
  code: string;
  name: string;
}

interface DirectusConclusionType {
  id: number;
  code: string;
  name: string;
  event_type_id?: number | null;
}

interface DirectusAssetEventItem {
  id: number;
  asset_id: number;
  status_id: number;
  event_date?: string | null;
  made_at?: string | null;
  maker_id?: number | null;
}

export async function GET() {
  try {
    // 1. Fetch all conclusions and indicators for mapping
    let conclusionsList: DirectusConclusionType[] = [];
    const indicatorsMap = new Map<number, DirectusIndicatorType>();

    if (API_BASE_URL) {
      try {
        const [conRes, indRes] = await Promise.all([
          fetch(`${API_BASE_URL}/items/asset_impairment_conclusions?sort=sort_order`, {
            headers: AUTH_HEADERS,
            cache: "no-store",
          }),
          fetch(`${API_BASE_URL}/items/asset_impairment_indicators?sort=sort_order`, {
            headers: AUTH_HEADERS,
            cache: "no-store",
          }),
        ]);

        if (conRes.ok) {
          const cJson = (await conRes.json()) as { data?: DirectusConclusionType[] };
          if (Array.isArray(cJson.data)) conclusionsList = cJson.data;
        }

        if (indRes.ok) {
          const iJson = (await indRes.json()) as { data?: DirectusIndicatorType[] };
          if (Array.isArray(iJson.data)) {
            iJson.data.forEach((ind) => indicatorsMap.set(ind.id, ind));
          }
        }
      } catch (err) {
        console.warn("Directus conclusions/indicators fetch failed:", err);
      }
    }

    if (conclusionsList.length === 0) {
      conclusionsList = [
        { id: 1, code: "TEST", name: "Test: estimate recoverable amount", event_type_id: 1 },
        { id: 2, code: "NOT_SIGNIFICANT", name: "No test — indicator not significant", event_type_id: null },
        { id: 3, code: "AMPLE_HEADROOM", name: "No test — earlier calculation shows ample headroom", event_type_id: null },
        { id: 4, code: "CGU_NO_IMPAIRMENT", name: "Tested with its cash-generating unit — no impairment", event_type_id: null },
        { id: 5, code: "NO_REVERSAL", name: "Prior impairment — no reversal indicated", event_type_id: null },
        { id: 6, code: "REVISE_ESTIMATE", name: "Revise useful life / residual value instead", event_type_id: 3 },
        { id: 7, code: "HELD_FOR_SALE", name: "Will be sold — classify as held for sale", event_type_id: 5 },
        { id: 8, code: "WRITE_OFF", name: "No future benefits — write off", event_type_id: 6 },
      ];
    }

    // 2. Query latest review from asset_impairment_reviews
    let latestReview: DirectusImpairmentReview | null = null;
    if (API_BASE_URL) {
      try {
        const revRes = await fetch(
          `${API_BASE_URL}/items/asset_impairment_reviews?sort=-id&limit=1`,
          { headers: AUTH_HEADERS, cache: "no-store" }
        );
        if (revRes.ok) {
          const revJson = (await revRes.json()) as { data?: DirectusImpairmentReview[] };
          if (Array.isArray(revJson.data) && revJson.data.length > 0) {
            latestReview = revJson.data[0];
          }
        }
      } catch (err) {
        console.warn("Directus asset_impairment_reviews fetch failed:", err);
      }
    }

    // STRICTLY REAL DATA: If no review in database, return hasActiveReview = false (Shows Start Review Card)
    if (!latestReview) {
      const payload: ImpairmentReviewData = {
        hasActiveReview: false,
        review: null,
        kpis: null,
        lines: [],
        conclusions: conclusionsList.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          event_type_id: c.event_type_id || null,
        })),
      };
      return NextResponse.json(payload);
    }

    // Parse review name from summary
    let reviewName = "Year-end impairment review FY 2026";
    if (latestReview.summary && typeof latestReview.summary === "object" && latestReview.summary.name) {
      reviewName = latestReview.summary.name;
    } else if (typeof latestReview.summary === "string" && latestReview.summary.trim()) {
      try {
        const parsed = JSON.parse(latestReview.summary) as { name?: string };
        if (parsed.name) reviewName = parsed.name;
      } catch {
        reviewName = latestReview.summary;
      }
    }

    // 3. Query lines for this review
    let directusLines: DirectusReviewLine[] = [];
    if (API_BASE_URL) {
      try {
        const lineRes = await fetch(
          `${API_BASE_URL}/items/asset_impairment_review_lines?filter[review_id][_eq]=${latestReview.id}&limit=200`,
          { headers: AUTH_HEADERS, cache: "no-store" }
        );
        if (lineRes.ok) {
          const lineJson = (await lineRes.json()) as { data?: DirectusReviewLine[] };
          if (Array.isArray(lineJson.data)) {
            directusLines = lineJson.data;
          }
        }
      } catch (err) {
        console.warn("Directus review lines fetch failed:", err);
      }
    }

    // 4. Query line indicators
    let lineIndicators: DirectusLineIndicator[] = [];
    if (API_BASE_URL && directusLines.length > 0) {
      try {
        const lineIds = directusLines.map((l) => l.id).join(",");
        const indLineRes = await fetch(
          `${API_BASE_URL}/items/asset_impairment_review_line_indicators?filter[line_id][_in]=${lineIds}&limit=500`,
          { headers: AUTH_HEADERS, cache: "no-store" }
        );
        if (indLineRes.ok) {
          const indLineJson = (await indLineRes.json()) as { data?: DirectusLineIndicator[] };
          if (Array.isArray(indLineJson.data)) {
            lineIndicators = indLineJson.data;
          }
        }
      } catch (err) {
        console.warn("Directus line indicators fetch failed:", err);
      }
    }

    // Map line indicators
    const lineIndicatorsMap = new Map<number, IndicatorItem[]>();
    lineIndicators.forEach((li) => {
      const indDef = indicatorsMap.get(li.indicator_id);
      if (!indDef) return;

      const code = indDef.code || "";
      let type: IndicatorItem["type"] = "other";
      if (code === "CONDITION") type = "condition";
      else if (code === "IDLE") type = "idle";
      else if (code === "PREVIOUSLY_IMPAIRED") type = "previously_impaired";
      else if (code === "OBSOLETE") type = "obsolete";
      else if (code === "MARKET_DECLINE") type = "market";
      else if (code === "INTEREST_RATES") type = "interest";

      const arr = lineIndicatorsMap.get(li.line_id) || [];
      arr.push({
        id: li.indicator_id,
        code,
        label: indDef.name,
        type,
      });
      lineIndicatorsMap.set(li.line_id, arr);
    });

    // 5. Query pending approvals to check if any asset has a pending impairment test in Approvals
    const pendingAssetApprovals = new Map<number, string>();
    if (API_BASE_URL) {
      try {
        const evRes = await fetch(
          `${API_BASE_URL}/items/asset_events?filter[status_id][_eq]=1&limit=50`,
          { headers: AUTH_HEADERS, cache: "no-store" }
        );
        if (evRes.ok) {
          const evJson = (await evRes.json()) as { data?: DirectusAssetEventItem[] };
          if (Array.isArray(evJson.data)) {
            evJson.data.forEach((ev) => {
              const dt = ev.event_date ? ev.event_date.split("T")[0] : "recently";
              pendingAssetApprovals.set(
                ev.asset_id,
                `An impairment test dated ${dt} is waiting in Approvals — decide that first, or conclude "not significant" referencing it.`
              );
            });
          }
        }
      } catch (err) {
        console.warn("Directus pending asset_events fetch failed:", err);
      }
    }

    // 6. Join with real assets from assets_and_equipment
    const assets = await fetchAssets().catch(() => []);
    const assetMap = new Map<number, AssetTableData>();
    assets.forEach((a) => assetMap.set(a.id, a));

    const lines: ReviewLineItem[] = directusLines.map((l) => {
      const asset = assetMap.get(l.asset_id);
      const inds = lineIndicatorsMap.get(l.id) || [];
      const isObsolete = Boolean(l.is_obsolete) || inds.some((i) => i.code === "OBSOLETE");
      const matchedConclusion = conclusionsList.find((c) => c.id === l.conclusion_id);

      return {
        id: l.id,
        review_id: l.review_id,
        asset_id: l.asset_id,
        asset_tag: asset?.asset_tag || `AST-${String(l.asset_id).padStart(4, "0")}`,
        item_name: asset?.item_name || "Asset Item",
        classification_name: asset?.classification_name || "General PPE",
        department_name: asset?.department_name || "Unassigned",
        condition_name: asset?.condition || "Good",
        carrying_amount: Number(l.carrying_amount ?? asset?.projected_value ?? asset?.cost_per_item ?? 0),
        indicators: inds,
        is_obsolete: isObsolete,
        pending_approval_notice: pendingAssetApprovals.get(l.asset_id) || null,
        conclusion_id: l.conclusion_id || null,
        conclusion_code: matchedConclusion?.code || null,
        conclusion_name: matchedConclusion?.name || null,
        fvlcd: l.fvlcd !== null && l.fvlcd !== undefined ? Number(l.fvlcd) : null,
        viu: l.viu !== null && l.viu !== undefined ? Number(l.viu) : null,
        fvlcts: l.fvlcts !== null && l.fvlcts !== undefined ? Number(l.fvlcts) : null,
        cgu_name: l.cgu_name || null,
        new_remaining_months:
          l.new_remaining_months !== null && l.new_remaining_months !== undefined
            ? Number(l.new_remaining_months)
            : null,
        new_residual_value:
          l.new_residual_value !== null && l.new_residual_value !== undefined
            ? Number(l.new_residual_value)
            : null,
        loss_amount:
          l.loss_amount !== null && l.loss_amount !== undefined ? Number(l.loss_amount) : null,
        notes: l.note || null,
      };
    });

    const linesWithIndicators = lines.filter((l) => l.indicators.length > 0 || l.is_obsolete);
    const concludedCount = lines.filter((l) => !!l.conclusion_id).length;
    const carryingAmountFlagged = linesWithIndicators.reduce(
      (sum, l) => sum + l.carrying_amount,
      0
    );

    // 7. Fetch asset_settings thresholds & review market classes from Directus
    let idleMonthsThreshold = 6;
    let maintenancePctThreshold = 25;
    let marketClasses: number[] = [];
    let marketClassNames: string[] = [];

    if (API_BASE_URL) {
      try {
        const [setRes, mcRes, allClasses] = await Promise.all([
          fetch(`${API_BASE_URL}/items/asset_settings?limit=1`, {
            headers: AUTH_HEADERS,
            cache: "no-store",
          }),
          fetch(
            `${API_BASE_URL}/items/asset_impairment_review_market_classes?filter[review_id][_eq]=${latestReview.id}&limit=100`,
            { headers: AUTH_HEADERS, cache: "no-store" }
          ),
          fetchAssetClasses(),
        ]);

        if (setRes.ok) {
          const sJson = (await setRes.json()) as {
            data?: Array<{ idle_months?: number | string; maintenance_cost_percent?: number | string }>;
          };
          if (sJson.data?.[0]) {
            idleMonthsThreshold = Number(sJson.data[0].idle_months ?? 6) || 6;
            maintenancePctThreshold = Number(sJson.data[0].maintenance_cost_percent ?? 25) || 25;
          }
        }

        if (mcRes.ok) {
          const mcJson = (await mcRes.json()) as { data?: Array<{ asset_class_id: number }> };
          if (Array.isArray(mcJson.data)) {
            marketClasses = mcJson.data.map((m) => Number(m.asset_class_id));
            marketClassNames = marketClasses
              .map((cid) => allClasses.find((c) => c.id === cid)?.name || "")
              .filter(Boolean);
          }
        }
      } catch (err) {
        console.warn("Directus settings/market_classes fetch failed:", err);
      }
    }

    const payload: ImpairmentReviewData = {
      hasActiveReview: true,
      review: {
        id: latestReview.id,
        review_date: latestReview.review_date
          ? latestReview.review_date.split("T")[0]
          : new Date().toISOString().split("T")[0],
        review_name: reviewName,
        status_id: latestReview.status_id || 1,
        status_code: latestReview.status_id === 2 ? "SIGNED" : "OPEN",
        interest_rates_increased: Boolean(latestReview.interest_rates_increased),
        idle_months_threshold: idleMonthsThreshold,
        maintenance_pct_threshold: maintenancePctThreshold,
        market_classes: marketClasses,
        market_class_names: marketClassNames,
      },
      kpis: {
        reviewDate: latestReview.review_date
          ? new Date(latestReview.review_date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "Nov 16, 2026",
        reviewName,
        assetsWithIndicators: linesWithIndicators.length,
        concludedCount,
        totalCount: lines.length,
        carryingAmountFlagged,
      },
      lines,
      conclusions: conclusionsList.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        event_type_id: c.event_type_id || null,
      })),
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("GET /api/fm/asset-management/impairment-review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StartReviewPayload;
    const reviewName = body.review_name || "Year-end impairment review";
    const reviewDate = body.review_date || new Date().toISOString().split("T")[0];

    // Get a valid user id from user table
    const users = await fetchUsers().catch(() => []);
    const validUserId = users[0]?.user_id || 24;

    let newReviewId = 1;

    // 1. Insert into asset_impairment_reviews in Directus
    if (API_BASE_URL) {
      try {
        const createRes = await fetch(`${API_BASE_URL}/items/asset_impairment_reviews`, {
          method: "POST",
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            review_date: reviewDate,
            status_id: 1, // OPEN
            interest_rates_increased: 0,
            started_by: validUserId,
            summary: { name: reviewName },
            row_version: 0,
          }),
        });

        if (createRes.ok) {
          const createJson = (await createRes.json()) as { data?: { id: number } };
          if (createJson.data?.id) {
            newReviewId = createJson.data.id;
          }
        } else {
          const errData = await createRes.json().catch(() => ({}));
          console.error("Directus create review error:", errData);
          throw new Error("Failed to create review in database.");
        }
      } catch (err) {
        console.error("Directus insert asset_impairment_reviews error:", err);
        throw err;
      }
    }

    // 2. Query real assets from assets_and_equipment to populate lines
    const assets = await fetchAssets().catch(() => []);

    if (API_BASE_URL && assets.length > 0) {
      try {
        const conditionId = 1; // Physical condition
        const idleId = 2; // Idle

        for (const asset of assets) {
          const isPoor =
            asset.condition?.toLowerCase().includes("poor") ||
            asset.condition?.toLowerCase().includes("damaged");
          const isIdle =
            !asset.assigned_to_name ||
            asset.assigned_to_name.trim() === "" ||
            asset.assigned_to_name.toLowerCase() === "unassigned";

          const lineRes = await fetch(`${API_BASE_URL}/items/asset_impairment_review_lines`, {
            method: "POST",
            headers: AUTH_HEADERS,
            body: JSON.stringify({
              review_id: newReviewId,
              asset_id: asset.id,
              carrying_amount: asset.projected_value ?? asset.cost_per_item ?? 0,
              is_obsolete: 0,
              conclusion_id: null,
            }),
          });

          if (lineRes.ok) {
            const lineJson = (await lineRes.json()) as { data?: { id: number } };
            const lineId = lineJson.data?.id;
            if (lineId) {
              if (isPoor) {
                await fetch(`${API_BASE_URL}/items/asset_impairment_review_line_indicators`, {
                  method: "POST",
                  headers: AUTH_HEADERS,
                  body: JSON.stringify({ line_id: lineId, indicator_id: conditionId }),
                });
              }
              if (isIdle) {
                await fetch(`${API_BASE_URL}/items/asset_impairment_review_line_indicators`, {
                  method: "POST",
                  headers: AUTH_HEADERS,
                  body: JSON.stringify({ line_id: lineId, indicator_id: idleId }),
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn("Directus populate review lines error:", err);
      }
    }

    await appendAuditLog({
      action_id: 14, // IMPAIRMENT_REVIEW
      user_id: validUserId,
      details: `Started impairment review "${reviewName}" dated ${reviewDate} (${assets.length} asset(s))`,
    });

    return NextResponse.json({ success: true, id: newReviewId });
  } catch (error: unknown) {
    console.error("POST /api/fm/asset-management/impairment-review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: number;
      review_date?: string;
      review_name?: string;
      interest_rates_increased?: boolean;
      market_classes?: number[];
      market_class_keys?: string[];
      idle_months_threshold?: number;
      maintenance_pct_threshold?: number;
    };
    const {
      id,
      review_date,
      review_name,
      interest_rates_increased,
      market_classes,
      market_class_keys,
      idle_months_threshold,
      maintenance_pct_threshold,
    } = body;
    if (!id) {
      return NextResponse.json({ error: "Review ID is required" }, { status: 400 });
    }

    if (API_BASE_URL) {
      const updateData: Record<string, unknown> = {};
      if (review_date !== undefined) updateData.review_date = review_date;
      if (review_name !== undefined) updateData.summary = { name: review_name };
      if (interest_rates_increased !== undefined) {
        updateData.interest_rates_increased = interest_rates_increased ? 1 : 0;
      }

      if (Object.keys(updateData).length > 0) {
        const patchRes = await fetch(`${API_BASE_URL}/items/asset_impairment_reviews/${id}`, {
          method: "PATCH",
          headers: AUTH_HEADERS,
          body: JSON.stringify(updateData),
        });
        if (!patchRes.ok) {
          const errJson = (await patchRes.json().catch(() => ({}))) as {
            errors?: Array<{ message?: string }>;
          };
          return NextResponse.json(
            { error: errJson.errors?.[0]?.message || "Failed to update impairment review in database." },
            { status: 400 }
          );
        }
      }

      // Sync market decline classes into asset_impairment_review_market_classes
      if (market_classes !== undefined || market_class_keys !== undefined) {
        let targetClassIds: number[] = Array.isArray(market_classes) ? market_classes : [];
        if (Array.isArray(market_class_keys)) {
          const allClasses = await fetchAssetClasses();
          targetClassIds = [];
          for (const key of market_class_keys) {
            const matched = allClasses.find((c) => c.name.toLowerCase().includes(key.toLowerCase()));
            if (matched && !targetClassIds.includes(matched.id)) {
              targetClassIds.push(matched.id);
            }
          }
        }

        const existingRes = await fetch(
          `${API_BASE_URL}/items/asset_impairment_review_market_classes?filter[review_id][_eq]=${id}&limit=100`,
          { headers: AUTH_HEADERS, cache: "no-store" }
        );
        const existingJson = existingRes.ok
          ? ((await existingRes.json()) as { data?: Array<{ id: number; asset_class_id: number }> })
          : { data: [] };
        const existingRows = existingJson.data || [];

        // Delete unchecked classes
        for (const row of existingRows) {
          if (!targetClassIds.includes(Number(row.asset_class_id))) {
            await fetch(`${API_BASE_URL}/items/asset_impairment_review_market_classes/${row.id}`, {
              method: "DELETE",
              headers: AUTH_HEADERS,
            });
          }
        }

        // Insert newly checked classes
        const existingIds = new Set(existingRows.map((r) => Number(r.asset_class_id)));
        for (const classId of targetClassIds) {
          if (!existingIds.has(classId)) {
            const insRes = await fetch(`${API_BASE_URL}/items/asset_impairment_review_market_classes`, {
              method: "POST",
              headers: AUTH_HEADERS,
              body: JSON.stringify({ review_id: id, asset_class_id: classId }),
            });
            if (!insRes.ok) {
              const errJson = (await insRes.json().catch(() => ({}))) as {
                errors?: Array<{ message?: string }>;
              };
              return NextResponse.json(
                { error: errJson.errors?.[0]?.message || "Failed to save market decline indicator." },
                { status: 400 }
              );
            }
          }
        }
      }

      // Sync idle_months / maintenance_cost_percent thresholds to asset_settings (id = 1)
      if (idle_months_threshold !== undefined || maintenance_pct_threshold !== undefined) {
        const settingsPatch: Record<string, unknown> = {};
        if (idle_months_threshold !== undefined) settingsPatch.idle_months = Number(idle_months_threshold);
        if (maintenance_pct_threshold !== undefined) {
          settingsPatch.maintenance_cost_percent = Number(maintenance_pct_threshold);
        }
        const userId = await getDefaultUserId();
        settingsPatch.updated_by = userId;

        const setRes = await fetch(`${API_BASE_URL}/items/asset_settings/1`, {
          method: "PATCH",
          headers: AUTH_HEADERS,
          body: JSON.stringify(settingsPatch),
        });
        if (!setRes.ok) {
          const errJson = (await setRes.json().catch(() => ({}))) as {
            errors?: Array<{ message?: string }>;
          };
          return NextResponse.json(
            { error: errJson.errors?.[0]?.message || "Failed to save threshold settings." },
            { status: 400 }
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PATCH /api/fm/asset-management/impairment-review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update review" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Review ID is required" }, { status: 400 });
    }

    if (API_BASE_URL) {
      // 1. Delete market classes linked to this review
      const mcRes = await fetch(
        `${API_BASE_URL}/items/asset_impairment_review_market_classes?filter[review_id][_eq]=${id}&limit=100`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      );
      if (mcRes.ok) {
        const mcJson = (await mcRes.json()) as { data?: Array<{ id: number }> };
        for (const item of mcJson.data || []) {
          await fetch(`${API_BASE_URL}/items/asset_impairment_review_market_classes/${item.id}`, {
            method: "DELETE",
            headers: AUTH_HEADERS,
          });
        }
      }

      // 2. Get lines
      const linesRes = await fetch(
        `${API_BASE_URL}/items/asset_impairment_review_lines?filter[review_id][_eq]=${id}&limit=500`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      );
      const linesJson = (await linesRes.json()) as { data?: Array<{ id: number }> };
      const lineIds = (linesJson.data || []).map((l) => l.id);

      // 3. Delete line indicators & lines
      if (lineIds.length > 0) {
        const indRes = await fetch(
          `${API_BASE_URL}/items/asset_impairment_review_line_indicators?filter[line_id][_in]=${lineIds.join(",")}&limit=1000`,
          { headers: AUTH_HEADERS, cache: "no-store" }
        );
        const indJson = (await indRes.json()) as { data?: Array<{ id: number }> };
        for (const item of indJson.data || []) {
          await fetch(
            `${API_BASE_URL}/items/asset_impairment_review_line_indicators/${item.id}`,
            { method: "DELETE", headers: AUTH_HEADERS }
          );
        }

        for (const lineId of lineIds) {
          await fetch(`${API_BASE_URL}/items/asset_impairment_review_lines/${lineId}`, {
            method: "DELETE",
            headers: AUTH_HEADERS,
          });
        }
      }

      // 4. Delete review
      const delRes = await fetch(`${API_BASE_URL}/items/asset_impairment_reviews/${id}`, {
        method: "DELETE",
        headers: AUTH_HEADERS,
      });
      if (!delRes.ok) {
        const errJson = (await delRes.json().catch(() => ({}))) as {
          errors?: Array<{ message?: string }>;
        };
        return NextResponse.json(
          { error: errJson.errors?.[0]?.message || "Failed to delete impairment review." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("DELETE /api/fm/asset-management/impairment-review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete review" },
      { status: 500 }
    );
  }
}
