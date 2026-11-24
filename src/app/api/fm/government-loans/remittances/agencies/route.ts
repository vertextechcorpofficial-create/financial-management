import { createAgency, listAgencies } from "@/modules/financial-management/government-loans/server/agencies";
import { withAgencyAccess } from "./_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withAgencyAccess(() => listAgencies(new URL(request.url).searchParams));
}

export function POST(request: Request) {
  return withAgencyAccess(async actor => createAgency(await request.json().catch(() => null), actor), 201);
}
