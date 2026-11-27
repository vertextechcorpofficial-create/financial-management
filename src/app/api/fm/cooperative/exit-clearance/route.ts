import { startClearance } from "@/modules/financial-management/cooperative/server/clearance-commands";
import { getClearanceRegister } from "@/modules/financial-management/cooperative/server/clearance-store";
import { withClearance } from "./_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withClearance(() => getClearanceRegister(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  return withClearance(async actor => startClearance(await request.json().catch(() => null), actor));
}
