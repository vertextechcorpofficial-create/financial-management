import { requireCooperativeWorkspace } from "@/modules/financial-management/cooperative/server/access";
import { ApprovalError } from "@/modules/financial-management/cooperative/server/approvals";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { WithdrawalError } from "@/modules/financial-management/cooperative/server/withdrawal-store";
import { SavingsCommandError } from "@/modules/financial-management/cooperative/server/savings-commands";

type Access = Extract<Awaited<ReturnType<typeof requireCooperativeWorkspace>>, { ok: true }>;

export async function withApprovals(handler: (actor: Access) => Promise<unknown>) {
  const access = await requireCooperativeWorkspace("approvals");
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      response = Response.json(await handler(access));
    } catch (error) {
      response = error instanceof ApprovalError || error instanceof LoanError || error instanceof WithdrawalError || error instanceof SavingsCommandError
        ? Response.json({ message: error.message, code: error.code,
          fieldErrors: error instanceof LoanError || error instanceof WithdrawalError ? error.fieldErrors : undefined }, { status: error.status })
        : Response.json({ message: "Approvals are temporarily unavailable. Please try again." }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
