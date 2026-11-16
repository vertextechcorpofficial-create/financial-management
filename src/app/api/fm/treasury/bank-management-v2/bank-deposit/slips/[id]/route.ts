import { NextResponse } from "next/server";

import { getDepositSlipDetail, NotFoundError } from "@/modules/financial-management/treasury/bank-management-v2/bank-deposit/services/deposit.service";
import { DirectusError, directusReason } from "@/modules/financial-management/treasury/bank-management-v2/bank-deposit/services/directus";

export const dynamic = "force-dynamic";

/** One slip with its itemised contents for the read-only modal. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const slipId = Number(id);
  if (!Number.isInteger(slipId) || slipId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid slip id." }, { status: 400 });
  }

  try {
    return NextResponse.json({ success: true, data: await getDepositSlipDetail(slipId) });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof DirectusError) {
      console.error("[bank-management-v2] deposit slip detail failed", error.status, error.body);
      const reason = directusReason(error.body);
      return NextResponse.json(
        { success: false, error: reason ? `The database rejected this read: ${reason}` : "The deposit slip could not be read." },
        { status: 502 },
      );
    }
    console.error("[bank-management-v2] deposit slip detail failed", error);
    return NextResponse.json({ success: false, error: "The deposit slip could not be read." }, { status: 500 });
  }
}
