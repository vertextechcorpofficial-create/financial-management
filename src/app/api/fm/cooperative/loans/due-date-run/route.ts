import { timingSafeEqual } from "node:crypto";
import { runLoanDueDates } from "@/modules/financial-management/cooperative/server/loan-due-dates";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const configured = process.env.COOPERATIVE_DUE_DATE_SCHEDULER_TOKEN?.trim();
  if (!configured) return Response.json({ message: "The Cooperative due-date job is not configured." }, { status: 503, headers });
  const expected = Buffer.from("Bearer " + configured);
  const received = Buffer.from(request.headers.get("Authorization") ?? "");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return Response.json({ message: "The due-date job requires its scheduler credential." }, { status: 401, headers });
  }
  try {
    const result = await runLoanDueDates();
    console.info("Cooperative loan due-date run", {
      date: result.date, loans: result.loans, pastDue: result.pastDue, accrued: result.accrued,
      penaltiesAssessed: result.penaltiesAssessed, failed: result.failed.length,
    });
    return Response.json(result, { status: result.failed.length ? 503 : 200, headers });
  } catch (cause) {
    return Response.json({ message: cause instanceof LoanError ? cause.message : "Due-date processing is temporarily unavailable." },
      { status: cause instanceof LoanError ? cause.status : 503, headers });
  }
}
