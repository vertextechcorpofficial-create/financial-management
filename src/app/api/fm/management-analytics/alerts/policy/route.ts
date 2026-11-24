import { z } from "zod";

import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { POLICY_FIELDS } from "@/modules/financial-management/management-analytics/analytics-alerts/constants";
import {
  loadPolicy,
  saveVariancePolicy,
} from "@/modules/financial-management/management-analytics/analytics-alerts/services/alerts.service";
import type { Policy } from "@/modules/financial-management/management-analytics/analytics-alerts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Built from POLICY_FIELDS so a bound shown on the card is the bound enforced here. */
const policySchema = z.object(
  Object.fromEntries(
    POLICY_FIELDS.map((field) => [
      field.key,
      field.kind === "switch"
        ? z.boolean()
        : z
            .number()
            .min(field.min, `${field.label} is at least ${field.min}.`)
            .max(field.max, `${field.label} is at most ${field.max}.`)
            .refine(
              (value) => (field.step ? Number.isInteger(value / field.step) : Number.isInteger(value)),
              `${field.label} moves in steps of ${field.step ?? 1}.`,
            ),
    ]),
  ),
);

export async function GET() {
  try {
    return ok({ policy: await loadPolicy() });
  } catch (error) {
    return handleRouteError(error, "reading the variance policy", "The variance policy could not be read.");
  }
}

export async function PUT(request: Request) {
  try {
    const body = policySchema.parse(await request.json()) as Record<string, number | boolean>;
    const policy: Policy = {
      seasonalTargets: Boolean(body.seasonalTargets),
      sustainedRule: Boolean(body.sustainedRule),
      confirmPeriods: Number(body.confirmPeriods),
      spikeMultiple: Number(body.spikeMultiple),
      memoDeadlineDays: Number(body.memoDeadlineDays),
      toleranceReadings: Number(body.toleranceReadings),
    };
    const result = await saveVariancePolicy(policy, await currentUserId());
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "saving the variance policy", "The variance policy could not be saved.");
  }
}
