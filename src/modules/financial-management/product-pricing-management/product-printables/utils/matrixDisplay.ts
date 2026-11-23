import type { PriceType, Unit } from "../types";

export const MATRIX_PRICE_TYPE_COLORS = [
    {
        className: "bg-muted text-foreground border-border",
        fill: "FFF3F4F6",
        font: "FF374151",
        border: "FFD1D5DB",
    },
    {
        className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25",
        fill: "FFEAF4FF",
        font: "FF1E4D8C",
        border: "FFB8D1F3",
    },
    {
        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
        fill: "FFF0FFF4",
        font: "FF1D5C2E",
        border: "FFC6F6D5",
    },
    {
        className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
        fill: "FFFFF9E6",
        font: "FF8C6D1E",
        border: "FFFCEFB4",
    },
    {
        className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25",
        fill: "FFFFF5F5",
        font: "FF8C1E1E",
        border: "FFFED7D7",
    },
    {
        className: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/25",
        fill: "FFF7F0FF",
        font: "FF4D1E8C",
        border: "FFE9D8FD",
    },
] as const;

export function matrixPriceTypeColor(index: number) {
    const resolvedIndex = index >= 0 ? index : 0;
    return MATRIX_PRICE_TYPE_COLORS[resolvedIndex % MATRIX_PRICE_TYPE_COLORS.length];
}

export function getVisibleMatrixPriceTypes(
    priceTypes: PriceType[],
    selectedPriceTypeIds: string[] = [],
): PriceType[] {
    if (selectedPriceTypeIds.length === 0) {
        return priceTypes.filter((priceType) => priceType.sort != null);
    }

    const selectedIds = new Set(selectedPriceTypeIds);
    return priceTypes.filter((priceType) => selectedIds.has(String(priceType.price_type_id)));
}

export function getVisibleMatrixUnits(units: Unit[], usedUnitIds: Set<number>): Unit[] {
    return units.filter((unit) => usedUnitIds.has(Number(unit.unit_id)));
}

export function priceTypeTierKey(priceType: Pick<PriceType, "price_type_id">): string {
    return priceType.price_type_id === -1 ? "LIST" : String(priceType.price_type_id);
}
