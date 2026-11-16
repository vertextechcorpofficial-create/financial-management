import { NextResponse } from "next/server";
import { z } from "zod";

import {
  batchReleaseOrDeposit,
  describeCheckError,
} from "@/modules/financial-management/treasury/bank-management-v2/check-clearing-management/services/checks.service";

import { currentUserId } from "../../_lib/actor";

export const dynamic = "force-dynamic";

const DepositBody = z.object({
  entries: z
    .array(
      z.object({
        checkId: z.coerce.number().int().positive(),
        date: z.string().trim().min(10).max(10),
      }),
    )
    .min(1)
    .max(100),
});

/** Deposit several received checks at once; each row carries the date it was sent. */
export async function POST(request: Request) {
  const parsed = DepositBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid deposit request.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const result = await batchReleaseOrDeposit("DEPOSIT", parsed.data.entries, await currentUserId());
    return NextResponse.json({ success: true, data: { deposited: result.checks, failures: result.failures } });
  } catch (error) {
    const failure = describeCheckError(error, "[bank-management-v2] batch deposit failed");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
