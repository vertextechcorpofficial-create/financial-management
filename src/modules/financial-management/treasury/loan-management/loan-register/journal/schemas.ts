import { z } from "zod";

import { ENTRY_TYPES } from "./constants";
import type { EntryType } from "./types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

/** The URL carries empty strings for untouched filters; a blank is "no filter", never a value. */
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const entryTypeValues = ENTRY_TYPES as [EntryType, ...EntryType[]];

export const journalQuerySchema = z.object({
  view: z.preprocess(blank, z.enum(["entries", "summary"]).default("entries")),
  q: z.preprocess(blank, z.string().trim().max(120).optional()),
  loanId: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  entryType: z.preprocess(blank, z.enum(entryTypeValues).optional()),
  coaId: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  from: z.preprocess(blank, isoDate.optional()),
  to: z.preprocess(blank, isoDate.optional()),
  page: z.preprocess(blank, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(blank, z.coerce.number().int().min(1).max(200).default(10)),
});

export type JournalQuery = z.infer<typeof journalQuerySchema>;
