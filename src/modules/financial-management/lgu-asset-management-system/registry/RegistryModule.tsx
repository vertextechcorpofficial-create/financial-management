"use client";

import * as React from "react";
import { Layers, Plus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BulkAssetInput, LguAsset, LguAssetInput } from "../types";
import { RECORD_STATUS_LABELS } from "../types";
import { AssetFormDialog } from "./components/AssetFormDialog";
import { BulkAssetDialog } from "./components/BulkAssetDialog";
import { RegistryTable } from "./components/RegistryTable";
import { SearchableSelect } from "./components/SearchableSelect";
import { useAssetRegistry } from "./hooks/useAssetRegistry";

const STATUS_OPTIONS = (Object.keys(RECORD_STATUS_LABELS) as (keyof typeof RECORD_STATUS_LABELS)[]).map((k) => ({
  label: RECORD_STATUS_LABELS[k],
  value: k,
}));

export default function RegistryModule() {
  const { query, patchQuery, data, loading, error, busy, refresh, create, createBulk, update } = useAssetRegistry();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LguAsset | null>(null);

  const classOptions = React.useMemo(
    () => data.lookups.classes.map((c) => ({ label: c.name, value: String(c.id) })),
    [data.lookups.classes]
  );
  const officeOptions = React.useMemo(
    () => data.lookups.offices.map((o) => ({ label: o.name, value: String(o.id) })),
    [data.lookups.offices]
  );

  const totalPages = Math.max(1, Math.ceil(data.total / (query.pageSize ?? 10)));

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(asset: LguAsset) {
    setEditing(asset);
    setDialogOpen(true);
  }

  async function handleSubmit(input: LguAssetInput) {
    if (editing) {
      await update(editing.id, input);
    } else {
      await create(input);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Property Register</h1>
          <p className="text-sm text-muted-foreground">
            LGU property, plant and equipment. Classification follows the 15,000 peso and one year rule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{data.total} on record</Badge>
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Layers className="mr-2 h-4 w-4" />
            Bulk register
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Register asset
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query.q ?? ""}
            onChange={(e) => patchQuery({ q: e.target.value, page: 1 })}
            placeholder="Search property number, description, officer..."
            className="pl-9"
          />
        </div>
        <div className="w-56">
          <SearchableSelect
            options={classOptions}
            value={query.classId ? String(query.classId) : ""}
            onChange={(v) => patchQuery({ classId: v ? Number(v) : null, page: 1 })}
            placeholder="All classes"
          />
        </div>
        <div className="w-56">
          <SearchableSelect
            options={officeOptions}
            value={query.officeId ? String(query.officeId) : ""}
            onChange={(v) => patchQuery({ officeId: v ? Number(v) : null, page: 1 })}
            placeholder="All offices"
          />
        </div>
        <div className="w-44">
          <SearchableSelect
            options={STATUS_OPTIONS}
            value={query.recordStatus ?? "active"}
            onChange={(v) => patchQuery({ recordStatus: v as typeof query.recordStatus, page: 1 })}
            placeholder="Status"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border">
        <RegistryTable
          assets={data.assets}
          lookups={data.lookups}
          loading={loading}
          onEdit={openEdit}
          onRetire={() => undefined}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {data.page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={(query.page ?? 1) <= 1}
            onClick={() => patchQuery({ page: Math.max(1, (query.page ?? 1) - 1) })}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(query.page ?? 1) >= totalPages}
            onClick={() => patchQuery({ page: (query.page ?? 1) + 1 })}
          >
            Next
          </Button>
        </div>
      </div>

      <BulkAssetDialog
        open={bulkOpen}
        lookups={data.lookups}
        busy={busy}
        onClose={() => setBulkOpen(false)}
        onSubmit={async (input: BulkAssetInput) => {
          await createBulk(input);
        }}
      />

      <AssetFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lookups={data.lookups}
        initial={editing}
        busy={busy}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
