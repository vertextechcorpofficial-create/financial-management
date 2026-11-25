import { listRemittanceDeductions, listRemittancePreparation, previewRemittancePreparation, submitRemittancePreparation } from "@/modules/financial-management/government-loans/server/remittance-preparation";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("remittances", () => {
    const params = new URL(request.url).searchParams;
    return params.get("deductions") === "1" ? listRemittanceDeductions(params) : listRemittancePreparation(params);
  });
}

export function POST(request: Request) {
  return withLoanRequestAccess("remittances", async actor => new URL(request.url).searchParams.get("preview") === "1"
    ? previewRemittancePreparation(await request.json().catch(() => null)) : submitRemittancePreparation(request, actor));
}
