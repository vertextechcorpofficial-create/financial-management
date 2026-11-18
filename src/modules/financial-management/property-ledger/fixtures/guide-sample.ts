import { emptyPortfolio, type Asset, type Portfolio } from "../types";

const uid = (family: number, suffix: number) => `${family}000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
/** Same four-property scenario and amounts as combines.html's loadSample(), explicitly labeled as sample records. */
export function guideSampleAssets(entityId = emptyPortfolio().entities[0].id): Asset[] {
  const common = { entityId, landId: "", location: "", tags: [] as string[], growth: "compound" as const, method: "sl" as const, rate: 5, cost: 0, parts: [], events: [], sale: null, notes: "Demonstration record based on the supplied Property Ledger guide. Not a posted accounting entry.", details: {} };
  const makati: Asset = { ...common, id: uid(60, 1), kind: "land", name: "Sample: Makati lot", location: "Makati", tags: ["Head office"], acquired: "2015-03", cost: 12000000, rate: 6, details: { area: "1200", zoning: "Commercial", titleNo: "TCT 000-0000 (sample)", zonal: "9500" }, events: [{ id: uid(62, 1), kind: "appraisal", date: "2023-01", amount: 21000000, note: "Bank appraisal (sample)", vendor: "" }] };
  const laguna: Asset = { ...common, id: uid(60, 2), kind: "land", name: "Sample: Laguna lot", location: "Calamba, Laguna", tags: ["Warehouse"], acquired: "2019-07", cost: 3500000, rate: 4, details: { area: "2500", zoning: "Industrial" } };
  const office: Asset = { ...common, id: uid(60, 3), kind: "building", name: "Sample: Head office tower", landId: makati.id, location: "Makati", tags: ["Head office"], acquired: "2015-06", cost: 18000000, details: { floorArea: "3600", storeys: "6", yearBuilt: "2015", construction: "Reinforced concrete", use: "Office", condition: "Good" }, parts: [
    { id: uid(61, 1), name: "Structure", cost: 12600000, life: 40, salvage: 10, date: "2015-06" },
    { id: uid(61, 2), name: "Roof", cost: 1080000, life: 20, salvage: 0, date: "2015-06" },
    { id: uid(61, 3), name: "Electrical & plumbing", cost: 2160000, life: 25, salvage: 0, date: "2015-06" },
    { id: uid(61, 4), name: "Elevators & HVAC", cost: 2160000, life: 15, salvage: 0, date: "2015-06" },
    { id: uid(61, 5), name: "Lobby renovation", cost: 1500000, life: 10, salvage: 0, date: "2021-02" },
  ] };
  const warehouse: Asset = { ...common, id: uid(60, 4), kind: "building", name: "Sample: Warehouse A", landId: laguna.id, location: "Calamba, Laguna", tags: ["Warehouse"], acquired: "2019-09", cost: 7500000, method: "ddb", details: { floorArea: "1800", storeys: "1", yearBuilt: "2019", construction: "Steel frame", use: "Warehouse" }, parts: [{ id: uid(61, 6), name: "Whole building", cost: 7500000, life: 20, salvage: 5, date: "2019-09" }] };
  return [makati, laguna, office, warehouse];
}
export function appendGuideSample(portfolio: Portfolio) {
  const samples = guideSampleAssets(portfolio.entities[0].id);
  const idMap = new Map(samples.map(sample => [sample.id, portfolio.assets.find(a => a.name === sample.name && a.kind === sample.kind)?.id ?? sample.id]));
  const additions = samples.filter(sample => !portfolio.assets.some(a => a.id === sample.id || a.name === sample.name)).map(sample => ({ ...sample, landId: sample.landId ? idMap.get(sample.landId) ?? sample.landId : "" }));
  return { portfolio: { ...portfolio, assets: [...portfolio.assets, ...additions] }, added: additions.length };
}
