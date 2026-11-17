import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  CarryoverValidationError,
  recordCarryoverLot,
  updateCarryoverUsed,
} from "@/modules/financial-management/taxation/entity-worksheet/services/carryovers.service";
import { currentActor } from "@/modules/financial-management/taxation/entity-worksheet/services/actor";
import { clearSnapshotCache } from "@/modules/financial-management/taxation/entity-worksheet/services/worksheet.service";
import { clearGroupCache } from "@/modules/financial-management/taxation/group-overview/services/groupOverview.service";
import { DirectusError } from "@/modules/financial-management/taxation/entity-worksheet/services/directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  taxYear: z.coerce.number().int().min(2000).max(2100),
  kind: z.enum(["NOLCO", "EXCESS_MCIT"]),
  originYear: z.coerce.number().int().min(1990).max(2100),
  amount: z.coerce.number().positive().max(1_000_000_000_000),
  amountUsed: z.coerce.number().min(0).max(1_000_000_000_000).default(0),
  expiresAfterYear: z.coerce.number().int().min(1).max(10).nullable().default(null),
});

const UsedSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  taxYear: z.coerce.number().int().min(2000).max(2100),
  id: z.coerce.number().int().positive(),
  amountUsed: z.coerce.number().min(0).max(1_000_000_000_000),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Check the carryover fields.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const lot = await recordCarryoverLot(parsed.data, await currentActor());
    // Lines 8 and 12 read the lots, so a new one has to invalidate both pages' caches.
    clearSnapshotCache(parsed.data.companyId, parsed.data.taxYear);
    clearGroupCache(parsed.data.taxYear);
    return NextResponse.json({ success: true, data: lot }, { status: 201 });
  } catch (error) {
    return fail(error, "The carryover lot could not be recorded.");
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = UsedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Check the used amount.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const lot = await updateCarryoverUsed(parsed.data.id, parsed.data.amountUsed, await currentActor());
    clearSnapshotCache(parsed.data.companyId, parsed.data.taxYear);
    clearGroupCache(parsed.data.taxYear);
    return NextResponse.json({ success: true, data: lot });
  } catch (error) {
    return fail(error, "The carryover lot could not be updated.");
  }
}

function fail(error: unknown, fallback: string) {
  if (error instanceof CarryoverValidationError) {
    return NextResponse.json(
      { success: false, error: error.message, fieldErrors: { [error.field]: [error.message] } },
      { status: 400 },
    );
  }
  if (error instanceof DirectusError) {
    console.error("[taxation/entity-worksheet carryovers]", error.status, error.message, error.body);
    if (error.status === 403 || error.status === 404) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The carryover table is not reachable. Run the taxation DDL, then check the API token can write to tax_carryover_lot.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: false, error: describeDirectusError(error.body) ?? fallback }, { status: 502 });
  }
  console.error("[taxation/entity-worksheet carryovers]", error);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

/** Directus answers with `{ errors: [{ message }] }`; show that instead of a shrug. */
function describeDirectusError(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: string }> };
    const first = parsed.errors?.find((entry) => entry.message)?.message;
    return first ? `Directus: ${first}` : null;
  } catch {
    return null;
  }
}
