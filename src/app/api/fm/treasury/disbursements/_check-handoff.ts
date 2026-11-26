import "server-only";

import { createItem, listItems } from "@/modules/financial-management/treasury/bank-management-v2/check-clearing-management/services/directus";
import { isCalendarDate } from "@/modules/financial-management/treasury/bank-management-v2/check-clearing-management/services/checks.service";
import { phtStamp } from "@/modules/financial-management/treasury/bank-management-v2/check-clearing-management/pht";
import { isPettyCashBankAccount } from "./_payment-method";
import { relationId, type DisbursementRow, type PaymentRow } from "./route";

export class CheckHandoffError extends Error {
    constructor(message: string, readonly status: 400 | 409) {
        super(message);
    }
}

type Cheque = {
    paymentId: number;
    bankId: number;
    checkNo: string;
    amount: number;
    checkDate: string;
    releasedBy: number;
    releasedAt: string;
};

function directusTimestamp(value: unknown) {
    const stamp = String(value ?? "").trim();
    return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(stamp) ? stamp : stamp.replace(" ", "T") + "Z");
}

export function prepareChecks(payments: PaymentRow[], banks: Map<number, { bankName: string; accountNumber: string }>) {
    const cheques: Cheque[] = [];
    const seen = new Set<string>();
    for (const [index, payment] of payments.entries()) {
        const bankId = relationId(payment.bank_id as never) ?? 0;
        const bank = banks.get(bankId);
        const row = `Payment row ${index + 1}`;
        if (!bank) throw new CheckHandoffError(`${row} needs a valid bank or cash account.`, 400);
        if (isPettyCashBankAccount(bank)) continue;

        const paymentId = Number(payment.id);
        const checkNo = String(payment.check_no ?? "").trim();
        const checkDate = String(payment.date ?? "").slice(0, 10);
        const amount = Math.round(Number(payment.amount) * 100) / 100;
        const releasedBy = relationId(payment.released_by, "user_id") ?? 0;
        const instant = directusTimestamp(payment.released_date);
        if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !checkNo || [...checkNo].length > 40 ||
            !isCalendarDate(checkDate) || !Number.isFinite(amount) || amount <= 0) {
            throw new CheckHandoffError(`${row} needs a valid cheque number, date, and positive amount.`, 400);
        }
        if (releasedBy <= 0 || !Number.isFinite(instant)) {
            throw new CheckHandoffError(`${row} is missing its release audit. Release the payment before posting.`, 409);
        }
        const key = `${bankId}:${checkNo.toLowerCase()}`;
        if (seen.has(key)) throw new CheckHandoffError(`${row} repeats cheque ${checkNo} for this bank account.`, 409);
        seen.add(key);
        cheques.push({ paymentId, bankId, checkNo, amount, checkDate, releasedBy, releasedAt: phtStamp(instant) });
    }
    return cheques;
}

async function registered(cheque: Cheque) {
    const sourceRef = `DP-${cheque.paymentId}`;
    const { rows } = await listItems<{
        id: number; source_ref: string | null; bank_account_id: number; check_no: string; check_date: string; amount: string | number;
    }>("bank_checks", {
        fields: ["id", "source_ref", "bank_account_id", "check_no", "check_date", "amount"],
        filter: {
            direction: { _eq: "ISSUED" },
            _or: [
                { source_ref: { _eq: sourceRef } },
                { bank_account_id: { _eq: cheque.bankId }, check_no: { _icontains: cheque.checkNo } },
            ],
        },
        limit: -1,
    });
    const matches = rows.filter(row => row.source_ref === sourceRef || (
        Number(row.bank_account_id) === cheque.bankId && row.check_no.trim().toLowerCase() === cheque.checkNo.toLowerCase()
    ));
    const [existing] = matches;
    if (matches.length > 1 || (existing && (existing.source_ref !== sourceRef ||
        Number(existing.bank_account_id) !== cheque.bankId ||
        existing.check_no.trim().toLowerCase() !== cheque.checkNo.toLowerCase() ||
        existing.check_date !== cheque.checkDate || Number(existing.amount) !== cheque.amount))) {
        throw new CheckHandoffError(`Cheque ${cheque.checkNo} conflicts with an issued cheque in Check & Clearing.`, 409);
    }
    return Boolean(existing);
}

export async function validateCheckHandoff(cheques: Cheque[]) {
    for (const cheque of cheques) await registered(cheque);
}

export async function syncPostedChecks(cheques: Cheque[], voucher: DisbursementRow, payeeName: string | null) {
    if (cheques.length === 0) return;
    const postedBy = relationId(voucher.posted_by, "user_id") ?? null;
    const postedInstant = directusTimestamp(voucher.date_posted);
    if (!Number.isFinite(postedInstant)) throw new CheckHandoffError("The voucher has no valid posting timestamp.", 409);
    const postedAt = phtStamp(postedInstant);
    const payee = payeeName ? [...payeeName].slice(0, 160).join("") : null;

    for (const cheque of cheques) {
        if (await registered(cheque)) continue;
        try {
            // Directus creates the related check and its issue event in one item write.
            await createItem("bank_check_events", {
                check_id: {
                    bank_account_id: cheque.bankId, direction: "ISSUED", check_no: cheque.checkNo,
                    check_date: cheque.checkDate, amount: cheque.amount, status: "PENDING",
                    is_pdc: cheque.checkDate > cheque.releasedAt.slice(0, 10),
                    payee, control_key: "AP_CONTROL", source_type: "MANUAL", source_ref: `DP-${cheque.paymentId}`,
                    released_at: cheque.releasedAt, remarks: `Voucher ${voucher.doc_no}, payment #${cheque.paymentId}`,
                    created_by: postedBy, created_at: postedAt,
                },
                action: "ISSUE", from_status: null, to_status: "PENDING", event_code: "E09",
                journal_entry_id: null, note: `Voucher ${voucher.doc_no} posted. Cheque ${cheque.checkNo} issued${payee ? ` to ${payee}` : ""}.`,
                actor_id: cheque.releasedBy, occurred_at: cheque.releasedAt, created_at: postedAt, created_by: postedBy,
            });
        } catch (error) {
            // A concurrent request or a lost response can leave a complete check behind.
            if (!(await registered(cheque))) throw error;
        }
    }
}
