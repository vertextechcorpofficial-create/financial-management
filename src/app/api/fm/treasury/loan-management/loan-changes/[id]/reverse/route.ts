import { reverseChange } from "@/modules/financial-management/treasury/loan-management/loan-changes/services/changes.service";
import { reverseChangeSchema } from "@/modules/financial-management/treasury/loan-management/loan-changes/schemas";
import { currentUserId, ok, readJson, toId } from "../../../_lib/http";
import { handleChangesError } from "../../respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/fm/treasury/loan-management/loan-changes/[id]/reverse — mirror entry and a put-back. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const changeId = toId(id);
    if (!changeId) {
      return handleChangesError(new Error("missing id"), "POST reverse change", "That change does not exist.");
    }
    const body = reverseChangeSchema.parse((await readJson(request)) ?? {});
    const actorId = await currentUserId();
    return ok(await reverseChange(changeId, body.reason ?? null, actorId));
  } catch (error) {
    return handleChangesError(error, "POST reverse change", "The change could not be reversed.");
  }
}
