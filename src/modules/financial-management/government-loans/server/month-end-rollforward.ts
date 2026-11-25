import "server-only";

import { z } from "zod";
import { amountFromCentavos } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { GOVERNMENT_LOAN_REMITTANCE_DECISIONS } from "./directus";
import { readGroups } from "./enrollment-sources";
import { payrollMonth, type PayrollReceipt } from "./payroll-month-store";
import type { RemittanceOverview } from "./remittance-records";
import { positiveId } from "./request-input";

const money = z.string().regex(/^-?\d+\.\d{2}$/);
const amounts = z.object({ opening: money, withheld: money.nullable(), remitted: money, closing: money.nullable(),
  current: money.nullable(), earlier: money.nullable() });
const receiptSource = z.object({ id: z.uuid(), month: payrollMonth, revision: positiveId, amount: money });
const paymentSource = z.object({ id: z.uuid(), decisionId: z.uuid().nullable(), month: payrollMonth, date: z.iso.date(),
  reference: z.string(), amount: money });
export const rollforwardSchema = z.object({
  complete: z.boolean(), totals: amounts,
  rows: z.array(amounts.extend({
    agencyId: positiveId, agency: z.string(), code: z.string(),
    openingSnapshot: z.object({ id: z.uuid(), month: payrollMonth }).nullable(),
    openingReceipts: z.array(receiptSource), openingPayments: z.array(paymentSource),
    receipt: receiptSource.nullable(), payments: z.array(paymentSource),
  })),
});
export type Rollforward = z.output<typeof rollforwardSchema>;
type Opening = { id: string; month: string; rollforward: Rollforward | null };
type Amounts = z.output<typeof amounts>;
type ReceiptSource = z.output<typeof receiptSource>;
type Withholding = { agencyId: number; receiptId: string; amount: bigint };
const decision = z.object({ remittance_id: z.uuid(), id: z.uuid() });

function signed(value: string) {
  return value.startsWith("-") ? -centavos(value.slice(1)) : centavos(value);
}

export async function buildAgencyRollforward(
  month: string,
  endDate: string,
  agencies: { id: number; display_name: string; short_code: string; is_active: boolean }[],
  receipts: ReadonlyMap<string, PayrollReceipt>,
  withholding: Withholding[],
  remittances: RemittanceOverview[],
  previous: Opening | null,
): Promise<Rollforward> {
  const complete = receipts.has(month);
  const previousRows = new Map(previous?.rollforward?.rows.map(row => [row.agencyId, row]));
  const byReceipt = new Map([...receipts.values()].map(receipt => [receipt.id, receipt]));
  const selected = remittances.filter(row => row.state === "APPROVED" && row.payment_date <= endDate);
  const sources = await readGroups<z.output<typeof decision>, string>(GOVERNMENT_LOAN_REMITTANCE_DECISIONS, decision,
    selected.filter(row => !previousRows.has(row.agency_id) || row.payment_date.slice(0, 7) === month).map(row => row.id),
    ids => ({ remittance_id: { _in: ids }, action: { _eq: "APPROVE" } }), "remittance_id");
  const approvals = new Map(sources.map(row => [row.remittance_id, row.id]));
  const relevant = new Set([...withholding.filter(row => row.amount !== 0n).map(row => row.agencyId),
    ...selected.map(row => row.agency_id), ...previousRows.keys()]);
  const rows = agencies.filter(agency => agency.is_active || relevant.has(agency.id)).map(agency => {
    const activity = withholding.filter(row => row.agencyId === agency.id);
    const paid = selected.filter(row => row.agency_id === agency.id);
    const earlierPaid = paid.filter(row => row.payment_date.slice(0, 7) < month);
    const thisPaid = paid.filter(row => row.payment_date.slice(0, 7) === month);
    const earlierWithheld = activity.filter(row => byReceipt.get(row.receiptId)!.month < month);
    const carry = previousRows.get(agency.id);
    const opening = carry?.closing != null ? signed(carry.closing) :
      earlierWithheld.reduce((sum, row) => sum + row.amount, 0n) -
      earlierPaid.reduce((sum, row) => sum + centavos(row.withheld), 0n);
    const withheld = activity.find(row => row.receiptId === receipts.get(month)?.id)?.amount ?? 0n;
    const remitted = thisPaid.reduce((sum, row) => sum + centavos(row.withheld), 0n);
    const closing = opening + withheld - remitted;
    const current = withheld - paid.filter(row => row.payroll_month === month).reduce((sum, row) => sum + centavos(row.withheld), 0n);
    const currentReceipt = receipts.get(month);
    const paymentSource = (row: RemittanceOverview) => ({
      id: row.id, decisionId: approvals.get(row.id) ?? null, month: row.payroll_month, date: row.payment_date,
      reference: row.payment_reference, amount: row.withheld,
    });
    const openingReceipts = carry ? [] : earlierWithheld.filter(row => row.amount !== 0n).map((row): ReceiptSource => {
      const receipt = byReceipt.get(row.receiptId)!;
      return { id: receipt.id, month: receipt.month, revision: receipt.revision, amount: amountFromCentavos(row.amount) };
    });
    return { agencyId: agency.id, agency: agency.display_name, code: agency.short_code,
      opening: amountFromCentavos(opening), withheld: complete ? amountFromCentavos(withheld) : null,
      remitted: amountFromCentavos(remitted), closing: complete ? amountFromCentavos(closing) : null,
      current: complete ? amountFromCentavos(current) : null, earlier: complete ? amountFromCentavos(closing - current) : null,
      openingSnapshot: carry && previous ? { id: previous.id, month: previous.month } : null,
      openingReceipts, openingPayments: carry ? [] : earlierPaid.map(paymentSource),
      receipt: currentReceipt ? { id: currentReceipt.id, month, revision: currentReceipt.revision, amount: amountFromCentavos(withheld) } : null,
      payments: thisPaid.map(paymentSource) };
  });
  const total = (key: keyof Amounts) => amountFromCentavos(rows.reduce((sum, row) => sum + signed(row[key] ?? "0.00"), 0n));
  return { complete, rows, totals: { opening: total("opening"), withheld: complete ? total("withheld") : null,
    remitted: total("remitted"), closing: complete ? total("closing") : null, current: complete ? total("current") : null,
    earlier: complete ? total("earlier") : null } };
}
