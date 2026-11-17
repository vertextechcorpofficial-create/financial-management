import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { updateOpeningCarryovers } from "@/modules/financial-management/taxation/entity-worksheet/services/carryovers.service";
import { currentActor } from "@/modules/financial-management/taxation/entity-worksheet/services/actor";
import { clearSnapshotCache } from "@/modules/financial-management/taxation/entity-worksheet/services/worksheet.service";
import { clearGroupCache } from "@/modules/financial-management/taxation/group-overview/services/groupOverview.service";
import { DirectusError } from "@/modules/financial-management/taxation/entity-worksheet/services/directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  companyId: z.coerce.number().int().positive(),
  taxYear: z.coerce.number().int().min(2000).max(2100),
});

/**
 * P71: accept last year's closing balances as this year's openings. Refused while the
 * company-year is locked, because a locked period must not change under the desk.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "A company and a tax year are required." },
      { status: 400 },
    );
  }

  try {
    const result = await updateOpeningCarryovers(parsed.data.companyId, parsed.data.taxYear, await currentActor());
    if (result.reason) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 409 });
    }
    clearSnapshotCache(parsed.data.companyId, parsed.data.taxYear);
    clearGroupCache(parsed.data.taxYear);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof DirectusError) {
      console.error("[taxation/entity-worksheet carryovers/opening]", error.status, error.message, error.body);
      return NextResponse.json(
        { success: false, error: "The carryover openings could not be updated." },
        { status: 502 },
      );
    }
    console.error("[taxation/entity-worksheet carryovers/opening]", error);
    return NextResponse.json({ success: false, error: "The carryover openings could not be updated." }, { status: 500 });
  }
}
