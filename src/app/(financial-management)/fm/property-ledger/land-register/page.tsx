import type { Metadata } from "next";
import { PropertyLedgerModule } from "@/modules/financial-management/property-ledger/PropertyLedgerModule";
export const metadata: Metadata = { title: "Land register | Property Ledger" };
export default function LandRegisterPage() { return <PropertyLedgerModule view="land-register" />; }
