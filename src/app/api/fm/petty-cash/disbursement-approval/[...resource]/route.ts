import { NextRequest } from "next/server";
import { readPettyCash } from "../../_spring";
import { fileError, readVoucherFile } from "../../disbursement/_files";
import { approvalPdf } from "../_print";
import type { VoucherOperations } from "@/modules/financial-management/petty-cash/voucher-types";
import type { VoucherDecision } from "@/modules/financial-management/petty-cash/voucher-approval-types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string[] }> };
const id = (value: string) => /^[1-9]\d{0,17}$/.test(value);
async function forward(request: NextRequest, { params }: Context) {
  const { resource: p } = await params, method = request.method;
  const record = ["requests", "decisions"].includes(p[0]) && id(p[1] || "");
  if (record && method === "GET" && p.length === 4 && p[2] === "attachments" && id(p[3])) return readVoucherFile(p[1], p[3], request.nextUrl.searchParams.get("view") === "preview", p[0] === "requests" ? "disbursement-approval/requests" : "disbursement-approval/decisions");
  if (record && method === "GET" && p.length === 3 && p[2] === "print") {
    const upstream = await readPettyCash(`disbursement-approval/${p[0]}/${p[1]}`);
    if (!upstream.ok) return upstream;
    const data = await upstream.json() as VoucherOperations | VoucherDecision, decision = "before" in data ? data : undefined, value = "before" in data ? data.before : data;
    const bytes = approvalPdf(value, decision);
    const response = new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${value.voucher.docNo.replace(/[^a-zA-Z0-9_-]/g, "_")}-approval${decision ? `-${decision.eventId}` : ""}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    for (const cookie of upstream.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
    return response;
  }
  const validGet = method === "GET" && (p.length === 1 && ["requests", "funds"].includes(p[0]) || record && p.length === 2);
  const validWrite = method === "POST" && p[0] === "requests" && id(p[1] || "") && p.length === 3 && ["approve", "reject"].includes(p[2]);
  if (!validGet && !validWrite) return fileError("Unknown voucher approval resource or action.", 404);
  let body: string | undefined;
  if (method !== "GET") { try { body = JSON.stringify(await request.json()); } catch { return fileError("Send a valid JSON decision.", 400); } }
  return readPettyCash(`disbursement-approval/${p.join("/")}${request.nextUrl.search}`, { method, body, signal: request.signal });
}
export const GET = forward;
export const POST = forward;
