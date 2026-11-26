import type { SettlementAllocation, UnpaidInvoice } from "../../types";

export const SETTLEMENT_SCALE = 1000;
export const SETTLEMENT_STEP = "0.001";
export const SETTLEMENT_BALANCE_TOLERANCE = 0;

export const toSettlementUnits = (value: number) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(Math.abs(amount) * SETTLEMENT_SCALE) * Math.sign(amount) : 0;
};

export function parseSettlementAmount(value: string): number | null {
    if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(value)) return null;
    const amount = Number(value);
    return Number.isFinite(amount) && Number.isSafeInteger(toSettlementUnits(amount)) ? amount : null;
}

export const roundCurrency = (value: number) => toSettlementUnits(value) / SETTLEMENT_SCALE;

export const formatSettlementAmount = (value: number) => roundCurrency(value).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
});

export const getSourceAllocationCapacity = (sourceAmount: number, usedElsewhere = 0) =>
    Math.max(0, Math.abs(toSettlementUnits(sourceAmount)) - Math.max(0, toSettlementUnits(usedElsewhere))) / SETTLEMENT_SCALE;

export const getInvoiceAllocationCapacity = (invoiceBalance: number, appliedElsewhere = 0) =>
    Math.max(0, toSettlementUnits(invoiceBalance) - Math.max(0, toSettlementUnits(appliedElsewhere))) / SETTLEMENT_SCALE;

/**
 * Returns the largest currency amount that can be applied to both sides of an
 * allocation. Integer thousandths keep manual input and auto-match arithmetic in sync.
 */
export const capSettlementAllocation = (
    requestedAmount: number,
    sourceAvailable: number,
    invoiceAvailable: number
) => {
    if (![requestedAmount, sourceAvailable, invoiceAvailable].every(Number.isFinite)) return 0;
    const requestedUnits = Math.max(0, toSettlementUnits(requestedAmount));
    const sourceUnits = Math.max(0, toSettlementUnits(sourceAvailable));
    const invoiceUnits = Math.max(0, toSettlementUnits(invoiceAvailable));
    return Math.min(requestedUnits, sourceUnits, invoiceUnits) / SETTLEMENT_SCALE;
};

export const getInvoiceSettlementCap = (invoice: UnpaidInvoice) => roundCurrency(Math.max(
    0,
    Number(invoice.maxSettleableAmount ?? invoice.remainingBalance ?? invoice.originalAmount ?? 0)
));

export const getInvoiceRequiredBalance = (invoice: UnpaidInvoice) => Math.max(
    0,
    getInvoiceSettlementCap(invoice)
);

export const getInvoiceAppliedForSettlement = (
    allocations: SettlementAllocation[],
    invoiceId: number
) => allocations
        .filter(allocation => allocation.invoiceId === invoiceId)
        .reduce((sum, allocation) => sum + toSettlementUnits(allocation.amountApplied), 0) / SETTLEMENT_SCALE;

export const findUnderAllocatedInvoice = (
    invoices: UnpaidInvoice[],
    allocations: SettlementAllocation[]
) => invoices.find(invoice => {
    const required = getInvoiceRequiredBalance(invoice);
    const applied = getInvoiceAppliedForSettlement(allocations, invoice.id);
    return toSettlementUnits(required) > toSettlementUnits(applied);
});

export const findOverAllocatedInvoice = (
    invoices: UnpaidInvoice[],
    allocations: SettlementAllocation[]
) => invoices.find(invoice => {
    const required = getInvoiceRequiredBalance(invoice);
    const applied = getInvoiceAppliedForSettlement(allocations, invoice.id);
    return toSettlementUnits(applied) > toSettlementUnits(required);
});

export const getCartBalanceTotals = (
    invoices: UnpaidInvoice[],
    allocations: SettlementAllocation[]
) => {
    const required = invoices.reduce(
        (sum, invoice) => sum + toSettlementUnits(getInvoiceRequiredBalance(invoice)),
        0
    );
    const applied = invoices.reduce(
        (sum, invoice) => sum + toSettlementUnits(getInvoiceAppliedForSettlement(allocations, invoice.id)),
        0
    );

    return {
        required: required / SETTLEMENT_SCALE,
        applied: applied / SETTLEMENT_SCALE,
        difference: (required - applied) / SETTLEMENT_SCALE,
    };
};
