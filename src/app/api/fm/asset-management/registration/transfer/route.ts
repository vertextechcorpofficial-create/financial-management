import { recordTransfer } from "@/modules/financial-management/asset-management/registration/services/asset";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await recordTransfer(body);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error("POST Transfer Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 400 },
    );
  }
}
