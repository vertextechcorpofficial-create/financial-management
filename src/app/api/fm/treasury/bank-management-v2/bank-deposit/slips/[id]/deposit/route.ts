import { NextResponse } from "next/server";

import {
  NotFoundError,
  ValidationError,
  markDepositSlipDeposited,
} from "@/modules/financial-management/treasury/bank-management-v2/bank-deposit/services/deposit.service";

export const dynamic = "force-dynamic";

/** Marks a prepared slip as taken by the bank: header Deposited, cash lines Deposited, checks For clearing. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const slipId = Number(id);
  if (!Number.isInteger(slipId) || slipId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid slip id." }, { status: 400 });
  }
  // The bank's own date and validation number, when the desk has them at hand.
  let confirmation: { depositDate?: string; slipNo?: string } = {};
  try {
    const body = (await request.json()) as { depositDate?: unknown; slipNo?: unknown } | null;
    confirmation = {
      depositDate: typeof body?.depositDate === "string" ? body.depositDate : undefined,
      slipNo: typeof body?.slipNo === "string" ? body.slipNo : undefined,
    };
  } catch {
    confirmation = {};
  }

  try {
    const slip = await markDepositSlipDeposited(slipId, confirmation);
    return NextResponse.json({ success: true, data: { slip } });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    console.error("[bank-management-v2] marking slip deposited failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "The slip could not be marked as deposited.",
        reason: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
