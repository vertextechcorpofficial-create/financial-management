import type { Metadata } from "next";
import { PropertyLedgerModule } from "@/modules/financial-management/property-ledger/PropertyLedgerModule";
export const metadata: Metadata = { title: "Accounting policies | Property Ledger" };
export default function AccountingPoliciesPage() { return <PropertyLedgerModule view="accounting-policies" />; }
