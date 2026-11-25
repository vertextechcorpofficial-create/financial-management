import { LEDGER_PAGES, ledgerPath } from "../navigation";

export type ModuleGrant = { base_path?: string | null; status?: string | null };
const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** ERP module assignments grant use of the module; they do not carry canEdit flags. */
export function ledgerAccess(grants: ModuleGrant[], admin: boolean) {
  const paths = grants.filter(grant => !grant.status || grant.status.toLowerCase() === "active")
    .map(grant => normalize(grant.base_path ?? "")).filter(Boolean);
  const pages = LEDGER_PAGES.filter(page => admin || paths.some(path => {
    const target = ledgerPath(page.slug);
    return target === path || target.startsWith(`${path}/`);
  })).map(page => page.slug);
  return { pages, editPages: pages.filter(page => page === "land-register" || page === "building-register" || page === "accounting-policies") };
}
