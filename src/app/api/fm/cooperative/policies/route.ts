import { policySaveSchema } from "@/modules/financial-management/cooperative/policies/policy-types";
import { getPolicies, PolicyError, savePolicies } from "@/modules/financial-management/cooperative/server/policies";
import { withPolicies } from "./_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withPolicies(() => getPolicies());
}

export async function POST(request: Request) {
  return withPolicies(async actor => {
    const result = policySaveSchema.safeParse(await request.json().catch(() => null));
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new PolicyError(422, issue.message, issue.path.slice(1).join("."));
    }
    return savePolicies(result.data, actor, request.headers.get("User-Agent"));
  });
}
