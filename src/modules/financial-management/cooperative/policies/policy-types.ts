import { z } from "zod";

const uint16 = z.number().int().min(0).max(65_535);
const id = z.number().int().positive().max(4_294_967_295);
const name = (min: number, max: number) => z.string().trim().min(min).max(max);
const positive = (value: string) => Number(value) > 0;
const decimal = (whole: number, fraction: number) => z.string().trim()
  .regex(new RegExp(`^\\d{1,${whole}}(?:\\.\\d{1,${fraction}})?$`), "Enter a decimal amount in range.")
  .transform(value => {
    const [integer, decimals = ""] = value.split(".");
    return `${BigInt(integer)}.${decimals.padEnd(fraction, "0")}`;
  });

export const money = decimal(10, 2);
const percent = decimal(3, 6).refine(value => Number(value) <= 100, "Enter a percentage from 0 to 100.");
const monthlyRate = percent.refine(value => Number(value) <= 10, "Enter a monthly rate from 0 to 10.");
const floorPercent = decimal(3, 4).refine(value => Number(value) <= 100, "Enter a percentage from 0 to 100.");

export const settingsSchema = z.discriminatedUnion("floorMode", [
  z.object({
    floorMode: z.literal("FIXED"),
    membershipFee: money, minimumSavings: money, maintainingBalance: money, withdrawalsPerYear: uint16,
    paymentOrder: z.enum(["PENALTIES_FIRST", "INSTALLMENTS_FIRST"]),
    floorFixedAmount: money, floorPercent: z.null(),
  }),
  z.object({
    floorMode: z.literal("PERCENT"),
    membershipFee: money, minimumSavings: money, maintainingBalance: money, withdrawalsPerYear: uint16,
    paymentOrder: z.enum(["PENALTIES_FIRST", "INSTALLMENTS_FIRST"]),
    floorFixedAmount: z.null(), floorPercent,
  }),
]);

export const loanMethods = { diminishing: "Diminishing balance", flat: "Flat", markup: "Markup" } as const;
export const repaymentFrequencies = { cutoff: "Every cutoff", monthly: "Monthly" } as const;
export const repaymentModes = { payroll: "Salary deduction", otc: "Over the counter" } as const;
export const policyAreas = {
  LOAN_PRODUCT: "Loan products",
  POLICY_SETTINGS: "Savings & membership",
  DOCUMENT_TYPE: "Required documents",
  DOCUMENT_RULE: "Required documents",
  GL_ACCOUNT: "Chart of accounts & mappings",
  ACCOUNT_MAPPING: "Chart of accounts & mappings",
} as const;

const unique = <T,>(list: T[]) => new Set(list).size === list.length;
const loanRule = z.object({ documentTypeId: id, enforcement: z.enum(["WARN", "BLOCK"]) });
const goodsItem = z.object({ id: id.optional(), name: name(1, 120), price: money.refine(positive, "Enter a positive price.") });
const reservedPrefixes = ["MA", "LA", "WD", "CL", "OR", "JV"];
const productFields = {
  id: id.optional(),
  name: name(3, 80),
  shortName: z.string().trim().max(50),
  prefix: z.string().regex(/^[A-Z]{2,4}$/, "Use 2–4 uppercase letters.")
    .refine(value => !reservedPrefixes.includes(value), "This prefix is reserved for Cooperative documents."),
  isOpen: z.boolean(),
  description: z.string().trim().max(4000),
  termsMonths: z.array(z.number().int().min(1).max(120)).min(1).max(120)
    .refine(unique, "List each term once.").transform(values => values.sort((a, b) => a - b)),
  frequencies: z.array(z.enum(["cutoff", "monthly"])).min(1).max(2).refine(unique),
  modes: z.array(z.enum(["payroll", "otc"])).min(1).max(2).refine(unique),
  limitType: z.enum(["SAVINGS_MULTIPLE", "FIXED", "NONE"]),
  savingsMultiple: decimal(5, 4).refine(positive, "Enter a positive savings multiple.").nullable(),
  fixedCeiling: money.refine(positive, "Enter a positive ceiling.").nullable(),
  minimumMembershipMonths: uint16,
  penaltyPercent: percent,
  graceDays: uint16,
  processingFee: money,
  documentRules: z.array(loanRule).refine(rules => unique(rules.map(rule => rule.documentTypeId)), "Choose each document once."),
};

export const productSchema = z.discriminatedUnion("kind", [
  z.object({
    ...productFields, kind: z.literal("CASH"),
    rateMin: monthlyRate, rateDefault: monthlyRate, rateMax: monthlyRate,
    methods: z.array(z.enum(["diminishing", "flat"])).min(1).max(2).refine(unique),
    markup: z.null(), items: z.tuple([]),
  }),
  z.object({
    ...productFields, kind: z.literal("GOODS"),
    rateMin: z.null(), rateDefault: z.null(), rateMax: z.null(), methods: z.tuple([z.literal("markup")]),
    markup: percent, items: z.array(goodsItem).min(1, "Add at least one priced item.")
      .refine(items => unique(items.flatMap(item => item.id === undefined ? [] : [item.id])), "Each item must be listed once."),
  }),
]).superRefine((product, ctx) => {
  if (product.kind === "CASH" && (Number(product.rateMin) > Number(product.rateDefault) ||
      Number(product.rateDefault) > Number(product.rateMax))) {
    ctx.addIssue({ code: "custom", path: ["rateDefault"], message: "The default rate must be within the minimum and maximum." });
  }
  if ((product.limitType === "SAVINGS_MULTIPLE") !== (product.savingsMultiple !== null)) {
    ctx.addIssue({ code: "custom", path: ["savingsMultiple"], message: "Enter a positive multiple for a savings-based limit." });
  }
  if ((product.limitType === "FIXED") !== (product.fixedCeiling !== null)) {
    ctx.addIssue({ code: "custom", path: ["fixedCeiling"], message: "Enter a positive ceiling for a fixed limit." });
  }
});

export const documentTypeSchema = z.object({ id: id.optional(), name: name(2, 60), isActive: z.boolean() });
export const documentRuleSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("MEMBERSHIP"), documentTypeId: id, enforcement: z.literal("CHECK"), isActive: z.boolean() }),
  z.object({ scope: z.literal("CLEARANCE"), documentTypeId: id, enforcement: z.enum(["WARN", "BLOCK"]), isActive: z.boolean() }),
]);
export const accountSchema = z.object({
  id: id.optional(), code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/).transform(value => value.toUpperCase()),
  name: name(1, 120), classification: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  isContra: z.boolean(), isActive: z.boolean(),
});

export const accountPurposes = [
  ["CASH_ON_HAND", "1010", "Cash on hand", "ASSET"],
  ["CASH_IN_BANK", "1020", "Cash in bank", "ASSET"],
  ["CASH_LOAN_PRINCIPAL", "1110", "Cash loan principal receivable", "ASSET"],
  ["GOODS_LOAN_PRINCIPAL", "1120", "Installment sales receivable", "ASSET"],
  ["INTEREST_MARKUP_RECEIVABLE", "1130", "Interest and markup receivable", "ASSET"],
  ["PENALTIES_RECEIVABLE", "1140", "Penalties receivable", "ASSET"],
  ["DUE_FROM_EMPLOYER", "1150", "Due from employer", "ASSET"],
  ["LOAN_LOSS_ALLOWANCE", "1190", "Allowance for probable loan losses", "ASSET", true],
  ["MEMBER_SAVINGS", "2010", "Members' savings deposits", "LIABILITY"],
  ["VENDOR_PAYABLE", "2020", "Accounts payable to vendors", "LIABILITY"],
  ["SAVINGS_INTEREST_PAYABLE", "2030", "Interest on savings payable", "LIABILITY"],
  ["PATRONAGE_REFUND_PAYABLE", "2040", "Patronage refund payable", "LIABILITY"],
  ["DUE_TO_DEPARTING_MEMBERS", "2050", "Due to departing members", "LIABILITY"],
  ["RESERVE_FUND", "3010", "Reserve fund", "EQUITY"],
  ["EDUCATION_AND_TRAINING_FUND", "3020", "Education and training fund", "EQUITY"],
  ["UNDIVIDED_NET_SURPLUS", "3030", "Undivided net surplus", "EQUITY"],
  ["LOAN_INTEREST_INCOME", "4010", "Loan interest income", "INCOME"],
  ["INSTALLMENT_MARKUP_INCOME", "4020", "Installment sales markup income", "INCOME"],
  ["PENALTY_INCOME", "4030", "Penalty income", "INCOME"],
  ["MEMBERSHIP_FEE_INCOME", "4040", "Membership fees", "INCOME"],
  ["LOAN_PROCESSING_FEE_INCOME", "4050", "Loan processing fees", "INCOME"],
  ["LOAN_LOSS_PROVISION", "5010", "Provision for probable loan losses", "EXPENSE"],
] as const;

export const mappingSchema = z.object({
  purpose: z.enum(accountPurposes.map(([key]) => key)),
  accountId: id,
});
const revision = z.number().int().min(0).max(2_147_483_646);

export const policySaveSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("settings"), expectedRevision: revision, data: settingsSchema }),
  z.object({ section: z.literal("product"), expectedRevision: revision, data: productSchema }),
  z.object({ section: z.literal("documentType"), expectedRevision: revision, data: documentTypeSchema }),
  z.object({ section: z.literal("documentRule"), expectedRevision: revision, data: documentRuleSchema }),
  z.object({ section: z.literal("account"), expectedRevision: revision, data: accountSchema }),
  z.object({ section: z.literal("mapping"), expectedRevision: revision, data: mappingSchema }),
]);

export type PolicySave = z.output<typeof policySaveSchema>;
export type Settings = z.output<typeof settingsSchema>;
export type ProductDraft = z.output<typeof productSchema>;
export type Product = ProductDraft & { id: number; code: string };
export type DocumentType = z.output<typeof documentTypeSchema> & { id: number; code: string };
export type DocumentRule = z.output<typeof documentRuleSchema> & { id: number };
export type PolicyAccount = z.output<typeof accountSchema> & { id: number };
export type PolicyMapping = z.output<typeof mappingSchema> & { id: number };
export type PolicyState = {
  revision: number;
  settings: Settings | null;
  products: Product[];
  documentTypes: DocumentType[];
  documentRules: DocumentRule[];
  accounts: PolicyAccount[];
  mappings: PolicyMapping[];
};
export type HistoryEntry = {
  id: number;
  revision: number;
  area: typeof policyAreas[keyof typeof policyAreas];
  actorName: string;
  occurredAt: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
