import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { raiseChange } from "@/modules/financial-management/management-analytics/analytics-governance/services/governance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  summary?: string;
  kpiId?: number | null;
  changeType?: string | null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const kpiId = body.kpiId === null || body.kpiId === undefined ? null : Number(body.kpiId);
    const result = await raiseChange(
      {
        summary: String(body.summary ?? ""),
        kpiId: Number.isFinite(kpiId) && kpiId !== null ? kpiId : null,
        changeType: body.changeType ?? null,
      },
      await currentUserId(),
    );
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "raising a change", "The change could not be raised.");
  }
}
