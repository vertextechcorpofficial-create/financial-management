"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

// Components
import { DataTableSkeleton } from "@/app/(financial-management)/fm/_components/DataTableSkeleton";
import { ErrorPage } from "@/app/(financial-management)/fm/_components/ErrorPage";
import { AssetDataTable } from "./components/data-table";
import { columns } from "./components/data-table/columns";
import { AssetTableData } from "./types";

// Hooks
import { useAssets } from "./hooks/useAssets";
import { assetService } from "./services/assetService";

import AddAssetModal from "./components/modals/AddAssetModal";
import AssetViewModal from "./components/modals/AssetViewModal";
import AssetEditModal from "./components/modals/EditAssetModal";
import TransferModal from "./components/modals/TransferModal";
import AssignAssetModal from "./components/modals/AssignAssetModal";
import ReturnAssetModal from "./components/modals/ReturnAssetModal";
import AssetAssignmentHistoryModal from "./components/modals/AssetAssignmentHistoryModal";

export default function AssetManagementModulePage() {
  const router = useRouter();
  const {
    assets: data,
    isLoading: loading,
    error: errorState,
    refresh: fetchAssets,
    updateAssetLocally,
    appendAssetLocally,
  } = useAssets();

  // Modal State
  const [selectedAsset, setSelectedAsset] = useState<AssetTableData | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // --- Handlers for Table Actions ---
  const handleView = (asset: AssetTableData) => {
    // Navigate to Phase 2 Asset Detail Page
    router.push(`/fm/asset-management/registration/${asset.id}`);
  };

  const handleEdit = (asset: AssetTableData) => {
    setSelectedAsset(asset);
    setIsEditOpen(true);
  };

  const handleTransfer = (asset: AssetTableData) => {
    setSelectedAsset(asset);
    setIsTransferOpen(true);
  };

  const handleImpairment = (asset: AssetTableData) => {
    router.push(`/fm/asset-management/registration/${asset.id}?tab=events&type=impairment`);
  };

  const handleChangeLife = (asset: AssetTableData) => {
    router.push(`/fm/asset-management/registration/${asset.id}?tab=events&type=estimate`);
  };

  const handleDispose = (asset: AssetTableData) => {
    router.push(`/fm/asset-management/registration/${asset.id}?tab=events&type=disposal`);
  };

  const handleCustodyHistory = (asset: AssetTableData) => {
    router.push(`/fm/asset-management/registration/${asset.id}?tab=custody`);
  };

  const handleHistory = (asset: AssetTableData) => {
    router.push(`/fm/asset-management/registration/${asset.id}?tab=history`);
  };

  const handleDeactivate = async (asset: AssetTableData) => {
    if (confirm(`Are you sure you want to deactivate ${asset.asset_tag || asset.item_name}?`)) {
      try {
        await assetService.deactivateAsset(asset.id, "Deactivated from register");
        toast.success(`${asset.asset_tag || asset.item_name} deactivated.`);
        fetchAssets();
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Failed to deactivate asset.";
        toast.error(errMsg);
      }
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <DataTableSkeleton />
      </div>
    );
  }

  if (errorState.hasError) {
    return (
      <div className="p-6">
        <ErrorPage
          title="Data Connection Error"
          message={errorState.message}
          onRefresh={fetchAssets}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Top Header Actions (matches Image 1: Refresh + Add New Asset) */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={fetchAssets}
          disabled={loading}
          title="Refresh Data"
          className="h-10 w-10 border shadow-xs"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <AddAssetModal
          onSuccess={fetchAssets}
          onLocalAppend={appendAssetLocally}
        />
      </div>

      {/* Main Data Table */}
      <AssetDataTable
        columns={columns}
        data={data}
        onEdit={handleEdit}
        onView={handleView}
        onTransfer={handleTransfer}
        onImpairment={handleImpairment}
        onChangeLife={handleChangeLife}
        onDispose={handleDispose}
        onCustodyHistory={handleCustodyHistory}
        onHistory={handleHistory}
        onDeactivate={handleDeactivate}
      />

      {/* Modals */}
      <AssetViewModal
        isOpen={isViewOpen}
        onOpenChange={setIsViewOpen}
        asset={selectedAsset}
      />

      <AssetEditModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        asset={selectedAsset}
        onSuccess={fetchAssets}
        onLocalUpdate={updateAssetLocally}
      />

      <TransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        asset={selectedAsset}
        onSuccess={fetchAssets}
        onLocalUpdate={updateAssetLocally}
      />

      <AssignAssetModal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        asset={selectedAsset}
        onSuccess={fetchAssets}
      />

      <ReturnAssetModal
        isOpen={isReturnOpen}
        onClose={() => setIsReturnOpen(false)}
        asset={selectedAsset}
        onSuccess={fetchAssets}
      />

      <AssetAssignmentHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        asset={selectedAsset}
      />
    </div>
  );
}
