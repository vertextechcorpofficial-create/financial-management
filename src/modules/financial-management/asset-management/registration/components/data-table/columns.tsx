"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  Calendar,
  EllipsisVertical,
  Eye,
  History,
  Package,
  RotateCcw,
  SquarePen,
  ArrowRightLeft,
  AlertTriangle,
  Clock,
  Ban,
} from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableColumnHeader } from "./table-column-header";
import { AssetTableData } from "../../types";

const formatPHP = (val?: number | null) => {
  const num = Number(val || 0);
  return `₱${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

interface AssetTableMeta {
  onEdit: (asset: AssetTableData) => void;
  onView: (asset: AssetTableData) => void;
  onTransfer?: (asset: AssetTableData) => void;
  onImpairment?: (asset: AssetTableData) => void;
  onChangeLife?: (asset: AssetTableData) => void;
  onDispose?: (asset: AssetTableData) => void;
  onCustodyHistory?: (asset: AssetTableData) => void;
  onHistory?: (asset: AssetTableData) => void;
  onDeactivate?: (asset: AssetTableData) => void;
}

const ConditionBadge = ({ condition }: { condition: string }) => {
  const c = condition.toLowerCase();
  if (c === "new") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        New
      </span>
    );
  }
  if (c === "good") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
        Good
      </span>
    );
  }
  if (c.includes("maintenance") || c.includes("repair")) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        {condition}
      </span>
    );
  }
  if (c.includes("poor") || c.includes("damaged") || c.includes("bad")) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
        {condition}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {condition}
    </span>
  );
};

export const columns: ColumnDef<AssetTableData>[] = [
  {
    accessorKey: "item_name",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Asset" />,
    cell: ({ row }) => {
      const asset = row.original;
      return (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg border bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden">
            {asset.item_image ? (
              <Image
                src={`/api/fm/asset-management/registration/asset-image-view?id=${asset.item_image}`}
                alt={asset.item_name}
                width={36}
                height={36}
                className="h-full w-full object-cover"
                unoptimized
              />
            ) : (
              <Package className="h-4 w-4 text-muted-foreground/60" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm truncate text-foreground">
              {asset.item_name}
            </span>
            <span className="text-[11px] font-mono text-muted-foreground">
              {asset.asset_tag || "No tag"}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "classification_name",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Classification" />,
    cell: ({ row }) => (
      <span className="text-sm font-medium text-foreground">
        {row.getValue("classification_name")}
      </span>
    ),
  },
  {
    accessorKey: "department_name",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Department" />,
    cell: ({ row }) => (
      <span className="text-sm text-foreground">
        {row.getValue("department_name") || "Unassigned"}
      </span>
    ),
  },
  {
    accessorKey: "assigned_to_name",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Assigned To" />,
    cell: ({ row }) => {
      const name = row.getValue("assigned_to_name") as string;
      const isUnassigned = !name || name.toLowerCase() === "unassigned";
      return (
        <span className={`text-sm ${isUnassigned ? "text-muted-foreground italic" : "text-foreground"}`}>
          {name || "Unassigned"}
        </span>
      );
    },
  },
  {
    accessorKey: "condition",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Condition" />,
    cell: ({ row }) => <ConditionBadge condition={row.getValue("condition") || "Good"} />,
  },
  {
    accessorKey: "quantity",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Qty" />,
    cell: () => <span className="text-sm font-mono font-medium">1</span>,
  },
  {
    accessorKey: "cost_per_item",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Cost per Item" />,
    cell: ({ row }) => (
      <span className="text-sm font-mono font-medium text-foreground">
        {formatPHP(row.getValue("cost_per_item"))}
      </span>
    ),
  },
  {
    accessorKey: "projected_value",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Projected Value" />,
    cell: ({ row }) => (
      <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400">
        {formatPHP(row.getValue("projected_value") ?? row.original.cost_per_item)}
      </span>
    ),
  },
  {
    accessorKey: "date_acquired",
    header: ({ column }) => <DataTableColumnHeader column={column} label="Acquired" />,
    cell: ({ row }) => {
      const date = row.getValue("date_acquired") as string;
      return (
        <div className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">
            {date ? format(new Date(date), "MMM d, yyyy") : "—"}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const meta = table.options.meta as AssetTableMeta;
      const asset = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0" size="icon">
              <EllipsisVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => meta?.onView(asset)}>
              <Eye className="mr-2 h-4 w-4" /> View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onEdit(asset)}>
              <SquarePen className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onTransfer?.(asset)}>
              <ArrowRightLeft className="mr-2 h-4 w-4" /> Transfer
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onImpairment?.(asset)}>
              <AlertTriangle className="mr-2 h-4 w-4" /> Impairment test
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onChangeLife?.(asset)}>
              <Clock className="mr-2 h-4 w-4" /> Change useful life
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onDispose?.(asset)}>
              <RotateCcw className="mr-2 h-4 w-4" /> Dispose
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onCustodyHistory?.(asset)}>
              <History className="mr-2 h-4 w-4" /> Custody history
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => meta?.onHistory?.(asset)}>
              <History className="mr-2 h-4 w-4" /> History
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => meta?.onDeactivate?.(asset)}
              className="text-destructive focus:text-destructive"
            >
              <Ban className="mr-2 h-4 w-4" /> Deactivate
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
