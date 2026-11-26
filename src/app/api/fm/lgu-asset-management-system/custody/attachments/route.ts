import { NextResponse } from "next/server";
import { attachDocumentScan } from "@/modules/financial-management/lgu-asset-management-system/custody/services/assetCustody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const documentId = Number(form.get("documentId"));
    const file = form.get("file");
    if (!documentId) return NextResponse.json({ message: "documentId is required" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ message: "Attach a file" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ message: "That file is empty" }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: "Scans have to be 8 MB or smaller" }, { status: 400 });
    }
    const result = await attachDocumentScan(documentId, file);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
