/** Use the authenticated BFF; never expose a Directus token in asset URLs. */
export function attachmentId(value: string): string {
    const clean = value.trim().split(/[?#]/)[0];
    return clean.split("/").filter(Boolean).pop() || "";
}

export function attachmentUrl(value: string): string {
    const id = attachmentId(value);
    return id ? `/api/fm/treasury/disbursements/attachments/${encodeURIComponent(id)}` : "";
}

export async function uploadSupportingDocument(file: File): Promise<string> {
    if (file.size > 5 * 1024 * 1024) throw new Error("Supporting documents must be 5 MB or smaller.");
    if (file.type !== "application/pdf" && !file.type.startsWith("image/")) throw new Error("Choose a PDF or image file.");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/fm/treasury/disbursements/upload", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || "Supporting document upload failed.");
    const id = data?.data?.id;
    if (typeof id !== "string" || !id.trim()) throw new Error("Upload returned no file ID. Your existing attachment was retained.");
    return id;
}
