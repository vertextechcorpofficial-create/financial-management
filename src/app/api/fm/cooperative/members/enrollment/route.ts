import { readEnrollmentCheck } from "@/modules/financial-management/cooperative/server/member-service";
import { withMembers } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withMembers(async () => Response.json(await readEnrollmentCheck(new URL(request.url).searchParams)));
}
