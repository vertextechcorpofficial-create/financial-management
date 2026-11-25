"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type {
  AssetSettingsPayload,
  AssetClassRow,
  ApprovalEventTypeOption,
  GeneralSettingsData,
} from "../types";
import { fetchAssetSettings, saveAssetSettings } from "../providers/fetchProvider";

export function useAssetSettings() {
  const [data, setData] = useState<AssetSettingsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable local form state hydrated from Directus
  const [settings, setSettings] = useState<GeneralSettingsData>({
    id: 1,
    capitalisation_threshold: 15000,
    depreciation_convention_id: 1,
    transfer_revaluation_surplus: false,
    approval_enabled: true,
    approval_threshold: 50000,
  });
  const [classes, setClasses] = useState<AssetClassRow[]>([]);
  const [deletedClassIds, setDeletedClassIds] = useState<number[]>([]);
  const [eventTypes, setEventTypes] = useState<ApprovalEventTypeOption[]>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAssetSettings();
      setData(res);
      setSettings(res.settings);
      setClasses(res.classes);
      setDeletedClassIds([]);
      setEventTypes(res.eventTypes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateSettingsField = <K extends keyof GeneralSettingsData>(
    key: K,
    value: GeneralSettingsData[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddClass = () => {
    const defaultModelId = data?.measurementModels[0]?.id || 1;
    const defaultMethodId = data?.depreciationMethods[0]?.id || 1;
    setClasses((prev) => [
      ...prev,
      {
        id: null,
        tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "New class",
        tag_prefix: "",
        measurement_model_id: defaultModelId,
        depreciation_method_id: defaultMethodId,
        useful_life_years: 5,
        residual_percent: 0,
        in_use: false,
      },
    ]);
  };

  const handleUpdateClass = (
    index: number,
    patch: Partial<AssetClassRow>
  ) => {
    setClasses((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row))
    );
  };

  const handleRemoveClass = (index: number) => {
    const target = classes[index];
    if (!target || target.in_use) return;
    if (target.id !== null) {
      setDeletedClassIds((prev) => [...prev, target.id!]);
    }
    setClasses((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleToggleEventType = (eventTypeId: number, checked: boolean) => {
    setEventTypes((prev) =>
      prev.map((et) =>
        et.id === eventTypeId ? { ...et, requires_approval: checked } : et
      )
    );
  };

  const handleSavePolicies = async () => {
    // Client-side validation for empty, duplicate, and Land/Building class names
    const seenNames = new Set<string>();
    for (const c of classes) {
      const trimmed = c.name.trim();
      if (!trimmed) {
        toast.error("Asset class name cannot be empty.");
        return;
      }
      if (/^(land|building)\b/i.test(trimmed)) {
        toast.error(
          `Class "${trimmed}" is not allowed (Land and Building are out of scope).`
        );
        return;
      }
      const lower = trimmed.toLowerCase();
      if (seenNames.has(lower)) {
        toast.error(`Duplicate asset class name "${trimmed}" is not allowed.`);
        return;
      }
      seenNames.add(lower);
    }

    setIsSaving(true);
    try {
      const res = await saveAssetSettings({
        settings: {
          capitalisation_threshold: settings.capitalisation_threshold,
          depreciation_convention_id: settings.depreciation_convention_id,
          transfer_revaluation_surplus: settings.transfer_revaluation_surplus,
          approval_enabled: settings.approval_enabled,
          approval_threshold: settings.approval_threshold,
        },
        classes: classes.map((c) => ({
          id: c.id,
          name: c.name.trim(),
          tag_prefix: c.tag_prefix,
          measurement_model_id: c.measurement_model_id,
          depreciation_method_id: c.depreciation_method_id,
          useful_life_years: c.useful_life_years,
          residual_percent: c.residual_percent,
        })),
        deletedClassIds,
        eventTypes: eventTypes.map((e) => ({
          id: e.id,
          requires_approval: e.requires_approval,
        })),
      });
      toast.success(res.message || "Policies saved successfully");
      await loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save policies");
    } finally {
      setIsSaving(false);
    }
  };

  return {
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
    refresh: loadData,
  };
}
