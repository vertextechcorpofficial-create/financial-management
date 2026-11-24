import { NextResponse } from "next/server";

export function disbursementErrorResponse(error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/FORBIDDEN|permission.*field|field.*permission|audit.*not persisted|field.*does not exist|UNKNOWN_FIELD/i.test(detail)) {
        return NextResponse.json({
            code: "DISBURSEMENT_SCHEMA_ACCESS",
            message: "Disbursement storage configuration needs attention.",
            detail: "A required Disbursement field is missing or inaccessible. Ask an administrator to verify the Disbursement and payment audit fields and the server role permissions. The operation was not confirmed; refresh the voucher before retrying.",
        }, { status: 503 });
    }
    return NextResponse.json({ message: "Unable to complete the disbursement operation.", detail }, { status: 502 });
}
