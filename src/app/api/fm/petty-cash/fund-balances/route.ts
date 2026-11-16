import { NextRequest } from "next/server";
import { readPettyCash } from "../_spring";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return readPettyCash(`fund-balances?${request.nextUrl.searchParams}`, { signal: request.signal });
}
