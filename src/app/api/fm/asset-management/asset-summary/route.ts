import { NextResponse } from "next/server";
import { fetchAssets } from "@/modules/financial-management/asset-management/registration/services/asset";
import type {
  AssetSummaryData,
  AssetSummaryGroupRow,
  AssetSummaryKPIs,
} from "@/modules/financial-management/asset-management/asset-summary/types";
import type { AssetTableData } from "@/modules/financial-management/asset-management/registration/types";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const groupBy = searchParams.get("groupBy") || "item_name";

    // 1. Fetch live assets directly from database
    const rawAssets = await fetchAssets();

    // 2. Group assets
    const groupsMap = new Map<string, AssetTableData[]>();

    rawAssets.forEach((asset) => {
      let key = asset.item_name || "Uncategorized Item";
      if (groupBy === "item_type") {
        key = asset.item_type_name || "General";
      } else if (groupBy === "classification") {
        key = asset.classification_name || "IT Equipment";
      } else if (groupBy === "department") {
        key = asset.department_name || "Unassigned";
      }

      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(asset);
    });

    let totalUnitsInUse = 0;
    let totalUnitsOut = 0;
    let totalCost = 0;
    let totalAccumDep = 0;
    let totalProjectedValue = 0;

    const groups: AssetSummaryGroupRow[] = [];

    groupsMap.forEach((units, key) => {
      let inUseCount = 0;
      let outCount = 0;
      let groupCost = 0;
      let groupProjected = 0;

      const deptCounts = new Map<string, number>();
      const condCounts = new Map<string, number>();

      const firstUnit = units[0];

      units.forEach((u) => {
        const isDisposedOrOut =
          u.record_status === "voided" ||
          u.record_status === "archived" ||
          u.condition === "Discontinued";

        if (isDisposedOrOut) {
          outCount += 1;
        } else {
          inUseCount += 1;
          const cost = Number(u.cost_per_item || u.acquisition_cost || 0);
          const val = Number(u.projected_value || cost);
          groupCost += cost;
          groupProjected += val;
        }

        const dept = u.department_name || "Unassigned";
        deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);

        const cond = u.condition || "Good";
        condCounts.set(cond, (condCounts.get(cond) || 0) + 1);
      });

      const groupAccum = Math.max(0, groupCost - groupProjected);

      totalUnitsInUse += inUseCount;
      totalUnitsOut += outCount;
      totalCost += groupCost;
      totalAccumDep += groupAccum;
      totalProjectedValue += groupProjected;

      const byDepartmentText = Array.from(deptCounts.entries())
        .map(([d, c]) => `${d} ${c}`)
        .join(" · ");

      const byConditionText = Array.from(condCounts.entries())
        .map(([cond, c]) => `${cond} ${c}`)
        .join(" · ");

      groups.push({
        groupKey: key,
        itemName: key,
        itemType: firstUnit?.item_type_name || "General",
        classification: firstUnit?.classification_name || "IT Equipment",
        inUseCount,
        outCount,
        byDepartmentText: byDepartmentText || "—",
        byConditionText: byConditionText || "—",
        totalCost: groupCost,
        accumDepAndImp: groupAccum,
        projectedValue: groupProjected,
        units,
      });
    });

    const kpis: AssetSummaryKPIs = {
      groupCount: groups.length,
      unitsInUse: totalUnitsInUse,
      disposedOrHeldForSale: totalUnitsOut,
      projectedValue: totalProjectedValue,
    };

    const payload: AssetSummaryData = {
      asOfDate: "Nov 16, 2026",
      kpis,
      groups,
      totalUnitsInUse,
      totalUnitsOut,
      totalCost,
      totalAccumDep,
      totalProjectedValue,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("GET /api/fm/asset-management/asset-summary error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
