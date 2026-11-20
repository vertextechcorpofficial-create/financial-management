import { NextRequest } from "next/server";
import { z } from "zod";
import { currentUserId, fail, fieldErrorsFromZod, handleRouteError, ok } from "../_lib/http";
import { loadScenario, saveScenario } from "@/modules/financial-management/management-analytics/analytics-scenario/services/scenario.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const leverSchema = z.object({
  code: z.string().min(1),
  revenuePct: z.number().min(-100).max(200),
  cmPoints: z.number().min(-100).max(100),
  fixedPct: z.number().min(-100).max(200),
  cccDays: z.number().min(-365).max(365),
});

const bodySchema = z.object({
  name: z.string().trim().min(1, "Give the scenario a name.").max(120),
  basePeriod: z.string().regex(/^\d{4}-\d{2}$/, "Pick the month this case starts from."),
  fxPct: z.number().min(-50).max(50),
  note: z.string().trim().max(255).nullable(),
  levers: z.array(leverSchema).min(1, "No company carries a lever."),
});

export async function GET() {
  try {
    return ok(await loadScenario());
  } catch (error) {
    return handleRouteError(error, "scenario GET", "The planner could not be read.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("Some fields need attention.", 400, { fieldErrors: fieldErrorsFromZod(parsed.error) });
    }
    const actorId = await currentUserId();
    return ok(await saveScenario(parsed.data, actorId), 201);
  } catch (error) {
    return handleRouteError(error, "scenario POST", "The scenario could not be saved.");
  }
}
