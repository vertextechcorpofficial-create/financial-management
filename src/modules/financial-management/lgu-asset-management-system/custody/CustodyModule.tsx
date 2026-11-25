"use client";

import * as React from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustodyRow, CustodyTransferInput } from "../types";

import { SearchableSelect } from "./components/SearchableSelect";
import { CustodyActionDialog, type CustodyMode } from "./components/CustodyActionDialog";
import { CustodyTable } from "./components/CustodyTable";
import { HistoryDialog } from "./components/HistoryDialog";
import { useAssetCustody } from "./hooks/useAssetCustody";

export default function CustodyModule() {
  const {
    params,
    patchParams,
    data,
    loading,
    error,
    busy,
    history,
    openHistory,
    closeHistory,
    issue,
    transfer,
    giveBack,
    refresh,
  } = useAssetCustody();

  const [mode, setMode] = React.useState<CustodyMode>("issue");
  const [row, setRow] = React.useState<CustodyRow | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const officeOptions = React.useMemo(
    () => data.offices.map((o) => ({ label: o.name, value: String(o.id) })),
    [data.offices]
  );

  function start(nextMode: CustodyMode, nextRow: CustodyRow) {
    setMode(nextMode);
    setRow(nextRow);
    setDialogOpen(true);
  }

  async function submit(input: CustodyTransferInput) {
    if (mode === "issue") await issue(input);
    else await transfer(input);
  }

  async function doReturn(input: { assetId: number; remarks?: string | null }) {
    await giveBack(input);
  }

  const assigned = data.rows.filter((r) => Boolean(r.asset.accountable_officer_name)).length;
  const totalPages = Math.max(1, Math.ceil(data.total / (data.pageSize || 50)));
  const activeFilterCount = [
    params.q,
    params.officeId,
    params.form,
    params.officer,
    params.prefix,
    params.onlyWithOfficer ? "y" : null,
  ].filter(Boolean).length;
  const hasActiveFilters =
    Boolean(params.q) ||
    Boolean(params.officeId) ||
    Boolean(params.form) ||
    Boolean(params.officer) ||
    Boolean(params.prefix) ||
    params.onlyWithOfficer;

  function clearFilters() {
    patchParams({
      q: "",
      officeId: null,
      form: null,
      officer: null,
      prefix: null,
      onlyWithOfficer: false,
      page: 1,
      sort: "property_no",
      dir: "asc",
    });
  }

  const formOptions = [
    { label: "PAR, PPE", value: "par" },
    { label: "ICS, semi-expendable", value: "ics" },
  ];
  const officerOptions = [
    { label: "Unassigned", value: "__none" },
    ...[...data.officers]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ label: name, value: name })),
  ];
  const prefixOptions = data.prefixes.map((p) => ({ label: p, value: p }));

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Custody</h1>
          <p className="text-sm text-muted-foreground">
            Who is answerable for each asset. PPE is issued on a PAR, semi-expendable property on an ICS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{data.total} on record</Badge>
          <Badge variant="outline">{assigned} assigned this page</Badge>
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card/40 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={params.q ?? ""}
                onChange={(e) => patchParams({ q: e.target.value, page: 1 })}
                placeholder="Search property number, description, officer..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {activeFilterCount > 0 ? (
                <span className="text-xs text-muted-foreground">{activeFilterCount} active</span>
              ) : null}
              <Button
                variant={params.onlyWithOfficer ? "default" : "outline"}
                size="sm"
                onClick={() => patchParams({ onlyWithOfficer: !params.onlyWithOfficer, page: 1 })}
              >
                Assigned only
              </Button>
              <Button size="sm" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
                <X className="mr-1 h-3.5 w-3.5" />
                Clear filters
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Property type</span>
              <SearchableSelect
                options={prefixOptions}
                value={params.prefix ?? ""}
                onChange={(v) => patchParams({ prefix: v || null, page: 1 })}
                placeholder="All types"
                allowClear
              />
            </div>
            <div className="grid gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Form</span>
              <SearchableSelect
                options={formOptions}
                value={params.form ?? ""}
                onChange={(v) => patchParams({ form: v || null, page: 1 })}
                placeholder="All forms"
                allowClear
              />
            </div>
            <div className="grid gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Accountable officer</span>
              <SearchableSelect
                options={officerOptions}
                value={params.officer ?? ""}
                onChange={(v) => patchParams({ officer: v || null, page: 1 })}
                placeholder="All officers"
                allowClear
              />
            </div>
            <div className="grid gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Office</span>
              <SearchableSelect
                options={officeOptions}
                value={params.officeId ? String(params.officeId) : ""}
                onChange={(v) => patchParams({ officeId: v ? Number(v) : null, page: 1 })}
                placeholder="All offices"
                allowClear
              />
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border">
        <CustodyTable
          rows={data.rows}
          offices={data.offices}
          loading={loading}
          sort={params.sort ?? "property_no"}
          dir={params.dir ?? "asc"}
          onSort={(key) => {
            const sameKey = (params.sort ?? "property_no") === key;
            patchParams({
              sort: key,
              dir: sameKey && (params.dir ?? "asc") === "asc" ? "desc" : "asc",
              page: 1,
            });
          }}
          onIssue={(r) => start("issue", r)}
          onTransfer={(r) => start("transfer", r)}
          onReturn={(r) => start("return", r)}
          onHistory={(r) => void openHistory(r.asset.id)}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {data.page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => patchParams({ page: data.page - 1 })}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={data.page >= totalPages} onClick={() => patchParams({ page: data.page + 1 })}>
            Next
          </Button>
        </div>
      </div>

      <CustodyActionDialog
        open={dialogOpen}
        mode={mode}
        row={row}
        officers={data.officers}
        offices={data.offices}
        busy={busy}
        onClose={() => setDialogOpen(false)}
        onSubmit={submit}
        onReturn={doReturn}
      />

      <HistoryDialog history={history} offices={data.offices} onClose={closeHistory} />
    </div>
  );
}
