import { NextRequest } from "next/server";

import { journalQuerySchema } from "@/modules/financial-management/treasury/loan-management/loan-journal/schemas";
import {
  loadEntries,
  loadSummary,
} from "@/modules/financial-management/treasury/loan-management/loan-journal/services/journal.service";

import { handleRouteError, ok } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const parsed = journalQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return handleRouteError(parsed.error, "GET loan journal", "The journal could not be read.");

    const payload = parsed.data.view === "summary" ? await loadSummary(parsed.data) : await loadEntries(parsed.data);
    return ok(payload);
  } catch (error) {
    return handleRouteError(error, "GET loan journal", "The journal could not be read.");
  }
}
