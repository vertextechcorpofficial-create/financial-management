import { NextResponse } from "next/server";
import { z } from "zod";

import {
  isCalendarDate,
  applyCheckAction,
  describeCheckError,
} from "@/modules/financial-management/treasury/bank-management-v2/check-clearing-management/services/checks.service";

import { currentUserId } from "../../_lib/actor";

export const dynamic = "force-dynamic";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine(isCalendarDate, "Enter a valid calendar date.");

const ActionSchema = z.object({
  action: z.enum(["RELEASE", "DEPOSIT", "CLEAR", "RETURN", "CANCEL", "REPLACE"]),
  returnReason: z.string().trim().max(120).optional(),
  cancelReason: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  releaseDate: dateField.optional(),
  depositDate: dateField.optional(),
  clearedDate: dateField.optional(),
  replacement: z
    .object({
      checkDate: dateField,
      amount: z.coerce.number().positive("Enter an amount greater than zero."),
      checkNo: z.string().trim().min(4, "The check number needs at least four digits.").max(40),
      draweeBank: z.string().trim().max(120).optional(),
      checkType: z.enum(["PDC", "DATED", "MANAGERS_CHECK"]),
    })
    .optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const checkId = Number(id);
  if (!Number.isInteger(checkId) || checkId <= 0) {
    return NextResponse.json({ success: false, error: "Invalid check id." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ActionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Check the action details.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const actorId = await currentUserId();
    const data = await applyCheckAction(checkId, {
      action: parsed.data.action,
      returnReason: parsed.data.returnReason ?? null,
      cancelReason: parsed.data.cancelReason ?? null,
      note: parsed.data.note ?? null,
      releaseDate: parsed.data.releaseDate ?? null,
      depositDate: parsed.data.depositDate ?? null,
      clearedDate: parsed.data.clearedDate ?? null,
      replacement: parsed.data.replacement
        ? {
            checkDate: parsed.data.replacement.checkDate,
            amount: parsed.data.replacement.amount,
            checkNo: parsed.data.replacement.checkNo,
            draweeBank: parsed.data.replacement.draweeBank ?? null,
            checkType: parsed.data.replacement.checkType,
          }
        : null,
    }, actorId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const failure = describeCheckError(error, `[bank-management-v2] check action ${checkId} failed`);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
