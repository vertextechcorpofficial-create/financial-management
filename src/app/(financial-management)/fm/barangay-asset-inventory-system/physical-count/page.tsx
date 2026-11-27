import { BarangayAssetModule } from "@/modules/financial-management/barangay-asset-inventory-system/BarangayAssetModule";

export default function Page() {
  return <BarangayAssetModule initialTab="Physical count" standalone />;
}
