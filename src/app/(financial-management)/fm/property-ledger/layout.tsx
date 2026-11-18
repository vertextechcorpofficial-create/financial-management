import { PropertyLedgerShell } from "@/modules/financial-management/property-ledger/components/PageShell";
import { PropertyLedgerProvider } from "@/modules/financial-management/property-ledger/providers/PropertyLedgerProvider";

export default function PropertyLedgerLayout({ children }: { children: React.ReactNode }) {
  return <PropertyLedgerShell><PropertyLedgerProvider>{children}</PropertyLedgerProvider></PropertyLedgerShell>;
}
