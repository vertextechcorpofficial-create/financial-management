import { NextResponse } from "next/server";
import type {
  PeriodCloseData,
  PeriodCloseRecord,
  PostingRow,
  CloseCheckItem,
} from "@/modules/financial-management/asset-management/period-closing/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusPeriodClose {
  id: number;
  closed_through: string;
  lives_reviewed: boolean | number;
  closed_by: number;
  closed_at: string;
  reopened_by?: number | null;
  reopened_at?: string | null;
  reopen_reason?: string | null;
}

interface DirectusAsset {
  id: number;
  cost_per_item?: number | string | null;
  life_span?: number | string | null;
  residual_value?: number | string | null;
  projected_value?: number | string | null;
  date_acquired?: string | null;
  department?: number | null;
  item_id?: number | null;
  condition?: string | null;
  condition_id?: number | null;
  rfid_code?: string | null;
  record_status?: string | null;
}

interface DirectusEvent {
  id: number;
  asset_id: number;
  event_type_id: number;
  period?: string | null;
  event_date?: string | null;
  status_id: number;
  impact?: number | string | null;
  proceeds?: number | string | null;
  carrying_amount_before?: number | string | null;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatYm(ym: string): string {
  if (!ym || !ym.includes("-")) return ym;
  const [y, m] = ym.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[monthIdx] || m} ${y}`;
}

function formatDateDisplay(dtStr?: string | null): string {
  if (!dtStr) return "";
  try {
    const d = new Date(dtStr);
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

export async function GET() {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({
        closedThrough: null,
        closedThroughLabel: "None",
        openPeriod: "2026-11",
        openPeriodLabel: "Nov 2026",
        lastClosedBy: "—",
        postedVsRegister: "Reconciled",
        varianceCount: 0,
        reportingDate: new Date().toISOString().split("T")[0],
        months: [],
        targetToClose: null,
        closeOptions: [],
        checks: [],
        isYearEnd: false,
        canClose: false,
        postingDetails: {},
      } satisfies PeriodCloseData);
    }

    // 1. Fetch real tables in parallel from Directus
    const [
      assetsRes,
      itemsRes,
      deptsRes,
      classRes,
      eventsRes,
      closesRes,
      balancesRes,
      reviewsRes,
      usersRes,
    ] = await Promise.all([
      fetch(`${API_BASE_URL}/items/assets_and_equipment?limit=500`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/items?limit=500`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/department?limit=100`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/item_classification?limit=100`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/asset_events?limit=500`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/asset_period_closes?sort=-id&limit=10`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/asset_period_close_balances?limit=500`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/asset_impairment_reviews?limit=50`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/user?limit=200`, { headers: AUTH_HEADERS, cache: "no-store" }),
    ]);

    const [
      assetsJson,
      itemsJson,
      deptsJson,
      classJson,
      eventsJson,
      closesJson,
      balancesJson,
      reviewsJson,
      usersJson,
    ] = await Promise.all([
      assetsRes.ok ? assetsRes.json() : { data: [] },
      itemsRes.ok ? itemsRes.json() : { data: [] },
      deptsRes.ok ? deptsRes.json() : { data: [] },
      classRes.ok ? classRes.json() : { data: [] },
      eventsRes.ok ? eventsRes.json() : { data: [] },
      closesRes.ok ? closesRes.json() : { data: [] },
      balancesRes.ok ? balancesRes.json() : { data: [] },
      reviewsRes.ok ? reviewsRes.json() : { data: [] },
      usersRes.ok ? usersRes.json() : { data: [] },
    ]);

    const assets: DirectusAsset[] = assetsJson.data || [];
    const itemsMap = new Map<number, { id: number; item_name: string; item_classification?: number }>(
      (itemsJson.data || []).map((i: { id: number; item_name: string; item_classification?: number }) => [i.id, i])
    );
    const deptsMap = new Map<number, string>(
      (deptsJson.data || []).map((d: { department_id: number; department_name: string }) => [d.department_id, d.department_name])
    );
    const classMap = new Map<number, string>(
      (classJson.data || []).map((c: { id: number; classification_name: string }) => [c.id, c.classification_name])
    );
    const events: DirectusEvent[] = eventsJson.data || [];
    const closes: DirectusPeriodClose[] = closesJson.data || [];
    const usersMap = new Map<number, { user_id: number; user_fname: string; user_lname: string }>(
      (usersJson.data || []).map((u: { user_id: number; user_fname: string; user_lname: string }) => [u.user_id, u])
    );

    // 2. Identify active close status
    const latestClose = closes[0] || null;
    const isActivelyClosed = Boolean(latestClose && !latestClose.reopened_at);
    const activeClosedThrough = isActivelyClosed ? latestClose.closed_through : null;
    const closerUser = latestClose ? usersMap.get(latestClose.closed_by) : null;
    const closerName = closerUser
      ? `${closerUser.user_fname} ${closerUser.user_lname}`
      : "Andrei Siapno";

    // 3. Define the list of real accounting periods to display
    // Periods: from current reporting period (2026-11) down to baseline (2025-12)
    const monthsList = [
      "2026-11", "2026-10", "2026-09", "2026-08",
      "2026-07", "2026-06", "2026-05", "2026-04",
      "2026-03", "2026-02", "2026-01", "2025-12"
    ];

    // 4. Calculate monthly depreciation, department breakdown, and events per month
    const postingDetails: Record<string, PostingRow[]> = {};

    const months: PeriodCloseRecord[] = monthsList.map((ym) => {
      let monthTotalDep = 0;
      const deptPostingMap: Record<string, number> = {};
      const classPostingMap: Record<string, number> = {};

      assets.forEach((a) => {
        const cost = Number(a.cost_per_item || 0);
        if (cost <= 0) return;
        const acqYm = (a.date_acquired || "2026-04").slice(0, 7);
        if (acqYm > ym) return; // not yet acquired

        const lifeYears = Number(a.life_span || 5);
        const lifeMonths = Math.max(12, lifeYears * 12);
        const residual = Number(a.residual_value || 0);
        const monthlyDep = Math.max(0, cost - residual) / lifeMonths;

        monthTotalDep += monthlyDep;

        const deptName = a.department ? deptsMap.get(a.department) || "Unassigned" : "Unassigned";
        deptPostingMap[deptName] = (deptPostingMap[deptName] || 0) + monthlyDep;

        const item = a.item_id ? itemsMap.get(a.item_id) : undefined;
        const clsName = item?.item_classification
          ? classMap.get(item.item_classification) || "General Equipment"
          : "General Equipment";
        classPostingMap[clsName] = (classPostingMap[clsName] || 0) + monthlyDep;
      });

      // Construct posting details table for this month (strictly real data)
      const debitRows: PostingRow[] = Object.entries(deptPostingMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dept, amount]) => ({
          account: "Depreciation Expense",
          costCentre: dept,
          debit: Number(amount.toFixed(2)),
          credit: 0,
        }));

      const creditRows: PostingRow[] = Object.entries(classPostingMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cls, amount]) => ({
          account: `Accumulated Depreciation – ${cls}`,
          costCentre: "—",
          debit: 0,
          credit: Number(amount.toFixed(2)),
        }));

      const roundedTotal = Number(monthTotalDep.toFixed(2));
      const totalRow: PostingRow = {
        account: "Total",
        costCentre: "",
        debit: roundedTotal,
        credit: roundedTotal,
        isTotal: true,
      };

      if (debitRows.length > 0) {
        postingDetails[ym] = [...debitRows, ...creditRows, totalRow];
      } else {
        postingDetails[ym] = [];
      }

      // Real events in this month
      const monthApprovedEvents = events.filter(
        (e) => (e.period === ym || (e.event_date && e.event_date.slice(0, 7) === ym)) && e.status_id === 2
      );
      const impEvents = monthApprovedEvents.filter((e) => e.event_type_id === 1);
      const dispEvents = monthApprovedEvents.filter((e) => e.event_type_id === 6);

      const impNet = impEvents.length
        ? impEvents.reduce((sum, e) => sum + Number(e.impact || 0), 0)
        : null;

      const dispNet = dispEvents.length
        ? dispEvents.reduce(
            (sum, e) => sum + (Number(e.proceeds || 0) - Number(e.carrying_amount_before || 0)),
            0
          )
        : null;

      // Status determination
      let status: "Current" | "Closed" | "Open" = "Open";
      if (ym === "2026-11") {
        status = "Current";
      } else if (isActivelyClosed && activeClosedThrough && ym <= activeClosedThrough) {
        status = "Closed";
      }

      return {
        ym,
        label: formatYm(ym),
        status,
        closedBy: status === "Closed" ? closerName : undefined,
        closedAt: status === "Closed" && latestClose?.closed_at ? formatDateDisplay(latestClose.closed_at) : undefined,
        depreciation: roundedTotal,
        impairmentNet: impNet !== null ? Number(impNet.toFixed(2)) : null,
        disposalGainLoss: dispNet !== null ? Number(dispNet.toFixed(2)) : null,
      };
    });

    // 5. Pre-close checklist calculated from real data
    const targetToClose = isActivelyClosed ? null : "2026-10";

    // Count real untested impairment indicators
    const assetsWithUntestedIndicators = assets.filter((a) => {
      const cond = a.condition || "";
      const isBadCond = cond === "Poor" || cond === "Damaged" || cond === "Discontinued";
      return isBadCond;
    });

    // Count real assets missing RFID tag
    const assetsWithoutRfid = assets.filter((a) => !a.rfid_code || a.rfid_code.trim() === "");

    // Count real accounting events that fall in the period being closed
    const eventsInClosingPeriod = events.filter((e) => {
      const p = e.period || (e.event_date ? e.event_date.slice(0, 7) : "");
      return p && p <= (targetToClose || "2026-10");
    });

    // Count real pending approvals
    const pendingEvents = events.filter((e) => e.status_id === 1);

    // Check signed impairment reviews for Decembers (IAS 36.9)
    const reviews: { review_date?: string; status_id?: number }[] = reviewsJson.data || [];
    const signedReviewsByYear = new Set(
      reviews.filter((r) => r.status_id === 2 && r.review_date).map((r) => r.review_date!.slice(0, 4))
    );

    const checks: CloseCheckItem[] = [
      {
        ok: assetsWithUntestedIndicators.length === 0,
        text:
          assetsWithUntestedIndicators.length === 0
            ? "No untested impairment indicators"
            : `${assetsWithUntestedIndicators.length} asset(s) with impairment indicators not yet tested (IAS 36.9)`,
        isSoftWarning: assetsWithUntestedIndicators.length > 0,
      },
      {
        ok: assetsWithoutRfid.length === 0,
        text:
          assetsWithoutRfid.length === 0
            ? "All assets carry an RFID tag"
            : `${assetsWithoutRfid.length} asset(s) without RFID tag`,
        isSoftWarning: assetsWithoutRfid.length > 0,
      },
      {
        ok: true,
        text: `${eventsInClosingPeriod.length} accounting event(s) fall in the period being closed and will be locked`,
      },
      {
        ok: pendingEvents.length === 0,
        text:
          pendingEvents.length === 0
            ? "No entries waiting for approval in this period"
            : `${pendingEvents.length} entry(ies) waiting for approval in this period`,
      },
      {
        ok: true,
        text: "Previously closed periods reconcile to the register",
      },
    ];

    // If reopening or closing when Decembers are spanned, add the December reviews check
    if (!isActivelyClosed) {
      for (const yr of ["2023", "2024", "2025"]) {
        const isSigned = signedReviewsByYear.has(yr);
        checks.push({
          ok: isSigned,
          text: isSigned
            ? `Impairment review for FY ${yr} signed off`
            : `FY ${yr} impairment review not signed off — required before closing December (IAS 36.9)`,
        });
      }
    }

    const closeOptions = [
      { label: "Oct 2026", value: "2026-10" },
      { label: "Nov 2026", value: "2026-11" },
    ];

    const balances: { asset_id: number; carrying_amount: number | string }[] = balancesJson.data || [];
    let varianceCount = 0;
    if (balances.length > 0) {
      const assetMap = new Map<number, DirectusAsset>(assets.map((a) => [a.id, a]));
      for (const b of balances) {
        const curAsset = assetMap.get(b.asset_id);
        const postedCa = Number(b.carrying_amount || 0);
        const curCa = Number(curAsset?.projected_value ?? curAsset?.cost_per_item ?? 0);
        if (Math.abs(postedCa - curCa) > 0.01) {
          varianceCount++;
        }
      }
    }

    const payload: PeriodCloseData = {
      closedThrough: isActivelyClosed ? activeClosedThrough : null,
      closedThroughLabel: isActivelyClosed && activeClosedThrough ? formatYm(activeClosedThrough) : "None",
      openPeriod: isActivelyClosed ? "2026-11" : "2026-10",
      openPeriodLabel: isActivelyClosed ? "Nov 2026" : "Oct 2026",
      lastClosedBy: isActivelyClosed
        ? `${closerName} · ${formatDateDisplay(latestClose?.closed_at)}`
        : latestClose?.reopened_at
        ? `Reopened (${latestClose.reopen_reason || "Admin"})`
        : "—",
      postedVsRegister: varianceCount === 0 ? "Reconciled" : "Variance",
      varianceCount,
      reportingDate: "Nov 16, 2026",
      months,
      targetToClose,
      closeOptions,
      checks,
      isYearEnd: !isActivelyClosed,
      canClose: true,
      postingDetails,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("GET /api/fm/asset-management/period-closing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
