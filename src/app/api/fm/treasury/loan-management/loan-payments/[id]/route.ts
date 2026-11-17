import { NextRequest } from "next/server";

import { getPayment, reversePayment } from "@/modules/financial-management/treasury/loan-management/loan-payments/services/payments.service";

import { currentUserId, fail, handleRouteError, ok, toId } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const paymentId = toId(id);
    if (!paymentId) return fail("That payment does not exist.", 404);

    return ok(await getPayment(paymentId));
  } catch (error) {
    return handleRouteError(error, "GET payment", "That payment could not be read.");
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const paymentId = toId(id);
    if (!paymentId) return fail("That payment does not exist.", 404);

    const actorId = await currentUserId();
    const reversed = await reversePayment(paymentId, actorId);
    return ok(reversed);
  } catch (error) {
    return handleRouteError(error, "POST reverse payment", "The payment could not be reversed.");
  }
}
