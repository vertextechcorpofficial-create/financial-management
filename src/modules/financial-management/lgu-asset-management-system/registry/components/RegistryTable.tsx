"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssetSortKey, LguAsset, RegistryLookups } from "../../types";
import { RECORD_STATUS_LABELS } from "../../types";

interface RegistryTableProps {
  assets: LguAsset[];
  lookups: RegistryLookups;
  loading: boolean;
  sort: string;
  dir: string;
  onSort: (key: AssetSortKey) => void;
  onEdit: (asset: LguAsset) => void;
  onRetire: (asset: LguAsset) => void;
}

function SortHead({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: AssetSortKey;
  sort: string;
  dir: string;
  onSort: (key: AssetSortKey) => void;
  className?: string;
}) {
  const active = sort === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        title={active ? "Sorted " + (dir === "desc" ? "descending" : "ascending") + ", click to reverse" : "Click to sort by " + label}
      >
        {label}
        {active ? (
          dir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

function peso(value: number | null): string {
  if (value === null) return "-";
  return "PHP " + value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RegistryTable({ assets, lookups, loading, sort, dir, onSort, onEdit, onRetire }: RegistryTableProps) {
  const className = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const c of lookups.classes) map.set(c.id, c.name);
    return map;
  }, [lookups.classes]);

  const offices = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const o of lookups.offices) map.set(o.id, o.name);
    return map;
  }, [lookups.offices]);

  const conditions = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const c of lookups.conditions) map.set(c.id, c.name);
    return map;
  }, [lookups.conditions]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading property register...</div>;
  }

  if (assets.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm font-medium">No assets on record yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add the first asset to start the property register.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHead label="Property No." sortKey="property_no" sort={sort} dir={dir} onSort={onSort} />
          <SortHead label="Description" sortKey="description" sort={sort} dir={dir} onSort={onSort} />
          <TableHead>Class</TableHead>
          <TableHead>Office</TableHead>
          <TableHead>Condition</TableHead>
          <SortHead label="Cost" sortKey="cost" sort={sort} dir={dir} onSort={onSort} className="text-right" />
          <TableHead>Status</TableHead>
          <TableHead className="w-[90px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((asset) => (
          <TableRow key={asset.id}>
            <TableCell className="font-mono text-xs">{asset.property_no}</TableCell>
            <TableCell>
              <div className="font-medium">{asset.description}</div>
              {asset.accountable_officer_name ? (
                <div className="text-xs text-muted-foreground">{asset.accountable_officer_name}</div>
              ) : null}
            </TableCell>
            <TableCell className="text-sm">
              {asset.class_id ? className.get(asset.class_id) ?? "-" : "-"}
              {asset.is_semi_expendable ? (
                <Badge variant="outline" className="ml-2 text-[10px]">SE</Badge>
              ) : null}
            </TableCell>
            <TableCell className="text-sm">
              {asset.office_id ? offices.get(asset.office_id) ?? "-" : "-"}
            </TableCell>
            <TableCell className="text-sm">
              {asset.condition_id ? conditions.get(asset.condition_id) ?? "-" : "-"}
            </TableCell>
            <TableCell className="text-right text-sm">{peso(asset.cost)}</TableCell>
            <TableCell>
              <Badge variant="secondary">{RECORD_STATUS_LABELS[asset.record_status]}</Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(asset)} aria-label="Edit">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onRetire(asset)} aria-label="Retire">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
