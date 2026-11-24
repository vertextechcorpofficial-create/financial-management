import { getReportMemberChoices } from "@/modules/financial-management/cooperative/server/member-reports";
import { withMembers } from "../../members/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withMembers(async () => Response.json(await getReportMemberChoices(new URL(request.url).searchParams)), "reports");
}
