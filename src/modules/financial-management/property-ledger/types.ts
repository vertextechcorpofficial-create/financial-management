import { z } from "zod";

export const monthSchema = z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/, "Use YYYY-MM (1900–2199)");
const money = z.number().finite().min(0).max(1e14);
const name = z.string().trim().min(1).max(120);
const id = z.string().uuid();
export const METHODS = { sl: "Straight-line", ddb: "Double-declining", db150: "150% declining", syd: "Sum-of-years’ digits" } as const;
export const partSchema = z.object({ id, name, cost: money, life: z.number().int().min(1).max(100), salvage: z.number().min(0).max(100), date: monthSchema });
export const eventSchema = z.object({
  id, kind: z.enum(["appraisal", "impairment", "revaluation", "repair"]), date: monthSchema,
  amount: money, note: z.string().max(1000), vendor: z.string().max(120),
});
export const assetSchema = z.object({
  id, kind: z.enum(["land", "building"]), name, entityId: id,
  landId: z.union([id, z.literal("")]), location: z.string().max(240),
  tags: z.array(z.string().trim().min(1).max(40)).max(12), acquired: monthSchema,
  cost: money, rate: z.number().min(-50).max(100), growth: z.enum(["simple", "compound"]),
  method: z.enum(["sl", "ddb", "db150", "syd"]),
  parts: z.array(partSchema).max(100), events: z.array(eventSchema).max(500),
  sale: z.object({ date: monthSchema, price: money, note: z.string().max(1000) }).nullable(),
  notes: z.string().max(4000),
  details: z.record(z.string().max(40), z.string().max(240)).refine(v => Object.keys(v).length <= 20, "Too many detail fields"),
});
export const policySchema = z.object({
  currency: z.enum(["PHP", "USD", "EUR", "JPY", "GBP"]), fyStart: z.number().int().min(1).max(12),
  landModel: z.enum(["cost", "reval"]), buildingModel: z.enum(["cost", "reval"]),
  lockThrough: z.union([monthSchema, z.literal("")]), capThreshold: money,
  projectionEndYear: z.number().int().min(1900).max(2199).default(new Date().getFullYear() + 25),
  componentSplit: z.array(z.object({ name, share: z.number().min(0).max(100), life: z.number().int().min(1).max(100), salvage: z.number().min(0).max(100) })).min(1).max(20)
    .refine(rows => Math.abs(rows.reduce((sum, row) => sum + row.share, 0) - 100) < 0.01, "Component shares must total 100%")
    .default([{ name: "Structure", share: 70, life: 40, salvage: 10 }, { name: "Roof", share: 6, life: 20, salvage: 0 }, { name: "Electrical & plumbing", share: 12, life: 25, salvage: 0 }, { name: "Elevators & HVAC", share: 12, life: 15, salvage: 0 }]),
});
export const portfolioSchema = z.object({
  entities: z.array(z.object({ id, name })).min(1).max(50), policies: policySchema,
  assets: z.array(assetSchema).max(1000),
}).superRefine((p, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  const entities = new Set(p.entities.map(e => e.id));
  if (entities.size !== p.entities.length) issue("Duplicate entity ID");
  const allIds = p.assets.flatMap(a => [a.id, ...a.parts.map(p => p.id), ...a.events.map(e => e.id)]);
  if (new Set(allIds).size !== allIds.length) issue("Duplicate asset, component or event ID");
  for (const a of p.assets) {
    if (!entities.has(a.entityId)) issue(`${a.name}: unknown entity`);
    if (a.kind === "building" && !a.parts.length) issue(`${a.name}: at least one component is required`);
    if (a.kind === "land" && (a.parts.length || a.landId)) issue(`${a.name}: land cannot contain components or link to land`);
    if (a.landId && !p.assets.some(l => l.id === a.landId && l.kind === "land" && l.entityId === a.entityId)) issue(`${a.name}: linked land must belong to the same entity`);
    if (a.sale && a.sale.date < a.acquired) issue(`${a.name}: disposal precedes acquisition`);
    if (a.parts.some(e => e.date < a.acquired || (a.sale && e.date >= a.sale.date && !(e.date === a.acquired && a.sale.date === a.acquired)))) issue(`${a.name}: component dates must be between acquisition and disposal`);
    if (a.events.some(e => e.date < a.acquired || (a.sale && e.date >= a.sale.date))) issue(`${a.name}: event dates must be between acquisition and disposal`);
    if (a.events.some(e => a.kind === "land" ? e.kind !== "appraisal" : e.kind === "appraisal")) issue(`${a.name}: invalid event type`);
    const valuations = a.events.filter(e => e.kind !== "repair").map(e => `${e.kind}:${e.date}`);
    if (new Set(valuations).size !== valuations.length) issue(`${a.name}: duplicate valuation event in the same month`);
  }
});
export type Asset = z.infer<typeof assetSchema>;
export type Part = z.infer<typeof partSchema>;
export type LedgerEvent = z.infer<typeof eventSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;
export type Policies = Portfolio["policies"];
export type LedgerState = { revision: number; portfolio: Portfolio; canManage: boolean; history: HistoryEntry[]; allowedPages?: string[] };
export type HistoryEntry = { id: number; actor: string; created_at: string; summary: string };
export const INITIAL_ENTITY = "00000000-0000-4000-8000-000000000001";
export function emptyPortfolio(): Portfolio {
  return { entities: [{ id: INITIAL_ENTITY, name: "Main company" }], assets: [], policies: policySchema.parse({ currency: "PHP", fyStart: 1, landModel: "cost", buildingModel: "cost", lockThrough: "", capThreshold: 50000 }) };
}
