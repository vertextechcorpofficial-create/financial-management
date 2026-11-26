import "server-only";

import { ZodError } from "zod";
import { requireGovernmentLoansWorkspace } from "./access";
import { AgencyError } from "./agencies";
import { GovernmentLoansDirectusError } from "./directus";
import { LoanRequestError } from "./request-input";

export async function withLoanRequestAccess(workspace: "dashboard" | "loan-applications" | "loan-approval" | "loans" | "my-loans" | "remittances" | "remittance-approval" | "month-end-close" | "reports",
  handler: (actor: Extract<Awaited<ReturnType<typeof requireGovernmentLoansWorkspace>>, { ok: true }>) => Promise<unknown>, status = 200) {
  const access = await requireGovernmentLoansWorkspace(workspace);
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
      } else if (workspace === "dashboard") {
        const validation = error instanceof ZodError
          ? error.issues.map(issue => ({ code: issue.code, path: issue.path.join("."), message: issue.message }))
          : null;
        console.error("Government Loans Dashboard read failed", error instanceof GovernmentLoansDirectusError
          ? { source: error.source, status: error.status, code: error.code }
          : validation ? { validation } : { error: error instanceof Error ? error.name : "Unknown" });
        response = Response.json(validation
          ? { message: "Government Loans data changed while loading. Refresh the dashboard." }
          : { message: "A Government Loans data source could not be loaded. Try again." },
        { status: validation ? 409 : 503 });
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
