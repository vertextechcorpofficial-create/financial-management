"use client";

import { useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

import { percentText } from "../constants";
import { phtDisplayDate } from "../pht";
import { useRateConfig } from "../hooks/useRateConfig";
import type { RateSettingRow, WithholdingRateRow } from "../types";
import { EMPTY_SETTING, RateSettingDialog } from "./RateSettingDialog";

const ROW_TONE = "border-border/50";

function SettingsTable({
  rows,
  onEdit,
  onNew,
  readOnly,
}: {
  rows: RateSettingRow[];
  onEdit: (index: number) => void;
  onNew: () => void;
  readOnly: boolean;
}) {
  return (
    <section
      aria-label="Rate settings"
      className={cn("overflow-hidden rounded-2xl border bg-card shadow-sm", ROW_TONE)}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Rates in force</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The newest row dated on or before 1 January of the year on screen is the one the desk uses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="tabular-nums text-[11px]">
            {rows.length} {rows.length === 1 ? "version" : "versions"}
          </Badge>
          <Button type="button" size="sm" onClick={onNew} disabled={readOnly}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New version
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No rate version is recorded on this instance yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Starts</th>
                <th className="px-3 py-2 text-right font-medium">VAT</th>
                <th className="px-3 py-2 text-right font-medium">Percentage</th>
                <th className="px-3 py-2 text-right font-medium">Corporate</th>
                <th className="px-3 py-2 text-right font-medium">Small</th>
                <th className="px-3 py-2 text-right font-medium">MCIT</th>
                <th className="px-3 py-2 text-right font-medium">OSD</th>
                <th className="px-3 py-2 text-right font-medium">SCIT</th>
                <th className="px-3 py-2 text-right font-medium">Final tax</th>
                <th className="px-3 py-2 text-right font-medium">NTI ceiling</th>
                <th className="px-4 py-2 text-right font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((row, index) => (
                <tr key={row.rateId ?? `new-${index}`} className="hover:bg-muted/20">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{phtDisplayDate(row.effectiveFrom)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentText(row.vat)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentText(row.percentage)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentText(row.corporate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentText(row.smallCorporate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentText(row.mcit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentText(row.osd)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentText(row.scit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{percentText(row.finalTaxInterest)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.smallCorporateNtiCeiling)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(index)} disabled={readOnly}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function rowKey(row: WithholdingRateRow): string {
  return row.rateId ? `id-${row.rateId}` : `${row.incomeType}-${row.rateTier}-${row.effectiveFrom}`;
}

interface WithholdingDraft {
  percent: string;
  topAgent: boolean;
}

function draftOf(row: WithholdingRateRow): WithholdingDraft {
  return { percent: String(Number((row.rate * 100).toFixed(4))), topAgent: row.requiresTopWithholdingAgent };
}

function isDirty(row: WithholdingRateRow, draft: WithholdingDraft): boolean {
  const parsed = Number(draft.percent);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return true;
  return draft.topAgent !== row.requiresTopWithholdingAgent || Math.abs(parsed / 100 - row.rate) > 1e-6;
}

function atcCodeFor(row: WithholdingRateRow): string {
  switch (row.incomeType) {
    case "RENT":
      return "WC100 / WI100";
    case "SERVICES":
      return "WC157 / WI157";
    case "CONSTRUCTION":
      return "WC120 / WI120";
    case "GOODS":
      return "WC158 / WI158";
    case "FEE":
      if (row.rateTier === "LARGE") return "WC011 (15% corp.)";
      if (row.rateTier === "MEDIUM") return "WC010 / WI011 (10%)";
      if (row.rateTier === "SMALL") return "WI010 (5% ind.)";
      return "WI010 / WC010";
    default:
      return "WC160 / WI160";
  }
}

function tierDisplayLabel(row: WithholdingRateRow): string {
  if (row.incomeType === "FEE") {
    if (row.rateTier === "LARGE") return "Corporation (>₱720k)";
    if (row.rateTier === "MEDIUM") return "Corp. ≤₱720k / Ind. >₱3M";
    if (row.rateTier === "SMALL") return "Individual (≤₱3M)";
  }
  return row.rateTier ? row.rateTier.toLowerCase() : "any";
}

function isNonStatutoryFee(row: WithholdingRateRow, draft: WithholdingDraft): boolean {
  if (row.incomeType !== "FEE") return false;
  const parsed = Number(draft.percent);
  return Number.isFinite(parsed) && ![5, 10, 15].includes(parsed);
}

function WithholdingRowEditor({
  row,
  draft,
  readOnly,
  onChange,
}: {
  row: WithholdingRateRow;
  draft: WithholdingDraft;
  readOnly: boolean;
  onChange: (next: WithholdingDraft) => void;
}) {
  const dirty = isDirty(row, draft);
  const nonStatutoryFee = isNonStatutoryFee(row, draft);

  return (
    <tr className={dirty || nonStatutoryFee ? "bg-amber-500/5" : undefined}>
      <td className="whitespace-nowrap px-4 py-2.5 capitalize">{row.incomeType.toLowerCase()}</td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">{atcCodeFor(row)}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{tierDisplayLabel(row)}</td>
      <td className="px-3 py-2.5 text-right">
        <Input
          value={draft.percent}
          onChange={(event) => onChange({ ...draft, percent: event.target.value })}
          inputMode="decimal"
          disabled={readOnly}
          className="ml-auto h-8 w-24 text-right tabular-nums"
          aria-label={`${row.incomeType} rate in percent`}
          aria-invalid={dirty || nonStatutoryFee}
        />
      </td>
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={draft.topAgent}
          onChange={(event) => onChange({ ...draft, topAgent: event.target.checked })}
          disabled={readOnly}
          aria-label={`${row.incomeType} requires a top withholding agent`}
          className="h-4 w-4"
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">{phtDisplayDate(row.effectiveFrom)}</td>
      <td className="px-4 py-2.5 text-right text-xs">
        {dirty ? (
          <span className="font-medium text-amber-700 dark:text-amber-300">Unsaved</span>
        ) : nonStatutoryFee ? (
          <span
            className="font-medium text-amber-700 dark:text-amber-300"
            title="Under RR 11-2018, professional/management fees are 5% or 10% (individuals) and 10% or 15% (corporations) — never 2%."
          >
            Non-statutory (use 5/10/15%)
          </span>
        ) : null}
      </td>
    </tr>
  );
}

type RateController = ReturnType<typeof useRateConfig>;

/** The company selector lives in the page header, so this panel only edits what it is handed. */
export function RateConfigPanel({ controller }: { controller: RateController }) {
  const rates = controller;
  const [editing, setEditing] = useState<{ row: typeof EMPTY_SETTING | null; open: boolean }>({ row: null, open: false });
  const [drafts, setDrafts] = useState<Record<string, WithholdingDraft>>({});

  const companies = rates.config?.companies ?? [];
  const readOnly = rates.isLoading || companies.length === 0;
  const withholding = rates.config?.withholding ?? [];
  const draftFor = (row: WithholdingRateRow): WithholdingDraft => drafts[rowKey(row)] ?? draftOf(row);
  const dirtyRows = withholding.filter((row) => isDirty(row, draftFor(row)));
  const invalidFeeRows = dirtyRows.filter((row) => isNonStatutoryFee(row, draftFor(row)));
  const [matrixError, setMatrixError] = useState<string | null>(null);

  async function saveMatrix() {
    if (invalidFeeRows.length > 0) {
      setMatrixError("Professional fee EWT rate must be 5%, 10%, or 15% under RR 11-2018.");
      return;
    }
    setMatrixError(null);
    // Saves one row at a time: each write is its own audit entry, and a failure stops the run
    // with the remaining rows still marked unsaved so nothing is silently dropped.
    for (const row of dirtyRows) {
      const draft = draftFor(row);
      const parsed = Number(draft.percent);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;
      const saved = await rates.saveWithholding({
        ...row,
        rate: parsed / 100,
        requiresTopWithholdingAgent: draft.topAgent,
      });
      if (!saved) return;
      setDrafts((current) => {
        const next = { ...current };
        delete next[rowKey(row)];
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      {rates.error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>That did not save</AlertTitle>
          <AlertDescription>{rates.error}</AlertDescription>
        </Alert>
      )}

      {rates.config?.notice && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Rates not readable</AlertTitle>
          <AlertDescription>{rates.config.notice}</AlertDescription>
        </Alert>
      )}

      {rates.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <SettingsTable
            rows={rates.config?.settings ?? []}
            readOnly={readOnly}
            onNew={() => setEditing({ row: null, open: true })}
            onEdit={(index) => setEditing({ row: rates.config?.settings[index] ?? null, open: true })}
          />

          <section
            aria-label="Withholding matrix"
            className={cn("overflow-hidden rounded-2xl border bg-card shadow-sm", ROW_TONE)}
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Withholding matrix</h2>
                <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
                  Rent 5%, services and construction 2%, goods 1% only for a top withholding agent, and the
                  professional fee at the statutory rate for the payee: 5% or 10% for an individual, 10% or 15%
                  for a juridical person.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    dirtyRows.length > 0
                      ? "tabular-nums text-[11px] text-amber-700 dark:text-amber-300"
                      : "tabular-nums text-[11px]"
                  }
                >
                  {dirtyRows.length === 0
                    ? "No unsaved changes"
                    : `${formatNumber(dirtyRows.length)} unsaved ${dirtyRows.length === 1 ? "change" : "changes"}`}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  disabled={dirtyRows.length === 0 || invalidFeeRows.length > 0 || readOnly || rates.isSaving}
                  onClick={() => void saveMatrix()}
                  title={
                    invalidFeeRows.length > 0
                      ? "Fix non-statutory professional fee rates (5%, 10%, or 15%) before saving"
                      : dirtyRows.length === 0
                        ? "Edit a rate or a top-agent flag first"
                        : `Save ${dirtyRows.length} ${dirtyRows.length === 1 ? "row" : "rows"}`
                  }
                >
                  {rates.isSaving ? "Saving" : "Save withholding matrix"}
                </Button>
              </div>
            </header>
            {matrixError && (
              <p className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                {matrixError}
              </p>
            )}

            {(rates.config?.withholding.length ?? 0) === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                No withholding rate is recorded on this instance yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Income type</th>
                      <th className="px-3 py-2 text-left font-medium">BIR ATC</th>
                      <th className="px-3 py-2 text-left font-medium">Payee tier</th>
                      <th className="px-3 py-2 text-right font-medium">Rate %</th>
                      <th className="px-3 py-2 text-center font-medium">Top agent only</th>
                      <th className="px-3 py-2 text-left font-medium">Starts</th>
                      <th className="px-4 py-2 text-right font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(rates.config?.withholding ?? []).map((row) => (
                      <WithholdingRowEditor
                        key={rowKey(row)}
                        row={row}
                        draft={draftFor(row)}
                        readOnly={readOnly}
                        onChange={(next) => setDrafts((current) => ({ ...current, [rowKey(row)]: next }))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <RateSettingDialog
        key={editing.open ? (editing.row?.rateId ?? "new") : "closed"}
        open={editing.open}
        row={editing.row}
        isSaving={rates.isSaving}
        onOpenChange={(open) => setEditing((current) => ({ ...current, open }))}
        onSave={rates.saveSetting}
      />
    </div>
  );
}
