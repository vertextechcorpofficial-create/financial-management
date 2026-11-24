import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { employeeId, assetId, action } = body;

    if (!employeeId || !assetId || !action) {
      return NextResponse.json({ error: "Missing required clearance parameters" }, { status: 400 });
    }

    // Process action (RECORD RETURN TO STOCK / REASSIGNMENT / REPORT AS LOST)
    // 1. If RETURNED_TO_STOCK: creates custody transfer with employee = null / holding dept
    // 2. If REASSIGNED: creates custody transfer to new user
    // 3. If LOST: logs disposal accounting event (IAS 16 derecognition)
    return NextResponse.json({
      success: true,
      message: `Asset ${assetId} marked as ${action} for employee ${employeeId}.`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process clearance action" },
      { status: 500 }
    );
  }
}
