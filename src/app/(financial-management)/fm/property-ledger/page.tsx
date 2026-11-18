import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Property Ledger | Financial Management", description: "Land and building registers, valuations, depreciation schedules and property accounting policies." };
export default function PropertyLedgerPage() {
  redirect("/fm/property-ledger/dashboard");
}
