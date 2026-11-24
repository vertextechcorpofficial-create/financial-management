"use client";

import * as React from "react";
import { RefreshCw, Search } from "lucide-react";
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
          <Badge variant="secondary">{assigned} assigned</Badge>
          <Badge variant="outline">{data.total - assigned} unassigned</Badge>
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={params.q ?? ""}
            onChange={(e) => patchParams({ q: e.target.value })}
            placeholder="Search property number, description, officer..."
            className="pl-9"
          />
        </div>
        <div className="w-56">
          <SearchableSelect
            options={officeOptions}
            value={params.officeId ? String(params.officeId) : ""}
            onChange={(v) => patchParams({ officeId: v ? Number(v) : null })}
            placeholder="All offices"
          />
        </div>
        <Button
          variant={params.onlyWithOfficer ? "default" : "outline"}
          size="sm"
          onClick={() => patchParams({ onlyWithOfficer: !params.onlyWithOfficer })}
        >
          Assigned only
        </Button>
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
          onIssue={(r) => start("issue", r)}
          onTransfer={(r) => start("transfer", r)}
          onReturn={(r) => start("return", r)}
          onHistory={(r) => void openHistory(r.asset.id)}
        />
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
