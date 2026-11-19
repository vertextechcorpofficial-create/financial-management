import type { NextRequest } from "next/server";
import { listBankBranches, listReferences, referenceResponse } from "../../_references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  if (resource !== "bank-branches") {
    return referenceResponse(async () => listReferences(resource, request.nextUrl.searchParams));
  }
  const started = performance.now();
  let lookupMs = 0;
  const response = await referenceResponse(async () =>
    listBankBranches(request.nextUrl.searchParams, ms => { lookupMs = ms; }));
  response.headers.set("Server-Timing", `bank_branches;dur=${(performance.now() - started).toFixed(1)}, directus;dur=${lookupMs.toFixed(1)}`);
  return response;
}
