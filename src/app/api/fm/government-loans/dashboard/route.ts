import { ZodError } from "zod";
import { readLoanDashboard } from "@/modules/financial-management/government-loans/server/dashboard";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return withLoanRequestAccess("dashboard", async () => {
    try {
      return await readLoanDashboard();
    } catch (error) {
      // Activation and month-end writes can briefly expose a partial row or move the period sequence.
      const transient = error instanceof ZodError || (error instanceof LoanRequestError && error.status === 409);
      if (!transient) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
      return readLoanDashboard();
    }
  });
}
