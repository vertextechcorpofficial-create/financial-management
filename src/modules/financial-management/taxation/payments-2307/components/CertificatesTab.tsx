"use client";

import { useMemo, useState } from "react";
import { Download, FileDown, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  DIRECTION_LABELS,
  PAGE_SIZE,
  PERIOD_KEYS,
  PERIOD_LABELS,
  WITHHOLDING_LABELS,
  certificateStatusLabel,
  effectiveRatePercent,
  isStatutoryRate,
} from "../constants";
import { phtDisplayDate } from "../pht";
import type { CertificateBody } from "../schemas";
import type { CertificateDirection, CertificateRow, CertificateStatus, ExpectedPeriod, PeriodKey, PrefillResult } from "../types";
import { CertificateDetailDialog } from "./CertificateDetailDialog";
import { CertificateDialog } from "./CertificateDialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { OptionCombobox } from "./OptionCombobox";
import { StatusBadge } from "./StatusBadge";
import { TablePager } from "./TablePager";
import { downloadCertificates } from "../utils/exportWorkbook";

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  SALES_INVOICE: "Sales invoice",
  PURCHASE_ORDER: "Purchase order",
};

const STATUS_KEYS: CertificateStatus[] = ["MATCHED", "SHORT", "OVER", "NOT_ENTERED", "UPCOMING", "UNKNOWN"];

const COLUMN_COUNT = 11;

function periodOrder(periodKey: string): number {
  return PERIOD_KEYS.indexOf(periodKey as (typeof PERIOD_KEYS)[number]);
}

/**
 * A prefilled row is the ledger's own estimate until someone confirms the TIN and the date the
 * certificate arrived. Until then it can be neither claimed as a credit nor reconciled against a
 * payor's copy, so it is counted apart instead of being totalled with the verified certificates.
 */
function isVerified(row: CertificateRow): boolean {
  return (row.counterpartyTin ?? "").trim() !== "" && (row.dateReceived ?? "") !== "";
}

/**
 * Some seeded rows store the rate as a fraction (0.05) and others as a percent (2), so the stored
 * number cannot be printed as-is. The two money figures always agree, so the percent is read from them.
 */
function ratePercent(row: CertificateRow): number {
  return effectiveRatePercent(row.incomeAmount, row.taxWithheld, row.taxRate);
}

interface CertificatesTabProps {
  companyId: number;
  year: number;
  companyOptions: { value: string; label: string; searchText?: string; description?: string }[];
  certificates: CertificateRow[];
  expected: ExpectedPeriod[];
  isLoading: boolean;
  isSaving: boolean;
  onCompanyChange: (companyId: number) => void;
  onCreate: (body: CertificateBody) => Promise<void>;
  onUpdate: (id: number, body: CertificateBody) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onPrefill: () => Promise<PrefillResult>;
}

export function CertificatesTab({
  companyId,
  year,
  companyOptions,
  certificates,
  expected,
  isLoading,
  isSaving,
  onCompanyChange,
  onCreate,
  onUpdate,
  onDelete,
  onPrefill,
}: CertificatesTabProps) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"ALL" | CertificateDirection>("ALL");
  const [period, setPeriod] = useState<"ALL" | PeriodKey>("ALL");
  const [status, setStatus] = useState<"ALL" | CertificateStatus>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CertificateRow | null>(null);
  const [deleting, setDeleting] = useState<CertificateRow | null>(null);
  const [viewing, setViewing] = useState<CertificateRow | null>(null);
  const [confirmPrefill, setConfirmPrefill] = useState(false);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  // The register lists certificates only. A period the ledger expects but no certificate covers is
  // reported once, in the panel under the table, instead of as a grey row repeating the same figure.
  const rows = useMemo<CertificateRow[]>(() => {
    const needle = query.trim().toLowerCase();
    return certificates
      .filter((row) => direction === "ALL" || row.direction === direction)
      .filter((row) => period === "ALL" || row.periodKey === period)
      .filter((row) => status === "ALL" || row.status === status)
      .filter(
        (row) =>
          needle === "" ||
          row.counterpartyName.toLowerCase().includes(needle) ||
          (row.counterpartyTin ?? "").toLowerCase().includes(needle),
      )
      .sort((left, right) => {
        const byPeriod = periodOrder(left.periodKey) - periodOrder(right.periodKey);
        if (byPeriod !== 0) return byPeriod;
        if (left.direction !== right.direction) return left.direction === "RECEIVED" ? -1 : 1;
        return left.counterpartyName.localeCompare(right.counterpartyName);
      });
  }, [certificates, query, direction, period, status]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // A credit and a liability never add up to one figure, and unreceived invoice estimates are
  // counted apart from substantiated certificates (RR 2-98 requires TIN + date received).
  const verifiedRows = rows.filter(isVerified);
  const receivedRows = verifiedRows.filter((row) => row.direction === "RECEIVED");
  const issuedRows = verifiedRows.filter((row) => row.direction === "ISSUED");
  const sumWithheld = (list: CertificateRow[]) => list.reduce((sum, row) => sum + row.taxWithheld, 0);

  const dirty = query.trim() !== "" || direction !== "ALL" || period !== "ALL" || status !== "ALL";

  const estimates = rows.filter((row) => !isVerified(row));

  function clearFilters() {
    setQuery("");
    setDirection("ALL");
    setPeriod("ALL");
    setStatus("ALL");
    setPage(1);
  }

  // A short certificate hides the gap it leaves, so expected and recorded stay side by side — but only
  // for periods that disagree. A matched period is already visible as the register's own amount.
  const expectation = useMemo(() => {
    const recorded = new Map<string, number>();
    for (const certificate of certificates) {
      if (!isVerified(certificate)) continue;
      const key = `${certificate.direction}|${certificate.periodKey}`;
      recorded.set(key, (recorded.get(key) ?? 0) + certificate.taxWithheld);
    }
    return expected
      .map((period) => {
        const key = `${period.direction}|${period.periodKey}`;
        const covered = recorded.get(key) ?? 0;
        return { period, recorded: covered, difference: covered - period.expected };
      })
      .filter((row) => row.period.known && row.period.expected > 0 && Math.abs(row.difference) > 0.005);
  }, [certificates, expected]);

  // A period the ledger could not read is unknown, not matched: an empty expectation list only means
  // "everything agrees" when at least one side of the ledger actually answered.
  const receivedKnown = expected.some((period) => period.direction === "RECEIVED" && period.known);
  const issuedKnown = expected.some((period) => period.direction === "ISSUED" && period.known);
  const anyKnown = receivedKnown || issuedKnown;
  const unreadable = [!receivedKnown ? "received" : null, !issuedKnown ? "issued" : null].filter(
    (side): side is string => side !== null,
  );

  async function prefill() {
    setPrefillError(null);
    setPrefillNote(null);
    try {
      const result = await onPrefill();
      setPrefillNote(`Prefilled ${result.created} certificate(s); skipped ${result.skipped} already recorded.`);
      setPage(1);
    } catch (error) {
      setPrefillError(error instanceof Error ? error.message : "The prefill failed.");
    }
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(certificate: CertificateRow) {
    setEditing(certificate);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
    <section
      aria-label="2307 certificates"
      className="overflow-hidden rounded-2xl border border-border/50 border-t-[3px] border-t-amber-500/70 bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Certificates on file</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One row per certificate. A row missing its TIN or the date received is an estimate from
            the ledger, counted apart. Click a row for the full record.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums text-[11px]">
            {dirty
              ? `${formatNumber(rows.length)} matching`
              : `${formatNumber(rows.length)} ${rows.length === 1 ? "certificate" : "certificates"}`}
          </Badge>
          <Badge
            variant="outline"
            className="tabular-nums text-[11px]"
            title="Tax a customer or payor withheld from you: a credit you can claim."
          >
            {formatNumber(receivedRows.length)} received · {formatCurrency(sumWithheld(receivedRows))}
          </Badge>
          <Badge
            variant="outline"
            className="tabular-nums text-[11px]"
            title="Tax you withheld from suppliers and payees: a liability you remit."
          >
            {formatNumber(issuedRows.length)} issued · {formatCurrency(sumWithheld(issuedRows))}
          </Badge>
          {estimates.length > 0 ? (
            <Badge
              variant="outline"
              className="tabular-nums text-[11px] text-amber-700 dark:text-amber-300"
              title="Prefilled from the ledger but missing a TIN or the date the certificate arrived. Not yet a claimable credit: open each one, confirm the TIN and the date, then save."
            >
              {formatNumber(estimates.length)} {estimates.length === 1 ? "estimate" : "estimates"} · {formatCurrency(sumWithheld(estimates))}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadCertificates(rows)}
            disabled={certificates.length === 0}
            title={certificates.length === 0 ? "No certificates to export" : "Download these rows as a workbook"}
            className="min-h-11 md:min-h-0"
          >
            <Download className="mr-2 size-4" />
            Export Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmPrefill(true)}
            disabled={isSaving || isLoading}
            className="min-h-11 md:min-h-0"
          >
            {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4" />}
            Prefill from invoices
          </Button>
          <Button type="button" size="sm" onClick={openCreate} className="min-h-11 md:min-h-0">
            <Plus className="mr-2 size-4" />
            Add certificate
          </Button>
        </div>
      </header>

      <div
        aria-label="2307 certificate filters"
        hidden={certificates.length === 0}
        className="border-b border-border/50 px-4 py-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="certificate-filter-search" className="text-[11px] font-medium text-muted-foreground">
              Search
            </Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="certificate-filter-search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Payor / supplier or TIN"
                className="pl-8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Direction</Label>
            <OptionCombobox
              options={[
                { value: "ALL", label: "Both directions" },
                { value: "RECEIVED", label: DIRECTION_LABELS.RECEIVED },
                { value: "ISSUED", label: DIRECTION_LABELS.ISSUED },
              ]}
              value={direction}
              onChange={(value) => {
                setDirection(value as "ALL" | CertificateDirection);
                setPage(1);
              }}
              placeholder="Both directions"
              searchPlaceholder="Search directions"
              emptyLabel="No direction matches."
              aria-label="Direction filter"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Period</Label>
            <Select
              value={period}
              onValueChange={(value) => {
                setPeriod(value as "ALL" | PeriodKey);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full" aria-label="Period filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="ALL">All periods</SelectItem>
                {PERIOD_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {PERIOD_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Status</Label>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as "ALL" | CertificateStatus);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full" aria-label="Status filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="ALL">Every status</SelectItem>
                {STATUS_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {certificateStatusLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={!dirty}
              title={dirty ? "Clear every filter" : "No filter is set"}
              className="min-h-11 md:min-h-0"
            >
              <X className="mr-2 size-4" />
              Clear filters
            </Button>
          </div>
        </div>
      </div>

      {prefillError ? (
        <div className="px-4 pb-3">
          <Alert variant="destructive">
            <AlertDescription>{prefillError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {prefillNote ? (
        <div className="px-4 pb-3">
          <Alert>
            <AlertDescription>{prefillNote}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="hidden overflow-x-auto min-[1300px]:block">
        <Table aria-label="2307 certificates" className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Payor / supplier</TableHead>
              <TableHead className="min-w-[120px]">TIN</TableHead>
              <TableHead className="whitespace-nowrap">Period</TableHead>
              <TableHead className="min-w-[120px]">Income type</TableHead>
              <TableHead className="whitespace-nowrap text-right">Income</TableHead>
              <TableHead className="whitespace-nowrap text-right">Rate</TableHead>
              <TableHead className="whitespace-nowrap text-right">Withheld</TableHead>
              <TableHead className="whitespace-nowrap">Received</TableHead>
              <TableHead className="whitespace-nowrap">Source</TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className="w-[88px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`}>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {dirty
                    ? "No certificate matches these filters. Clear the search, or pick another direction, period or status."
                    : `No certificate is recorded for ${year}. Prefill from invoices, or add one by hand.`}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                  <TableRow
                    key={row.id}
                    tabIndex={0}
                    aria-label={`Open certificate from ${row.counterpartyName}`}
                    className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                    onClick={() => setViewing(row)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setViewing(row);
                    }}
                  >
                    <TableCell>
                      <div className="max-w-[240px] truncate font-medium" title={row.counterpartyName}>
                        {row.counterpartyName}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {DIRECTION_LABELS[row.direction]}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span className="block max-w-[130px] truncate" title={row.counterpartyTin ?? ""}>
                        {row.counterpartyTin ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>{PERIOD_LABELS[row.periodKey]}</TableCell>
                    <TableCell>
                      <span className="block max-w-[140px] truncate" title={WITHHOLDING_LABELS[row.incomeType]}>
                        {WITHHOLDING_LABELS[row.incomeType]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.incomeAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {isStatutoryRate(ratePercent(row)) ? (
                        `${formatNumber(ratePercent(row), "en-PH", 2)}%`
                      ) : (
                        <span
                          className="text-amber-600 dark:text-amber-400"
                          title={`${formatNumber(ratePercent(row), "en-PH", 2)}% is not a withholding rate (1%, 2%, 5%, 10% or 15%), so the withheld amount was probably computed on a VAT-inclusive base. Recompute it on the VAT-exclusive income, then set the rate.`}
                        >
                          {formatNumber(ratePercent(row), "en-PH", 2)}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.taxWithheld)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.dateReceived ? (
                        phtDisplayDate(row.dateReceived)
                      ) : (
                        <span
                          className="text-amber-700 dark:text-amber-300"
                          title="No date received yet. The row is an estimate from the ledger until the certificate itself is in hand."
                        >
                          Not yet
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{SOURCE_LABELS[row.source] ?? row.source}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge
                          status={row.status}
                          label={certificateStatusLabel(row.status)}
                        />
                        {isVerified(row) ? null : (
                          <span
                            className="text-[11px] text-amber-700 dark:text-amber-300"
                            title="Missing the TIN or the date received, so this row is not yet a claimable credit."
                          >
                            Estimate
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit certificate from ${row.counterpartyName}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(row);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete certificate from ${row.counterpartyName}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleting(row);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && visible.length > 0 ? (
        <ul className="divide-y min-[1300px]:hidden">
          {visible.map((row) => (
            <li key={row.id} className="space-y-3 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium" title={row.counterpartyName}>
                    {row.counterpartyName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {DIRECTION_LABELS[row.direction]} · {PERIOD_LABELS[row.periodKey]} ·{" "}
                    {WITHHOLDING_LABELS[row.incomeType]}
                    {isVerified(row) ? "" : " · estimate"}
                  </p>
                </div>
                <StatusBadge status={row.status} label={certificateStatusLabel(row.status)} />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Withheld</dt>
                  <dd className="tabular-nums font-medium">{formatCurrency(row.taxWithheld)}</dd>
                </div>
                <div className="text-right">
                  <dt className="text-muted-foreground">Income at {formatNumber(ratePercent(row), "en-PH", 2)}%</dt>
                  <dd className="tabular-nums">{formatCurrency(row.incomeAmount)}</dd>
                </div>
              </dl>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1"
                  onClick={() => setViewing(row)}
                >
                  Details
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1"
                  aria-label={`Edit certificate from ${row.counterpartyName}`}
                  onClick={() => openEdit(row)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 flex-1"
                  aria-label={`Delete certificate from ${row.counterpartyName}`}
                  onClick={() => setDeleting(row)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <TablePager
        page={safePage}
        pageCount={pageCount}
        total={rows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        isLoading={isLoading}
        className="border-t border-border/50 px-4 py-3"
      />
    </section>

    <section
      aria-label="Expected against recorded"
      className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">What the ledger expects</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Periods where the certificates on file do not match the withholding in the ledger.
          </p>
        </div>
        <Badge variant="outline" className="tabular-nums text-[11px]">
          {!anyKnown
            ? "Not compared"
            : expectation.length === 0
              ? "All matched"
              : `${formatNumber(expectation.length)} to reconcile`}
        </Badge>
      </header>

      {expectation.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {!anyKnown
            ? "The withholding ledger could not be read, so no period can be compared. The certificates above are listed but not matched."
            : `Every period the ledger could read carries a certificate.${
                unreadable.length > 0
                  ? ` ${unreadable.join(" and ")} certificates are not compared: that side of the ledger could not be read.`
                  : ""
              }`}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table aria-label="Expected against recorded" className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%] pl-5">Direction</TableHead>
                <TableHead className="w-[12%]">Period</TableHead>
                <TableHead className="w-[16%] text-right">Expected</TableHead>
                <TableHead className="w-[16%] text-right">Recorded</TableHead>
                <TableHead className="w-[16%] text-right">Difference</TableHead>
                <TableHead className="w-[150px] pr-5">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expectation.map(({ period, recorded, difference }) => (
                <TableRow key={`${period.direction}-${period.periodKey}`}>
                  <TableCell className="whitespace-nowrap pl-5 text-xs">{DIRECTION_LABELS[period.direction]}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{PERIOD_LABELS[period.periodKey]}</TableCell>
                  <TableCell className="text-right tabular-nums" title="Withholding the ledger says was withheld">
                    {formatCurrency(period.expected)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(recorded)}</TableCell>
                  <TableCell
                    className={
                      difference < -0.005
                        ? "text-right tabular-nums text-red-600 dark:text-red-400"
                        : difference > 0.005
                          ? "text-right tabular-nums text-amber-600 dark:text-amber-400"
                          : "text-right tabular-nums text-muted-foreground"
                    }
                    title={
                      difference < -0.005
                        ? "Short: less has been recorded than the ledger says was withheld"
                        : difference > 0.005
                          ? "Over: more has been recorded than the ledger says was withheld"
                          : "Matched within ₱1"
                    }
                  >
                    {difference < 0 ? `−${formatCurrency(Math.abs(difference))}` : formatCurrency(difference)}
                  </TableCell>
                  <TableCell className="pr-5">
                    <StatusBadge status={period.status} label={certificateStatusLabel(period.status)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t border-border/50 px-5 py-2 text-[11px] text-muted-foreground">
            Matched within ₱1 · Short: less recorded than the ledger · Over: more recorded · Not received: past due and
            missing · Not due yet: the quarter has not closed.
          </p>
        </div>
      )}
    </section>

      <CertificateDetailDialog
        certificate={viewing}
        onOpenChange={(next) => {
          if (!next) setViewing(null);
        }}
      />

      <CertificateDialog
        open={dialogOpen}
        certificate={editing}
        companyId={companyId}
        companyOptions={companyOptions}
        onCompanyChange={onCompanyChange}
        year={year}
        isSaving={isSaving}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
        onSubmit={async (body) => {
          if (editing) {
            await onUpdate(editing.id, body);
          } else {
            await onCreate(body);
          }
          setPage(1);
        }}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        title="Delete this certificate?"
        description={
          deleting
            ? `${deleting.counterpartyName}, ${PERIOD_LABELS[deleting.periodKey]}: ${formatCurrency(deleting.taxWithheld)} withheld. The change log keeps the deleted values.`
            : ""
        }
        isSaving={isSaving}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        onConfirm={async () => {
          if (deleting) await onDelete(deleting.id);
        }}
      />
      <AlertDialog open={confirmPrefill} onOpenChange={setConfirmPrefill}>
        <AlertDialogContent className="w-[95vw] sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Write certificates from the invoices?</AlertDialogTitle>
            <AlertDialogDescription>
              One certificate is written per customer and quarter that carries withholding, stamped to this company and
              year. Certificates that already exist for the same period are skipped. Nothing is filed with BIR — this is
              a working register.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                setConfirmPrefill(false);
                void prefill();
              }}
            >
              {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Write certificates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


