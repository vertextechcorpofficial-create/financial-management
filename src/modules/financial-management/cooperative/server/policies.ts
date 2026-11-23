import "server-only";

import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { cooperativeAuditEvent } from "./audit";
import { cooperativeDirectus, readDirectusItems } from "./directus";
import { policyFieldLabel, policyValue } from "../policies/policy-labels";
import {
  accountPurposes, accountSchema, documentRuleSchema, documentTypeSchema, mappingSchema, policyAreas, productSchema, settingsSchema,
  type DocumentRule, type DocumentType, type HistoryEntry, type PolicyAccount, type PolicyMapping,
  type PolicySave, type PolicyState, type Product,
} from "../policies/policy-types";

export class PolicyError extends Error {
  constructor(readonly status: number, message: string, readonly field?: string, readonly code?: string) { super(message); }
}

type Collection = Parameters<typeof readDirectusItems>[0];
type Subject = keyof typeof policyAreas;
type AuditState = NonNullable<Parameters<typeof cooperativeAuditEvent>[1]["before"]>;
type Actor = { actorId: number; actorRole: string | null; actorName: string };
type Row = Record<string, unknown>;

const pageSize = 50;
const manila = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
});
export const isActive = (value: unknown) => value === true || value === 1 || value === "1";
const flag = (value: boolean) => value ? 1 : 0;
const normalized = (value: string) => value.normalize("NFKC").trim().toLowerCase();
const asRows = z.object({ data: z.array(z.record(z.string(), z.unknown())) });
const int = z.number().int().positive();
const decimalText = (value: unknown) => value === null || value === undefined ? null : String(value);

async function rows(collection: Collection, fields: string, options: { filter?: object; sort?: string; limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams({ fields, limit: String(options.limit ?? -1) });
  if (options.filter) params.set("filter", JSON.stringify(options.filter));
  if (options.sort) params.set("sort", options.sort);
  if (options.offset) params.set("offset", String(options.offset));
  return asRows.parse(await readDirectusItems(collection, params)).data;
}

async function revision() {
  const [last] = await rows("cooperative_audit_events", "policy_revision", {
    filter: { policy_revision: { _nnull: true } }, sort: "-policy_revision", limit: 1,
  });
  return last ? int.parse(last.policy_revision) : 0;
}

const fields = {
  settings: "id,membership_fee,minimum_savings_per_cutoff,maintaining_balance,withdrawals_per_year,floor_mode,floor_fixed_amount,floor_percent,payment_order,exit_savings_annual_rates",
  products: [
    "id,product_code,number_prefix,name,short_name,description,kind,is_open",
    "monthly_rate_min,monthly_rate_max,monthly_rate_default,interest_methods,goods_markup_percent",
    "terms_months,repayment_frequencies,repayment_modes,limit_type,savings_multiple,fixed_ceiling",
    "minimum_membership_months,penalty_percent,grace_days,processing_fee",
    "goods_items.id,goods_items.name,goods_items.price,goods_items.is_active",
    "document_rules.id,document_rules.document_type_id,document_rules.enforcement,document_rules.is_active",
  ].join(","),
};

export async function readDocumentTypes() {
  return rows("cooperative_document_types", "id,code,name,is_active", { sort: "name,id" });
}

async function readPolicies() {
  const [latest, [settingsResult, rawProducts, types, rules, accounts, mappings]] = await Promise.all([
    revision(),
    Promise.all([
      readDirectusItems("cooperative_policy_settings", new URLSearchParams({ fields: fields.settings })),
      rows("cooperative_loan_products", fields.products, { sort: "name,id" }),
      readDocumentTypes(),
      rows("cooperative_policy_document_requirements", "id,scope,document_type_id,enforcement,is_active", { sort: "scope,document_type_id" }),
      rows("cooperative_gl_accounts", "id,code,name,classification,is_contra,is_active", { sort: "code,id" }),
      rows("cooperative_account_mappings", "id,purpose,account_id", { sort: "purpose" }),
    ]),
  ]);
  const { data: setting } = z.object({ data: z.record(z.string(), z.unknown()).nullable() }).parse(settingsResult);
  const settings = setting?.id ? settingsSchema.parse({
    membershipFee: decimalText(setting.membership_fee), minimumSavings: decimalText(setting.minimum_savings_per_cutoff),
    maintainingBalance: decimalText(setting.maintaining_balance), withdrawalsPerYear: setting.withdrawals_per_year,
    floorMode: setting.floor_mode, floorFixedAmount: decimalText(setting.floor_fixed_amount),
    floorPercent: decimalText(setting.floor_percent), paymentOrder: setting.payment_order,
    exitSavingsAnnualRates: setting.exit_savings_annual_rates ?? {},
  }) : null;

  const nested = z.array(z.record(z.string(), z.unknown()));
  const branches = new Map<number, { items: Row[]; rules: Row[] }>();
  const products: Product[] = rawProducts.map(row => {
    const id = int.parse(row.id);
    const items = nested.parse(row.goods_items ?? []).sort((a, b) => Number(a.id) - Number(b.id));
    const rules = nested.parse(row.document_rules ?? []).sort((a, b) => Number(a.document_type_id) - Number(b.document_type_id));
    branches.set(id, { items, rules });
    const product = productSchema.parse({
      id, name: row.name, shortName: row.short_name, prefix: row.number_prefix, kind: row.kind,
      isOpen: isActive(row.is_open), description: row.description ?? "",
      rateMin: decimalText(row.monthly_rate_min), rateMax: decimalText(row.monthly_rate_max), rateDefault: decimalText(row.monthly_rate_default),
      methods: row.interest_methods, markup: decimalText(row.goods_markup_percent), termsMonths: row.terms_months,
      frequencies: row.repayment_frequencies, modes: row.repayment_modes, limitType: row.limit_type,
      savingsMultiple: decimalText(row.savings_multiple), fixedCeiling: decimalText(row.fixed_ceiling),
      minimumMembershipMonths: row.minimum_membership_months, penaltyPercent: decimalText(row.penalty_percent),
      graceDays: row.grace_days, processingFee: decimalText(row.processing_fee),
      items: items.filter(item => isActive(item.is_active)).map(item => ({ id: item.id, name: item.name, price: decimalText(item.price) })),
      documentRules: rules.filter(rule => isActive(rule.is_active))
        .map(rule => ({ documentTypeId: rule.document_type_id, enforcement: rule.enforcement })),
    });
    return { ...product, id, code: z.string().parse(row.product_code) };
  });
  const view: PolicyState = {
    revision: latest, settings, products,
    documentTypes: types.map((row): DocumentType => ({
      ...documentTypeSchema.parse({ name: row.name, isActive: isActive(row.is_active) }), id: int.parse(row.id), code: z.string().parse(row.code),
    })),
    documentRules: rules.map((row): DocumentRule => ({
      ...documentRuleSchema.parse({ scope: row.scope, documentTypeId: row.document_type_id, enforcement: row.enforcement, isActive: isActive(row.is_active) }),
      id: int.parse(row.id),
    })),
    accounts: accounts.map((row): PolicyAccount => ({
      ...accountSchema.parse({ code: row.code, name: row.name, classification: row.classification, isActive: isActive(row.is_active), isContra: isActive(row.is_contra) }),
      id: int.parse(row.id),
    })),
    mappings: mappings.map((row): PolicyMapping => ({
      ...mappingSchema.parse({ purpose: row.purpose, accountId: row.account_id }), id: int.parse(row.id),
    })),
  };
  if (await revision() !== latest) throw stalePolicy();
  return { view, branches };
}

function stalePolicy() {
  return new PolicyError(409, "Policies changed since you opened this form. Review the latest values before saving again.", undefined, "STALE_POLICY");
}

export async function getPolicies() {
  return (await readPolicies()).view;
}

type Prepared = {
  collection: Collection;
  id?: number;
  key: string;
  subject: Subject;
  title: string;
  before?: AuditState;
  after: AuditState;
  payload: Row;
};

function existing<T extends { id: number }>(values: T[], id: number | undefined) {
  if (id === undefined) return undefined;
  const match = values.find(row => row.id === id);
  if (!match) throw new PolicyError(404, "This policy record is unavailable.");
  return match;
}

function prepareProduct(data: Extract<PolicySave, { section: "product" }>["data"], state: Awaited<ReturnType<typeof readPolicies>>): Prepared {
  const { view, branches } = state;
  const prior = existing(view.products, data.id);
  if (prior && (prior.prefix !== data.prefix || prior.kind !== data.kind)) {
    throw new PolicyError(422, "The prefix and loan type are fixed after creation.", "prefix");
  }
  if (view.products.some(p => p.id !== data.id && normalized(p.name) === normalized(data.name))) {
    throw new PolicyError(409, "Another product already uses this name.", "name");
  }
  if (view.products.some(p => p.id !== data.id && p.prefix === data.prefix)) {
    throw new PolicyError(409, "Another product already uses this prefix.", "prefix");
  }
  if (data.documentRules.some(rule => !view.documentTypes.some(type => type.id === rule.documentTypeId && type.isActive))) {
    throw new PolicyError(422, "Choose active document types.", "documentRules");
  }
  const attached = prior ? branches.get(prior.id) : undefined;
  const previousItems = attached?.items ?? [];
  const previousRules = attached?.rules ?? [];
  const items = [...data.items];
  if (items.some(item => item.id !== undefined && !previousItems.some(row => row.id === item.id && isActive(row.is_active)))) {
    throw new PolicyError(422, "A priced item does not belong to this product.", "items");
  }
  const rules = [...data.documentRules].sort((a, b) => a.documentTypeId - b.documentTypeId);
  const code = prior?.code ?? data.prefix;
  const shortName = data.shortName || data.name.slice(0, 50);
  const auditView = (product: Product): AuditState => {
    const details = Object.fromEntries(Object.entries(product).filter(([key]) =>
      !["id", "code", "items", "documentRules"].includes(key))) as AuditState;
    // Describe nested changes with the visible names rather than database IDs.
    return { ...details,
      items: product.items.map(item => `${item.name} · ₱${item.price}`),
      documentRules: product.documentRules.map(rule => `${view.documentTypes.find(type => type.id === rule.documentTypeId)?.name ?? rule.documentTypeId} · ${policyValue("enforcement", rule.enforcement)}`),
    };
  };
  const payload: Row = {
    product_code: code, name: data.name, short_name: shortName, number_prefix: data.prefix, kind: data.kind,
    is_open: flag(data.isOpen), description: data.description || null, monthly_rate_min: data.rateMin,
    monthly_rate_max: data.rateMax, monthly_rate_default: data.rateDefault, interest_methods: data.methods,
    goods_markup_percent: data.markup, terms_months: data.termsMonths, repayment_frequencies: data.frequencies,
    repayment_modes: data.modes, limit_type: data.limitType, savings_multiple: data.savingsMultiple,
    fixed_ceiling: data.fixedCeiling, minimum_membership_months: data.minimumMembershipMonths,
    penalty_percent: data.penaltyPercent, grace_days: data.graceDays, processing_fee: data.processingFee,
  };
  const goods = {
    create: items.filter(item => item.id === undefined).map(item => ({ name: item.name, price: item.price, is_active: 1 })),
    update: [
      ...items.filter(item => item.id !== undefined).map(item => ({ id: item.id, name: item.name, price: item.price })),
      ...previousItems.filter(item => isActive(item.is_active) && !items.some(next => next.id === item.id))
        .map(item => ({ id: item.id, is_active: 0 })),
    ],
  };
  const documentRules = { create: [] as Row[], update: [] as Row[] };
  for (const rule of rules) {
    const stored = previousRules.find(row => row.document_type_id === rule.documentTypeId);
    if (stored) documentRules.update.push({ id: stored.id, enforcement: rule.enforcement, is_active: 1 });
    else documentRules.create.push({ document_type_id: rule.documentTypeId, enforcement: rule.enforcement, is_active: 1 });
  }
  for (const row of previousRules) {
    if (isActive(row.is_active) && !rules.some(rule => rule.documentTypeId === row.document_type_id)) {
      documentRules.update.push({ id: row.id, is_active: 0 });
    }
  }
  if (goods.create.length || goods.update.length) payload.goods_items = goods;
  if (documentRules.create.length || documentRules.update.length) payload.document_rules = documentRules;
  // Only the display details enter audit. New item IDs are assigned by Directus.
  const after = auditView({ ...data, id: data.id ?? 0, code, shortName, documentRules: rules });
  return {
    collection: "cooperative_loan_products", id: prior?.id, key: code, subject: "LOAN_PRODUCT", title: data.name,
    before: prior ? auditView(prior) : undefined, after, payload,
  };
}

async function prepare(command: PolicySave, state: Awaited<ReturnType<typeof readPolicies>>): Promise<Prepared> {
  const { view } = state;
  if (command.section === "settings") {
    const { data } = command;
    const exitSavingsAnnualRates = data.exitSavingsAnnualRates ?? view.settings?.exitSavingsAnnualRates ?? {};
    return {
      collection: "cooperative_policy_settings", key: "1", subject: "POLICY_SETTINGS", title: "Savings and membership settings",
      before: view.settings ?? undefined, after: { ...data, exitSavingsAnnualRates },
      payload: {
        ...(view.settings ? {} : { id: 1 }),
        membership_fee: data.membershipFee, minimum_savings_per_cutoff: data.minimumSavings,
        maintaining_balance: data.maintainingBalance, withdrawals_per_year: data.withdrawalsPerYear,
        floor_mode: data.floorMode, floor_fixed_amount: data.floorFixedAmount, floor_percent: data.floorPercent,
        payment_order: data.paymentOrder,
        ...(data.exitSavingsAnnualRates === undefined ? {} : { exit_savings_annual_rates: exitSavingsAnnualRates }),
      },
    };
  }
  if (command.section === "product") return prepareProduct(command.data, state);

  if (command.section === "documentType") {
    const { data } = command;
    const prior = existing(view.documentTypes, data.id);
    if (view.documentTypes.some(doc => doc.id !== data.id && normalized(doc.name) === normalized(data.name))) {
      throw new PolicyError(409, "This document type is already listed.", "name");
    }
    if (prior && !data.isActive && (
      view.documentRules.some(rule => rule.documentTypeId === prior.id && rule.isActive) ||
      view.products.some(product => product.documentRules.some(rule => rule.documentTypeId === prior.id))
    )) throw new PolicyError(409, "Remove the active requirements for this document type before archiving it.", "isActive");
    const code = prior?.code ?? `DOC_${randomUUID().replaceAll("-", "").toUpperCase()}`;
    return {
      collection: "cooperative_document_types", id: prior?.id, key: code, subject: "DOCUMENT_TYPE", title: data.name,
      before: prior && { name: prior.name, isActive: prior.isActive }, after: { name: data.name, isActive: data.isActive },
      payload: { name: data.name, code, is_active: flag(data.isActive) },
    };
  }
  if (command.section === "documentRule") {
    const { data } = command;
    const type = existing(view.documentTypes, data.documentTypeId);
    if (!type || (data.isActive && !type.isActive)) throw new PolicyError(422, "Choose an active document type.", "documentTypeId");
    const prior = view.documentRules.find(row => row.scope === data.scope && row.documentTypeId === data.documentTypeId);
    if (!prior && !data.isActive) throw new PolicyError(404, "The document requirement is unavailable.");
    return {
      collection: "cooperative_policy_document_requirements", id: prior?.id, key: `${data.scope}_${type.code}`,
      subject: "DOCUMENT_RULE", title: `${data.scope === "MEMBERSHIP" ? "Membership" : "Exit clearance"} · ${type.name}`,
      before: prior && { enforcement: prior.enforcement, isActive: prior.isActive },
      after: { enforcement: data.enforcement, isActive: data.isActive },
      payload: { scope: data.scope, document_type_id: data.documentTypeId, enforcement: data.enforcement, is_active: flag(data.isActive) },
    };
  }
  if (command.section === "account") {
    const { data } = command;
    const prior = existing(view.accounts, data.id);
    if (view.accounts.some(account => account.id !== data.id && account.code === data.code)) {
      throw new PolicyError(409, "Another account already uses this code.", "code");
    }
    const mapped = prior && view.mappings.some(mapping => mapping.accountId === prior.id);
    if (mapped && !data.isActive) throw new PolicyError(409, "Remap this account before deactivating it.", "isActive");
    if (prior && (prior.code !== data.code || prior.classification !== data.classification || prior.isContra !== data.isContra)) {
      const posted = await rows("cooperative_gl_lines", "id", { filter: { account_id: { _eq: prior.id } }, limit: 1 });
      if (mapped || posted.length) throw new PolicyError(409, "This account’s code and classification are fixed while it is mapped or used in the ledger.");
    }
    const describe = (account: typeof data) => ({
      code: account.code, name: account.name, classification: account.classification, isContra: account.isContra, isActive: account.isActive,
    });
    return {
      collection: "cooperative_gl_accounts", id: prior?.id, key: String(prior?.id ?? data.code),
      subject: "GL_ACCOUNT", title: `${data.code} · ${data.name}`, before: prior && describe(prior), after: describe(data),
      payload: { code: data.code, name: data.name, classification: data.classification, is_contra: flag(data.isContra), is_active: flag(data.isActive) },
    };
  }

  const { purpose, accountId } = command.data;
  const definition = accountPurposes.find(row => row[0] === purpose);
  const account = existing(view.accounts, accountId);
  if (!definition || !account?.isActive || account.classification !== definition[3] || account.isContra !== (definition[4] ?? false)) {
    throw new PolicyError(422, "Choose an active account with the required classification.", "accountId");
  }
  const mapping = view.mappings.find(row => row.purpose === purpose);
  const previous = view.accounts.find(row => row.id === mapping?.accountId);
  return {
    collection: "cooperative_account_mappings", id: mapping?.id, key: purpose, subject: "ACCOUNT_MAPPING", title: definition[2],
    before: previous && { account: `${previous.code} · ${previous.name}` }, after: { account: `${account.code} · ${account.name}` },
    payload: { purpose, account_id: accountId },
  };
}

export async function savePolicies(command: PolicySave, actor: Actor, userAgent: string | null) {
  const state = await readPolicies();
  if (state.view.revision !== command.expectedRevision) throw stalePolicy();
  const save = await prepare(command, state);
  if (isDeepStrictEqual(save.before, save.after)) return { revision: state.view.revision, saved: false };
  const next = state.view.revision + 1;
  const change = cooperativeAuditEvent(actor, {
    subject: { type: save.subject, id: save.key }, action: save.before ? "POLICY_CHANGED" : "POLICY_CREATED",
    before: save.before, after: save.after, userAgent,
  });
  const changed = Object.keys(change.after_state ?? {}).map(key => {
    const newValue = policyValue(key, change.after_state?.[key]);
    return save.before ? `${policyFieldLabel(key)} ${policyValue(key, change.before_state?.[key])} → ${newValue}`
      : `${policyFieldLabel(key)} ${newValue}`;
  });
  const event = {
    ...change, policy_revision: next, actor_name: actor.actorName.slice(0, 255),
    policy_summary: [save.title.replace(/\s+/g, " "), ...changed].join("\n").slice(0, 6000),
  };
  const method = save.id || save.collection === "cooperative_policy_settings" ? "PATCH" : "POST";
  try {
    const response = await cooperativeDirectus(`/items/${save.collection}${save.id ? `/${save.id}` : ""}?fields=id`, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...save.payload, last_policy_event_id: event }),
    }, 30_000);
    await response.body?.cancel();
  } catch (error) {
    if (await revision().catch(() => state.view.revision) !== state.view.revision) throw stalePolicy();
    throw error;
  }
  return { revision: next, saved: true };
}

export async function getPolicyHistory(query: URLSearchParams) {
  const areas = Object.entries(policyAreas);
  const area = query.get("area") ?? "";
  const text = (query.get("q") ?? "").trim().slice(0, 200);
  const page = Number(query.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger((page - 1) * pageSize) ||
      (area && !areas.some(([, label]) => label === area))) throw new PolicyError(400, "Choose a valid history filter.");
  const filter = { _and: [
    { policy_revision: { _nnull: true } },
    { entity_type: { _in: areas.filter(([, label]) => !area || label === area).map(([key]) => key) } },
    ...text.split(/\s+/).filter(Boolean).map(term => ({
      _or: [{ policy_summary: { _icontains: term } }, { actor_name: { _icontains: term } }],
    })),
  ] };
  const data = await rows("cooperative_audit_events", "id,policy_revision,entity_type,occurred_at,actor_name,policy_summary,before_state,after_state", {
    filter, sort: "-policy_revision", limit: pageSize + 1, offset: (page - 1) * pageSize,
  });
  const details = z.record(z.string(), z.unknown()).nullable();
  return {
    items: data.slice(0, pageSize).map((row): HistoryEntry => ({
      id: int.parse(row.id), revision: int.parse(row.policy_revision), area: policyAreas[row.entity_type as Subject],
      actorName: z.string().parse(row.actor_name), occurredAt: manila.format(new Date(`${row.occurred_at}Z`)),
      summary: z.string().parse(row.policy_summary).split("\n", 1)[0],
      before: details.parse(row.before_state), after: details.parse(row.after_state),
    })),
    hasMore: data.length > pageSize, page,
  };
}
