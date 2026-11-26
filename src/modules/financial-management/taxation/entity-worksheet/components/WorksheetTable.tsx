"use client";

import { Fragment, useState } from "react";
import { Download, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";

import { MANUAL_LINE_KEYS, MANUAL_LINE_LABELS, isManualLineKey } from "../constants";
import type { WorksheetLine } from "../types";
import { downloadWorksheet, downloadWorksheetPdf } from "../utils/exportWorkbook";

const SECTION_LABEL: Record<WorksheetLine["section"], string> = {
  INCOME: "Part II · Income",
  DEDUCTIONS: "Part III · Deductions",
  TAX: "Part IV · Tax and credits",
};

/** The five rows a preparer may type; every other row is arithmetic on them. */
const EDITABLE = new Set<string>(MANUAL_LINE_KEYS);

interface Props {
  lines: WorksheetLine[];
  total: number;
  /** Names the workbook, so an export never overwrites another year's. */
  taxYear: number;
  /** The cost-of-sales basis the sheet carries, named on the face of the table (W1/W2). */
  basisLabel: string;
  /** Manual entry mode (deck item 10): the five input rows accept typed figures. */
  manualMode?: boolean;
  isSaving?: boolean;
  onManualChange?: (lineKey: string, quarter: number, amount: number | null) => void;
}

/**
 * One editable figure.
 *
 * Commits on blur or Enter; an empty box clears the typed figure and the line returns to
 * what the ledgers produced. The value is the key, so a saved figure remounts the box with
 * the figure the server read back instead of a stale draft.
 */
function ManualCell({
  value,
  typed,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  typed: boolean;
  label: string;
  disabled: boolean;
  onCommit: (amount: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (typed || value !== 0 ? String(value) : "");

  const commit = () => {
    if (draft === null) return;
    const trimmed = draft.trim();
    setDraft(null);
    if (!trimmed) {
      if (typed) onCommit(null);
      return;
    }
    const amount = Number(trimmed);
    if (!Number.isFinite(amount)) return;
    if (amount === value && typed) return;
    onCommit(amount);
  };

  return (
    <Input
      type="number"
      inputMode="decimal"
      step="0.01"
      value={shown}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "h-8 w-full min-w-[96px] text-right tabular-nums",
        typed && "border-indigo-400/70 bg-indigo-50/50 font-medium dark:bg-indigo-950/20",
      )}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** A computed figure, with a mark when a preparer typed it rather than the ledgers. */
function StaticCell({ value, typed }: { value: number; typed: boolean }) {
  return (
    <span title={typed ? "Typed by a preparer — overrides the ledger figure" : undefined}>
      {formatCurrency(value)}
      {typed ? <span className="ml-0.5 text-indigo-600 dark:text-indigo-400">*</span> : null}
    </span>
  );
}

/**
 * The 1702Q worksheet: one row per numbered line, one column per quarter, plus the year.
 * Every row already states how it is built, so there is nothing to drill into.
 */
export function WorksheetTable({ lines, total, taxYear, basisLabel, manualMode, isSaving, onManualChange }: Props) {
  // Group sales, group cost of sales, other income, non-deductible expenses and NOLCO sit at zero on a
  // clean year; five guaranteed-empty rows push the lines that matter off the fold. Manual mode
  // keeps the editable rows visible: a company with no ledger data has nothing to show otherwise.
  const visible = lines.filter(
    (line) =>
      line.emphasis ||
      (manualMode && EDITABLE.has(line.key)) ||
      line.values.some((value) => Math.abs(value) >= 0.005) ||
      Math.abs(line.yearValue) >= 0.005,
  );
  const hidden = lines.length - visible.length;
  const sections = (Object.keys(SECTION_LABEL) as WorksheetLine["section"][]).filter((section) =>
    lines.some((line) => line.section === section),
  );
  const editing = manualMode === true && onManualChange != null;
  const typedCells = lines.reduce(
    (count, line) => count + (line.manual?.filter(Boolean).length ?? 0),
    0,
  );

  /** Editable cell, or the printed figure, for one line and quarter. */
  const renderCell = (line: WorksheetLine, index: number) => {
    const typed = line.manual?.[index] === true;
    if (editing && isManualLineKey(line.key)) {
      return (
        <ManualCell
          // A saved figure remounts the box; the draft never outlives the server's answer.
          key={`${line.key}-${index}-${line.values[index]}-${typed}`}
          value={line.values[index]}
          typed={typed}
          label={`${MANUAL_LINE_LABELS[line.key]} Q${index + 1}`}
          disabled={isSaving === true}
          onCommit={(amount) =>
            onManualChange?.(line.key, index + 1, amount)
          }
        />
      );
    }
    return <StaticCell value={line.values[index]} typed={typed} />;
  };

  return (
    <section aria-label="Tax worksheet" className="overflow-hidden rounded-2xl border border-border/50 border-t-[3px] border-t-indigo-500/70 bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">1702Q worksheet</h2>
          {/* W2: a 5× swing in tax due sat in a block below the fold with nothing on the face of the
              return saying which reading produced line 5. It is named here, next to the lines. */}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Lines 1 to 11a are{" "}
            <span className="font-medium text-foreground">year to date</span>, as the 1702Q is a cumulative return, so
            each column carries the same income from line 1 down to line 10; line 12 is the amount that quarter&apos;s
            return pays. Cost of sales read as <span className="font-medium text-foreground">{basisLabel}</span>, so
            line 5 is line 1 plus 1a less lines 2, 3 and 3a on that basis.
          </p>
          {manualMode ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Manual input is on: lines {MANUAL_LINE_KEYS.join(", ")} take typed figures, marked{" "}
              <span className="font-medium text-indigo-600 dark:text-indigo-400">*</span>. Clear a box to return that
              figure to the ledgers; the tax lines stay computed.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {typedCells > 0 ? (
            <Badge variant="outline" className="border-indigo-300 text-[11px] text-indigo-700 dark:text-indigo-300">
              {typedCells} typed
            </Badge>
          ) : null}
          <Badge variant="outline" className="tabular-nums text-[11px]">
            {visible.length} of {total} lines
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 md:min-h-0"
            onClick={() => downloadWorksheet(visible, taxYear)}
            disabled={visible.length === 0}
            title="Download these lines as an Excel workbook"
          >
            <Download className="mr-2 size-4" />
            Export Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 md:min-h-0"
            onClick={() => downloadWorksheetPdf(visible, taxYear)}
            disabled={visible.length === 0}
            title="Download these lines as a PDF working paper"
          >
            <FileText className="mr-2 size-4" />
            Download PDF
          </Button>
        </div>
      </header>

      <div className="hidden overflow-x-auto min-[1300px]:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[64px]">Line</TableHead>
              <TableHead className="min-w-[260px]">Item</TableHead>
              <TableHead className="w-[120px] text-right">Q1</TableHead>
              <TableHead className="w-[120px] text-right">Q2</TableHead>
              <TableHead className="w-[120px] text-right">Q3</TableHead>
              <TableHead className="w-[120px] text-right">Q4</TableHead>
              <TableHead className="w-[140px] text-right">Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((section) => (
              <Fragment key={section}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={7} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {SECTION_LABEL[section]}
                  </TableCell>
                </TableRow>
                {visible
                  .filter((line) => line.section === section)
                  .map((line) => (
                    <TableRow key={line.key} className={cn(line.emphasis && "bg-muted/20 font-medium")}>
                      <TableCell className="tabular-nums text-xs text-muted-foreground">{line.lineNo}</TableCell>
                      <TableCell className="max-w-[380px]">
                        <span className="block truncate" title={line.label}>
                          {line.label}
                          {editing && EDITABLE.has(line.key) ? (
                            <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                              editable
                            </Badge>
                          ) : null}
                        </span>
                        {line.hint ? (
                          <span className="block truncate text-[11px] text-muted-foreground" title={line.hint}>
                            {line.hint}
                          </span>
                        ) : null}
                      </TableCell>
                      {line.values.map((value, index) => (
                        <TableCell key={index} className="text-right tabular-nums">
                          {renderCell(line, index)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">{formatCurrency(line.yearValue)}</TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="min-[1300px]:hidden">
        {sections.map((section) => (
          <div key={section}>
            <p className="border-y border-border/50 bg-muted/40 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {SECTION_LABEL[section]}
            </p>
            <ul className="divide-y divide-border/50">
              {visible
                .filter((line) => line.section === section)
                .map((line) => (
                  <li key={line.key} className={cn("space-y-2 px-4 py-3", line.emphasis && "bg-muted/20")}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm">
                        <span className="tabular-nums text-xs text-muted-foreground">{line.lineNo} </span>
                        {line.label}
                        {editing && EDITABLE.has(line.key) ? (
                          <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                            editable
                          </Badge>
                        ) : null}
                      </p>
                      <p className={cn("shrink-0 tabular-nums text-sm", line.emphasis && "font-medium")}>
                        {formatCurrency(line.yearValue)}
                      </p>
                    </div>
                    <dl className="grid grid-cols-4 gap-2 text-[11px]">
                      {line.values.map((value, index) => (
                        <div key={index}>
                          <dt className="text-muted-foreground">Q{index + 1}</dt>
                          <dd className="tabular-nums">{renderCell(line, index)}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      {hidden > 0 ? (
        <p className="border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
          {hidden} line{hidden === 1 ? "" : "s"} sit at zero for this year and are hidden.
          {editing ? " The five input rows stay visible so they can be typed." : ""}
        </p>
      ) : null}
    </section>
  );
}
