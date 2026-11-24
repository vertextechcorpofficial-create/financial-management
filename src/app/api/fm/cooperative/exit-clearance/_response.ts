import { requireCooperativeWorkspace } from "@/modules/financial-management/cooperative/server/access";
import { ClearanceError } from "@/modules/financial-management/cooperative/server/clearance-store";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { SavingsCommandError } from "@/modules/financial-management/cooperative/server/savings-commands";

type Actor = Extract<Awaited<ReturnType<typeof requireCooperativeWorkspace>>, { ok: true }>;

export async function withClearance(run: (actor: Actor) => Promise<unknown>, workspace: "exit-clearance" | "transactions" = "exit-clearance") {
  const access = await requireCooperativeWorkspace(workspace);
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      response = Response.json(await run(access));
    } catch (error) {
      response = error instanceof ClearanceError || error instanceof LoanError || error instanceof SavingsCommandError
        ? Response.json({
          message: error.message, code: error.code,
          fieldErrors: error instanceof SavingsCommandError ? undefined : error.fieldErrors,
          preview: error instanceof ClearanceError ? error.preview : undefined,
        }, { status: error.status })
        : Response.json({ message: "Exit clearance is temporarily unavailable. Try again." }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
