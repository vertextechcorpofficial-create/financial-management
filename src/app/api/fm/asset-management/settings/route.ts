import { NextResponse } from "next/server";
import type {
  AssetSettingsPayload,
  AssetClassRow,
  SaveAssetSettingsRequest,
  LookupOption,
  ApprovalEventTypeOption,
} from "@/modules/financial-management/asset-management/settings/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusAssetSettings {
  id: number;
  capitalisation_threshold: number | string;
  approval_enabled: number | boolean;
  approval_threshold: number | string;
  depreciation_convention_id: number;
  transfer_revaluation_surplus: number | boolean;
}

interface DirectusAssetClass {
  id: number;
  name: string;
  tag_prefix: string;
  depreciation_method_id: number;
  default_life_months: number;
  residual_percent: number | string;
  measurement_model_id: number;
  is_active: number | boolean;
}

interface DirectusEventType {
  id: number;
  code: string;
  name: string;
  requires_approval: number | boolean;
}

interface DirectusPeriodClose {
  id: number;
  closed_through: string;
  reopened_at?: string | null;
}

interface DirectusAssetRef {
  id: number;
  asset_class_id?: number | null;
}

async function safeList<T>(path: string): Promise<T[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: T[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

function generateTagPrefix(name: string, usedPrefixes: Set<string>): string {
  const letters = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const base = (letters.slice(0, 3) || "AST").padEnd(3, "X");
  if (!usedPrefixes.has(base)) {
    usedPrefixes.add(base);
    return base;
  }
  for (let i = 1; i <= 99; i++) {
    const candidate = `${base.slice(0, 2)}${i}`;
    if (!usedPrefixes.has(candidate)) {
      usedPrefixes.add(candidate);
      return candidate;
    }
  }
  return base;
}

export async function GET() {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "Directus API URL not configured" }, { status: 500 });
    }

    const [
      settingsRows,
      classRows,
      eventTypeRows,
      conventions,
      measurementModels,
      depreciationMethods,
      closes,
      assetRefs,
    ] = await Promise.all([
      safeList<DirectusAssetSettings>("/items/asset_settings?limit=1"),
      safeList<DirectusAssetClass>("/items/asset_classes?filter[is_active][_eq]=1&sort=id&limit=200"),
      safeList<DirectusEventType>("/items/asset_event_types?sort=sort_order,id&limit=50"),
      safeList<LookupOption>("/items/asset_depreciation_conventions?sort=sort_order,id&limit=20"),
      safeList<LookupOption>("/items/asset_measurement_models?sort=sort_order,id&limit=20"),
      safeList<LookupOption>("/items/asset_depreciation_methods?sort=sort_order,id&limit=20"),
      safeList<DirectusPeriodClose>(
        "/items/asset_period_closes?filter[reopened_at][_null]=true&sort=-closed_through&limit=1"
      ),
      safeList<DirectusAssetRef>("/items/assets_and_equipment?fields=id,asset_class_id&limit=1000"),
    ]);

    const latestClose = closes[0] || null;
    const hasClosedPeriod = Boolean(latestClose && !latestClose.reopened_at);
    const closedThrough = hasClosedPeriod ? latestClose.closed_through : null;

    const usedClassIds = new Set<number>();
    for (const a of assetRefs) {
      if (a.asset_class_id) usedClassIds.add(Number(a.asset_class_id));
    }

    const rawSettings = settingsRows[0];
    const settings = {
      id: rawSettings?.id || 1,
      capitalisation_threshold: Number(rawSettings?.capitalisation_threshold ?? 15000),
      depreciation_convention_id: Number(rawSettings?.depreciation_convention_id ?? 1),
      transfer_revaluation_surplus: Boolean(rawSettings?.transfer_revaluation_surplus),
      approval_enabled: rawSettings ? Boolean(rawSettings.approval_enabled) : true,
      approval_threshold: Number(rawSettings?.approval_threshold ?? 50000),
    };

    const classes: AssetClassRow[] = classRows.map((c) => ({
      id: c.id,
      name: c.name,
      tag_prefix: c.tag_prefix,
      measurement_model_id: Number(c.measurement_model_id || 1),
      depreciation_method_id: Number(c.depreciation_method_id || 1),
      useful_life_years: Math.max(0, Number((Number(c.default_life_months || 0) / 12).toFixed(2))),
      residual_percent: Number(c.residual_percent || 0),
      in_use: usedClassIds.has(c.id),
    }));

    const eventTypes: ApprovalEventTypeOption[] = eventTypeRows.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      requires_approval: Boolean(e.requires_approval),
    }));

    const payload: AssetSettingsPayload = {
      hasClosedPeriod,
      closedThrough,
      settings,
      classes,
      eventTypes,
      conventions,
      measurementModels,
      depreciationMethods,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("GET /api/fm/asset-management/settings error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "Directus API URL not configured" }, { status: 500 });
    }

    const body = (await req.json()) as SaveAssetSettingsRequest;
    const nowIso = new Date().toISOString();

    // Check period close lock state + existing settings/classes
    const [closes, existingSettingsList, existingClasses, assetRefs] = await Promise.all([
      safeList<DirectusPeriodClose>(
        "/items/asset_period_closes?filter[reopened_at][_null]=true&sort=-closed_through&limit=1"
      ),
      safeList<DirectusAssetSettings>("/items/asset_settings?limit=1"),
      safeList<DirectusAssetClass>("/items/asset_classes?limit=200"),
      safeList<DirectusAssetRef>("/items/assets_and_equipment?fields=id,asset_class_id&limit=1000"),
    ]);

    const latestClose = closes[0] || null;
    const hasClosedPeriod = Boolean(latestClose && !latestClose.reopened_at);
    const existingSettings = existingSettingsList[0];
    const existingClassMap = new Map<number, DirectusAssetClass>(
      existingClasses.map((c) => [c.id, c])
    );
    const usedClassIds = new Set<number>(
      assetRefs.map((a) => Number(a.asset_class_id)).filter((n) => n > 0)
    );

    // Enforce DOCX rule: Class names cannot be empty, duplicated, or start with "Land" / "Building"
    const seenClassNames = new Set<string>();
    for (const cls of body.classes || []) {
      const trimmed = (cls.name || "").trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Asset class name cannot be empty." }, { status: 400 });
      }
      if (/^(land|building)\b/i.test(trimmed)) {
        return NextResponse.json(
          { error: `Class "${trimmed}" is not allowed (Land and Building are handled separately).` },
          { status: 400 }
        );
      }
      const lower = trimmed.toLowerCase();
      if (seenClassNames.has(lower)) {
        return NextResponse.json(
          { error: `Duplicate asset class name "${trimmed}" is not allowed.` },
          { status: 400 }
        );
      }
      seenClassNames.add(lower);
    }

    // 1. Update asset_settings (id = 1), respecting period-close locks
    const settingsPatch: Record<string, unknown> = {
      capitalisation_threshold: Number(body.settings.capitalisation_threshold || 0),
      approval_enabled: body.settings.approval_enabled ? 1 : 0,
      approval_threshold: Number(body.settings.approval_threshold || 0),
      updated_at: nowIso,
      updated_by: 24,
    };

    if (!hasClosedPeriod) {
      settingsPatch.depreciation_convention_id = Number(body.settings.depreciation_convention_id || 1);
      settingsPatch.transfer_revaluation_surplus = body.settings.transfer_revaluation_surplus ? 1 : 0;
    } else if (existingSettings) {
      // Preserve locked fields when any period is closed
      settingsPatch.depreciation_convention_id = existingSettings.depreciation_convention_id;
      settingsPatch.transfer_revaluation_surplus = existingSettings.transfer_revaluation_surplus;
    }

    const patchSettingsRes = await fetch(
      `${API_BASE_URL}/items/asset_settings/${existingSettings?.id || 1}`,
      {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify(settingsPatch),
      }
    );

    if (!patchSettingsRes.ok) {
      const errText = await patchSettingsRes.text();
      throw new Error(`Failed to save asset_settings: ${errText}`);
    }

    // 2. Delete removed unused classes
    const deletedSet = new Set<number>(body.deletedClassIds || []);
    for (const delId of deletedSet) {
      if (usedClassIds.has(delId)) continue; // Refuse deleting in-use class
      const delRes = await fetch(`${API_BASE_URL}/items/asset_classes/${delId}`, {
        method: "DELETE",
        headers: AUTH_HEADERS,
      });
      if (!delRes.ok) {
        const errText = await delRes.text();
        throw new Error(`Failed to delete asset class #${delId}: ${errText}`);
      }
    }

    // 3. Upsert asset_classes
    const usedPrefixes = new Set<string>(
      existingClasses
        .filter((c) => !deletedSet.has(c.id))
        .map((c) => (c.tag_prefix || "").toUpperCase())
    );

    for (const cls of body.classes || []) {
      const name = cls.name.trim();
      const lifeMonths = Math.max(0, Math.round(Number(cls.useful_life_years || 0) * 12));
      const residualPct = Math.max(0, Math.min(100, Number(cls.residual_percent || 0)));

      if (cls.id && existingClassMap.has(cls.id)) {
        const prev = existingClassMap.get(cls.id)!;
        const patchClsRes = await fetch(`${API_BASE_URL}/items/asset_classes/${cls.id}`, {
          method: "PATCH",
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            name,
            depreciation_method_id: Number(cls.depreciation_method_id || 1),
            default_life_months: lifeMonths,
            residual_percent: residualPct,
            measurement_model_id: hasClosedPeriod
              ? prev.measurement_model_id
              : Number(cls.measurement_model_id || 1),
            updated_at: nowIso,
            updated_by: 24,
          }),
        });
        if (!patchClsRes.ok) {
          const errText = await patchClsRes.text();
          throw new Error(`Failed to update asset class "${name}": ${errText}`);
        }
      } else {
        const prefix =
          cls.tag_prefix && cls.tag_prefix.trim()
            ? cls.tag_prefix.trim().toUpperCase().slice(0, 10)
            : generateTagPrefix(name, usedPrefixes);

        const insClsRes = await fetch(`${API_BASE_URL}/items/asset_classes`, {
          method: "POST",
          headers: AUTH_HEADERS,
          body: JSON.stringify({
            name,
            tag_prefix: prefix,
            depreciation_method_id: Number(cls.depreciation_method_id || 1),
            default_life_months: lifeMonths,
            residual_percent: residualPct,
            measurement_model_id: Number(cls.measurement_model_id || 1),
            is_active: 1,
            row_version: 0,
            created_at: nowIso,
            created_by: 24,
          }),
        });
        if (!insClsRes.ok) {
          const errText = await insClsRes.text();
          throw new Error(`Failed to create asset class "${name}": ${errText}`);
        }
      }
    }

    // 4. Update asset_event_types requires_approval flags
    for (const ev of body.eventTypes || []) {
      const patchEvRes = await fetch(`${API_BASE_URL}/items/asset_event_types/${ev.id}`, {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          requires_approval: ev.requires_approval ? 1 : 0,
          updated_at: nowIso,
          updated_by: 24,
        }),
      });
      if (!patchEvRes.ok) {
        const errText = await patchEvRes.text();
        throw new Error(`Failed to update event type #${ev.id}: ${errText}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Policies saved successfully.",
    });
  } catch (error: unknown) {
    console.error("POST /api/fm/asset-management/settings error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
