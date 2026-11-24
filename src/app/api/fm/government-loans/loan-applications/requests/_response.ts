import { requireGovernmentLoansWorkspace } from "@/modules/financial-management/government-loans/server/access";
import { AgencyError, type AgencyActor } from "@/modules/financial-management/government-loans/server/agencies";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";

export async function withRequestAccess(handler: (actor: AgencyActor) => Promise<unknown>, status = 200) {
  const access = await requireGovernmentLoansWorkspace("loan-applications");
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      const result = await handler(access);
      response = result instanceof Response ? result : Response.json(result, { status });
    } catch (error) {
      if (error instanceof LoanRequestError) {
        response = Response.json({ message: error.message, fieldErrors: error.fieldErrors }, { status: error.status });
      } else if (error instanceof AgencyError) {
        response = Response.json({ message: error.message }, { status: error.status });
      } else {
        response = Response.json({ message: "The loan request service is temporarily unavailable. Try again." }, { status: 503 });
      }
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
