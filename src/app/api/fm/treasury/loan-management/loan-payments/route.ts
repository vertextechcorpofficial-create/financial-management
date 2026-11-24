import { NextRequest } from "next/server";

import { paymentBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-payments/schemas";
import { recordPayment } from "@/modules/financial-management/treasury/loan-management/loan-payments/services/payments.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (body === undefined) return fail("Send the payment as JSON.", 400);

    const parsed = paymentBodySchema.safeParse(body);
    if (!parsed.success) {
      return handleRouteError(parsed.error, "POST payment", "The payment could not be recorded.");
    }

    const actorId = await currentUserId();
    const payment = await recordPayment(parsed.data, actorId);
    return ok(payment, 201);
  } catch (error) {
    return handleRouteError(error, "POST payment", "The payment could not be recorded.");
  }
}
