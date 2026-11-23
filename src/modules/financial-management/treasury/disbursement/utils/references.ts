import type { PayableLine, UnpaidPoDto } from "../types";

export const referenceKey = (reference: string) => reference.trim().replace(/\s*\/\s*/g, "/").toUpperCase();

/** References are unique within this voucher, not across unrelated TRs. */
export function availablePurchaseOrders(records: UnpaidPoDto[], lines: Pick<PayableLine, "referenceNo">[]) {
    const used = new Set(lines.map(line => referenceKey(line.referenceNo)));
    const seen = new Set<string>();
    return records.filter(record => {
        const key = referenceKey(`${record.poNo} / ${record.receiptNo}`);
        if (used.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function toggleRecordSelection(current: string[], key: string, checked?: boolean) {
    const selected = new Set(current);
    if (checked ?? !selected.has(key)) selected.add(key);
    else selected.delete(key);
    return [...selected];
}

/** VAT principal, input VAT and withholding are one import, not duplicate invoices. */
export function findDuplicateVoucherReference(lines: { referenceNo?: unknown; remarks?: unknown }[]): string | null {
    const groups = new Map<string, Set<string>>();
    for (const line of lines) {
        const key = referenceKey(String(line.referenceNo || ""));
        if (!key || !/^(PO[-/]|SCM-|SDM-)/.test(key)) continue;
        const remark = String(line.remarks || "").trim().toUpperCase();
        const role = key.startsWith("PO")
            ? /^(PRINCIPAL|INPUT VAT|EWT DEDUCTION)/.exec(remark)?.[1] || "MANUAL"
            : "MEMO";
        const roles = groups.get(key) || new Set<string>();
        if (roles.has(role) || (roles.size > 0 && (role === "MANUAL" || roles.has("MANUAL")))) return key;
        roles.add(role);
        groups.set(key, roles);
    }
    return null;
}
