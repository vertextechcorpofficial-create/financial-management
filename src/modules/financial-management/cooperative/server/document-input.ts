import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

export const maxFileSize = 10 * 1024 * 1024;
const maxFiles = 10;
const maxRequestSize = maxFiles * maxFileSize + 64 * 1024;
const mimeTypes = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
} as const;

export class CooperativeDocumentError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function documentDigest(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readForm(request: Request) {
  const contentType = request.headers.get("Content-Type");
  if (!contentType || !/^multipart\/form-data;/i.test(contentType) || !request.body) {
    throw new CooperativeDocumentError(400, "Send the documents as a multipart upload.");
  }
  if (Number(request.headers.get("Content-Length")) > maxRequestSize) {
    throw new CooperativeDocumentError(413, "Upload up to 10 files, with a maximum of 10 MB each.");
  }
  let size = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxRequestSize) {
        throw new CooperativeDocumentError(413, "Upload up to 10 files, with a maximum of 10 MB each.");
      }
      controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch (error) {
    if (error instanceof CooperativeDocumentError) throw error;
    throw new CooperativeDocumentError(400, "The document upload could not be read.");
  }
}

function detectedType(bytes: Buffer) {
  if (/^%PDF-[12]\.\d[\r\n]/.test(bytes.toString("latin1", 0, 12))) {
    const trailer = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(bytes.subarray(-1024).toString("latin1"));
    const offset = Number(trailer?.[1]);
    if (Number.isSafeInteger(offset) && offset > 0 && offset < bytes.length &&
        /^(?:xref\s|\d+\s+\d+\s+obj\b)/.test(bytes.toString("latin1", offset, offset + 40))) return mimeTypes.pdf;
  }

  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR" &&
      bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 &&
      bytes.readUInt32BE(bytes.length - 12) === 0 && bytes.toString("ascii", bytes.length - 8, bytes.length - 4) === "IEND") {
    return mimeTypes.png;
  }
  if (bytes.length >= 16 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      bytes[3] !== 0 && bytes[3] !== 0xff && bytes.readUInt16BE(bytes.length - 2) === 0xffd9) return mimeTypes.jpg;
  return null;
}

export async function readCooperativeUpload(request: Request) {
  const form = await readForm(request);
  const batchKey = z.uuid().safeParse(form.get("uploadKey"));
  const rawTypeId = form.get("documentTypeId");
  const documentTypeId = typeof rawTypeId === "string" && /^[1-9]\d*$/.test(rawTypeId) ? Number(rawTypeId) : 0;
  if (!batchKey.success || !Number.isSafeInteger(documentTypeId) || documentTypeId <= 0) {
    throw new CooperativeDocumentError(400, "Choose a document type and include an upload key.");
  }
  const input = form.getAll("files");
  if (!input.length || input.length > maxFiles || input.some(file => !(file instanceof File))) {
    throw new CooperativeDocumentError(400, "Choose between 1 and 10 files.");
  }
  const files = [];
  for (const file of input as File[]) {
    const name = file.name.trim();
    const extension = /\.(pdf|png|jpe?g)$/i.exec(name)?.[1].toLowerCase() as keyof typeof mimeTypes | undefined;
    if (!extension || name.length > 255 || !name.isWellFormed() || /[\\/\r\n\x00-\x1f\x7f]/.test(name)) {
      throw new CooperativeDocumentError(415, "Choose a PDF, JPG, or PNG file with a valid filename.");
    }
    if (file.size > maxFileSize) throw new CooperativeDocumentError(413, "Each file must be 10 MB or smaller.");

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = detectedType(bytes);
    if (!mime || mime !== mimeTypes[extension]) {
      throw new CooperativeDocumentError(415, "The file contents must match the PDF, JPG, or PNG extension.");
    }
    files.push({ file, name, extension, mime, digest: documentDigest(bytes) });
  }
  return { key: batchKey.data.toLowerCase(), documentTypeId, files };
}
