import { NextResponse } from "next/server";

import {
  describeCheckError,
  listDraweeBanks,
} from "@/modules/financial-management/treasury/bank-management-v2/check-clearing-management/services/checks.service";

export const dynamic = "force-dynamic";

/** The drawee-bank options for a received check, read from the shared bank registry. */
export async function GET() {
  try {
    const banks = await listDraweeBanks();
    return NextResponse.json({ success: true, data: { banks } });
  } catch (error) {
    const failure = describeCheckError(error, "[bank-management-v2] drawee banks read failed");
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
