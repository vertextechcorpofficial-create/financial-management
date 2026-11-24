import { requireCooperativeWorkspace } from "@/modules/financial-management/cooperative/server/access";
import { MemberError } from "@/modules/financial-management/cooperative/server/member-errors";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { SavingsCommandError } from "@/modules/financial-management/cooperative/server/savings-commands";

type Access = Extract<Awaited<ReturnType<typeof requireCooperativeWorkspace>>, { ok: true }>;

export async function withDividends(run: (actor: Access) => Promise<unknown>) {
  const access = await requireCooperativeWorkspace("year-end-dividends");
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      response = Response.json(await run(access));
    } catch (error) {
      response = error instanceof MemberError
        ? Response.json({ message: error.message, code: error.code,
          fieldErrors: error.field ? { [error.field]: error.message } : undefined, details: error.details }, { status: error.status })
        : error instanceof LoanError || error instanceof SavingsCommandError
          ? Response.json({ message: error.message, code: error.code }, { status: error.status })
          : Response.json({ message: "Year-end dividend data could not be loaded. Try again." }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
