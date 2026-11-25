import { confirmAgencyBilling, previewAgencyBilling, readBillingImportBody } from "@/modules/financial-management/government-loans/server/agency-billing";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withLoanRequestAccess("remittances", async actor => {
    const body = await readBillingImportBody(request);
    return new URL(request.url).searchParams.get("preview") === "1"
      ? previewAgencyBilling(body) : confirmAgencyBilling(body, request.headers.get("Idempotency-Key"), actor);
  });
}
