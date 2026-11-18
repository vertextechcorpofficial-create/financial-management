import type { Metadata } from "next";
import { PropertyLedgerModule } from "@/modules/financial-management/property-ledger/PropertyLedgerModule";
export const metadata: Metadata = { title: "Land appreciation | Property Ledger" };
export default function LandAppreciationPage() { return <PropertyLedgerModule view="land-appreciation" />; }
