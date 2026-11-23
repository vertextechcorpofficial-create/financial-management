import type { PaymentInput, PaymentRow, RelationValue } from "./route";
import { relationId } from "./route";

/** Released rows and their server-owned stamps must survive subsequent allocations. */
export function findReleasedPaymentEdit(existing: PaymentRow[], incoming: PaymentInput[]): string | null {
    for (const row of existing.filter(line => Boolean(line.released_date))) {
        const matches = incoming.filter(line => Number(line.id) === Number(row.id));
        const line = matches[0];
        if (matches.length !== 1 || !line
            || Number(line.coaId) !== relationId(row.coa_id, "coa_id")
            || Number(line.bankId) !== relationId(row.bank_id as RelationValue)
            || String(line.checkNo || "") !== String(row.check_no || "")
            || String(line.date || "").split("T")[0] !== String(row.date || "").split("T")[0]
            || Math.round(Number(line.amount) * 100) !== Math.round(Number(row.amount) * 100)
            || String(line.remarks || "") !== String(row.remarks || "")) {
            return "Released payment lines cannot be changed or removed. Add a new payment for the remaining balance.";
        }
    }
    return null;
}
