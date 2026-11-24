import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

export async function POST(req: Request) {
    if (!(await cookies()).get("vos_access_token")?.value) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!(file instanceof File)) {
            return NextResponse.json({ message: "No file uploaded" }, { status: 400 });
        }
        if (file.size > 5 * 1024 * 1024 || (file.type !== "application/pdf" && !file.type.startsWith("image/"))) {
            return NextResponse.json({ message: "Upload a PDF or image no larger than 5 MB." }, { status: 400 });
        }

        // Forward to Directus /files
        const directusFormData = new FormData();
        directusFormData.append("file", file);

        const res = await fetch(`${API_BASE_URL}/files`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
            },
            body: directusFormData,
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({ message: "Directus upload failed" }));
            console.error("Directus upload error:", error);
            return NextResponse.json(error, { status: res.status });
        }

        const data = await res.json();
        if (typeof data?.data?.id !== "string" || !data.data.id.trim()) {
            return NextResponse.json({ message: "The storage service returned no file ID. Please retry." }, { status: 502 });
        }
        return NextResponse.json(data);
    } catch (err: unknown) {
        console.error("BFF upload error:", err);
        return NextResponse.json({
            message: "BFF Upload Error",
            detail: err instanceof Error ? err.message : String(err)
        }, { status: 502 });
    }
}

export async function DELETE(req: Request) {
    if (!(await cookies()).get("vos_access_token")?.value) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ message: "File ID is required" }, { status: 400 });
        }

        const res = await fetch(`${API_BASE_URL}/files/${id}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
            },
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({ message: "Directus delete failed" }));
            console.error("Directus delete error:", error);
            return NextResponse.json(error, { status: res.status });
        }

        return new Response(null, { status: 204 });
    } catch (err: unknown) {
        console.error("BFF delete error:", err);
        return NextResponse.json({
            message: "BFF Delete Error",
            detail: err instanceof Error ? err.message : String(err)
        }, { status: 502 });
    }
}
