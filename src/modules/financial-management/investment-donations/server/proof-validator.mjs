// Keep normal multipart submissions below Next.js's default 1 MB Server Action
// limit without requiring configuration changes outside this module.
export const MAX_PROOF_BYTES = 1024 * 1024;
const extensions = { "application/pdf": /\.pdf$/i, "image/jpeg": /\.jpe?g$/i, "image/png": /\.png$/i };
export const proofUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function validateProofUpload(filename, type, bytes) {
  if (!extensions[type]?.test(filename) || !bytes?.length || bytes.length > MAX_PROOF_BYTES) throw new Error("Upload a PDF, JPEG or PNG file, no larger than 1 MB.");
  const signature = type === "application/pdf" ? [37, 80, 68, 70, 45] : type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error("The file contents do not match its PDF, JPEG or PNG type.");
}

export function validateStoredProof(file, actor, serviceUser) {
  let metadata;
  try { metadata = typeof file?.description === "string" ? JSON.parse(file.description) : null; } catch { metadata = null; }
  if (!proofUuid(serviceUser)) throw new Error("Manual filing requires the configured Directus endpoint service user.");
  if (!file || !proofUuid(file.id) || String(file.uploaded_by).toLowerCase() !== serviceUser.toLowerCase() ||
      metadata?.scope !== "cgl-filing-evidence" || metadata?.actor !== actor || file.title !== "CGL filing evidence" ||
      !extensions[file.type]?.test(file.filename_download ?? "") || !Number.isSafeInteger(Number(file.filesize)) ||
      Number(file.filesize) <= 0 || Number(file.filesize) > MAX_PROOF_BYTES || !file.storage || !file.filename_disk) {
    throw new Error("Upload valid supporting evidence for this signed-in user before marking filed.");
  }
  return { id: file.id, filename: file.filename_download, type: file.type, size: Number(file.filesize) };
}
