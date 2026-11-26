import { NextResponse } from "next/server";
import { directusUrl, enc, get, patch } from "@/modules/financial-management/barangay-asset-inventory-system/shared/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

async function photoId(assetId: number): Promise<string | null> {
  const rows = await get<{ id: number; photo: string | null }[]>(
    "/items/brgy_asset?filter=" + enc({ id: { _eq: assetId } }) + "&fields=id,photo&limit=1"
  );
  return rows?.[0]?.photo ?? null;
}

/** Serve the asset photo through our own route so the Directus token never reaches the browser. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const fileId = await photoId(Number(id));
    if (!fileId) return NextResponse.json({ message: "This asset has no photo yet" }, { status: 404 });

    const res = await fetch(directusUrl("/assets/" + fileId), {
      headers: { Authorization: "Bearer " + (process.env.DIRECTUS_STATIC_TOKEN ?? "") },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return NextResponse.json({ message: "The photo could not be read" }, { status: res.status });

    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** Section 3: one clear photo per asset, strongly encouraged. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const assetId = Number(id);
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) return NextResponse.json({ message: "Choose an image to upload" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ message: "The photo must be an image" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ message: "The photo must be 8 MB or smaller" }, { status: 400 });

    const upload = new FormData();
    upload.append("file", file, file.name || "asset-photo.jpg");
    const res = await fetch(directusUrl("/files"), {
      method: "POST",
      headers: { Authorization: "Bearer " + (process.env.DIRECTUS_STATIC_TOKEN ?? "") },
      body: upload,
      signal: AbortSignal.timeout(30000),
    });
    const body = (await res.json().catch(() => null)) as { data?: { id?: string }; errors?: { message?: string }[] } | null;
    if (!res.ok || !body?.data?.id) {
      return NextResponse.json({ message: body?.errors?.[0]?.message ?? "Upload failed" }, { status: 400 });
    }

    const previous = await photoId(assetId);
    await patch("/items/brgy_asset/" + assetId, { photo: body.data.id });

    if (previous) {
      await fetch(directusUrl("/files/" + previous), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + (process.env.DIRECTUS_STATIC_TOKEN ?? "") },
        signal: AbortSignal.timeout(15000),
      }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, photo: body.data.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
