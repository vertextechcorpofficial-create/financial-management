import "server-only";

import { z } from "zod";
import { CooperativeDirectusError, readDirectusItems, usesCooperativeQaDatabase } from "./directus";

const revision = z.object({ dividend_source_revision: z.number().int().positive() });

export async function readDividendSourceRevision() {
  const { data } = z.object({ data: revision.array().max(1) }).parse(
    await readDirectusItems("cooperative_audit_events", new URLSearchParams({
      fields: "dividend_source_revision", sort: "-dividend_source_revision", limit: "1",
      filter: JSON.stringify({ dividend_source_revision: { _nnull: true } }),
    })),
  );
  return data[0]?.dividend_source_revision ?? 0;
}

export async function dividendSourceChange() {
  return usesCooperativeQaDatabase()
    ? { dividend_source_revision: (await readDividendSourceRevision()) + 1 }
    : {};
}

export function isCooperativeWriteCollision(error: unknown) {
  return error instanceof CooperativeDirectusError && /unique|duplicate|already exists|deadlock/i.test(error.detail ?? "");
}
