import "server-only";

import { phtDate, phtStamp, toPhtDateString } from "../pht";
import type {
  AccountKind,
  GlAccountOption,
  HolidayKind,
  SettingsAccount,
  SettingsData,
  SettingsHoliday,
  SettingsLock,
  SettingsMapping,
  SettingsValue,
} from "../types";
import type { AccountBody, AccountPatch, HolidayBody, HolidayPatch, LockBody, MappingCreateBody } from "../schemas";
import {
  DirectusError,
  asBoolean,
  asNumber,
  asNumberOrNull,
  asString,
  createItem,
  deleteItem,
  getItem,
  listItems,
  roundMoney,
  updateItem,
} from "./directus";
import { LoanConflictError, LoanNotFoundError, LoanValidationError } from "./errors";

const ACCOUNTS = "loan_payment_account";
const HOLIDAYS = "loan_holiday";
const MAPPINGS = "loan_gl_mapping";
const LOCKS = "loan_period_lock";
const VALUES = "loan_setting";
const COA = "chart_of_accounts";
const PAYMENTS = "loan_payment";
const USERS = "user";

const ACCOUNT_FIELDS = ["id", "name", "kind", "coa_id", "charge_pct", "is_active", "sort"];
const COA_FIELDS = ["coa_id", "gl_code", "account_title"];
const MAPPING_FIELDS = ["mapping_key", "coa_id", "mapping_group", "mapping_label", "usage_description", "updated_at"];

/** The mapping rows, with the group, label and usage text the GL tab shows. */
async function loadMappings(): Promise<MappingRowRaw[]> {
  const { rows } = await listItems<MappingRowRaw>(MAPPINGS, { fields: MAPPING_FIELDS, sort: "mapping_key", limit: 200 });
  return rows;
}

interface AccountRow {
  id: number;
  name: string;
  kind: AccountKind;
  coa_id: number | null;
  charge_pct: string | number | null;
  is_active: unknown;
  sort: number | null;
}

interface HolidayRowRaw {
  id: number;
  holiday_date: string;
  name: string;
  kind: HolidayKind;
}

interface MappingRowRaw {
  mapping_key: string;
  coa_id: number | null;
  mapping_group?: string | null;
  mapping_label?: string | null;
  usage_description?: string | null;
  updated_at: string | null;
}

interface LockRowRaw {
  id: number;
  locked_through: string;
  note: string | null;
  locked_by: number | null;
  locked_at: string | null;
  reopened_at: string | null;
}

interface ValueRowRaw {
  setting_key: string;
  setting_value: string | null;
  updated_at: string | null;
}

interface CoaRow {
  coa_id: number;
  gl_code: string;
  account_title: string;
}

/** Every chart row, so a picker can name an account that is already linked somewhere. */
async function loadChart(): Promise<CoaRow[]> {
  const { rows } = await listItems<CoaRow>(COA, { fields: COA_FIELDS, sort: "gl_code", limit: 500 });
  return rows.filter((row) => Number.isFinite(Number(row.coa_id)) && asString(row.gl_code) !== "");
}

function chartOption(row: CoaRow): GlAccountOption {
  return { coaId: row.coa_id, glCode: asString(row.gl_code), accountTitle: asString(row.account_title) };
}

async function actorNames(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return new Map();
  try {
    const { rows } = await listItems<{
      user_id: number;
      user_fname: string | null;
      user_mname: string | null;
      user_lname: string | null;
      user_email: string | null;
    }>(USERS, {
      fields: ["user_id", "user_fname", "user_mname", "user_lname", "user_email"],
      filter: { user_id: { _in: unique } },
      limit: 200,
    });
    const names = new Map<number, string>();
    for (const row of rows) {
      const name = [asString(row.user_fname), asString(row.user_mname), asString(row.user_lname)]
        .filter(Boolean)
        .join(" ");
      names.set(Number(row.user_id), name || asString(row.user_email) || `User ${row.user_id}`);
    }
    return names;
  } catch {
    return new Map();
  }
}

/** Payments already recorded against each account; read only, used to explain a retirement. */
async function paymentCounts(accountIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  await Promise.all(
    accountIds.map(async (id) => {
      try {
        const { total } = await listItems<{ id: number }>(PAYMENTS, {
          fields: ["id"],
          filter: { account_id: { _eq: id } },
          limit: 1,
        });
        counts.set(id, total);
      } catch {
        counts.set(id, 0);
      }
    }),
  );
  return counts;
}

export async function loadSettings(): Promise<SettingsData> {
  const [chart, accountPage, holidayPage, mappingRows, lockPage, valuePage] = await Promise.all([
    loadChart(),
    listItems<AccountRow>(ACCOUNTS, { fields: ACCOUNT_FIELDS, sort: "sort,name", limit: 200 }),
    listItems<HolidayRowRaw>(HOLIDAYS, { fields: ["id", "holiday_date", "name", "kind"], sort: "-holiday_date", limit: 500 }),
    loadMappings(),
    listItems<LockRowRaw>(LOCKS, {
      fields: ["id", "locked_through", "note", "locked_by", "locked_at", "reopened_at"],
      sort: "-locked_through",
      limit: 50,
    }),
    listItems<ValueRowRaw>(VALUES, { fields: ["setting_key", "setting_value", "updated_at"], sort: "setting_key", limit: 200 }),
  ]);

  const byCoa = new Map(chart.map((row) => [row.coa_id, row] as const));
  const counts = await paymentCounts(accountPage.rows.map((row) => Number(row.id)));

  const accounts: SettingsAccount[] = accountPage.rows.map((row) => {
    const coaId = asNumber(row.coa_id);
    const coa = byCoa.get(coaId);
    return {
      id: Number(row.id),
      name: asString(row.name),
      kind: (asString(row.kind) as AccountKind) || "BANK",
      coaId,
      glCode: coa ? asString(coa.gl_code) : "",
      glTitle: coa ? asString(coa.account_title) : "Unknown GL account",
      chargePct: roundMoney(asNumber(row.charge_pct)),
      isActive: asBoolean(row.is_active),
      sort: asNumber(row.sort),
      paymentCount: counts.get(Number(row.id)) ?? 0,
    };
  });

  const holidays: SettingsHoliday[] = holidayPage.rows.map((row) => ({
    id: Number(row.id),
    holidayDate: toPhtDateString(asString(row.holiday_date)) || asString(row.holiday_date),
    name: asString(row.name),
    kind: (asString(row.kind) as HolidayKind) || "REGULAR",
  }));

  const mappings: SettingsMapping[] = mappingRows.map((row) => {
    const coaId = asNumberOrNull(row.coa_id);
    const coa = coaId == null ? null : byCoa.get(coaId);
    return {
      mappingKey: asString(row.mapping_key),
      coaId,
      glCode: coa ? asString(coa.gl_code) : null,
      accountTitle: coa ? asString(coa.account_title) : null,
      mappingGroup: asString(row.mapping_group) || null,
      mappingLabel: asString(row.mapping_label) || null,
      description: asString(row.usage_description) || null,
      updatedAt: row.updated_at ? toPhtDateString(row.updated_at) : null,
    };
  });

  const actorIds = lockPage.rows.flatMap((row) => (row.locked_by == null ? [] : [Number(row.locked_by)]));
  const names = await actorNames(actorIds);

  const locks: SettingsLock[] = lockPage.rows.map((row) => ({
    id: Number(row.id),
    lockedThrough: toPhtDateString(asString(row.locked_through)) || asString(row.locked_through),
    note: asString(row.note),
    lockedByName: row.locked_by == null ? null : (names.get(Number(row.locked_by)) ?? null),
    lockedAt: row.locked_at ? toPhtDateString(row.locked_at) : null,
    reopenedAt: row.reopened_at ? toPhtDateString(row.reopened_at) : null,
  }));

  const values: SettingsValue[] = valuePage.rows.map((row) => ({
    settingKey: asString(row.setting_key),
    settingValue: asString(row.setting_value),
    updatedAt: row.updated_at ? toPhtDateString(row.updated_at) : null,
  }));

  return {
    accounts,
    holidays,
    mappings,
    chartAccounts: chart.map(chartOption),
    locks,
    values,
    currentLock: locks.find((lock) => lock.reopenedAt === null) ?? null,
    unmappedKeys: mappings.filter((row) => row.coaId === null).map((row) => row.mappingKey),
  };
}

async function requireCoa(coaId: number): Promise<void> {
  if (!Number.isInteger(coaId) || coaId <= 0) {
    throw new LoanValidationError("Choose the GL account this payment account posts to.", { coaId: ["Choose a GL account."] });
  }
  const row = await getItem<CoaRow>(COA, coaId, COA_FIELDS);
  if (!row) {
    throw new LoanValidationError("That GL account is not on the chart.", { coaId: ["Pick a chart account."] });
  }
}

export async function createAccount(body: AccountBody, actor: number | null) {
  await requireCoa(body.coaId);
  const { rows } = await listItems<{ sort: number | null }>(ACCOUNTS, { fields: ["sort"], sort: "-sort", limit: 1 });
  const nextSort = body.sort ?? asNumber(rows[0]?.sort) + 1;
  const created = await createItem<{ id: number }>(ACCOUNTS, {
    name: body.name,
    kind: body.kind,
    coa_id: body.coaId,
    charge_pct: roundMoney(body.chargePct),
    is_active: true,
    sort: nextSort,
    created_by: actor,
    updated_by: actor,
    updated_at: phtStamp(),
  });
  return { id: Number(created.id), name: body.name };
}

async function loadAccountRow(id: number): Promise<AccountRow> {
  const row = await getItem<AccountRow>(ACCOUNTS, id, ACCOUNT_FIELDS);
  if (!row) throw new LoanNotFoundError("That payment account no longer exists.");
  return row;
}

export async function updateAccount(id: number, patch: AccountPatch, actor: number | null) {
  const row = await loadAccountRow(id);
  if (patch.coaId !== undefined) await requireCoa(patch.coaId);

  const payload: Record<string, unknown> = { updated_by: actor, updated_at: phtStamp() };
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.kind !== undefined) payload.kind = patch.kind;
  if (patch.coaId !== undefined) payload.coa_id = patch.coaId;
  if (patch.chargePct !== undefined) payload.charge_pct = roundMoney(patch.chargePct);
  if (patch.sort !== undefined) payload.sort = patch.sort;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;

  await updateItem(ACCOUNTS, id, payload);

  if (patch.isActive === false) {
    const { total } = await listItems<{ id: number }>(PAYMENTS, {
      fields: ["id"],
      filter: { account_id: { _eq: id } },
      limit: 1,
    });
    return {
      id,
      isActive: false,
      paymentCount: total,
      note:
        total > 0
          ? `${total} payment${total === 1 ? "" : "s"} still point at ${asString(row.name)}. The row is kept, only its use is stopped.`
          : `${asString(row.name)} is retired. No payment can be recorded from it.`,
    };
  }
  return { id, isActive: asBoolean(patch.isActive ?? true), paymentCount: 0, note: "" };
}

export async function createHoliday(body: HolidayBody, actor: number | null) {
  const duplicate = await listItems<{ id: number }>(HOLIDAYS, {
    fields: ["id"],
    filter: { _and: [{ holiday_date: { _eq: body.holidayDate } }, { name: { _eq: body.name } }] },
    limit: 1,
  });
  if (duplicate.total > 0) {
    throw new LoanConflictError(`${body.name} is already recorded on ${body.holidayDate}.`);
  }
  const created = await createItem<{ id: number }>(HOLIDAYS, {
    holiday_date: body.holidayDate,
    name: body.name,
    kind: body.kind,
    created_by: actor,
    updated_by: actor,
  });
  return { id: Number(created.id), name: body.name, holidayDate: body.holidayDate };
}

export async function updateHoliday(id: number, patch: HolidayPatch, actor: number | null) {
  const row = await getItem<HolidayRowRaw>(HOLIDAYS, id, ["id", "holiday_date", "name", "kind"]);
  if (!row) throw new LoanNotFoundError("That holiday no longer exists.");

  const nextDate = patch.holidayDate ?? toPhtDateString(asString(row.holiday_date));
  const nextName = patch.name ?? asString(row.name);
  const duplicate = await listItems<{ id: number }>(HOLIDAYS, {
    fields: ["id"],
    filter: { _and: [{ holiday_date: { _eq: nextDate } }, { name: { _eq: nextName } }] },
    limit: 2,
  });
  if (duplicate.rows.some((other) => Number(other.id) !== id)) {
    throw new LoanConflictError(`${nextName} is already recorded on ${nextDate}.`);
  }

  const payload: Record<string, unknown> = { updated_by: actor };
  if (patch.holidayDate !== undefined) payload.holiday_date = patch.holidayDate;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.kind !== undefined) payload.kind = patch.kind;
  await updateItem(HOLIDAYS, id, payload);
  return { id, name: nextName, holidayDate: nextDate };
}

export async function deleteHoliday(id: number) {
  const row = await getItem<{ id: number }>(HOLIDAYS, id, ["id"]);
  if (!row) throw new LoanNotFoundError("That holiday no longer exists.");
  await deleteItem(HOLIDAYS, id);
  return { id };
}

export async function updateMapping(
  mappingKey: string,
  coaId: number | null,
  description: string,
  actor: number | null,
) {
  const row = await getItem<{ mapping_key: string }>(MAPPINGS, mappingKey, ["mapping_key", "coa_id"]);
  if (!row) throw new LoanNotFoundError(`There is no GL key called ${mappingKey}.`);
  if (coaId !== null) await requireCoa(coaId);
  await updateItem(MAPPINGS, mappingKey, {
    coa_id: coaId,
    usage_description: description.trim(),
    updated_by: actor,
    updated_at: phtStamp(),
  });
  const { rows } = await listItems<MappingRowRaw>(MAPPINGS, { fields: ["mapping_key", "coa_id"], sort: "mapping_key", limit: 100 });
  return {
    mappingKey,
    coaId,
    unmappedKeys: rows.filter((item) => asNumberOrNull(item.coa_id) === null).map((item) => asString(item.mapping_key)),
  };
}

/** Add one line account: a key, the posting account it points at, and the group it sits under. */
export async function createMapping(body: MappingCreateBody, actor: number | null) {
  // A filtered list answers "does this key exist" without the 403 that a single-item read
  // returns for a row that is not there.
  const { rows } = await listItems<{ mapping_key: string }>(MAPPINGS, {
    fields: ["mapping_key"],
    filter: { mapping_key: { _eq: body.mapping_key } },
    limit: 1,
  });
  if (rows.length > 0) throw new LoanConflictError(`There is already a GL key called ${body.mapping_key}.`);
  await requireCoa(body.coa_id);

  const label = body.mapping_label.trim();
  const description = body.usage_description?.trim() ?? "";
  await createItem<{ mapping_key: string }>(MAPPINGS, {
    mapping_key: body.mapping_key,
    coa_id: body.coa_id,
    mapping_group: body.mapping_group,
    mapping_label: label,
    usage_description: description,
    created_by: actor,
    updated_by: actor,
    updated_at: phtStamp(),
  });
  return { mappingKey: body.mapping_key, mappingGroup: body.mapping_group, mappingLabel: label };
}

export async function closeBooks(body: LockBody, actor: number | null) {
  const today = phtDate();
  if (body.lockedThrough > today) {
    throw new LoanValidationError("The closing date cannot be in the future.", { lockedThrough: ["Pick today or an earlier date."] });
  }
  const settings = await loadSettings();
  const open = settings.currentLock;
  if (open && body.lockedThrough <= open.lockedThrough) {
    throw new LoanConflictError(`The books are already closed through ${open.lockedThrough}.`);
  }
  const created = await createItem<{ id: number }>(LOCKS, {
    locked_through: body.lockedThrough,
    note: body.note ?? "",
    locked_by: actor,
    locked_at: phtStamp(),
    created_by: actor,
    updated_by: actor,
  });
  return { id: Number(created.id), lockedThrough: body.lockedThrough };
}

export async function reopenBooks(id: number, reason: string, actor: number | null) {
  const row = await getItem<LockRowRaw>(LOCKS, id, ["id", "locked_through", "note", "reopened_at"]);
  if (!row) throw new LoanNotFoundError("That period lock no longer exists.");
  if (row.reopened_at) throw new LoanConflictError(`The lock through ${toPhtDateString(row.locked_through)} was already reopened.`);

  const previous = asString(row.note);
  const stamp = phtStamp();
  await updateItem(LOCKS, id, {
    reopened_by: actor,
    reopened_at: stamp,
    note: previous ? `${previous} · Reopened: ${reason}` : `Reopened: ${reason}`,
    updated_by: actor,
  });
  return { id, lockedThrough: toPhtDateString(asString(row.locked_through)), reopenedAt: stamp };
}

/**
 * `loan_setting` is read, never written from this module.
 *
 * No screen in the loan tree reads a key, so an editor here would offer changes that do
 * nothing (finding L8). The table stays visible so its contents are not a mystery; when a
 * screen starts asking for a key, the write path comes back with that screen.
 */
/** Directus answers 403 for a table the token cannot see; say so instead of "nothing found". */
export function isUnreachableTable(error: unknown): boolean {
  return error instanceof DirectusError && (error.status === 403 || error.status === 404);
}
