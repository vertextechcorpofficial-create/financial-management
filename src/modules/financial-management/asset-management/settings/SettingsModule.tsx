"use client";

import React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAssetSettings } from "./hooks/useAssetSettings";
import GeneralSettingsCard from "./components/GeneralSettingsCard";
import AssetClassesCard from "./components/AssetClassesCard";
import ApprovalsSettingsCard from "./components/ApprovalsSettingsCard";

export default function SettingsModule() {
  const {
    data,
    isLoading,
    isSaving,
    error,
    settings,
    updateSettingsField,
    classes,
    handleAddClass,
    handleUpdateClass,
    handleRemoveClass,
    eventTypes,
    handleToggleEventType,
    handleSavePolicies,
    refresh,
  } = useAssetSettings();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">Loading asset management settings...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center space-y-4">
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 inline-block max-w-md">
          <p className="font-semibold text-sm">{error || "Failed to load settings."}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px] mx-auto min-h-screen">
      {/* Header & Save Button */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Entity-level settings. Settings that would restate closed periods are locked.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={handleSavePolicies}
          disabled={isSaving}
          className="h-9 px-4 text-xs gap-1.5 font-medium shadow-2xs"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save policies
        </Button>
      </div>

      {/* Section 1: General */}
      <GeneralSettingsCard
        settings={settings}
        conventions={data.conventions}
        hasClosedPeriod={data.hasClosedPeriod}
        onUpdateField={updateSettingsField}
      />

      {/* Section 2: Asset Classes */}
      <AssetClassesCard
        classes={classes}
        measurementModels={data.measurementModels}
        depreciationMethods={data.depreciationMethods}
        hasClosedPeriod={data.hasClosedPeriod}
        onAddClass={handleAddClass}
        onUpdateClass={handleUpdateClass}
        onRemoveClass={handleRemoveClass}
      />

      {/* Section 3: Approvals */}
      <ApprovalsSettingsCard
        settings={settings}
        eventTypes={eventTypes}
        onUpdateField={updateSettingsField}
        onToggleEventType={handleToggleEventType}
      />
    </div>
  );
}
