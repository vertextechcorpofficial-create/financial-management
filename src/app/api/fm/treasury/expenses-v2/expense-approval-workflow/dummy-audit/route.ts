import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ error: "The separate auditor workspace has been removed. Request history remains available to the requester and assigned approver." }, { status: 410 });
}
