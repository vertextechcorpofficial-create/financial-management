import { listActiveCooperativeMembers } from "@/modules/financial-management/cooperative/server/loan-enrollment";
import { getWithdrawalFilingReview, fileWithdrawal, listStaffWithdrawalRequests } from "@/modules/financial-management/cooperative/server/withdrawals";
import { withLoans } from "../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLoans(() => {
    const params = new URL(request.url).searchParams;
    if (params.get("select") === "members") return listActiveCooperativeMembers(params);
    if (params.has("memberId")) return getWithdrawalFilingReview(Number(params.get("memberId")));
    return listStaffWithdrawalRequests(params);
  }, "transactions");
}

export async function POST(request: Request) {
  return withLoans(async actor => fileWithdrawal(await request.json().catch(() => null), actor), "transactions");
}
