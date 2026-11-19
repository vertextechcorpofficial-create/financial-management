import type { Metadata } from "next";
import { PropertyLedgerModule } from "@/modules/financial-management/property-ledger/PropertyLedgerModule";
export const metadata: Metadata = { title: "Building depreciation | Property Ledger" };
export default function BuildingDepreciationPage() { return <PropertyLedgerModule view="building-depreciation" />; }
