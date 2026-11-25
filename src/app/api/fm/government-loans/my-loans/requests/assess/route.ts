import { assessRequest } from "@/modules/financial-management/government-loans/server/request-assessment";
import { addRequestInput, employeeRequestForm, parseInput } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withLoanRequestAccess("my-loans", async actor => {
    const { form } = parseInput(addRequestInput, await request.json().catch(() => null));
    return assessRequest(employeeRequestForm(form, actor.actorId));
  });
}
