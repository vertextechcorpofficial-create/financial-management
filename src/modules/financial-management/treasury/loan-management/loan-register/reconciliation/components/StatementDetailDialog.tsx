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

import type { StatementRow } from "../types";
import { STATEMENT_RESULT_LABEL, STATEMENT_RESULT_TONE } from "../constants";
import { StatusBadge } from "./StatusBadge";

type Props = {
  row: StatementRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const FIELDS: Array<{ key: "principal" | "interest" | "penalties" | "advances"; label: string }> = [
  { key: "principal", label: "Principal" },
  { key: "interest", label: "Interest" },
  { key: "penalties", label: "Penalties" },
  { key: "advances", label: "Advances" },
];

function money(value: number) {
  return formatCurrency(Math.abs(value) < 0.005 ? 0 : value);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right tabular-nums">{children}</dd>
    </div>
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

/** One lender statement beside our own figures, field by field, so the variance is traceable. */
export function StatementDetailDialog({ row, open, onOpenChange }: Props) {
  if (!row) return null;

  const pairs = FIELDS.map((field) => {
    const lender = Number(row[`lender${field.key[0].toUpperCase()}${field.key.slice(1)}` as keyof StatementRow]);
    const ours = Number(row[`our${field.key[0].toUpperCase()}${field.key.slice(1)}` as keyof StatementRow]);
    return { label: field.label, lender, ours, variance: Number((lender - ours).toFixed(2)) };
  });
  const netVariance = Number(pairs.reduce((sum, pair) => sum + pair.variance, 0).toFixed(2));
  const agrees = row.result === "AGREES";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[720px]"
      >
        <DialogHeader className="space-y-2 border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <DialogTitle className="text-base">
              {row.loanNo} · {row.lenderName ?? "Lender"}
            </DialogTitle>
            <StatusBadge tone={STATEMENT_RESULT_TONE[row.result]}>{STATEMENT_RESULT_LABEL[row.result]}</StatusBadge>
          </div>
          <DialogDescription>
            Statement dated {row.statementDate} compared with our figures on the same date.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Lender principal" value={money(row.lenderPrincipal)} />
            <Tile label="Our principal" value={money(row.ourPrincipal)} />
            <Tile
              label="Principal variance"
              value={money(pairs[0].variance)}
              tone={agrees ? undefined : "text-destructive"}
            />
            <Tile
              label="Net variance"
              value={money(netVariance)}
              tone={Math.abs(netVariance) < 0.005 ? undefined : "text-destructive"}
            />
          </div>

          <section className="overflow-hidden rounded-lg border border-border/60">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Field</th>
                  <th className="px-3 py-2 text-right font-medium">Lender</th>
                  <th className="px-3 py-2 text-right font-medium">Ours</th>
                  <th className="px-4 py-2 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {pairs.map((pair) => (
                  <tr key={pair.label}>
                    <td className="px-4 py-2">{pair.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(pair.lender)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(pair.ours)}</td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        Math.abs(pair.variance) < 0.005 ? "text-muted-foreground" : "text-destructive"
                      }`}
                    >
                      {money(pair.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="overflow-hidden rounded-lg border border-border/60">
            <h3 className="border-b border-border/60 bg-muted/20 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Record
            </h3>
            <dl className="divide-y divide-border/50">
              <Row label="Loan">{row.loanNo}</Row>
              <Row label="Lender">{row.lenderName ?? "—"}</Row>
              <Row label="Statement date">{row.statementDate}</Row>
              <Row label="Recorded">{row.createdAt ? row.createdAt.replace("T", " ") : "—"}</Row>
            </dl>
          </section>

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
