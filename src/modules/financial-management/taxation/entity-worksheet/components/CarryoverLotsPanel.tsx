"use client";

import { useMemo, useState } from "react";
import { Plus, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { CarryoverKind, CarryoverLotDetail, CarryoverPanel } from "../types";
import type { CarryoverLotPayload } from "../providers/worksheetApi";

interface Props {
  panel: CarryoverPanel;
  companyId: number;
  taxYear: number;
  isSaving: boolean;
  onRecord: (input: CarryoverLotPayload) => Promise<boolean>;
  onUpdateUsed: (id: number, amountUsed: number) => Promise<boolean>;
  onUpdateOpenings: () => Promise<boolean>;
}

const KIND_LABELS: Record<CarryoverKind, string> = {
  NOLCO: "NOLCO · Net operating loss carryover",
  EXCESS_MCIT: "MCIT · Excess minimum corporate income tax",
};

const STATUS_LABELS: Record<CarryoverLotDetail["status"], string> = {
  OPEN: "Open",
  EXPIRED: "Expired",
  USED: "Used up",
};

const statusTone = (status: CarryoverLotDetail["status"]): string =>
  status === "OPEN" ? "text-foreground" : "text-muted-foreground";

/**
 * Part I-B of the 1702Q: the carryover lots by the year they arose, what this year used,
 * what is left, when each expires, and what rolls into next year (P70). The warning names
 * any lot whose window closes with this tax year while money is still on it.
 */
export function CarryoverLotsPanel({
  panel,
  companyId,
  taxYear,
  isSaving,
  onRecord,
  onUpdateUsed,
  onUpdateOpenings,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<CarryoverLotDetail | null>(null);

  const nextYear = taxYear + 1;
  const expiring = panel.expiringUnused;

  return (
    <section className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Carryover lots</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            What lines 8 and 12 subtract: NOLCO and excess MCIT, by the year each arose. A lot applies only after its
            origin year and inside its window.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setRecording(true)} disabled={isSaving}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Record lot
        </Button>
      </header>

      {panel.stale.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/40 px-4 py-2.5 text-xs">
          <span className="min-w-0 break-words">
            {panel.stale.length === 1 ? "One opening differs" : `${panel.stale.length} openings differ`} from{" "}
            {taxYear - 1}&apos;s closing balance:{" "}
            {panel.stale
              .map((lot) => `${lot.kind} ${lot.originYear} records ${formatCurrency(lot.recorded)}, closed at ${formatCurrency(lot.closing)}`)
              .join("; ")}
            .
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={isSaving || panel.locked}
            title={
              panel.locked
                ? `The ${taxYear} period is locked, so its openings cannot be rewritten until it is unlocked.`
                : "Accept last year's closing balances as this year's openings"
            }
            onClick={() => void onUpdateOpenings()}
          >
            Update opening carryovers
          </Button>
        </div>
      ) : null}

      {expiring.length > 0 ? (
        <div className="flex items-start gap-2 border-b border-border/50 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            {expiring.length === 1 ? "One lot expires" : `${expiring.length} lots expire`} unused at the end of {taxYear}:{" "}
            {expiring
              .map((lot) => `${lot.kind} ${lot.originYear} (${formatCurrency(lot.left)} left)`)
              .join(", ")}
            . Record what this year used before the window closes.
          </span>
        </div>
      ) : null}

      {panel.lots.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No carryover lot is recorded for {taxYear}.
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-4 py-2 font-medium">Origin year</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 text-right font-medium">Used</th>
                  <th className="px-4 py-2 text-right font-medium">Left</th>
                  <th className="px-4 py-2 font-medium">Expires</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {panel.lots.map((lot) => (
                  <tr key={lot.id} className="border-b border-border/40 last:border-0">
                    <td className="max-w-[220px] truncate px-4 py-2" title={KIND_LABELS[lot.kind]}>
                      {lot.kind}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{lot.originYear}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(lot.amount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(lot.used)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(lot.left)}</td>
                    <td className={`px-4 py-2 tabular-nums ${statusTone(lot.status)}`}>
                      After {lot.lastUsableYear} · {STATUS_LABELS[lot.status]}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(lot)}
                        disabled={isSaving}
                        title={`Correct how much of the ${lot.kind} ${lot.originYear} lot this year used`}
                      >
                        Edit used
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border/50 md:hidden">
            {panel.lots.map((lot) => (
              <li key={lot.id} className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium" title={KIND_LABELS[lot.kind]}>
                    {lot.kind} · {lot.originYear}
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[11px]">
                    {STATUS_LABELS[lot.status]}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="text-right tabular-nums">{formatCurrency(lot.amount)}</dd>
                  <dt className="text-muted-foreground">Used</dt>
                  <dd className="text-right tabular-nums">{formatCurrency(lot.used)}</dd>
                  <dt className="text-muted-foreground">Left</dt>
                  <dd className="text-right tabular-nums">{formatCurrency(lot.left)}</dd>
                  <dt className="text-muted-foreground">Expires</dt>
                  <dd className="text-right tabular-nums">After {lot.lastUsableYear}</dd>
                </dl>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-full md:min-h-0"
                  onClick={() => setEditing(lot)}
                  disabled={isSaving}
                >
                  Edit used
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
        <h3 className="text-xs font-semibold">Carried to {nextYear}</h3>
        {panel.carriedForward.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Nothing rolls into {nextYear}.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(panel.carriedForward.reduce((total, lot) => total + lot.left, 0))} rolls forward
              {panel.earliestExpiry ? `, the earliest expiry after ${panel.earliestExpiry}` : ""}.
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {panel.carriedForward.map((lot) => (
                <li key={`carried-${lot.id}`} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate" title={KIND_LABELS[lot.kind]}>
                    {lot.kind} {lot.originYear}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatCurrency(lot.left)} · expires after {lot.lastUsableYear}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <RecordLotDialog
        open={recording}
        companyId={companyId}
        taxYear={taxYear}
        isSaving={isSaving}
        onOpenChange={setRecording}
        onSubmit={async (input) => {
          const saved = await onRecord(input);
          if (saved) setRecording(false);
        }}
      />

      <EditUsedDialog
        lot={editing}
        isSaving={isSaving}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={async (amountUsed) => {
          if (!editing) return;
          const saved = await onUpdateUsed(editing.id, amountUsed);
          if (saved) setEditing(null);
        }}
      />
    </section>
  );
}

function RecordLotDialog({
  open,
  companyId,
  taxYear,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  companyId: number;
  taxYear: number;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CarryoverLotPayload) => Promise<void>;
}) {
  const [kind, setKind] = useState<CarryoverKind>("NOLCO");
  const [originYear, setOriginYear] = useState(String(taxYear - 1));
  const [amount, setAmount] = useState("");
  const [amountUsed, setAmountUsed] = useState("0");
  const [expires, setExpires] = useState("");

  const defaultYears = useMemo(() => {
    const origin = Number(originYear);
    return kind === "NOLCO" && (origin === 2020 || origin === 2021) ? 5 : 3;
  }, [kind, originYear]);

  const originError = Number(originYear) > taxYear - 1 ? `The origin year must be ${taxYear - 1} or earlier.` : null;
  const amountError = !(Number(amount) > 0) ? "The amount must be greater than zero." : null;
  const hasErrors = Boolean(originError || amountError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[550px]">
        <DialogHeader className="border-b border-border/50 px-6 py-4">
          <DialogTitle>Record a carryover lot</DialogTitle>
          <DialogDescription>
            A lot from an earlier year that {taxYear} may still subtract on line 8 (NOLCO) or line 12 (MCIT).
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="lot-kind">Kind</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as CarryoverKind)}>
              <SelectTrigger id="lot-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="NOLCO">NOLCO · Net operating loss carryover</SelectItem>
                <SelectItem value="EXCESS_MCIT">MCIT · Excess minimum corporate income tax</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lot-origin">
                Origin year <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lot-origin"
                type="number"
                inputMode="numeric"
                value={originYear}
                onChange={(event) => setOriginYear(event.target.value)}
                aria-invalid={Boolean(originError)}
              />
              {originError ? <p className="text-xs text-destructive">{originError}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lot-expires">Expires after</Label>
              <Input
                id="lot-expires"
                type="number"
                inputMode="numeric"
                placeholder={`${defaultYears} years`}
                value={expires}
                onChange={(event) => setExpires(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Years after the origin year. Empty uses {defaultYears} for this kind and year.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lot-amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lot-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-invalid={Boolean(amountError)}
              />
              {amountError ? <p className="text-xs text-destructive">{amountError}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lot-used">Already used</Label>
              <Input
                id="lot-used"
                type="number"
                inputMode="decimal"
                value={amountUsed}
                onChange={(event) => setAmountUsed(event.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="justify-end gap-2 border-t border-border/50 bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSaving || hasErrors}
            onClick={() =>
              void onSubmit({
                companyId,
                taxYear,
                kind,
                originYear: Number(originYear),
                amount: Number(amount),
                amountUsed: Number(amountUsed) || 0,
                expiresAfterYear: expires.trim() ? Number(expires) : null,
              })
            }
          >
            Save lot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUsedDialog({
  lot,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  lot: CarryoverLotDetail | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (amountUsed: number) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const used = lot ? (value === "" ? lot.used : Number(value)) : 0;
  const error = lot && (used < 0 || used > lot.amount) ? `Must sit between 0 and ${formatNumber(lot.amount)}.` : null;

  return (
    <Dialog
      open={lot != null}
      onOpenChange={(open) => {
        if (!open) setValue("");
        onOpenChange(open);
      }}
    >
      <DialogContent className="flex max-h-[85vh] w-[95vw] flex-col overflow-hidden rounded-2xl p-0 sm:max-w-[500px]">
        <DialogHeader className="border-b border-border/50 px-6 py-4">
          <DialogTitle>
            Used amount · {lot?.kind} {lot?.originYear}
          </DialogTitle>
          <DialogDescription>
            {lot ? `${formatCurrency(lot.amount)} recorded, ${formatCurrency(lot.left)} left before this edit.` : null}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-6 py-4">
          <Label htmlFor="lot-used-edit">Used this year</Label>
          <Input
            id="lot-used-edit"
            type="number"
            inputMode="decimal"
            placeholder={lot ? String(lot.used) : ""}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={Boolean(error)}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="justify-end gap-2 border-t border-border/50 bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving || Boolean(error)} onClick={() => void onSubmit(used)}>
            Save used amount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
