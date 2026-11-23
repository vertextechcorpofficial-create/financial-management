// src/modules/financial-management/printables-management/product-printables/components/PrintablesMatrixTable.tsx
"use client";

import React from "react";
import type { MatrixRow, PriceType, Unit } from "../types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";
import {
    getVisibleMatrixPriceTypes,
    getVisibleMatrixUnits,
    matrixPriceTypeColor,
    priceTypeTierKey,
} from "../utils/matrixDisplay";
import { formatPriceNumber } from "../../shared/pricePrecision";

type Props = {
    rows: MatrixRow[];
    loading: boolean;
    error?: string | null;
    onRetry?: () => void;
    priceTypes: PriceType[];
    units: Unit[];
    usedUnitIds: Set<number>;
    selectedPriceTypeIds?: string[];
};

export default function PrintablesMatrixTable({ 
    rows, 
    loading, 
    error,
    onRetry,
    priceTypes, 
    units, 
    usedUnitIds,
    selectedPriceTypeIds = []
}: Props) {
    if (loading) {
        return (
            <div className="overflow-hidden rounded-xl border border-border">
                <div className="min-w-[900px]">
                    <div className="grid grid-cols-[100px_100px_180px_repeat(6,minmax(70px,1fr))] gap-px border-b bg-border">
                        {Array.from({ length: 9 }).map((_, index) => (
                            <div key={`header-${index}`} className="bg-muted p-3">
                                <Skeleton className="h-4 w-full" />
                            </div>
                        ))}
                    </div>
                    {Array.from({ length: 8 }).map((_, rowIndex) => (
                        <div
                            key={`row-${rowIndex}`}
                            className="grid grid-cols-[100px_100px_180px_repeat(6,minmax(70px,1fr))] gap-px border-b bg-border last:border-b-0"
                        >
                            {Array.from({ length: 9 }).map((_, columnIndex) => (
                                <div key={`cell-${columnIndex}`} className="bg-background p-3">
                                    <Skeleton
                                        className={cn(
                                            "h-4",
                                            columnIndex === 2 ? "w-4/5" : columnIndex < 3 ? "w-3/5" : "ml-auto w-2/3",
                                        )}
                                    />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <div>
                    <p className="text-sm font-medium">Unable to load products</p>
                    <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                </div>
                {onRetry ? (
                    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </Button>
                ) : null}
            </div>
        );
    }

    if (rows.length === 0) return <div className="p-8 text-center text-muted-foreground">No products found.</div>;

    const visibleUnits = getVisibleMatrixUnits(units, usedUnitIds);
    const activePriceTypes = getVisibleMatrixPriceTypes(priceTypes, selectedPriceTypeIds);
    const totalMatrixCols = activePriceTypes.length * (visibleUnits.length || 1);

    return (
        <div className="rounded-xl border border-border overflow-hidden overflow-x-auto shadow-md">
            <Table className="border-collapse border-hidden">
                <TableHeader className="bg-muted">
                    {/* Level 1: Global Header */}
                    <TableRow className="border-b border-border">
                        <TableHead colSpan={3} className="border-r border-border sticky left-0 top-0 z-40 bg-muted h-8"></TableHead>
                        <TableHead 
                            colSpan={totalMatrixCols || 1} 
                            className="text-center font-bold text-[11px] uppercase tracking-[0.2em] text-muted-foreground py-1 border-r border-border sticky top-0 z-30 bg-muted"
                        >
                            Price Type
                        </TableHead>
                    </TableRow>
                    
                    {/* Level 2: Price Tiers (Selected) */}
                    <TableRow className="border-b border-border">
                        <TableHead className="font-bold sticky left-0 top-8 z-40 bg-muted border-r border-border min-w-[100px] text-[10px] uppercase text-foreground h-10">Brand</TableHead>
                        <TableHead className="font-bold sticky left-[100px] top-8 z-40 bg-muted border-r border-border min-w-[100px] text-[10px] uppercase text-foreground h-10">Category</TableHead>
                        <TableHead className="font-bold sticky left-[200px] top-8 z-40 bg-muted border-r border-border min-w-[180px] text-[10px] uppercase text-foreground h-10">Product Name</TableHead>
                        {activePriceTypes.map((pt) => {
                            const absoluteIndex = priceTypes.indexOf(pt);
                            return (
                                <TableHead 
                                    key={pt.price_type_id} 
                                    colSpan={visibleUnits.length || 1} 
                                    className={cn(
                                        "text-center font-black text-xs border-r border-border py-1.5 sticky top-8 z-30",
                                        matrixPriceTypeColor(absoluteIndex).className
                                    )}
                                >
                                    {pt.price_type_name}
                                </TableHead>
                            );
                        })}
                    </TableRow>

                    {/* Level 3: Units (BOX, PCS, etc.) */}
                    <TableRow className="border-b border-border">
                        <TableHead className="sticky left-0 top-[72px] z-40 bg-muted border-r border-border h-8"></TableHead>
                        <TableHead className="sticky left-[100px] top-[72px] z-40 bg-muted border-r border-border h-8"></TableHead>
                        <TableHead className="sticky left-[200px] top-[72px] z-40 bg-muted border-r border-border h-8"></TableHead>
                        {activePriceTypes.map((pt) => (
                            <React.Fragment key={pt.price_type_id}>
                                {visibleUnits.length > 0 ? visibleUnits.map((u) => (
                                    <TableHead 
                                        key={u.unit_id} 
                                        className="text-center font-bold text-[9px] uppercase text-muted-foreground py-1 border-r border-border min-w-[70px] sticky top-[72px] z-30 bg-muted"
                                    >
                                        {u.unit_shortcut}
                                    </TableHead>
                                )) : (
                                    <TableHead className="min-w-[70px] border-r border-border">—</TableHead>
                                )}
                            </React.Fragment>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row) => (
                        <TableRow key={row.group_id} className="hover:bg-accent transition-colors border-b border-border">
                            <TableCell className="sticky left-0 bg-card z-10 border-r border-border py-2 text-[10px] text-muted-foreground">
                                {row.brand_name}
                            </TableCell>
                            <TableCell className="sticky left-[100px] bg-card z-10 border-r border-border py-2 text-[10px] text-muted-foreground">
                                {row.category_name}
                            </TableCell>
                            <TableCell className="font-semibold sticky left-[200px] bg-card z-10 border-r border-border py-2 text-[11px] text-foreground">
                                {row.display.product_name}
                            </TableCell>
                            {activePriceTypes.map((pt) => {
                                const ptSuffix = priceTypeTierKey(pt);
                                
                                return (
                                    <React.Fragment key={pt.price_type_id}>
                                        {visibleUnits.length > 0 ? visibleUnits.map((u) => {
                                            const variant = row.variantsByUnitId[Number(u.unit_id)];
                                            const price = (variant?.tiers as Record<string, number | null>)?.[ptSuffix];

                                            return (
                                                <TableCell 
                                                    key={u.unit_id} 
                                                    className={cn(
                                                        "text-right border-r border-border px-3 py-2 font-mono text-[10px]",
                                                        price == null ? "bg-muted/50" : ""
                                                    )}
                                                >
                                                    {price != null ? (
                                                        <span className="font-bold text-foreground">
                                                            {formatPriceNumber(price, "\u2014")}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground/40">—</span>
                                                    )}
                                                </TableCell>
                                            );
                                        }) : (
                                            <TableCell className="border-r border-border bg-muted/50">—</TableCell>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
