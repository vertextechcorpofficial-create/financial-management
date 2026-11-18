import type { Metadata } from "next";
import { PropertyLedgerModule } from "@/modules/financial-management/property-ledger/PropertyLedgerModule";
export const metadata: Metadata = { title: "Combined schedule | Property Ledger" };
export default function CombinedPage() { return <PropertyLedgerModule view="combined" />; }
