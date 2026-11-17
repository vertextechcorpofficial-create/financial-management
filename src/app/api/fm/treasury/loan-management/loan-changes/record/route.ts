import { recordChange } from "@/modules/financial-management/treasury/loan-management/loan-changes/services/changes.service";
import { recordChangeSchema } from "@/modules/financial-management/treasury/loan-management/loan-changes/schemas";
import { currentUserId, ok, readJson } from "../../_lib/http";
import { handleChangesError } from "../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/fm/treasury/loan-management/loan-changes/record — plans, writes and returns one change. */
export async function POST(request: Request) {
  try {
    const body = recordChangeSchema.parse(await readJson(request));
    const actorId = await currentUserId();
    const change = await recordChange(body, actorId);
    return ok(change, 201);
  } catch (error) {
    return handleChangesError(error, "POST record change", "The change could not be recorded.");
  }
}
