import { INITIAL_ENTITY, type Portfolio } from "../types";

export type MasterCompany = { company_id: number; company_name: string; is_default?: boolean | number | null; status?: string };
export const companyEntityId = (id: number) => `00000000-0000-4000-8001-${String(id).padStart(12, "0")}`;
export type CompanyActor = { canManage: boolean; companyId: number | null };

/** Bind legacy IDs once by master identity, never by the viewing user's company. */
export function companyWorkspace(stored: Portfolio, companies: MasterCompany[], actor: CompanyActor) {
  const used = new Set<string>();
  const bindings = companies.map(company => {
    const canonical = companyEntityId(company.company_id);
    const legacy = stored.entities.filter(entity => !used.has(entity.id) && (
      entity.id === canonical || (!/^00000000-0000-4000-8001-\d{12}$/.test(entity.id) && (
        entity.name.trim().toLowerCase() === company.company_name.trim().toLowerCase() ||
        (entity.id === INITIAL_ENTITY && entity.name === "Main company" && (company.is_default === 1 || company.is_default === true))
      ))
    ));
    const entity = { id: canonical, name: company.company_name.trim() };
    legacy.forEach(entity => used.add(entity.id));
    return { company, entity, legacy };
  });
  // All rows stay in storage; the response and edits are scoped to active, authorized companies.
  const visibleEntities = bindings.filter(({ company }) => company.status?.toUpperCase() === "ACTIVE" &&
    (actor.canManage || company.company_id === actor.companyId)).map(binding => binding.entity);
  const visibleIds = new Set(visibleEntities.map(entity => entity.id));
  const allEntities = [...bindings.map(binding => binding.entity), ...stored.entities.filter(entity => !used.has(entity.id))];
  const aliases = new Map(bindings.flatMap(binding => binding.legacy.map(entity => [entity.id, binding.entity.id] as const)));
  const assets = stored.assets.map(asset => ({ ...asset, entityId: aliases.get(asset.entityId) ?? asset.entityId }));
  const full = { ...stored, entities: allEntities, assets };
  const visible = { ...stored, entities: visibleEntities, assets: assets.filter(asset => visibleIds.has(asset.entityId)) };
  return { full, visible };
}

/** Whole-portfolio saves must never delete records belonging to another company. */
export function mergeCompanyChanges(full: Portfolio, visible: Portfolio, submitted: Portfolio): Portfolio {
  if (JSON.stringify(visible.entities) !== JSON.stringify(submitted.entities))
    throw new Error("Companies are managed by the company master. Refresh the ledger to load current companies.");
  const allowed = new Set(visible.entities.map(entity => entity.id));
  const hidden = full.assets.filter(asset => !allowed.has(asset.entityId));
  const hiddenIds = new Set(hidden.map(asset => asset.id));
  if (submitted.assets.some(asset => !allowed.has(asset.entityId) || hiddenIds.has(asset.id)))
    throw new Error("You do not have access to this asset's company.");
  return { ...submitted, entities: full.entities, assets: [...hidden, ...submitted.assets] };
}
