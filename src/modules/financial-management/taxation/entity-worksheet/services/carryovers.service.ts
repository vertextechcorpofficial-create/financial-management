import "server-only";

import { createItem, getItem, listItems, updateItem } from "./directus";
import { appendAudit } from "./auditLog";
import type { Actor } from "./actor";
import { phtStamp } from "../pht";
import type {
  CarryoverInput,
  CarryoverKind,
  CarryoverLot,
  CarryoverLotDetail,
  CarryoverPanel,
  CarryoverStaleLot,
} from "../types";

/**
 * The two things the 1702Q formula subtracts that do not come from the company's own
 * ledgers: the carryover lots still unused (NOLCO, excess MCIT) and the 1702Q payments
 * the desk already recorded. Both live in the central database, not per-company.
 */

const LOTS = "tax_carryover_lot";
const PAYMENTS = "tax_payment";
const LOCKS = "tax_period_lock";

/** NOLCO runs three years after the loss, five for 2020 and 2021 losses. */
const DEFAULT_NOLCO_YEARS = 3;
const MAX_YEARS = 10;

const PERIOD_INDEX: Record<string, number> = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };

interface LotRow {
  id?: number | string | null;
  kind?: string | null;
  origin_year?: number | string | null;
  amount?: number | string | null;
  amount_used?: number | string | null;
  expires_after_year?: number | string | null;
  created_at?: string | null;
}

interface PaymentRow {
  form_code?: string | null;
  period_key?: string | null;
  amount?: number | string | null;
}

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number): number => Math.round(value * 100) / 100;

export interface CarryoverLoad {
  input: CarryoverInput;
  panel: CarryoverPanel;
  notice: string | null;
}

function usableYears(row: LotRow, kind: string): number {
  const configured = number(row.expires_after_year);
  if (configured > 0) return configured;
  // NOLCO keeps the five-year window the document gives 2020 and 2021 losses; the column
  // is the honest source, so this only covers rows written before it existed.
  const origin = number(row.origin_year);
  if (kind === "NOLCO" && (origin === 2020 || origin === 2021)) return 5;
  return DEFAULT_NOLCO_YEARS;
}

function detail(row: LotRow, kind: CarryoverKind, taxYear: number): CarryoverLotDetail {
  const amount = money(number(row.amount));
  const used = money(number(row.amount_used));
  const left = money(amount - used);
  const years = usableYears(row, kind);
  const lastUsableYear = number(row.origin_year) + years;
  const status: CarryoverLotDetail["status"] =
    left <= 0 ? "USED" : taxYear > lastUsableYear ? "EXPIRED" : "OPEN";
  return {
    id: number(row.id),
    kind,
    originYear: number(row.origin_year),
    amount,
    used,
    left,
    expiresAfterYear: years,
    lastUsableYear,
    status,
  };
}

/** A lot may be applied to a year only after the year it arose in, and inside its window. */
function usableIn(lot: CarryoverLotDetail, taxYear: number): boolean {
  return lot.left > 0 && taxYear > lot.originYear && taxYear <= lot.lastUsableYear;
}

export function emptyPanel(taxYear: number, notice: string | null = null): CarryoverPanel {
  return {
    taxYear,
    lots: [],
    carriedForward: [],
    earliestExpiry: null,
    expiringUnused: [],
    stale: [],
    locked: false,
    notice,
  };
}

/** A lock is a row for this company-year with no unlock stamp. */
async function isLocked(companyId: number, taxYear: number): Promise<boolean> {
  try {
    const { rows } = await listItems<{ id?: number | string }>(LOCKS, {
      fields: ["id"],
      filter: {
        _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear } }, { unlocked_at: { _null: true } }],
      },
      limit: 1,
    });
    return rows.length > 0;
  } catch {
    // An unreadable lock table must not read as "open": openings stay frozen until it answers.
    return true;
  }
}

/**
 * P71: this year opens a lot at whatever last year closed it at. When last year's figures
 * moved afterwards, the opening is stale and the desk has to accept the new one.
 */
function staleOpenings(lots: CarryoverLotDetail[], prior: CarryoverLotDetail[]): CarryoverStaleLot[] {
  const closing = new Map(prior.map((lot) => [`${lot.kind}:${lot.originYear}`, lot]));
  const stale: CarryoverStaleLot[] = [];
  for (const lot of lots) {
    const before = closing.get(`${lot.kind}:${lot.originYear}`);
    if (!before) continue;
    if (Math.abs(lot.amount - before.left) < 0.005) continue;
    stale.push({ lotId: lot.id, kind: lot.kind, originYear: lot.originYear, recorded: lot.amount, closing: before.left });
  }
  return stale;
}

export async function loadCarryoverInput(companyId: number, taxYear: number): Promise<CarryoverLoad> {
  const empty: CarryoverInput = { nolco: [], mcit: [], actualPaid: [null, null, null, null] };
  try {
    const { rows } = await listItems<LotRow>(LOTS, {
      fields: ["id", "kind", "origin_year", "amount", "amount_used", "expires_after_year", "created_at"],
      filter: { _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear } }] },
      limit: -1,
    });

    const lots: CarryoverLotDetail[] = [];
    for (const row of rows) {
      const kind = String(row.kind ?? "").toUpperCase();
      if (kind !== "NOLCO" && kind !== "EXCESS_MCIT") continue;
      lots.push(detail(row, kind, taxYear));
    }
    lots.sort((a, b) => a.kind.localeCompare(b.kind) || a.originYear - b.originYear);

    // The engine only sees what may be applied this year; the panel shows everything so the
    // desk can see a lot it has already used up or let expire (P70).
    const nolco: CarryoverLot[] = [];
    const mcit: CarryoverLot[] = [];
    for (const lot of lots) {
      if (!usableIn(lot, taxYear)) continue;
      const target = lot.kind === "NOLCO" ? nolco : mcit;
      target.push({ originYear: lot.originYear, amount: lot.left });
    }
    const byYear = (a: CarryoverLot, b: CarryoverLot) => a.originYear - b.originYear;
    nolco.sort(byYear);
    mcit.sort(byYear);

    const paid = await listItems<PaymentRow>(PAYMENTS, {
      fields: ["form_code", "period_key", "amount"],
      filter: { _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear } }, { form_code: { _eq: "1702Q" } }] },
      limit: -1,
    });
    const actualPaid: (number | null)[] = [null, null, null, null];
    for (const row of paid.rows) {
      const index = PERIOD_INDEX[String(row.period_key ?? "").toUpperCase()];
      if (index === undefined) continue;
      actualPaid[index] = Math.round(((actualPaid[index] ?? 0) + number(row.amount)) * 100) / 100;
    }

    const priorRows = await listItems<LotRow>(LOTS, {
      fields: ["id", "kind", "origin_year", "amount", "amount_used", "expires_after_year"],
      filter: { _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear - 1 } }] },
      limit: -1,
    });
    const priorLots: CarryoverLotDetail[] = [];
    for (const row of priorRows.rows) {
      const kind = String(row.kind ?? "").toUpperCase();
      if (kind !== "NOLCO" && kind !== "EXCESS_MCIT") continue;
      priorLots.push(detail(row, kind, taxYear - 1));
    }
    const stale = staleOpenings(lots, priorLots);
    const locked = await isLocked(companyId, taxYear);

    const carriedForward = lots.filter((lot) => usableIn(lot, taxYear + 1));
    const earliestExpiry = carriedForward.length
      ? carriedForward.reduce((earliest, lot) => Math.min(earliest, lot.lastUsableYear), Number.POSITIVE_INFINITY)
      : null;
    const expiringUnused = lots.filter((lot) => lot.left > 0 && lot.lastUsableYear === taxYear);

    return {
      input: { nolco, mcit, actualPaid },
      panel: {
        taxYear,
        lots,
        carriedForward,
        earliestExpiry: earliestExpiry === Number.POSITIVE_INFINITY ? null : earliestExpiry,
        expiringUnused,
        stale,
        locked,
        notice: null,
      },
      notice: null,
    };
  } catch {
    const notice = `The carryover lots and recorded 1702Q payments could not be read (${LOTS}, ${PAYMENTS}), so lines 8 and 12 ignore them.`;
    return { input: empty, panel: emptyPanel(taxYear, notice), notice };
  }
}

export class CarryoverValidationError extends Error {
  field: string;

  constructor(message: string, field: string) {
    super(message);
    this.name = "CarryoverValidationError";
    this.field = field;
  }
}

export interface CarryoverLotInput {
  companyId: number;
  taxYear: number;
  kind: CarryoverKind;
  originYear: number;
  amount: number;
  amountUsed: number;
  /** Null means "use the statutory default for this kind and origin year". */
  expiresAfterYear: number | null;
}

function defaultYears(kind: CarryoverKind, originYear: number): number {
  return kind === "NOLCO" && (originYear === 2020 || originYear === 2021) ? 5 : DEFAULT_NOLCO_YEARS;
}

function validate(input: CarryoverLotInput): number {
  if (input.originYear > input.taxYear - 1) {
    throw new CarryoverValidationError(
      `The origin year must be ${input.taxYear - 1} or earlier: a lot is carried into a later year, not the same one.`,
      "originYear",
    );
  }
  if (!(input.amount > 0)) {
    throw new CarryoverValidationError("The amount must be greater than zero.", "amount");
  }
  if (input.amountUsed < 0 || input.amountUsed > input.amount) {
    throw new CarryoverValidationError("The used amount must sit between zero and the lot amount.", "amountUsed");
  }
  const years = input.expiresAfterYear ?? defaultYears(input.kind, input.originYear);
  if (!Number.isInteger(years) || years < 1 || years > MAX_YEARS) {
    throw new CarryoverValidationError(`The expiry must be between 1 and ${MAX_YEARS} years after the origin year.`, "expiresAfterYear");
  }
  return years;
}

export async function recordCarryoverLot(input: CarryoverLotInput, actor: Actor): Promise<CarryoverLotDetail> {
  const years = validate(input);
  const created = await createItem<LotRow>(LOTS, {
    company_id: input.companyId,
    tax_year: input.taxYear,
    kind: input.kind,
    origin_year: input.originYear,
    amount: money(input.amount),
    amount_used: money(input.amountUsed),
    expires_after_year: years,
    // The column carries no database default, so a row without it is refused.
    created_at: phtStamp(),
    created_by: actor.userId,
  });

  await appendAudit({
    companyId: input.companyId,
    taxYear: input.taxYear,
    entity: "tax_carryover_lot",
    entityRef: `${input.kind} ${input.originYear}`,
    field: "amount",
    beforeValue: null,
    afterValue: `${money(input.amount).toFixed(2)} (${years} years)`,
    reason: "Carryover lot recorded",
    actor,
  });

  return detail(created, input.kind, input.taxYear);
}

export async function updateCarryoverUsed(
  id: number,
  amountUsed: number,
  actor: Actor,
): Promise<CarryoverLotDetail> {
  const row = await getItem<LotRow & { company_id?: number; tax_year?: number }>(LOTS, id, [
    "id",
    "company_id",
    "tax_year",
    "kind",
    "origin_year",
    "amount",
    "amount_used",
    "expires_after_year",
  ]);
  if (!row) throw new CarryoverValidationError("That carryover lot no longer exists.", "id");
  const kind = String(row.kind ?? "").toUpperCase() === "EXCESS_MCIT" ? "EXCESS_MCIT" : "NOLCO";
  const amount = money(number(row.amount));
  if (!(amountUsed >= 0) || amountUsed > amount) {
    throw new CarryoverValidationError(
      `The used amount must sit between zero and the lot amount (${amount.toFixed(2)}).`,
      "amountUsed",
    );
  }

  const before = money(number(row.amount_used));
  const after = money(amountUsed);
  const updated = await updateItem<LotRow>(LOTS, id, { amount_used: after });
  if (before !== after) {
    await appendAudit({
      companyId: number(row.company_id),
      taxYear: number(row.tax_year),
      entity: "tax_carryover_lot",
      entityRef: `${kind} ${number(row.origin_year)}`,
      field: "amount_used",
      beforeValue: before.toFixed(2),
      afterValue: after.toFixed(2),
      reason: "Carryover amount used corrected",
      actor,
    });
  }
  return detail({ ...row, ...updated }, kind, number(row.tax_year));
}

export interface OpeningUpdateResult {
  updated: number;
  skipped: number;
  reason: string | null;
}

/**
 * P71: rewrite this year's openings to last year's closing balances. A locked company-year is
 * skipped whole rather than half-updated; the caller reports which case it hit.
 */
export async function updateOpeningCarryovers(
  companyId: number,
  taxYear: number,
  actor: Actor,
): Promise<OpeningUpdateResult> {
  if (await isLocked(companyId, taxYear)) {
    return { updated: 0, skipped: 0, reason: `The ${taxYear} period is locked, so its openings stay as recorded.` };
  }

  const current = await listItems<LotRow>(LOTS, {
    fields: ["id", "kind", "origin_year", "amount", "amount_used", "expires_after_year"],
    filter: { _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear } }] },
    limit: -1,
  });
  const prior = await listItems<LotRow>(LOTS, {
    fields: ["id", "kind", "origin_year", "amount", "amount_used", "expires_after_year"],
    filter: { _and: [{ company_id: { _eq: companyId } }, { tax_year: { _eq: taxYear - 1 } }] },
    limit: -1,
  });

  const lots: CarryoverLotDetail[] = [];
  for (const row of current.rows) {
    const kind = String(row.kind ?? "").toUpperCase();
    if (kind !== "NOLCO" && kind !== "EXCESS_MCIT") continue;
    lots.push(detail(row, kind, taxYear));
  }
  const priorLots: CarryoverLotDetail[] = [];
  for (const row of prior.rows) {
    const kind = String(row.kind ?? "").toUpperCase();
    if (kind !== "NOLCO" && kind !== "EXCESS_MCIT") continue;
    priorLots.push(detail(row, kind, taxYear - 1));
  }

  let updated = 0;
  for (const stale of staleOpenings(lots, priorLots)) {
    const lot = lots.find((entry) => entry.id === stale.lotId);
    if (!lot) continue;
    // The opening is the prior closing; what this year already used stays, clamped to the opening.
    const amountUsed = Math.min(lot.used, stale.closing);
    await updateItem(LOTS, lot.id, { amount: stale.closing, amount_used: amountUsed });
    await appendAudit({
      companyId,
      taxYear,
      entity: "tax_carryover_lot",
      entityRef: `${lot.kind} ${lot.originYear}`,
      field: "amount",
      beforeValue: stale.recorded.toFixed(2),
      afterValue: stale.closing.toFixed(2),
      reason: "Opening carryover updated from the prior year",
      actor,
    });
    updated += 1;
  }

  return { updated, skipped: 0, reason: null };
}