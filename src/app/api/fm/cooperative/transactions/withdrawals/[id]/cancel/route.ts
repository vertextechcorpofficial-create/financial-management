import { cancelWithdrawal } from "@/modules/financial-management/cooperative/server/withdrawals";
import { withLoans } from "../../../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoans(async actor => cancelWithdrawal(Number((await params).id), await request.json().catch(() => null), actor), "transactions");
}
