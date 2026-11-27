import { formatNumber } from "@/lib/utils";
import { BridgeBars, type Tone } from "../../shared/Charts";
import { Callout, Panel, PanelHead, SectionHeading } from "../../shared/BoardKit";
import type { BridgeEntity, OverviewBridge } from "../types";

const CURRENCY = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₱M a year, the unit the baselines are stored in, the same format the planner screen uses. */
function money(value: number): string {
  return `${value < 0 ? "−" : ""}₱${CURRENCY.format(Math.abs(value))}M`;
}

function EntityRow({ entity }: { entity: BridgeEntity }) {
  return (
    <tr className="border-t border-border/60 align-top">
      <td className="py-2 pr-3">
        <span className="block font-medium">{entity.name}</span>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{entity.code}</span>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{entity.revenue === null ? <span className="text-muted-foreground">not reported</span> : money(entity.revenue)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{entity.ebitda === null ? <span className="text-muted-foreground">not reported</span> : money(entity.ebitda)}</td>
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
}: {
  label: string;
  value: number;
  note?: string;
  accent?: boolean;
  column?: "revenue" | "ebitda";
}) {
  const cell = <td className="py-2 pr-3 text-right tabular-nums">{money(value)}</td>;
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

/**
 * The reference's consolidation bridge: one column per company, the eliminations that turn the
 * company sum into the consolidated figure, then the Holdings charge that turns the entity EBITDA
 * sum into the group's. Every number here is derived from settings and the month's readings, and
 * the card says so, because the module stores no reported group profit and loss.
 */
export function ConsolidationBridge({ bridge }: { bridge: OverviewBridge }) {
  const reportedRows = bridge.entities.filter((entity) => entity.revenue !== null);
  const steps = [
    ...reportedRows.map((entity) => ({ label: entity.code, value: entity.revenue ?? 0, tone: "info" as Tone })),
    { label: "Gross", value: bridge.gross, tone: "primary" as Tone, total: true },
    { label: "Eliminated", value: -bridge.eliminations, tone: "muted" as Tone },
    { label: "Consolidated", value: bridge.consolidated, tone: "primary" as Tone, total: true },
  ];
  const eliminShare = bridge.gross > 0 ? (bridge.eliminations / bridge.gross) * 100 : null;
  const gapOver = bridge.gap !== null && bridge.gap.value > bridge.gap.ceiling;

  return (
    <>
      <SectionHeading
        title="Consolidation bridge"
        description={`Revenue per company at baseline, EBITDA from the ${bridge.asOf} readings, reconciled to the group.`}
        right={<span className="text-[11px] text-muted-foreground">{`${bridge.reported} of ${bridge.total} reporting`}</span>}
      />
      <Panel>
        <PanelHead
          title="Revenue build to consolidated"
          description="Intercompany sales are eliminated so internal trade is not counted twice."
          count={`${bridge.entities.length} entities`}
        />
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <BridgeBars steps={steps} dp={0} unit="M" />
          </div>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          {eliminShare === null
            ? "No company reported a baseline this month, so there is nothing to consolidate."
            : `Eliminations take ${formatNumber(eliminShare, "en-PH", 1)}% of the ₱${formatNumber(bridge.gross, "en-PH", 0)}M gross. Revenue is the annual baseline each company is budgeted on, not a month of billings.`}
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
                <EntityRow key={entity.code} entity={entity} />
              ))}
            </tbody>
            <tfoot>
              <TotalRow label="Sum of reported companies" value={bridge.gross} note={`${bridge.entities.length - reportedRows.length === 0 ? "all operating companies reported" : `${bridge.entities.length - reportedRows.length} not reported`}`} />
              <TotalRow label="Less intercompany sales" value={-bridge.eliminations} note="Eliminated so internal trade is not counted twice" />
              <TotalRow label="Consolidated revenue" value={bridge.consolidated} accent />
              <TotalRow label="Less Holdings fee" value={-bridge.holdingsFee} note="One percent of consolidated revenue" column="ebitda" />
              <TotalRow
                label="Group EBITDA"
                value={bridge.groupEbitda}
                note={`Entity EBITDA sums to ${money(bridge.ebitdaSum)} before the charge`}
                accent
                column="ebitda"
              />
            </tfoot>
          </table>
        </div>

        <ul className="mt-3 space-y-2 md:hidden">
          {bridge.entities.map((entity) => (
            <li key={entity.code} className="rounded-md border border-border/60 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{entity.name}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{entity.code}</span>
              </div>
              <dl className="mt-1.5 grid grid-cols-2 gap-x-3 text-[12px]">
                <dt className="text-muted-foreground">Revenue / year</dt>
                <dd className="text-right tabular-nums">{entity.revenue === null ? "not reported" : money(entity.revenue)}</dd>
                <dt className="text-muted-foreground">EBITDA / year</dt>
                <dd className="text-right tabular-nums">{entity.ebitda === null ? "not reported" : money(entity.ebitda)}</dd>
              </dl>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{entity.basis}</p>
            </li>
          ))}
          <li className="rounded-md border border-border/60 p-3 text-[12px]">
            <dl className="grid grid-cols-2 gap-x-3">
              <dt className="text-muted-foreground">Consolidated revenue</dt>
              <dd className="text-right tabular-nums">{money(bridge.consolidated)}</dd>
              <dt className="text-muted-foreground">Group EBITDA</dt>
              <dd className="text-right tabular-nums">{money(bridge.groupEbitda)}</dd>
            </dl>
          </li>
        </ul>

        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          The group line is derived from the company rows above, not read from a reported consolidated statement: this module stores no group profit and loss, so the bridge reconciles to its own arithmetic rather than to a filed total.
        </p>

        {bridge.gap ? (
          <div className="mt-3">
            <Callout
              tone={gapOver ? "warning" : "info"}
              title={gapOver ? "Intercompany imbalance is over its ceiling" : "Intercompany imbalance is within its ceiling"}
            >
              {`₱${formatNumber(bridge.gap.value, "en-PH", 2)}M at ${bridge.gap.period} against a ₱${formatNumber(bridge.gap.ceiling, "en-PH", 2)}M ceiling: ${gapOver ? `over by ₱${formatNumber(bridge.gap.value - bridge.gap.ceiling, "en-PH", 2)}M, which is the part of the bridge that does not tie` : `₱${formatNumber(bridge.gap.ceiling - bridge.gap.value, "en-PH", 2)}M of headroom`}.`}
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
