import { NextResponse } from "next/server";

function removed() {
  return NextResponse.json({ error: "The workflow administrator workspace and settings API have been removed." }, { status: 410 });
}

export const GET = removed;
export const POST = removed;
