import type { Metadata } from "next";
import { PropertyLedgerModule } from "@/modules/financial-management/property-ledger/PropertyLedgerModule";
export const metadata: Metadata = { title: "Change history | Property Ledger" };
export default function ChangeHistoryPage() { return <PropertyLedgerModule view="change-history" />; }
