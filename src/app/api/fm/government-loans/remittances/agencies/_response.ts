import { requireGovernmentLoansWorkspace } from "@/modules/financial-management/government-loans/server/access";
import { AgencyError, type AgencyActor } from "@/modules/financial-management/government-loans/server/agencies";

export async function withAgencyAccess(handler: (actor: AgencyActor) => Promise<unknown>, status = 200) {
  const access = await requireGovernmentLoansWorkspace("remittances");
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      response = Response.json(await handler(access), { status });
    } catch (error) {
      response = error instanceof AgencyError
        ? Response.json({ message: error.message, field: error.field }, { status: error.status })
        : Response.json({ message: "The agency configuration service is temporarily unavailable. Please try again." }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
