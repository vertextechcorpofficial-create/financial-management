import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { currentActor } from "@/modules/financial-management/taxation/entity-worksheet/services/actor";
import { DirectusError } from "@/modules/financial-management/taxation/entity-worksheet/services/directus";
import { saveManualValue } from "@/modules/financial-management/taxation/entity-worksheet/services/manual.service";
import { clearSnapshotCache } from "@/modules/financial-management/taxation/entity-worksheet/services/worksheet.service";
import { clearGroupCache } from "@/modules/financial-management/taxation/group-overview/services/groupOverview.service";
import { MANUAL_LINE_KEYS } from "@/modules/financial-management/taxation/entity-worksheet/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ManualSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  taxYear: z.coerce.number().int().min(2000).max(2100),
  lineKey: z.enum(MANUAL_LINE_KEYS),
  quarter: z.coerce.number().int().min(1).max(4),
  /** null clears the typed figure and returns the line to what the ledgers say. */
  amount: z.coerce.number().min(-1_000_000_000_000).max(1_000_000_000_000).nullable(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = ManualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Check the line, quarter and amount.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const saved = await saveManualValue(parsed.data, await currentActor());
    // The snapshot holds the figures computed before this edit; a stale copy would keep showing them.
    clearSnapshotCache(parsed.data.companyId, parsed.data.taxYear);
    clearGroupCache(parsed.data.taxYear);
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    if (error instanceof DirectusError) {
      console.error("[taxation/entity-worksheet manual POST]", error.status, error.message, error.body);
      if (error.status === 403 || error.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error:
              "The manual figure table is not reachable. Run the taxation DDL for tax_worksheet_manual, then check the API token can write to it.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { success: false, error: describeDirectusError(error.body) ?? "The manual figure could not be saved." },
        { status: 502 },
      );
    }
    console.error("[taxation/entity-worksheet manual POST]", error);
    return NextResponse.json({ success: false, error: "The manual figure could not be saved." }, { status: 500 });
  }
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
