import type { Metadata } from "next";
import { PropertyLedgerModule } from "@/modules/financial-management/property-ledger/PropertyLedgerModule";
export const metadata: Metadata = { title: "Building register | Property Ledger" };
export default function BuildingRegisterPage() { return <PropertyLedgerModule view="building-register" />; }
