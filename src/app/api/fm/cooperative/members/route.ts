import { getMemberRegister, submitMembership } from "@/modules/financial-management/cooperative/server/member-service";
import { withMembers } from "./_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withMembers(async () => Response.json(await getMemberRegister(new URL(request.url).searchParams)));
}

export async function POST(request: Request) {
  return withMembers(async actor => {
    const payload = await request.json().catch(() => null);
    const result = await submitMembership(payload, actor);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  });
}
