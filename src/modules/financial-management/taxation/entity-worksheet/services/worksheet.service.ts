import "server-only";

import { getRegistryCompany, listRegistryCompaniesWithHealth } from "./registry";
import { loadExpenseBreakdown, loadFigures } from "./companyFigures";
import { loadProfile } from "./profile.service";
import { loadTaxRates } from "./taxRates.service";
import { loadCarryoverInput } from "./carryovers.service";
import { applyManualValues, loadManualValues, manualFlags } from "./manual.service";
import { buildLines, computeTax, computeVat } from "./taxEngine";
import type { EntitySnapshot, QuarterFigures, RegistryCompany } from "../types";

/**
 * One company, one tax year: registry row + profile + the figures summed from that
 * company's own tables + the arithmetic. Every page reads through here, so the eight
 * modules can never disagree about a number.
 */

export class TaxonomyLookupError extends Error {
  status: number;

  constructor(message: string, status = 404) {
    super(message);
    this.name = "TaxonomyLookupError";
    this.status = status;
  }
}

export async function listCompanies(): Promise<RegistryCompany[]> {
  return listRegistryCompaniesWithHealth();
}

/** Named for the banner, so a failed source never reads as "purchase orders" by default. */
const FAILED_SOURCE_LABELS: Record<string, string> = {
  sales: "sales invoices",
  purchases: "purchase orders",
  "sales detail lines": "the sales detail lines behind product standard cost",
};

/**
 * The registry row minus everything the browser must never hold. The token opens that
 * company's whole database, so the payload only carries what the picker renders.
 */
export function publicCompany(company: RegistryCompany): Omit<RegistryCompany, "baseUrl" | "token" | "springUrl" | "springToken"> {
  return {
    companyId: company.companyId,
    code: company.code,
    name: company.name,
    tin: company.tin,
    reachable: company.reachable,
    unreachableReason: company.unreachableReason,
  };
}

function emptyFigures(): QuarterFigures[] {
  return [0, 1, 2, 3].map(() => ({
    sales: 0,
    salesVat: 0,
    discounts: 0,
    returns: 0,
    returnsVat: 0,
    purchases: 0,
    purchasesVat: 0,
    cogsProductCost: 0,
    cogsLedger: 0,
    expenses: 0,
    cwt: 0,
    icSales: 0,
    icPurchases: 0,
    icSalesByCompany: {},
    icPurchasesByCompany: {},
  }));
}

// The itemized sales view costs a few minutes a year, so a snapshot lives long enough to be worth keeping; Refresh bypasses it.
const SNAPSHOT_TTL_MS = 30 * 60_000;

/**
 * A request with no Spring session reads the invoice register instead of the Spring views, so its
 * payload is a different, poorer answer. Keying the cache by the session keeps that fallback from
 * being served to a signed-in reader for the next half hour.
 */
function authKey(springToken: string | null | undefined): string {
  return springToken ? springToken.slice(-8) : "anon";
}
/**
 * App Router gives every route handler and every page its own module instance, so a route that
 * calls clearSnapshotCache() would otherwise clear a copy the page never reads. The map hangs off
 * globalThis so a saved carryover lot reaches the worksheet that renders it.
 */
const sharedStore = globalThis as unknown as {
  __fmTaxationSnapshotCache?: Map<string, { at: number; data: EntitySnapshot }>;
};
const snapshotCache = (sharedStore.__fmTaxationSnapshotCache ??= new Map());

export async function loadEntitySnapshot(
  companyId: number,
  taxYear: number,
  /** Already health-checked rows from the route; without this the registry is pinged twice per page. */
  knownCompanies?: RegistryCompany[],
  /** The signed-in user's Spring token, forwarded so the itemized views answer. */
  springToken?: string | null,
  /** Set when the user asks for a fresh pull instead of the cached one. */
  options: { fresh?: boolean } = {},
): Promise<EntitySnapshot> {
  const key = `${companyId}:${taxYear}:${authKey(springToken)}`;
  const cached = snapshotCache.get(key);
  if (!options.fresh && cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.data;

  const snapshot = await buildEntitySnapshot(companyId, taxYear, knownCompanies, springToken);
  snapshotCache.set(key, { at: Date.now(), data: snapshot });
  return snapshot;
}

export function clearSnapshotCache(companyId: number, taxYear: number): void {
  // Keys carry a session suffix, so an exact-key delete would leave every cached snapshot in place
  // and a saved profile would keep showing the figures computed before the edit.
  const prefix = `${companyId}:${taxYear}:`;
  for (const key of [...snapshotCache.keys()]) {
    if (key.startsWith(prefix)) snapshotCache.delete(key);
  }
}

async function buildEntitySnapshot(
  companyId: number,
  taxYear: number,
  knownCompanies?: RegistryCompany[],
  springToken?: string | null,
): Promise<EntitySnapshot> {
  const companies = knownCompanies ?? (await listCompanies());
  const company = companies.find((entry) => entry.companyId === companyId) ?? (await getRegistryCompany(companyId));
  if (!company) throw new TaxonomyLookupError(`Company ${companyId} is not in the registry.`);

  const peers = companies.filter((peer) => peer.companyId !== companyId);
  const profile = await loadProfile(companyId, taxYear);
  const rates = await loadTaxRates(company, taxYear);
  const carryovers = await loadCarryoverInput(companyId, taxYear);

  if (!company.reachable) {
    const notices = [
      `${company.code} is unreachable (${company.unreachableReason ?? "no answer"}). Figures are not shown rather than guessed.`,
    ];
    const empty = emptyFigures();
    const computation = computeTax(empty, profile, rates, carryovers.input);
    return {
      company,
      profile,
      figures: empty,
      computation,
      vat: computeVat(empty, profile, rates),
      lines: buildLines(empty, computation, profile),
      matches: [],
      notices: [...notices, ...(carryovers.notice ? [carryovers.notice] : []), ...computation.notices],
      figuresAvailable: false,
      failedSources: ["the company instance"],
      salesSource: "INVOICE_HEADERS",
      expenseBreakdown: null,
      carryovers: carryovers.panel,
    };
  }

  const expenseBreakdown = await loadExpenseBreakdown(company, taxYear, { springToken });
  const loaded = await loadFigures(company, taxYear, peers, {
    vatRate: rates.vat,
    springToken,
  });
  const { matches, notices, failed, salesSource } = loaded;

  // Manual entry replaces ledger figures before the arithmetic, so the tax due on screen is
  // built from what the preparer typed by the same engine, never a second hand-made path.
  const manual = await loadManualValues(companyId, taxYear);
  const figures = applyManualValues(loaded.figures, manual.values, profile.priorYearExcessCredit);
  const computation = computeTax(figures, profile, rates, carryovers.input);
  const vat = computeVat(figures, profile, rates);

  return {
    company,
    profile,
    figures,
    computation,
    vat,
    lines: buildLines(figures, computation, profile).map((line) => {
      const manualLine = manualFlags(line, manual.values);
      return manualLine ? { ...line, manual: manualLine } : line;
    }),
    matches,
    notices: [
      ...notices,
      ...(carryovers.notice ? [carryovers.notice] : []),
      ...(manual.notice ? [manual.notice] : []),
      ...computation.notices,
    ],
    // Gross income is the headline; without the sales register the whole sheet is unknown.
    figuresAvailable: !failed.includes("sales"),
    failedSources: failed.map((source) => FAILED_SOURCE_LABELS[source] ?? source),
    salesSource,
    expenseBreakdown,
    carryovers: carryovers.panel,
  };
}




