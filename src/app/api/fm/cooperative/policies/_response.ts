import { requireCooperativeWorkspace } from "@/modules/financial-management/cooperative/server/access";
import { PolicyError } from "@/modules/financial-management/cooperative/server/policies";

type Access = Extract<Awaited<ReturnType<typeof requireCooperativeWorkspace>>, { ok: true }>;

export async function withPolicies(handler: (actor: Access) => Promise<unknown>) {
  const access = await requireCooperativeWorkspace("policies");
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      response = Response.json(await handler(access));
    } catch (error) {
      response = error instanceof PolicyError
        ? Response.json({ message: error.message, field: error.field, code: error.code }, { status: error.status })
        : Response.json({ message: "Policies are temporarily unavailable. Please try again." }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
