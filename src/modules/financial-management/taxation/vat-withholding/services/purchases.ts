import "server-only";

import type { RegistryCompany } from "../types";
import { groupedByDate } from "./companyClient";

/**
 * Purchase VAT and purchase withholding, from the two places this ERP actually keeps them.
 *
 * Men2 leaves `purchase_order.vat_amount` and `withholding_tax_amount` null on its 2025 orders
 * and books the tax on `purchase_order_items.tax_amount`, so reading the header alone reports
 * zero input VAT on a year that paid it — the deck's finding on the VAT tab. The order header
 * stays the source for withholding, because the lines carry no withheld column.
 *
 * The instance exposes no join from a line back to its order date (`purchase_order.id` is not
 * readable with the token this app uses), so a line is attributed to the month it was encoded.
 * That is stated in the notice instead of being passed off as the order date.
 */

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface PurchaseMonth {
  month: number;
  /** VAT-exclusive base. */
  base: number;
  /** VAT booked on the lines. */
  vat: number;
}

export interface PurchaseVatResult {
  months: Map<number, PurchaseMonth>;
  /** Lines that carried a VAT figure. */
  vatLines: number;
  /** Lines that carried none, so VAT on them is missing rather than zero. */
  noVatLines: number;
}

export async function loadPurchaseVat(
  company: RegistryCompany,
  from: string,
  to: string,
): Promise<PurchaseVatResult> {
  const months = new Map<number, PurchaseMonth>();
  const lines = await groupedByDate(
    company.baseUrl,
    company.token,
    company.code,
    "purchase_order_items",
    "created_at",
    { line_subtotal: "sum", tax_amount: "sum" },
    from,
    to,
  );

  let vatLines = 0;
  let noVatLines = 0;
  for (const row of lines) {
    const month = Number(row.date.slice(5, 7));
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;
    const vat = round(row.sums.tax_amount ?? 0);
    const base = round(row.sums.line_subtotal ?? 0);
    const current = months.get(month) ?? { month, base: 0, vat: 0 };
    current.base = round(current.base + base);
    current.vat = round(current.vat + vat);
    months.set(month, current);
    if (vat !== 0) vatLines += 1;
    else noVatLines += 1;
  }

  return { months, vatLines, noVatLines };
}

export interface WithholdingMonth {
  month: number;
  /** Orders dated in the month. */
  orders: number;
  withheld: number;
  /** Orders in the month that recorded no withheld amount. */
  noWithheld: number;
}

/** Purchase withholding as the order header records it: one aggregate per order date. */
export async function loadPurchaseWithholding(
  company: RegistryCompany,
  from: string,
  to: string,
): Promise<Map<number, WithholdingMonth>> {
  const rows = await groupedByDate(
    company.baseUrl,
    company.token,
    company.code,
    "purchase_order",
    "date",
    { withholding_tax_amount: "sum", total_amount: "sum" },
    from,
    to,
  );

  const months = new Map<number, WithholdingMonth>();
  for (const row of rows) {
    const month = Number(row.date.slice(5, 7));
    if (!Number.isInteger(month) || month < 1 || month > 12) continue;
    const withheld = round(row.sums.withholding_tax_amount ?? 0);
    const gross = round(row.sums.total_amount ?? 0);
    const current = months.get(month) ?? { month, orders: 0, withheld: 0, noWithheld: 0 };
    // A grouped row is one order date, not one order, so "orders" counts dated batches: what
    // matters here is whether the month recorded withholding at all, not how many vouchers.
    if (gross !== 0 || withheld !== 0) current.orders += 1;
    current.withheld = round(current.withheld + withheld);
    if (withheld === 0) current.noWithheld += 1;
    months.set(month, current);
  }
  return months;
}
