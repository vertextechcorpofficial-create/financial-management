"use client";

import { useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

import { CURRENCY_PARAM, FX_PHP_PER_USD, type CurrencyCode } from "./analytics-screens";
import { MicroLabel, Panel, PanelHead, SampleBadge } from "./BoardKit";
import { useErpEndpoint } from "./useErpEndpoint";
import { formatNumber } from "../services/engine";

interface OpexBreakdownPayload {
  sample?: boolean;
  totalActual?: number;
  totalBudget?: number | null;
  categories?: Array<{
    code: string;
    label: string;
    actual: number;
    budget?: number | null;
    priorMonth?: number | null;
  }>;
}

interface AgingBucket {
  bucket: string;
  amount: number;
  sharePct: number;
}

interface WorkingCapitalAgingPayload {
  sample?: boolean;
  arAging?: AgingBucket[];
  apAging?: AgingBucket[];
  inventoryAging?: AgingBucket[];
}

const BUCKET_LABEL: Record<string, string> = {
  CURRENT: "Current",
  "1_30": "1–30d",
  "31_60": "31–60d",
  "61_90": "61–90d",
  OVER_90: "90+d",
  OVER_30: "30+d",
  "0_30": "0–30d",
  "31_90": "31–90d",
  "91_180": "91–180d",
  OVER_180: "180+d",
};

const BUCKET_COLORS = [
  "bg-emerald-600 dark:bg-emerald-500",
  "bg-teal-600 dark:bg-teal-400",
  "bg-amber-500",
  "bg-orange-500",
  "bg-rose-600",
];

function AgingBarRow({
  title,
  buckets,
  symbol,
  scale,
}: {
  title: string;
  buckets: AgingBucket[];
  symbol: string;
  scale: number;
}) {
  const total = buckets.reduce((sum, b) => sum + (b.amount || 0), 0);
  const totalM = (total * scale) / 1_000_000;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
          {symbol}
          {formatNumber(totalM, 2)}M
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {buckets.map((b, idx) => (
          <div
            key={b.bucket}
            className={cn("h-full transition-all", BUCKET_COLORS[idx % BUCKET_COLORS.length])}
            style={{ width: `${Math.max(2, b.sharePct)}%` }}
            title={`${BUCKET_LABEL[b.bucket] ?? b.bucket}: ${symbol}${formatNumber((b.amount * scale) / 1_000_000, 2)}M (${formatNumber(b.sharePct, 1)}%)`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
        {buckets.map((b, idx) => (
          <span key={b.bucket} className="inline-flex items-center gap-1 font-mono tabular-nums">
            <span className={cn("h-1.5 w-1.5 rounded-full", BUCKET_COLORS[idx % BUCKET_COLORS.length])} />
            {BUCKET_LABEL[b.bucket] ?? b.bucket} {formatNumber(b.sharePct, 0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export function OverviewFinancialBento({ asOf }: { asOf: string }) {
  const search = useSearchParams();
  const currency: CurrencyCode = search.get(CURRENCY_PARAM) === "USD" ? "USD" : "PHP";
  const scale = currency === "USD" ? 1 / FX_PHP_PER_USD : 1;
  const symbol = currency === "USD" ? "$" : "₱";

  const opex = useErpEndpoint<OpexBreakdownPayload>("financial/opex-breakdown", { period: asOf });
  const aging = useErpEndpoint<WorkingCapitalAgingPayload>("financial/working-capital-aging", { period: asOf });

  if (!opex.loading && !aging.loading && !opex.available && !aging.available) {
    return null;
  }

  const maxCat = Math.max(
    1,
    ...(opex.data?.categories?.flatMap((c) => [c.actual, c.budget ?? 0]) ?? [1]),
  );
  const totalActual = opex.data?.totalActual ?? 0;
  const totalBudget = opex.data?.totalBudget ?? null;
  const hasTotalBudget = totalBudget !== null && totalBudget > 0;

  return (
    <div className="space-y-4">
      {/* Opex Spend Composition */}
      <Panel>
        <PanelHead
          title="Opex Spend Composition"
          description={
            hasTotalBudget
              ? "ERP expense accounts vs monthly budget."
              : "ERP expense accounts by share (no budget entered)."
          }
          right={opex.sample ? <SampleBadge /> : null}
        />
        <div className="p-4">
          {opex.loading ? (
            <p className="py-5 text-center text-xs text-muted-foreground">Loading Opex breakdown…</p>
          ) : !opex.available || !opex.data?.categories?.length ? (
            <p className="py-5 text-center text-xs text-muted-foreground">
              Opex breakdown endpoint not available yet.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2.5">
                <div>
                  <MicroLabel>Total Opex ({asOf})</MicroLabel>
                  <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
                    {symbol}
                    {formatNumber((totalActual * scale) / 1000, 1)}k
                  </p>
                </div>
                {hasTotalBudget ? (
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 font-mono text-xs font-semibold tabular-nums",
                      totalActual > totalBudget
                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {((totalActual - totalBudget) / totalBudget) * 100 >= 0 ? "+" : ""}
                    {formatNumber(((totalActual - totalBudget) / totalBudget) * 100, 1)}% vs bud.
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">No budget entered</span>
                )}
              </div>

              <div className="space-y-2.5">
                {opex.data.categories.map((cat) => {
                  const catBudget = cat.budget ?? null;
                  const hasCatBudget = catBudget !== null && catBudget > 0;
                  const over = hasCatBudget && cat.actual > catBudget;
                  const varPct = hasCatBudget ? ((cat.actual - catBudget) / catBudget) * 100 : null;
                  const sharePct = totalActual > 0 ? (cat.actual / totalActual) * 100 : 0;
                  return (
                    <div key={cat.code} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-foreground" title={cat.label}>
                          {cat.label}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {symbol}
                          {formatNumber((cat.actual * scale) / 1000, 1)}k
                          {varPct !== null ? (
                            <span
                              className={cn(
                                "ml-1.5 text-[10.5px]",
                                over ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              ({varPct >= 0 ? "+" : ""}
                              {formatNumber(varPct, 1)}%)
                            </span>
                          ) : (
                            <span className="ml-1.5 text-[10.5px] text-muted-foreground">
                              {formatNumber(sharePct, 0)}%
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            over ? "bg-rose-500" : "bg-teal-700 dark:bg-teal-400",
                          )}
                          style={{ width: `${Math.min(100, (cat.actual / maxCat) * 100)}%` }}
                        />
                        {hasCatBudget ? (
                          <span
                            aria-hidden
                            className="absolute bottom-0 top-0 w-0.5 bg-foreground/60"
                            style={{ left: `${Math.min(99, (catBudget / maxCat) * 100)}%` }}
                            title={`Budget: ${symbol}${formatNumber((catBudget * scale) / 1000, 1)}k`}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Working Capital & Aging Velocity */}
      <Panel>
        <PanelHead
          title="Working Capital & Aging"
          description="AR, AP, and Inventory aging profile."
          right={aging.sample ? <SampleBadge /> : null}
        />
        <div className="p-4">
          {aging.loading ? (
            <p className="py-5 text-center text-xs text-muted-foreground">Loading aging velocity…</p>
          ) : !aging.available || !aging.data ? (
            <p className="py-5 text-center text-xs text-muted-foreground">
              Working capital aging endpoint not available yet.
            </p>
          ) : (
            <div className="space-y-4">
              {aging.data.arAging?.length ? (
                <AgingBarRow title="Accounts Receivable" buckets={aging.data.arAging} symbol={symbol} scale={scale} />
              ) : null}
              {aging.data.apAging?.length ? (
                <AgingBarRow title="Accounts Payable" buckets={aging.data.apAging} symbol={symbol} scale={scale} />
              ) : null}
              {aging.data.inventoryAging?.length ? (
                <AgingBarRow title="Inventory Aging" buckets={aging.data.inventoryAging} symbol={symbol} scale={scale} />
              ) : null}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
