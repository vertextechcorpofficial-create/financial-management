"use client";

import { useSearchParams } from "next/navigation";

import { CURRENCY_PARAM, FX_PHP_PER_USD, type CurrencyCode } from "./analytics-screens";
import { Callout, Panel, PanelHead, SectionHeading } from "./BoardKit";
import { BridgeBars, type Tone } from "./Charts";
import { formatNumber } from "../services/engine";
import type { BridgeEntity, OverviewBridge } from "../types";

const CURRENCY = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money(value: number, currency: CurrencyCode): string {
  const scaled = currency === "USD" ? value / FX_PHP_PER_USD : value;
  const sym = currency === "USD" ? "$" : "₱";
  return `${scaled < 0 ? "−" : ""}${sym}${CURRENCY.format(Math.abs(scaled))}M`;
}

function scaleMoney(value: number, currency: CurrencyCode): number {
  return currency === "USD" ? value / FX_PHP_PER_USD : value;
}

function EntityRow({ entity, currency }: { entity: BridgeEntity; currency: CurrencyCode }) {
  return (
    <tr className="border-t border-border/60 align-top">
      <td className="py-2 pr-3">
        <span className="block font-medium">{entity.name}</span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{entity.code}</span>
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums">
        {entity.revenue === null ? <span className="text-muted-foreground">—</span> : money(entity.revenue, currency)}
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums">
        {entity.ebitda === null ? <span className="text-muted-foreground">—</span> : money(entity.ebitda, currency)}
      </td>
      <td className="py-2 text-[11px] leading-snug text-muted-foreground">{entity.basis}</td>
    </tr>
  );
}

function TotalRow({
  label,
  value,
  note,
  accent,
  column = "revenue",
  currency,
}: {
  label: string;
  value: number;
  note?: string;
  accent?: boolean;
  column?: "revenue" | "ebitda";
  currency: CurrencyCode;
}) {
  const cell = <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(value, currency)}</td>;
  return (
    <tr className="border-t border-border/60">
      <td className="py-2 pr-3">
        <span className={accent ? "font-semibold" : undefined}>{label}</span>
        {note ? <span className="block text-[11px] text-muted-foreground">{note}</span> : null}
      </td>
      {column === "revenue" ? cell : <td className="py-2 pr-3" />}
      {column === "ebitda" ? cell : <td className="py-2 pr-3" />}
      <td className="py-2" />
    </tr>
  );
}

export function ConsolidationBridge({ bridge }: { bridge: OverviewBridge }) {
  const search = useSearchParams();
  const currency = (search.get(CURRENCY_PARAM) === "USD" ? "USD" : "PHP") as CurrencyCode;

  const reportedRows = bridge.entities.filter((entity) => entity.revenue !== null);
  const steps = [
    ...reportedRows.map((entity) => ({
      label: entity.code.toUpperCase(),
      value: scaleMoney(entity.revenue ?? 0, currency),
      tone: "info" as Tone,
    })),
    { label: "Gross", value: scaleMoney(bridge.gross, currency), tone: "primary" as Tone, total: true },
    { label: "Eliminated", value: scaleMoney(-bridge.eliminations, currency), tone: "muted" as Tone },
    { label: "Consolidated", value: scaleMoney(bridge.consolidated, currency), tone: "primary" as Tone, total: true },
  ];
  const eliminShare = bridge.gross > 0 ? (bridge.eliminations / bridge.gross) * 100 : null;
  const gapOver = bridge.gap !== null && bridge.gap.value > bridge.gap.ceiling;
  const sym = currency === "USD" ? "$" : "₱";

  return (
    <>
      <SectionHeading
        title={`Consolidation bridge — revenue, ${bridge.asOf}`}
        description="Intercompany sales are eliminated so internal trade is not counted twice."
        right={
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {`${bridge.reported} of ${bridge.total} reporting`}
            {currency === "USD" ? ` · ₱${FX_PHP_PER_USD} = $1` : ""}
          </span>
        }
      />
      <Panel className="p-4">
        <PanelHead
          title="Revenue & EBITDA build to consolidated"
          description="Annual company baselines reconciled through eliminations and Holdings charge."
          count={`${bridge.entities.length} entities`}
          className="-mx-4 -mt-4 mb-4"
        />
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <BridgeBars steps={steps} dp={0} unit="M" showBreak />
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {eliminShare === null
            ? "No company reported a baseline this month, so there is nothing to consolidate."
            : `Eliminations take ${formatNumber(eliminShare, 1)}% of ${sym}${formatNumber(scaleMoney(bridge.gross, currency), 0)}M gross revenue. Revenue reflects the annual company baseline; EBITDA reflects ${bridge.asOf} readings.`}
        </p>

        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-3 text-left font-medium">Company</th>
                <th className="py-1 pr-3 text-right font-medium">Revenue / year</th>
                <th className="py-1 pr-3 text-right font-medium">EBITDA / year</th>
                <th className="py-1 text-left font-medium">Basis</th>
              </tr>
            </thead>
            <tbody>
              {bridge.entities.map((entity) => (
                <EntityRow key={entity.code} entity={entity} currency={currency} />
              ))}
            </tbody>
            <tfoot>
              <TotalRow
                label="Sum of reported companies"
                value={bridge.gross}
                note={
                  bridge.entities.length - reportedRows.length === 0
                    ? "All operating companies reported"
                    : `${bridge.entities.length - reportedRows.length} not reported`
                }
                currency={currency}
              />
              <TotalRow
                label="Less intercompany sales"
                value={-bridge.eliminations}
                note="Eliminated so internal trade is not counted twice"
                currency={currency}
              />
              <TotalRow label="Consolidated revenue" value={bridge.consolidated} accent currency={currency} />
              <TotalRow
                label="Less Holdings fee"
                value={-bridge.holdingsFee}
                note="One percent of consolidated revenue"
                column="ebitda"
                currency={currency}
              />
              <TotalRow
                label="Group EBITDA"
                value={bridge.groupEbitda}
                note={`Entity EBITDA sums to ${money(bridge.ebitdaSum, currency)} before the charge`}
                accent
                column="ebitda"
                currency={currency}
              />
            </tfoot>
          </table>
        </div>

        <ul className="mt-3 space-y-2 md:hidden">
          {bridge.entities.map((entity) => (
            <li key={entity.code} className="rounded-md border border-border/60 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{entity.name}</span>
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{entity.code}</span>
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 text-[12px]">
                <dt className="text-muted-foreground">Revenue / year</dt>
                <dd className="text-right font-mono tabular-nums">
                  {entity.revenue === null ? "—" : money(entity.revenue, currency)}
                </dd>
                <dt className="text-muted-foreground">EBITDA / year</dt>
                <dd className="text-right font-mono tabular-nums">
                  {entity.ebitda === null ? "—" : money(entity.ebitda, currency)}
                </dd>
              </dl>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{entity.basis}</p>
            </li>
          ))}
        </ul>

        {bridge.gap ? (
          <div className="mt-3">
            <Callout
              tone={gapOver ? "warning" : "info"}
              title={gapOver ? "Intercompany imbalance is over its ceiling" : "Intercompany imbalance is within its ceiling"}
            >
              {`${money(bridge.gap.value, currency)} at ${bridge.gap.period} against a ${money(bridge.gap.ceiling, currency)} ceiling.`}
            </Callout>
          </div>
        ) : null}

        {bridge.untied ? (
          <div className="mt-3">
            <Callout tone="warning" title="The bridge does not tie">
              {bridge.untied}
            </Callout>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
