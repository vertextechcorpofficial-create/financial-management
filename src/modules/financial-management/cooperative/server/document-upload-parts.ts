import "server-only";

import { z } from "zod";
import { maxUploadSize, uploadPartSize } from "../document-limits";
import { cooperativeDirectus, CooperativeDirectusError } from "./directus";
import { CooperativeDocumentError, documentDigest, readCooperativeUpload } from "./document-input";
import { readCooperativeAsset, uploadCooperativeAsset } from "./document-storage";

const maxParts = Math.ceil(maxUploadSize / uploadPartSize);
const marker = "Temporary Cooperative document upload part";
const partMime = "application/octet-stream";
const attemptKey = z.uuid().transform(value => value.toLowerCase());
const manifestSchema = z.object({
  attempt: attemptKey,
  contentType: z.string().max(200).regex(/^multipart\/form-data; boundary=[a-zA-Z0-9_-]+$/i),
  sizes: z.array(z.number().int().positive().max(uploadPartSize)).min(2).max(maxParts),
});

function partId(owner: string, actorId: number, attempt: string, part: number) {
  const hex = documentDigest(JSON.stringify([marker, owner, actorId, attempt, part]));
  return [hex.slice(0, 8), hex.slice(8, 12), "4" + hex.slice(13, 16), "8" + hex.slice(17, 20), hex.slice(20, 32)].join("-");
}

async function removeParts(ids: string[]) {
  if (!ids.length) return;
  try {
    await cooperativeDirectus("/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids),
    });
  } catch (error) {
    if (!(error instanceof CooperativeDirectusError && error.status === 404)) {
      console.error("Cooperative upload part cleanup was incomplete.");
    }
  }
}

async function discardExpiredParts(folder: string) {
  const query = new URLSearchParams({
    fields: "id", limit: "50", sort: "uploaded_on",
    "filter[folder][_eq]": folder, "filter[description][_eq]": marker,
    "filter[uploaded_on][_lt]": new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  });
  try {
    const result = await cooperativeDirectus("/files?" + query);
    const { data } = z.object({ data: z.array(z.object({ id: z.uuid() })) }).parse(await result.json());
    await removeParts(data.map(row => row.id));
  } catch {
    console.error("Cooperative expired upload parts could not be checked.");
  }
}

export async function stageDocumentPart(request: Request, folder: string, owner: string, actorId: number) {
  const query = new URL(request.url).searchParams;
  const attempt = attemptKey.safeParse(query.get("attempt"));
  const part = query.get("part") ?? "";
  const index = Number(part);
  if (!attempt.success || !/^\d{1,2}$/.test(part) || index >= maxParts || request.headers.get("Content-Type") !== partMime) {
    throw new CooperativeDocumentError(400, "Send a valid document upload part.");
  }
  if (Number(request.headers.get("Content-Length")) > uploadPartSize) {
    throw new CooperativeDocumentError(413, "This document upload part is too large.");
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > uploadPartSize) {
    throw new CooperativeDocumentError(413, "This document upload part size is invalid.");
  }
  if (index === 0) await discardExpiredParts(folder);
  const id = partId(owner, actorId, attempt.data, index);
  await uploadCooperativeAsset(id, folder, new File([bytes], "part.bin"), partMime, "bin", marker);
}

export async function discardDocumentParts(request: Request, owner: string, actorId: number) {
  const attempt = attemptKey.safeParse(new URL(request.url).searchParams.get("attempt"));
  if (!attempt.success) throw new CooperativeDocumentError(400, "Choose a valid upload attempt.");
  await removeParts(Array.from({ length: maxParts }, (_, index) => partId(owner, actorId, attempt.data, index)));
}

export async function readStagedDocumentUpload(request: Request, owner: string, actorId: number) {
  const manifest = manifestSchema.safeParse(await request.json().catch(() => null));
  if (!manifest.success || manifest.data.sizes.reduce((total, size) => total + size, 0) > maxUploadSize) {
    throw new CooperativeDocumentError(400, "The upload batch could not be read. Retry the same batch.");
  }
  const { attempt, contentType, sizes } = manifest.data;
  const ids = sizes.map((_, index) => partId(owner, actorId, attempt, index));
  let part = 0;
  const body: NonNullable<Request["body"]> = new ReadableStream({
    async pull(controller) {
      const bytes = await readCooperativeAsset(ids[part], sizes[part]);
      controller.enqueue(bytes);
      part += 1;
      if (part === ids.length) controller.close();
    },
  });
  try {
    return await readCooperativeUpload({ headers: new Headers({ "Content-Type": contentType }), body });
  } finally {
    await removeParts(ids);
  }
}
