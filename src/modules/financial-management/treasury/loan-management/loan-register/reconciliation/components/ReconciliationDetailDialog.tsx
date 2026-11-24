"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

import type { ReconciliationRow } from "../types";
import { RESULT_LABEL, RESULT_TONE } from "../constants";
import { formatDateMDY, phtDisplayStamp } from "../pht";
import { StatusBadge } from "./StatusBadge";

type Props = {
  row: ReconciliationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The six buckets the roll-forward adds up, in the order the panel shows them.
 *
 * The stored columns are magnitudes, not signed movements: the service subtracts payments,
 * prepayments, restructures and payoffs when it closes the period. The panel therefore carries
 * the direction itself, or the "Opening + movement" line prints a sum that never equals Closing.
 */
const MOVEMENT: Array<{ key: keyof ReconciliationRow; label: string; direction: 1 | -1 }> = [
  { key: "newLoans", label: "New loans released", direction: 1 },
  { key: "interestAmortization", label: "Interest and amortization", direction: 1 },
  { key: "payments", label: "Payments", direction: -1 },
  { key: "partialPrepayments", label: "Partial prepayments", direction: -1 },
  { key: "restructures", label: "Restructures", direction: -1 },
  { key: "payoffs", label: "Payoffs", direction: -1 },
];

function money(value: number) {
  return formatCurrency(Math.abs(value) < 0.005 ? 0 : value);
}

/** A blank or missing value has to say so: an empty cell reads as "nothing here", not "unknown". */
function text(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? "not recorded" : trimmed;
}

/** `children` is typed as text on purpose: a truncated node would have no title to read it by. */
function Row({ label, strong, children }: { label: string; strong?: boolean; children: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        title={children}
        className={`min-w-0 truncate text-right tabular-nums${strong ? " font-medium" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border/60">
      <h3 className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border/50">{children}</dl>
    </section>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

/** One closed period, in full: what came in, what went out, and how the closing figure was reached. */
export function ReconciliationDetailDialog({ row, open, onOpenChange }: Props) {
  if (!row) return null;

  const movement = MOVEMENT.reduce((sum, item) => sum + item.direction * Number(row[item.key] ?? 0), 0);
  const ties = row.result === "RECONCILED" && Math.abs(row.difference) < 0.005;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[720px]"
      >
        <DialogHeader className="space-y-2 border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <DialogTitle className="text-base">
              {formatDateMDY(row.periodStart)} → {formatDateMDY(row.periodEnd)}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={RESULT_TONE[row.result]}>{RESULT_LABEL[row.result]}</StatusBadge>
              {row.signedAt ? <StatusBadge tone="success">Signed off</StatusBadge> : null}
            </div>
          </div>
          <DialogDescription>
            {ties
              ? row.stale
                ? "The roll-forward and the ledger agreed when this period was saved; later postings have moved the ledger."
                : "The roll-forward and the ledger closed at the same figure."
              : `The roll-forward and the ledger disagree by ${money(row.difference)}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {row.stale ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              Postings dated inside this period were recorded after it was saved. Rebuild the period to
              refresh these figures; a sign-off would freeze the older ones.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Opening" value={money(row.openingBalance)} />
            <Tile label="Movement" value={money(movement)} />
            <Tile label="Closing" value={money(row.closingBalance)} />
            <Tile
              label="Difference"
              value={money(row.difference)}
              tone={ties ? undefined : "text-destructive"}
            />
          </div>

          <Group title="Movement">
            {MOVEMENT.map((item) => (
              <Row key={item.key} label={item.label}>
                {money(item.direction * Number(row[item.key] ?? 0))}
              </Row>
            ))}
            <Row label="Opening + movement" strong>
              {money(row.openingBalance + movement)}
            </Row>
          </Group>

          <Group title="Sign-off">
            <Row label="Signed by">{text(row.signedByName)}</Row>
            <Row label="Signed at">
              {row.signedAt ? phtDisplayStamp(row.signedAt) : "Not signed"}
            </Row>
            <Row label="Recorded">
              {row.createdAt ? phtDisplayStamp(row.createdAt) : "not recorded"}
            </Row>
          </Group>

          {row.remarks ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Remarks</p>
              <p className="mt-1 whitespace-pre-line">{row.remarks}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
