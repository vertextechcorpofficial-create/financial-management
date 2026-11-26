import { Card } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";

import type { RegisterSummary } from "../types";
import { toneClass, type Tone } from "../constants";

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: Tone;
}) {
  return (
    <Card className={`gap-1 border-l-[3px] p-4 ${toneClass(tone)}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs opacity-80">{hint}</p> : null}
    </Card>
  );
}

export function RegisterKpis({ summary, pending = false }: { summary: RegisterSummary; pending?: boolean }) {
  // A zero reads as a measured fact. Until the register answers, say so instead of printing ₱0.00,
  // and keep the counts and sentences below the value quiet for the same reason.
  const show = (formatted: string) => (pending ? "—" : formatted);
  const whenLoaded = (text: string) => (pending ? undefined : text);
  const { totals } = summary;
  const rate = totals.weightedRate;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Open loans"
        value={show(formatNumber(totals.current))}
        hint={whenLoaded(
          `${formatNumber(totals.loans)} on file · ${formatNumber(totals.pendingReview)} waiting for approval`,
        )}
        tone="info"
      />
      <Tile
        label="Outstanding principal"
        value={show(formatCurrency(totals.outstandingPrincipal))}
        hint={whenLoaded(
          rate === null ? "No rate on file yet" : `Weighted nominal rate ${formatNumber(rate, "en-PH", 2)}% a year`,
        )}
        tone="success"
      />
      <Tile
        label="Due this month"
        value={show(formatCurrency(totals.dueThisMonth))}
        hint="Installments whose payment date falls in the current month"
        tone="neutral"
      />
      <Tile
        label="Overdue"
        value={show(formatCurrency(totals.overdueAmount))}
        hint={whenLoaded(
          totals.overdueAmount > 0 ? "Installments past their due date and still unpaid" : "Nothing is past its due date",
        )}
        tone={totals.overdueAmount > 0 ? "danger" : "neutral"}
      />
    </div>
  );
}
