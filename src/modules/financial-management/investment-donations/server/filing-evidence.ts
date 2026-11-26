"use server";

import { z } from "zod";
import { ledgerAccess } from "./access";
import { allows, workspaceRole } from "./permissions";
import { ledgerConnectionBase } from "./connection-url.mjs";
import { MAX_PROOF_BYTES, validateProofUpload, validateStoredProof } from "./proof-validator.mjs";

const uploaded = z.object({ data: z.object({ id: z.string().uuid(), filename_download: z.string().min(1),
  type: z.string(), filesize: z.coerce.number().int().positive().max(MAX_PROOF_BYTES), uploaded_by: z.string().uuid(),
  title: z.string(), description: z.string(), storage: z.string().min(1), filename_disk: z.string().min(1) }) });

export async function uploadFilingEvidence(form: FormData) {
  try {
    const access = await ledgerAccess();
    // In no-extension Directus mode, use the same local membership/admin role
    // fallback as the rest of the module. The upload still requires Approve;
    // do not let an unavailable remote role endpoint turn an administrator into
    // a false view-only user.
    const permission = access;
    if (!permission || !allows(workspaceRole(permission, "tax-compliance"), "approve")) return { ok: false as const, message: "Tax-compliance approval permission is required to upload filing evidence." };
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0 || file.size > MAX_PROOF_BYTES) return { ok: false as const, message: "Select a PDF, JPEG or PNG supporting file, no larger than 1 MB." };
    validateProofUpload(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
    const base = ledgerConnectionBase(process.env.NEXT_PUBLIC_API_BASE_URL);
    const token = process.env.DIRECTUS_STATIC_TOKEN;
    if (!token) throw new Error("File upload service is not configured.");
    const options = { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" as const, redirect: "error" as const, signal: AbortSignal.timeout(30000) };
    const identity = await fetch(`${base}/users/me?fields=id`, options);
    if (!identity.ok) throw new Error("The Directus file-upload identity could not be verified.");
    const service = z.object({ data: z.object({ id: z.string().uuid() }) }).parse(await identity.json()).data.id;
    const body = new FormData();
    body.set("title", "CGL filing evidence");
    body.set("description", JSON.stringify({ scope: "cgl-filing-evidence", actor: permission.id }));
    body.set("file", file, file.name);
    const response = await fetch(`${base}/files`, { ...options, method: "POST", body });
    if (!response.ok) return { ok: false as const, message: "Supporting file upload failed. The Directus service user needs file-upload permission; no filing was recorded." };
    const result = uploaded.parse(await response.json()).data;
    return { ok: true as const, file: validateStoredProof(result, permission.id, service) };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error && /^(Upload|The file contents)/.test(error.message) ? error.message : "Supporting file upload could not be confirmed. No filing was recorded; retry after checking the file-upload service." };
  }
}
