import "server-only";

import { z } from "zod";
import { maxFileSize } from "../document-limits";
import { cooperativeDirectus } from "./directus";
import { CooperativeDocumentError } from "./document-input";

function excludesFolder(rule: unknown, folder: string): boolean {
  const filter = z.record(z.string(), z.unknown()).safeParse(rule);
  if (!filter.success) return false;
  const { _and, _or, folder: condition } = filter.data;
  if (Array.isArray(_or)) return _or.length > 0 && _or.every(item => excludesFolder(item, folder));
  if (Array.isArray(_and) && _and.some(item => excludesFolder(item, folder))) return true;

  const result = z.record(z.string(), z.unknown()).safeParse(condition);
  if (!result.success) return false;
  const { _eq, _neq, _in, _nin, _null } = result.data;
  const uuid = z.uuid().transform(value => value.toLowerCase());
  const equal = uuid.safeParse(_eq);
  const include = uuid.array().safeParse(_in);
  const exclude = uuid.array().safeParse(_nin);
  // Stop unless the existing rule clearly separates its files from this folder.
  return (equal.success && equal.data !== folder) ||
    (typeof _neq === "string" && _neq.toLowerCase() === folder) ||
    (include.success && !include.data.includes(folder)) ||
    (exclude.success && exclude.data.includes(folder)) ||
    _null === true;
}

export async function privateCooperativeFolder() {
  const folderQuery = new URLSearchParams({
    fields: "id", limit: "2", "filter[name][_eq]": "Cooperative Documents", "filter[parent][_null]": "true",
  });
  const rows = z.object({ data: z.array(z.object({ id: z.uuid() })) }).parse(
    await (await cooperativeDirectus(`/folders?${folderQuery}`)).json(),
  ).data;
  const folder = rows.length === 1 ? rows[0].id.toLowerCase() : null;
  if (folder) {
    const query = new URLSearchParams({
      fields: "permissions", limit: "-1",
      "filter[collection][_in]": "directus_files,*", "filter[action][_in]": "read,update,delete,share",
    });
    const { data } = z.object({ data: z.array(z.object({ permissions: z.unknown() })) }).parse(
      await (await cooperativeDirectus(`/permissions?${query}`)).json(),
    );
    if (data.every(rule => excludesFolder(rule.permissions, folder))) return folder;
  }
  throw new CooperativeDocumentError(503, "Private Cooperative document storage is unavailable.");
}

export async function uploadCooperativeAsset(id: string, folder: string, file: File, mime: string, extension: string, description?: string) {
  const form = new FormData();
  form.append("id", id);
  form.append("folder", folder);
  if (description) form.append("description", description);
  form.append("file", file.slice(0, file.size, mime), `${id}.${extension}`);
  const response = await cooperativeDirectus("/files", { method: "POST", body: form }, 60_000);
  const { data } = z.object({ data: z.object({ id: z.uuid(), folder: z.uuid() }) }).parse(await response.json());
  if (data.id !== id || data.folder !== folder) throw new Error("Unexpected Cooperative file storage location.");
}

export async function readCooperativeAsset(id: string, size: number) {
  const response = await cooperativeDirectus(`/assets/${encodeURIComponent(id)}`, {}, 30_000);
  const reader = response.body?.getReader();
  if (!reader || size > maxFileSize) throw new Error("The stored document is unavailable.");
  const bytes = Buffer.alloc(size);
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > size) throw new Error("The stored document exceeds its recorded size.");
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (offset !== size) throw new Error("The stored document is incomplete.");
  return bytes;
}
