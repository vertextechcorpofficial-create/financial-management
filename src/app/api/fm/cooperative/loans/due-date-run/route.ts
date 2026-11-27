import { createHash, timingSafeEqual } from "node:crypto";
import { cooperativeDirectus } from "@/modules/financial-management/cooperative/server/directus";
import { runLoanDueDates } from "@/modules/financial-management/cooperative/server/loan-due-dates";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const credentialPath = "/items/cooperative_scheduler_credentials/COOPERATIVE_DUE_DATE_SCHEDULER_TOKEN?fields=token_hash";
const lookupTimeout = 5_000;
const credentialTtl = 5 * 60_000;
const lookupCooldown = 30_000;

let cachedCredential: { hash: Buffer | null; expiresAt: number } | undefined;
let credentialLookup: Promise<Buffer | null> | undefined;

async function readCredentialHash() {
  const response = await cooperativeDirectus(credentialPath, { method: "GET" }, lookupTimeout);
  const payload = await response.json() as { data?: { token_hash?: unknown } } | null;
  const hash = payload?.data?.token_hash;
  return typeof hash === "string" && /^[a-f0-9]{64}$/i.test(hash) ? Buffer.from(hash, "hex") : null;
}

async function getCredentialHash() {
  if (cachedCredential && Date.now() < cachedCredential.expiresAt) return cachedCredential.hash;
  credentialLookup ??= readCredentialHash()
    .catch(() => null)
    .then(hash => {
      cachedCredential = { hash, expiresAt: Date.now() + (hash ? credentialTtl : lookupCooldown) };
      return hash;
    })
    .finally(() => { credentialLookup = undefined; });
  return credentialLookup;
}

function unauthorized() {
  return Response.json({ message: "The due-date job requires its scheduler credential." }, { status: 401, headers });
}

export async function POST(request: Request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([^\s,]+)$/)?.[1];
  if (!token) return unauthorized();
  const expected = await getCredentialHash();
  if (!expected) return Response.json({ message: "The Cooperative due-date job credential is unavailable." }, { status: 503, headers });
  if (!timingSafeEqual(createHash("sha256").update(token).digest(), expected)) return unauthorized();
  try {
    const result = await runLoanDueDates();
    console.info("Cooperative loan due-date run " + JSON.stringify({
      date: result.date, loans: result.loans, pastDue: result.pastDue, accrued: result.accrued,
      penaltiesAssessed: result.penaltiesAssessed, failed: result.failed.length,
    }));
    return Response.json(result, { status: result.failed.length ? 503 : 200, headers });
  } catch (cause) {
    return Response.json({ message: cause instanceof LoanError ? cause.message : "Due-date processing is temporarily unavailable." },
      { status: cause instanceof LoanError ? cause.status : 503, headers });
  }
}
