import { createSubscription, issueCertificate, reconcileCgt, recordCapitalAction, recordCashEntry, recordGiving, recordTrade, reverseEntry, saveAnnualReview, saveDonationDocument, saveReconciliation, submitPeriod } from "@/modules/financial-management/investment-donations/server/actions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return Response.json({ ok: false, message: "Use the same application origin to save ledger changes." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" ||
      request.headers.get("x-ledger-request") !== "1") {
    return Response.json({ ok: false, message: "Expected a ledger JSON request." }, { status: 415 });
  }
  const body = await request.json().catch(() => null);
  switch (body?.operation) {
    case "cash": return Response.json(await recordCashEntry(body.input));
    case "reverse": return Response.json(await reverseEntry(body.input));
    case "reconciliation": return Response.json(await saveReconciliation(body.input));
    case "period": return Response.json(await submitPeriod(body.input));
    case "donation-document": return Response.json(await saveDonationDocument(body.input));
    case "trade": return Response.json(await recordTrade(body.input));
    case "annual-review": return Response.json(await saveAnnualReview(body.input));
    case "issue-certificate": return Response.json(await issueCertificate(body.input));
    case "giving": return Response.json(await recordGiving(body.input));
    case "cgt-reconcile": return Response.json(await reconcileCgt(body.input));
    case "cgt-filing": return Response.json(await saveDonationDocument(body.input, true));
    case "subscribe": return Response.json(await createSubscription(body.input));
    case "capital": return Response.json(await recordCapitalAction(body.input));
    default: return Response.json({ ok: false, message: "Unknown ledger operation." }, { status: 400 });
  }
}
