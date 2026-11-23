import { remittanceTemplate } from "@/modules/financial-management/cooperative/server/payroll-remittance-file";
import { listRemittanceBatches, listRemittanceRuns, requireRemittanceRollout } from "@/modules/financial-management/cooperative/server/payroll-remittance-store";
import { previewRemittanceFile } from "@/modules/financial-management/cooperative/server/payroll-remittances";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { withLoans } from "../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLoans(async () => {
    const query = new URL(request.url).searchParams;
    const action = query.get("action");
    if (action === "template") {
      requireRemittanceRollout();
      return new Response(remittanceTemplate(), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="Cooperative-Payroll-Remittance.xlsx"',
      } });
    }
    if (action === "runs") return listRemittanceRuns(query);
    return listRemittanceBatches(query);
  }, "transactions");
}

export async function POST(request: Request) {
  return withLoans(async actor => {
    requireRemittanceRollout();
    if (Number(request.headers.get("Content-Length") ?? 0) > 1_100_000) throw new LoanError(422, "Use an Excel file up to 1 MB.");
    const form = await request.formData().catch(() => null);
    if (!form) throw new LoanError(422, "Upload an Excel file with the payroll run and bank receipt details.");
    return previewRemittanceFile(form, actor);
  }, "transactions");
}
