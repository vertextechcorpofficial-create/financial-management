import { requireCooperativeWorkspace } from "@/modules/financial-management/cooperative/server/access";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";

type Access = Extract<Awaited<ReturnType<typeof requireCooperativeWorkspace>>, { ok: true }>;

export async function withLoans(handler: (actor: Access) => Promise<unknown>, workspace: "loans" | "transactions" = "loans") {
  const access = await requireCooperativeWorkspace(workspace);
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      const result = await handler(access);
      response = result instanceof Response ? result : Response.json(result);
    } catch (error) {
      response = error instanceof LoanError
        ? Response.json({ message: error.message, code: error.code, fieldErrors: error.fieldErrors }, { status: error.status })
        : Response.json({ message: `${workspace === "loans" ? "Loans" : "Transactions"} are temporarily unavailable. Please try again.` }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
