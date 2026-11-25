import { fileDispute, readDisputes } from "@/modules/financial-management/government-loans/server/posting-disputes";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return withLoanRequestAccess("my-loans", actor => readDisputes(new URL(request.url).searchParams, actor.actorId));
}
export function POST(request: Request) {
  return withLoanRequestAccess("my-loans", actor => fileDispute(request, actor));
}
