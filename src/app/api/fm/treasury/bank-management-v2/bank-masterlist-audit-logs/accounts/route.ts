import { NextResponse } from "next/server";
import { z } from "zod";

import { listAccounts } from "@/modules/financial-management/treasury/bank-management-v2/bank-masterlist-audit-logs/services/masterlist.service";

export const dynamic = "force-dynamic";

const emptyToUndefined = (value: unknown) => (value === "" || value == null ? undefined : value);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const querySchema = z.object({
  // Five statuses, because the register shows INACTIVE and ESCHEATED rows too.
  status: optional(z.enum(["ACTIVE", "DORMANT", "INACTIVE", "ESCHEATED", "CLOSED"])),
  currency: optional(z.enum(["PHP", "USD"])),
  type: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().trim().max(40).optional()),
  ifrs: z.preprocess((value) => (value === "" || value == null ? undefined : value), z.string().trim().max(40).optional()),
  q: z
    .string()
    .trim()
    .max(120, "Search text is too long")
    .optional()
    .transform((value) => value || undefined),
  reconciliation: optional(z.enum(["RECONCILED", "UNRECONCILED"])),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid query parameters", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const data = await listAccounts({
      ...parsed.data,
      accountType: parsed.data.type,
      ifrsCategory: parsed.data.ifrs,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[bank-management-v2] masterlist accounts failed", error);
    return NextResponse.json({ success: false, error: "Failed to load bank accounts" }, { status: 500 });
  }
}
