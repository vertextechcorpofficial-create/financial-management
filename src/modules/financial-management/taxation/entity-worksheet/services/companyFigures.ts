import "server-only";

import type {
  ExpenseBreakdown,
  ExpenseBucket,
  IntercompanyMatch,
  QuarterFigures,
  RegistryCompany,
} from "../types";
import { VAT_RATE } from "../constants";
import { listRows, sumFields, CompanyRequestError, groupedByDate } from "./companyClient";
import { listItems } from "./directus";
import { loadSttSales, loadSpringExpenses, loadSpringSales } from "./stt.client";

/**
 * Where every tax figure comes from.
 *
 * One grouped request per collection per company per year (`groupBy` the date
 * column) and the quarter is bucketed here, so a nine-company overview costs about
 * forty requests instead of a thousand. VAT-inclusive amounts are the norm in this
 * ERP: `total_amount` includes VAT and `net_amount` mirrors it, so the VAT-exclusive
 * base is `total_amount - vat_amount`.
 *
 * Sales are read from the itemized Spring view when the company has one, because that
 * is the view the STT sales report sums; the invoice register is the fallback.
 */

const CANCELLED_SALES = ["Cancelled", "Void", "cancelled", "void"];

const AMOUNT = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
const COUNT = new Intl.NumberFormat("en-PH");

/**
 * Server copy reaches the screen verbatim, so a transport code never belongs in it (W6):
 * "refused the request (431)" reads as a code fragment, not a sentence.
 */
function plain(text: string): string {
  return text
    .replace(/\s*\(\d{3}\)\s*/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * `chart_of_accounts.account_type` values a return may deduct: 7 cost of goods sold,
 * 8 cost of services, 9 operating expenses, 10 finance costs. Everything else the
 * disbursement ledger carries (inventory, receivables, loans, taxes payable, equity)
 * is a balance-sheet movement, not a deduction.
 */
const DEDUCTIBLE_TYPES = new Set(["7", "8", "9", "10"]);

/** The two of those four that belong to line 3 (cost of sales), not line 6. */
const COST_TYPES = new Set(["7", "8"]);

interface DeductibleAccounts {
  /** Every account a return may subtract, cost of sales included. */
  ids: number[];
  /** The cost-of-sales and cost-of-services accounts, which go to line 3. */
  cost: Set<number>;
}

async function loadDeductibleAccounts(company: RegistryCompany): Promise<DeductibleAccounts | null> {
  try {
    const rows = await listRows<{ coa_id?: number | string; account_type?: string | number | null }>(
      company.baseUrl,
      company.token,
      company.code,
      "chart_of_accounts",
      { fields: ["coa_id", "account_type"], limit: -1 },
    );
    const ids: number[] = [];
    const cost = new Set<number>();
    for (const row of rows) {
      const type = String(row.account_type ?? "").trim();
      if (!DEDUCTIBLE_TYPES.has(type)) continue;
      const id = Number(row.coa_id);
      if (!Number.isFinite(id) || id <= 0) continue;
      ids.push(id);
      if (COST_TYPES.has(type)) cost.add(id);
    }
    return ids.length > 0 ? { ids, cost } : null;
  } catch {
    return null;
  }
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  "1": "Assets",
  "2": "Property, plant and equipment",
  "3": "Liabilities",
  "4": "Long-term liabilities",
  "5": "Equity",
  "6": "Income",
  "7": "Cost of goods sold",
  "8": "Cost of services",
  "9": "Operating expenses",
  "10": "Finance costs",
  "11": "Other income",
};

interface AccountDirectory {
  typeById: Map<number, string>;
  titleById: Map<number, string>;
}

async function loadAccountDirectory(company: RegistryCompany): Promise<AccountDirectory | null> {
  try {
    const rows = await listRows<{
      coa_id?: number | string;
      account_type?: string | number | null;
      account_title?: string | null;
    }>(company.baseUrl, company.token, company.code, "chart_of_accounts", {
      fields: ["coa_id", "account_type", "account_title"],
      limit: -1,
    });
    const typeById = new Map<number, string>();
    const titleById = new Map<number, string>();
    for (const row of rows) {
      const id = Number(row.coa_id);
      if (!Number.isFinite(id) || id <= 0) continue;
      typeById.set(id, String(row.account_type ?? "").trim());
      titleById.set(id, String(row.account_title ?? "").trim());
    }
    return typeById.size > 0 ? { typeById, titleById } : null;
  } catch {
    return null;
  }
}

/**
 * Where the deduction line comes from, account type by account type.
 *
 * The disbursement ledger carries everything that left the bank: stock, loan repayments, tax
 * payments, asset purchases. Only cost of sales, cost of services, operating expense and
 * finance cost reach the return, so the panel shows all three buckets — what was disbursed,
 * which part lands on line 3, which on line 6, and what stays a balance-sheet movement.
 *
 * The itemized Spring view is read first because it carries the account on every line; when it
 * answers with nothing, the same ledger the engine summed is walked directly, so the panel
 * always describes the source the figures actually came from.
 */
export async function loadExpenseBreakdown(
  company: RegistryCompany,
  taxYear: number,
  options: { springToken?: string | null } = {},
): Promise<ExpenseBreakdown | null> {
  const directory = await loadAccountDirectory(company);
  if (!directory) return null;

  // The itemized view needs its own token; without one the ledger below answers instead.
  const spring =
    company.springUrl && options.springToken
      ? await loadSpringExpenses(company, options.springToken, taxYear)
      : { lines: null };

  if (!spring.lines || spring.lines.length === 0) {
    return loadLedgerBreakdown(company, taxYear, directory);
  }

  const byType = new Map<string, number>();
  const byAccount = new Map<number, number>();
  for (const line of spring.lines) {
    const type = directory.typeById.get(line.coaId) ?? "";
    byType.set(type, (byType.get(type) ?? 0) + line.amount);
    if (DEDUCTIBLE_TYPES.has(type)) byAccount.set(line.coaId, (byAccount.get(line.coaId) ?? 0) + line.amount);
  }
  return summariseBreakdown(byType, byAccount, directory, "SPRING");
}

function bucketOf(type: string): ExpenseBucket {
  if (COST_TYPES.has(type)) return "COST_OF_SALES";
  if (DEDUCTIBLE_TYPES.has(type)) return "DEDUCTIONS";
  if (type === "6" || type === "11") return "INCOME_ADJUSTMENT";
  if (!type) return "UNCLASSIFIED";
  return "BALANCE_SHEET";
}

function summariseBreakdown(
  byType: Map<string, number>,
  byAccount: Map<number, number>,
  directory: AccountDirectory,
  source: ExpenseBreakdown["source"],
): ExpenseBreakdown {
  const rows = [...byType.entries()]
    .map(([type, amount]) => ({
      type,
      label: ACCOUNT_TYPE_LABELS[type] ?? (type ? `Other (type ${type})` : "Not classified in the chart of accounts"),
      amount: Math.round(amount * 100) / 100,
      bucket: bucketOf(type),
    }))
    .sort((left, right) => right.amount - left.amount);

  const accounts = [...byAccount.entries()]
    .map(([coaId, amount]) => ({
      title: directory.titleById.get(coaId) || `Account ${coaId}`,
      type: directory.typeById.get(coaId) ?? "",
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 8);

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const costOfSales = rows.filter((row) => row.bucket === "COST_OF_SALES").reduce((sum, row) => sum + row.amount, 0);
  const deductible = rows.filter((row) => row.bucket === "DEDUCTIONS").reduce((sum, row) => sum + row.amount, 0);
  return {
    total: Math.round(total * 100) / 100,
    costOfSales: Math.round(costOfSales * 100) / 100,
    deductible: Math.round(deductible * 100) / 100,
    rows,
    accounts,
    source,
  };
}

const IN_CHUNK_SIZE = 100;

function chunkIds<T>(items: T[], size = IN_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** The same breakdown from the ledger the engine summed, for instances with no itemized view. */
async function loadLedgerBreakdown(
  company: RegistryCompany,
  taxYear: number,
  directory: AccountDirectory,
): Promise<ExpenseBreakdown | null> {
  const from = `${taxYear}-01-01`;
  const to = `${taxYear}-12-31`;
  try {
    const vouchers = await listRows<{ id?: number | string | null; transaction_date?: string | null }>(
      company.baseUrl,
      company.token,
      company.code,
      "disbursement",
      {
        fields: ["id", "transaction_date"],
        filter: { _and: [{ transaction_date: { _gte: from } }, { transaction_date: { _lte: to } }] },
        limit: -1,
      },
    );
    const ids = vouchers.map((voucher) => Number(voucher.id)).filter((id) => Number.isFinite(id) && id > 0);
    if (ids.length === 0) return null;

    // Chunk `_in` arrays to keep GET query strings well under HTTP 431 header limits.
    const lines: Array<{ amount?: number | string | null; coa_id?: number | string | null }> = [];
    for (const batch of chunkIds(ids)) {
      const part = await listRows<{ amount?: number | string | null; coa_id?: number | string | null }>(
        company.baseUrl,
        company.token,
        company.code,
        "disbursement_payables",
        { fields: ["amount", "coa_id"], filter: { disbursement_id: { _in: batch } }, limit: -1 },
      );
      lines.push(...part);
    }
    if (lines.length === 0) return null;

    const byType = new Map<string, number>();
    const byAccount = new Map<number, number>();
    for (const line of lines) {
      const coaId = Number(line.coa_id);
      if (!Number.isFinite(coaId)) continue;
      const type = directory.typeById.get(coaId) ?? "";
      const amount = Number(line.amount) || 0;
      byType.set(type, (byType.get(type) ?? 0) + amount);
      if (DEDUCTIBLE_TYPES.has(type)) byAccount.set(coaId, (byAccount.get(coaId) ?? 0) + amount);
    }
    return summariseBreakdown(byType, byAccount, directory, "LEDGER");
  } catch {
    return null;
  }
}

export interface FigureResult {
  figures: QuarterFigures[];
  matches: IntercompanyMatch[];
  notices: string[];
  /** Sources that could not be read at all, e.g. "sales". The figures are then unknown, not zero. */
  failed: string[];
  salesSource: "STT_VIEW" | "INVOICE_LINES" | "INVOICE_HEADERS";
}

function emptyQuarter(): QuarterFigures {
  return {
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
  };
}

function quarterOf(dateValue: string): number {
  const month = Number(dateValue.slice(5, 7));
  if (!month) return -1;
  return Math.min(3, Math.floor((month - 1) / 3));
}

/**
 * Withholding the customers' 2307 certificates already credit.
 *
 * A customer withholds the tax and then issues the certificate, so the register and
 * `sales_invoice.ewt_amount` describe the same money. Where a quarter has certificates the
 * register wins — it is the document the return is filed against — and adding both would
 * count the same withholding twice. Null means the register could not be read at all.
 *
 * The certificates live in the central Directus (that is where the 2307 desk writes them),
 * not in the company's own instance, which has no `tax_2307` table.
 */
async function loadCertificateCredits(
  company: RegistryCompany,
  taxYear: number,
): Promise<{ byQuarter: number[]; count: number } | null> {
  try {
    const { rows } = await listItems<{
      period_key?: string | null;
      tax_withheld?: number | string | null;
    }>("tax_2307", {
      fields: ["period_key", "tax_withheld"],
      filter: {
        _and: [
          { company_id: { _eq: company.companyId } },
          { tax_year: { _eq: taxYear } },
          { direction: { _eq: "RECEIVED" } },
        ],
      },
      limit: -1,
    });
    const byQuarter = [0, 0, 0, 0];
    let count = 0;
    for (const row of rows) {
      const index = ["Q1", "Q2", "Q3", "Q4"].indexOf(String(row.period_key ?? "").toUpperCase());
      if (index < 0) continue;
      byQuarter[index] += Number(row.tax_withheld ?? 0) || 0;
      count += 1;
    }
    return { byQuarter, count };
  } catch {
    return null;
  }
}

/** Same quarter rule, exported for per-line sums that never become grouped rows. */
export function quarterIndex(dateValue: string): number {
  return quarterOf(dateValue);
}

/**
 * Payable lines carry their own `date`, which is null on some rows − filtering on it silently
 * drops money. The voucher's `transaction_date` is always present, so a line is attributed to
 * the quarter its disbursement was booked in, and the sum matches the disbursement header.
 */
async function payableRowsByDisbursementDate(
  company: RegistryCompany,
  from: string,
  to: string,
  accounts: DeductibleAccounts,
): Promise<Array<{ date: string; sums: Record<string, number> }>> {
  const vouchers = await listRows<{ id: number; transaction_date: string | null }>(
    company.baseUrl,
    company.token,
    company.code,
    "disbursement",
    {
      fields: ["id", "transaction_date"],
      filter: { _and: [{ transaction_date: { _gte: from } }, { transaction_date: { _lte: to } }] },
      limit: -1,
    },
  );
  const dateOf = new Map<number, string>();
  for (const voucher of vouchers) {
    if (voucher.transaction_date) dateOf.set(Number(voucher.id), String(voucher.transaction_date).slice(0, 10));
  }
  if (dateOf.size === 0) return [];

  // Chunk `_in` arrays so high-volume entities never exceed GET URL / header size (HTTP 431).
  const lines: Array<{ disbursement_id: number; amount: number | string | null; coa_id: number | null }> = [];
  for (const batch of chunkIds([...dateOf.keys()])) {
    const part = await listRows<{ disbursement_id: number; amount: number | string | null; coa_id: number | null }>(
      company.baseUrl,
      company.token,
      company.code,
      "disbursement_payables",
      {
        fields: ["disbursement_id", "amount", "coa_id"],
        filter: { _and: [{ disbursement_id: { _in: batch } }, { coa_id: { _in: accounts.ids } }] },
        limit: -1,
      },
    );
    lines.push(...part);
  }

  const byDate = new Map<string, { amount: number; costAmount: number }>();
  for (const line of lines) {
    const date = dateOf.get(Number(line.disbursement_id));
    if (!date) continue;
    const amount = Number(line.amount) || 0;
    const current = byDate.get(date) ?? { amount: 0, costAmount: 0 };
    current.amount += amount;
    if (accounts.cost.has(Number(line.coa_id))) current.costAmount += amount;
    byDate.set(date, current);
  }

  return [...byDate.entries()].map(([date, sums]) => ({ date, sums }));
}

function bucket(  figures: QuarterFigures[],
  rows: Array<{ date: string; sums: Record<string, number> }>,
  apply: (quarter: QuarterFigures, sums: Record<string, number>) => void,
) {
  for (const row of rows) {
    const index = quarterOf(row.date);
    if (index < 0) continue;
    apply(figures[index], row.sums);
  }
}

interface GroupPeer {
  company: RegistryCompany;
  customerCodes: string[];
  supplierNeedles: string[];
}

async function resolveGroupPeers(
  company: RegistryCompany,
  peers: RegistryCompany[],
): Promise<{ peers: GroupPeer[]; notices: string[] }> {
  const notices: string[] = [];
  if (peers.length === 0) return { peers: [], notices };

  const codes = peers.map((peer) => peer.code).filter(Boolean);
  const tins = peers.map((peer) => peer.tin).filter((tin): tin is string => Boolean(tin));

  let customers: Array<{ customer_code?: string | null; customer_tin?: string | null }> = [];
  try {
    customers = await listRows(company.baseUrl, company.token, company.code, "customer", {
      fields: ["customer_code", "customer_tin"],
      filter: {
        _or: [
          ...(codes.length ? [{ customer_code: { _in: codes } }] : []),
          ...(tins.length ? [{ customer_tin: { _in: tins } }] : []),
        ],
      },
      limit: 500,
    });
  } catch (error) {
    const message = error instanceof CompanyRequestError ? error.message : String(error);
    notices.push(`Intercompany sales could not be matched: ${message}`);
  }

  const resolved = peers.map<GroupPeer>((peer) => {
    const matched = customers
      .filter(
        (row) =>
          (row.customer_code && row.customer_code === peer.code) ||
          (peer.tin && row.customer_tin && row.customer_tin.replace(/\D/g, "") === peer.tin.replace(/\D/g, "")),
      )
      .map((row) => String(row.customer_code ?? ""))
      .filter(Boolean);

    return {
      company: peer,
      customerCodes: Array.from(new Set(matched)),
      supplierNeedles: [peer.name, peer.code].filter(Boolean),
    };
  });

  return { peers: resolved, notices };
}

export async function loadFigures(
  company: RegistryCompany,
  taxYear: number,
  peers: RegistryCompany[],
  options: { intercompany?: boolean; vatRate?: number; springToken?: string | null } = {},
): Promise<FigureResult> {
  const notices: string[] = [];
  const failed: string[] = [];
  const figures = [0, 1, 2, 3].map(emptyQuarter);
  const from = `${taxYear}-01-01`;
  const to = `${taxYear}-12-31`;
  const vatRate = options.vatRate ?? VAT_RATE;
  let salesSource: FigureResult["salesSource"] = "INVOICE_HEADERS";

  try {
    const sales = await groupedByDate(company.baseUrl, company.token, company.code, "sales_invoice", "invoice_date", {
      total_amount: "sum",
      vat_amount: "sum",
      discount_amount: "sum",
    }, from, to, { transaction_status: { _nin: CANCELLED_SALES } });

    bucket(figures, sales, (quarter, sums) => {
      quarter.sales += (sums.total_amount ?? 0) - (sums.vat_amount ?? 0);
      quarter.salesVat += sums.vat_amount ?? 0;
      quarter.discounts += sums.discount_amount ?? 0;
    });

    // Same view the sales report sums, one quarter at a time. The by-channel summary is cheaper but
    // left ₱21.7M of 2026 revenue out, so it is only reached when the itemized view fails.
    const springSales = options.springToken
      ? await loadSpringSales(company, options.springToken, taxYear)
      : { sales: null, reason: "no Spring session token was forwarded" as string | null };
    const stt = springSales.sales ? springSales : await loadSttSales(company, taxYear);
    if (stt.sales) {
      const gross = stt.sales.quarters;
      const net = gross.map((value) => value / (1 + vatRate));
      figures.forEach((quarter, index) => {
        if (gross[index] > 0) {
          quarter.sales = net[index];
          quarter.salesVat = gross[index] - net[index];
        }
      });
      const yearGross = gross.reduce((total, value) => total + value, 0);
      const yearRegister = figures.reduce((total, quarter) => total + quarter.sales + quarter.salesVat, 0);
      salesSource = "STT_VIEW";
      // One fact per sentence, and no comparison when the two bases agree: the old copy printed
      // raw decimals and a "differ by 0.00" beside them, which read like a contradiction (W6).
      const sentences = [
        `Sales come from the itemized sales view: ${COUNT.format(stt.sales.lines)} product lines on ${COUNT.format(stt.sales.invoices)} invoices, ${AMOUNT.format(yearGross)} including VAT.`,
      ];
      if (Math.abs(yearRegister - yearGross) >= 0.005) {
        sentences.push(
          `The invoice register totals ${AMOUNT.format(yearRegister)} on the same basis, so the two differ by ${AMOUNT.format(yearRegister - yearGross)}.`,
        );
      }
      notices.push(sentences.join(" "));
      if (stt.reason) notices.push(`Only part of the year came from that view: ${stt.reason}.`);
    } else if (stt.reason) {
      notices.push(`Sales fall back to the invoice register because ${stt.reason}.`);
    }

    // `ewt_amount` does not exist on every instance (Vertex has no such column, and Directus fails
    // the whole grouped query when one summed field is unknown). Its own request keeps the sales
    // figures instead of losing them to an optional column.
    try {
      const withheld = await groupedByDate(
        company.baseUrl,
        company.token,
        company.code,
        "sales_invoice",
        "invoice_date",
        { ewt_amount: "sum" },
        from,
        to,
        { transaction_status: { _nin: CANCELLED_SALES } },
      );
      bucket(figures, withheld, (quarter, sums) => {
        quarter.cwt += sums.ewt_amount ?? 0;
      });
    } catch {
      notices.push("This instance has no tax-withheld column on its sales invoices, so credits are zero.");
    }

    const certificates = await loadCertificateCredits(company, taxYear);
    if (certificates === null) {
      notices.push("The 2307 certificate register could not be read, so line 11 shows invoice withholding only.");
    } else {
      const replaced = figures.filter((quarter, index) => {
        const credited = certificates.byQuarter[index];
        if (credited <= 0) return false;
        quarter.cwt = credited;
        return true;
      }).length;
      if (replaced > 0) {
        notices.push(
          `Line 11 reads ${certificates.count} received 2307 certificate${certificates.count === 1 ? "" : "s"} for ${replaced} quarter${replaced === 1 ? "" : "s"}; invoice withholding is used for quarters with no certificate.`,
        );
      }
    }
  } catch (error) {
    failed.push("sales");
    notices.push(`Sales invoices could not be read: ${plain(error instanceof Error ? error.message : String(error))}`);
  }

  // The ledger answer (cost of goods sold and cost of services accounts) is loaded below with
  // the deductions; this block adds the product standard cost reading (quantity ×
  // `products.cost_per_unit`) for instances whose sales detail carries a unit cost.
  try {
    const lines = await groupedByDate(
      company.baseUrl,
      company.token,
      company.code,
      "sales_invoice_details",
      "created_date",
      { total_amount: "sum" },
      from,
      to,
    );
    const lineTotal = lines.reduce((total, row) => total + (row.sums.total_amount ?? 0), 0);
    if (lineTotal > 0) {
      const byProduct = await groupedByDate(
        company.baseUrl,
        company.token,
        company.code,
        "sales_invoice_details",
        "product_id",
        { quantity: "sum" },
        from,
        to,
      );
      const products = await listRows<{ product_id?: number | string | null; cost_per_unit?: number | string | null }>(
        company.baseUrl,
        company.token,
        company.code,
        "products",
        { fields: ["product_id", "cost_per_unit"], limit: -1 },
      );
      const costById = new Map(products.map((row) => [String(row.product_id ?? ""), Number(row.cost_per_unit ?? 0) || 0]));
      let cost = 0;
      let costedLines = 0;
      for (const row of byProduct) {
        const unitCost = costById.get(String(row.date));
        if (!unitCost) continue;
        cost += (row.sums.quantity ?? 0) * unitCost;
        costedLines += 1;
      }
      if (cost > 0) {
        const ratio = cost / lineTotal;
        bucket(figures, lines, (quarter, sums) => {
          quarter.cogsProductCost += (sums.total_amount ?? 0) * ratio;
        });
        notices.push(
          `Product standard cost covers ${COUNT.format(costedLines)} of ${COUNT.format(byProduct.length)} sold products; line amounts carry the rest at cost ${(ratio * 100).toFixed(1)}% of price.`,
        );
      } else {
        notices.push("No product carries a standard cost, so cost of sales from product cost is zero.");
      }
      if (salesSource !== "STT_VIEW") salesSource = "INVOICE_LINES";
    }
  } catch (error) {
    // Falling back to the purchase-order basis is fine; falling back silently is not, so the
    // failure is named in the payload instead of leaving a zero that looks like a real cost.
    failed.push("sales detail lines");
    notices.push(
      `The sales detail lines could not be read (${plain(
        error instanceof Error ? error.message : String(error),
      )}), so product standard cost is zero and line 5 uses purchase orders.`,
    );
  }

  try {
    const returns = await groupedByDate(company.baseUrl, company.token, company.code, "sales_return", "return_date", {
      total_amount: "sum",
    }, from, to);
    bucket(figures, returns, (quarter, sums) => {
      quarter.returns += sums.total_amount ?? 0;
    });
  } catch {
    // No returns table on this instance; zero is the honest answer.
  }

  try {
    const purchases = await groupedByDate(company.baseUrl, company.token, company.code, "purchase_order", "date", {
      total_amount: "sum",
      vat_amount: "sum",
    }, from, to);
    bucket(figures, purchases, (quarter, sums) => {
      quarter.purchases += (sums.total_amount ?? 0) - (sums.vat_amount ?? 0);
      quarter.purchasesVat += sums.vat_amount ?? 0;
    });
  } catch (error) {
    failed.push("purchases");
    notices.push(`Purchase orders could not be read: ${plain(error instanceof Error ? error.message : String(error))}`);
  }

  /**
   * Line 3 and line 6, not one pooled "deductions" figure. Cost of sales and cost of services
   * are account types 7 and 8, and the deck puts them on line 3 because gross income (and the
   * MCIT base that follows it) is sales less cost of sales, not sales less every expense.
   * Settlements of inventory, receivables, loans and taxes stay out: they move the balance sheet.
   */
  const deductibleAccounts = await loadDeductibleAccounts(company);
  let expenseBooked = false;

  if (deductibleAccounts && company.springUrl && options.springToken) {
    const spring = await loadSpringExpenses(company, options.springToken, taxYear);
    if (spring.lines && spring.lines.length > 0) {
      const allowed = new Set(deductibleAccounts.ids);
      for (const line of spring.lines) {
        if (!allowed.has(line.coaId)) continue;
        const quarter = quarterIndex(line.date);
        if (quarter < 0) continue;
        if (deductibleAccounts.cost.has(line.coaId)) figures[quarter].cogsLedger += line.amount;
        else figures[quarter].expenses += line.amount;
      }
      expenseBooked = true;
      notices.push(
        `Cost of sales and cost of services come from the itemized disbursement view: ${deductibleAccounts.cost.size} ` +
          `account${deductibleAccounts.cost.size === 1 ? "" : "s"} of ${deductibleAccounts.ids.length} deductible ones ` +
          "reach line 3, the rest reach line 6. Inventory, receivables, loans and tax settlements are excluded.",
      );
    } else if (spring.reason) {
      notices.push(`The itemized disbursement view was not used because ${spring.reason}.`);
    }
  }

  if (!expenseBooked && deductibleAccounts) {
    try {
      const payables = await payableRowsByDisbursementDate(company, from, to, deductibleAccounts);
      if (payables.length > 0) {
        bucket(figures, payables, (quarter, sums) => {
          quarter.cogsLedger += sums.costAmount ?? 0;
          quarter.expenses += (sums.amount ?? 0) - (sums.costAmount ?? 0);
        });
        expenseBooked = true;
        notices.push(
          `The disbursement ledger supplies line 3 (cost of sales and cost of services, ${deductibleAccounts.cost.size} ` +
            `accounts) and line 6 (operating and finance costs, ${deductibleAccounts.ids.length - deductibleAccounts.cost.size} accounts). ` +
            "Payments that settled inventory, receivables, loans or taxes are balance-sheet movements and are excluded.",
        );
      }
    } catch (error) {
      notices.push(
        `Disbursement lines could not be read: ${plain(
          error instanceof Error ? error.message : String(error),
        )} Deductions fall back to the expense register.`,
      );
    }
  }

  if (!expenseBooked) {
    try {
      const expenses = await groupedByDate(company.baseUrl, company.token, company.code, "expense", "expense_date", {
        amount: "sum",
      }, from, to, { is_deleted: { _eq: 0 } });
      bucket(figures, expenses, (quarter, sums) => {
        quarter.expenses += sums.amount ?? 0;
      });
    } catch {
      try {
        const legacy = await groupedByDate(company.baseUrl, company.token, company.code, "expenses", "transaction_date", {
          total_expense: "sum",
        }, from, to);
        bucket(figures, legacy, (quarter, sums) => {
          quarter.expenses += sums.total_expense ?? 0;
        });
      } catch {
        notices.push("No expense ledger on this instance, so operating expenses are zero.");
      }
    }
  }

  const matches: IntercompanyMatch[] = [];
  if (options.intercompany !== false) {
    const { peers: groupPeers, notices: peerNotices } = await resolveGroupPeers(company, peers);
    notices.push(...peerNotices);

    for (const peer of groupPeers) {
      let sold = 0;
      if (peer.customerCodes.length > 0) {
        try {
          const icSales = await groupedByDate(
            company.baseUrl,
            company.token,
            company.code,
            "sales_invoice",
            "invoice_date",
            { total_amount: "sum", vat_amount: "sum" },
            from,
            to,
            { customer_code: { _in: peer.customerCodes } },
          );
          bucket(figures, icSales, (quarter, sums) => {
            const base = (sums.total_amount ?? 0) - (sums.vat_amount ?? 0);
            quarter.icSales += base;
            quarter.icSalesByCompany[peer.company.code] = (quarter.icSalesByCompany[peer.company.code] ?? 0) + base;
            sold += base;
          });
        } catch {
          notices.push(`Intercompany sales to ${peer.company.code} could not be read.`);
        }
      }

      let bought = 0;
      for (const needle of peer.supplierNeedles) {
        try {
          const icPurchase = await groupedByDate(
            company.baseUrl,
            company.token,
            company.code,
            "purchase_order",
            "date",
            { total_amount: "sum", vat_amount: "sum" },
            from,
            to,
            { supplier_name: { _icontains: needle } },
          );
          bucket(figures, icPurchase, (quarter, sums) => {
            const base = (sums.total_amount ?? 0) - (sums.vat_amount ?? 0);
            quarter.icPurchases += base;
            quarter.icPurchasesByCompany[peer.company.code] =
              (quarter.icPurchasesByCompany[peer.company.code] ?? 0) + base;
            bought += base;
          });
          if (bought > 0) break;
        } catch {
          // supplier_name is free text and often absent; no match is reported as no match.
        }
      }

      if (sold > 0 || bought > 0) {
        matches.push({
          counterpartyCode: peer.company.code,
          counterpartyName: peer.company.name,
          direction: sold > 0 && bought > 0 ? "BOTH" : sold > 0 ? "SOLD_TO" : "BOUGHT_FROM",
          amount: Math.round((sold + bought) * 100) / 100,
          months: [],
          counterpartyMirrors: "UNKNOWN",
          counterpartyAmount: null,
        });
      }
    }

    if (matches.length === 0) {
      notices.push("No intercompany amount matched a group company in this year's invoices or purchase orders.");
    }
  }

  return { figures, matches, notices, failed, salesSource };
}

/** Year-level totals only − what the group overview needs, in a handful of requests. */
export async function loadYearTotals(company: RegistryCompany, taxYear: number, vatRate: number = VAT_RATE) {
  const from = `${taxYear}-01-01`;
  const to = `${taxYear}-12-31`;
  const totals = {
    sales: 0,
    salesVat: 0,
    discounts: 0,
    purchases: 0,
    purchasesVat: 0,
    cogsProductCost: 0,
    cogsLedger: 0,
    expenses: 0,
    cwt: 0,
    salesSource: "INVOICE_HEADERS" as FigureResult["salesSource"],
  };

  try {
    const sums = await sumFields(company.baseUrl, company.token, company.code, "sales_invoice", [
      "total_amount",
      "vat_amount",
      "discount_amount",
    ], {
      _and: [
        { invoice_date: { _gte: from } },
        { invoice_date: { _lte: to } },
        { transaction_status: { _nin: CANCELLED_SALES } },
      ],
    });
    totals.sales = (sums.total_amount ?? 0) - (sums.vat_amount ?? 0);
    totals.salesVat = sums.vat_amount ?? 0;
    totals.discounts = sums.discount_amount ?? 0;
  } catch {
    // Company unreadable or table missing: leave the zeros.
  }

  try {
    const sums = await sumFields(company.baseUrl, company.token, company.code, "sales_invoice", ["ewt_amount"], {
      _and: [
        { invoice_date: { _gte: from } },
        { invoice_date: { _lte: to } },
        { transaction_status: { _nin: CANCELLED_SALES } },
      ],
    });
    totals.cwt = sums.ewt_amount ?? 0;
  } catch {
    // Vertex has no ewt_amount column; credits stay zero rather than breaking the row.
  }

  const certificates = await loadCertificateCredits(company, taxYear);
  if (certificates) {
    const credited = certificates.byQuarter.reduce((sum, value) => sum + value, 0);
    // Same rule as the worksheet: the certificate register wins where it has rows.
    if (credited > 0) totals.cwt = credited;
  }

  const stt = await loadSttSales(company, taxYear);
  if (stt.sales) {
    const gross = stt.sales.quarters.reduce((total, value) => total + value, 0);
    totals.sales = gross / (1 + vatRate);
    totals.salesVat = gross - totals.sales;
    totals.salesSource = "STT_VIEW";
  }

  if (stt.sales === null && stt.reason) totals.salesSource = "INVOICE_HEADERS";

  try {
    const sums = await sumFields(company.baseUrl, company.token, company.code, "purchase_order", [
      "total_amount",
      "vat_amount",
    ], { _and: [{ date: { _gte: from } }, { date: { _lte: to } }] });
    totals.purchases = (sums.total_amount ?? 0) - (sums.vat_amount ?? 0);
    totals.purchasesVat = sums.vat_amount ?? 0;
  } catch {
    // ignored
  }

  try {
    const lines = await sumFields(
      company.baseUrl,
      company.token,
      company.code,
      "sales_invoice_details",
      ["total_amount"],
      { _and: [{ created_date: { _gte: from } }, { created_date: { _lte: to } }] },
    );
    const lineTotal = lines.total_amount ?? 0;
    if (lineTotal > 0) {
      const byProduct = await groupedByDate(
        company.baseUrl,
        company.token,
        company.code,
        "sales_invoice_details",
        "product_id",
        { quantity: "sum" },
        from,
        to,
      );
      const products = await listRows<{ product_id?: number | string | null; cost_per_unit?: number | string | null }>(
        company.baseUrl,
        company.token,
        company.code,
        "products",
        { fields: ["product_id", "cost_per_unit"], limit: -1 },
      );
      const costById = new Map(products.map((row) => [String(row.product_id ?? ""), Number(row.cost_per_unit ?? 0) || 0]));
      let cost = 0;
      for (const row of byProduct) {
        const unitCost = costById.get(String(row.date));
        if (!unitCost) continue;
        cost += (row.sums.quantity ?? 0) * unitCost;
      }
      totals.cogsProductCost = cost;
    }
  } catch {
    // Alternative basis stays zero; the entity worksheet reports why.
  }

  const deductibleAccounts = await loadDeductibleAccounts(company);
  if (deductibleAccounts) {
    try {
      const rows = await payableRowsByDisbursementDate(company, from, to, deductibleAccounts);
      totals.cogsLedger = rows.reduce((total, row) => total + (row.sums.costAmount ?? 0), 0);
      totals.expenses = rows.reduce(
        (total, row) => total + (row.sums.amount ?? 0) - (row.sums.costAmount ?? 0),
        0,
      );
    } catch {
      // Falls back to the expense register below.
    }
  }

  if (totals.expenses === 0) {
    try {
      const sums = await sumFields(company.baseUrl, company.token, company.code, "expense", ["amount"], {
        _and: [{ expense_date: { _gte: from } }, { expense_date: { _lte: to } }, { is_deleted: { _eq: 0 } }],
      });
      totals.expenses = sums.amount ?? 0;
    } catch {
      // ignored
    }
  }

  return totals;
}




