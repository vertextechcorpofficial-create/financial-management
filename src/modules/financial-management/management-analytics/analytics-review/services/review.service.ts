import "server-only";

import { asBoolean, asNumber, asNumberOrNull, asString, createItem, getItem, listItems, updateItem } from "./directus";
import { phtStamp, phtToday } from "../pht";
import type {
  AgendaItem,
  ActionRow,
  CompanyRow,
  ExceptionListRow,
  KpiRow,
  ReviewDetail,
  ReviewRow,
} from "../types";

const OPEN_STATUSES = ["OPEN", "MONITORING", "ESCALATED", "RECURRENCE"];

function mapCompany(row: Record<string, unknown>): CompanyRow {
  return {
    id: asNumber(row.id),
    code: asString(row.code),
    name: asString(row.name),
    kind: asString(row.kind) || "OPERATING",
    parent_code: row.parent_code ? asString(row.parent_code) : null,
    industry: row.industry ? asString(row.industry) : null,
    currency: asString(row.currency) || "PHP",
    fx_to_php: asNumber(row.fx_to_php, 1),
    revenue_weight: asNumberOrNull(row.revenue_weight),
    headcount: asNumber(row.headcount),
    sort: asNumber(row.sort),
    is_active: asBoolean(row.is_active),
  };
}

function mapReview(row: Record<string, unknown>): ReviewRow {
  return {
    id: asNumber(row.id),
    period: asString(row.period),
    company_id: asNumber(row.company_id),
    status: asString(row.status),
    held_at: row.held_at ? asString(row.held_at) : null,
    chair_user_id: asNumberOrNull(row.chair_user_id),
    attendees: row.attendees ? asString(row.attendees) : null,
    minutes: row.minutes ? asString(row.minutes) : null,
  };
}

/** Agenda rows written before the generator switched to the middle dot still carry the old dash. */
function plain(text: string): string {
  return text.replace(/ [—–] /g, " · ");
}

function mapItem(row: Record<string, unknown>): AgendaItem {
  return {
    id: asNumber(row.id),
    review_id: asNumber(row.review_id),
    sort: asNumber(row.sort),
    kind: asString(row.kind),
    ref_type: row.ref_type ? asString(row.ref_type) : null,
    ref_id: asNumberOrNull(row.ref_id),
    title: plain(asString(row.title)),
    minutes_alloc: asNumber(row.minutes_alloc),
    notes: row.notes ? plain(asString(row.notes)) : null,
    decision: row.decision ? plain(asString(row.decision)) : null,
  };
}

function mapAction(row: Record<string, unknown>): ActionRow {
  return {
    id: asNumber(row.id),
    exception_id: asNumberOrNull(row.exception_id),
    company_id: asNumber(row.company_id),
    review_id: asNumberOrNull(row.review_id),
    title: asString(row.title),
    owner_user_id: asNumberOrNull(row.owner_user_id),
    due_date: row.due_date ? asString(row.due_date).slice(0, 10) : null,
    status: asString(row.status),
    notes: row.notes ? asString(row.notes) : null,
    done_at: row.done_at ? asString(row.done_at) : null,
  };
}

/**
 * Names behind the owner ids an action stores.
 *
 * The platform's user directory is the `user` table (`user_id`, `user_fname`, ...); the REST listing of
 * `directus_users` answers 403 on this instance, so reading it here would fail the whole meeting load.
 * An unreadable directory leaves the id alone: the row then says the name is unavailable rather than
 * printing a number that pretends to be a person.
 */
async function ownerNames(ids: (number | null)[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id): id is number => Number.isInteger(id) && (id ?? 0) > 0))];
  if (unique.length === 0) return new Map();

  try {
    const { rows } = await listItems<Record<string, unknown>>("user", {
      fields: ["user_id", "user_fname", "user_mname", "user_lname", "user_email"],
      filter: { user_id: { _in: unique } },
      limit: unique.length,
    });
    const names = new Map<number, string>();
    for (const row of rows) {
      const id = asNumber(row.user_id);
      const full = [row.user_fname, row.user_mname, row.user_lname].map((part) => asString(part).trim()).filter(Boolean).join(" ");
      const label = full || asString(row.user_email).trim();
      if (id > 0 && label) names.set(id, label);
    }
    return names;
  } catch {
    return new Map();
  }
}

async function withOwnerNames(rows: ActionRow[]): Promise<ActionRow[]> {
  const names = await ownerNames(rows.map((row) => row.owner_user_id));
  return rows.map((row) => ({ ...row, ownerName: row.owner_user_id ? (names.get(row.owner_user_id) ?? null) : null }));
}

function mapException(row: Record<string, unknown>, kpi?: KpiRow): ExceptionListRow {
  return {
    id: asNumber(row.id),
    company_id: asNumber(row.company_id),
    kpi_id: asNumber(row.kpi_id),
    period_start: asString(row.period_start),
    period_end: asString(row.period_end),
    status: asString(row.status),
    reason: row.reason ? asString(row.reason) : null,
    owner_user_id: asNumberOrNull(row.owner_user_id),
    memo_due_date: row.memo_due_date ? asString(row.memo_due_date).slice(0, 10) : null,
    memo_at: row.memo_at ? asString(row.memo_at) : null,
    memo: row.memo ? asString(row.memo) : null,
    memo_by: asNumberOrNull(row.memo_by),
    escalated_level: asNumber(row.escalated_level),
    escalated_at: row.escalated_at ? asString(row.escalated_at) : null,
    closed_at: row.closed_at ? asString(row.closed_at) : null,
    close_note: row.close_note ? asString(row.close_note) : null,
    direction: asString(row.direction),
    deviation: asNumber(row.deviation),
    relative_pct: asNumber(row.relative_pct),
    identity_key: asString(row.identity_key),
    companyCode: "",
    companyName: "",
    kpiKey: kpi?.kpi_key ?? "",
    kpiName: kpi?.name ?? "",
    unit: kpi?.unit ?? null,
    dp: kpi?.dp ?? 1,
  };
}

async function loadContext() {
  const [companyRows, kpiRows, exceptionRows, sourceRows] = await Promise.all([
    listItems<Record<string, unknown>>("ma_company", {
      fields: ["id", "code", "name", "kind", "parent_code", "industry", "currency", "fx_to_php", "revenue_weight", "headcount", "sort", "is_active"],
      sort: ["sort", "code"],
      limit: 100,
    }),
    listItems<Record<string, unknown>>("ma_kpi", {
      fields: ["id", "kpi_key", "name", "domain", "tier", "company_id", "unit", "polarity", "rule_type", "threshold", "watch_band", "dp", "rollup", "owner_position", "source_codes", "definition", "sort", "is_active"],
      limit: 400,
    }),
    listItems<Record<string, unknown>>("ma_exception", {
      fields: [
        "id", "company_id", "kpi_id", "period_start", "period_end", "status", "reason", "owner_user_id",
        "memo_due_date", "memo_at", "memo", "memo_by", "escalated_level", "escalated_at", "closed_at",
        "close_note", "direction", "deviation", "relative_pct", "identity_key",
      ],
      limit: 800,
    }),
    listItems<Record<string, unknown>>("ma_source", {
      fields: ["id", "code", "name", "state", "last_sync_at", "sla_minutes"],
      limit: 50,
    }),
  ]);

  const kpis = kpiRows.rows.map((row) => ({
    id: asNumber(row.id),
    kpi_key: asString(row.kpi_key),
    name: asString(row.name),
    unit: row.unit ? asString(row.unit) : null,
    dp: asNumber(row.dp),
    company_id: asNumber(row.company_id),
  })) as Array<Pick<KpiRow, "id" | "kpi_key" | "name" | "unit" | "dp" | "company_id">>;

  const byId = new Map(kpis.map((kpi) => [kpi.id, kpi as KpiRow]));
  const companies = companyRows.rows.map(mapCompany);
  const companyById = new Map(companies.map((row) => [row.id, row]));
  const exceptions = exceptionRows.rows.map((row) => {
    const mapped = mapException(row, byId.get(asNumber(row.kpi_id)));
    const company = companyById.get(asNumber(row.company_id));
    mapped.companyCode = company?.code ?? "";
    mapped.companyName = company?.name ?? "";
    return mapped;
  });
  return {
    companies,
    exceptions,
    sources: sourceRows.rows.map((row) => ({
      code: asString(row.code),
      name: asString(row.name),
      state: asString(row.state),
      last_sync_at: row.last_sync_at ? asString(row.last_sync_at) : null,
      sla_minutes: asNumber(row.sla_minutes),
    })),
  };
}

/**
 * Agenda order and time budget come from the specification: escalated first, then
 * recurrence, open, one combined early-warning item, monitoring, data quality, and
 * anything waiting on a sign-off.
 */
export function planAgenda(
  exceptions: ExceptionListRow[],
  staleness: Array<{ code: string; name: string; stale: boolean }>,
): Array<Omit<AgendaItem, "id" | "review_id">> {
  const items: Array<Omit<AgendaItem, "id" | "review_id">> = [];
  let sort = 1;
  const push = (kind: string, title: string, minutes: number, refType: string | null, refId: number | null) => {
    items.push({ sort: sort++, kind, ref_type: refType, ref_id: refId, title, minutes_alloc: minutes, notes: null, decision: null });
  };

  for (const row of exceptions.filter((item) => item.status === "ESCALATED")) {
    push("ESCALATED", `${row.companyCode} · ${row.kpiName} · escalated, memo overdue`, 5, "exception", row.id);
  }
  for (const row of exceptions.filter((item) => item.status === "RECURRENCE")) {
    push("RECURRENCE", `${row.companyCode} · ${row.kpiName} · back over the limit after a fix`, 4, "exception", row.id);
  }
  for (const row of exceptions.filter((item) => item.status === "OPEN")) {
    push("OPEN", `${row.companyCode} · ${row.kpiName} · open, no memo yet`, 4, "exception", row.id);
  }

  const early = exceptions.filter((item) => item.status === "MONITORING" && item.escalated_level === 0);
  if (early.length > 0) {
    push(
      "EARLY",
      `Early warnings: ${early
        .map((row) => `${row.companyCode} · ${row.kpiName}`)
        .slice(0, 3)
        .join(", ")}${early.length > 3 ? `, and ${early.length - 3} more` : ""}`,
      Math.min(10, 4 + early.length),
      "exception_group",
      null,
    );
  }

  const stale = staleness.filter((row) => row.stale);
  if (stale.length > 0) {
    push(
      "DATA",
      `Data quality: ${stale.length} feed${stale.length === 1 ? "" : "s"} past the freshness limit: ${stale
        .map((row) => row.code)
        .slice(0, 4)
        .join(", ")}${stale.length > 4 ? `, +${stale.length - 4}` : ""}`,
      Math.min(8, 3 + stale.length),
      "source_group",
      null,
    );
  }

  return items;
}

export async function loadReview(params: { period?: string; company?: string }): Promise<ReviewDetail> {
  const period = params.period && /^\d{4}-\d{2}$/.test(params.period) ? params.period : phtToday().slice(0, 7);
  const { companies, exceptions, sources } = await loadContext();
  const company = companies.find((row) => row.code === params.company) ?? companies.find((row) => row.kind === "GROUP") ?? null;
  const companyId = company?.id ?? 0;

  const reviewRows = await listItems<Record<string, unknown>>("ma_review", {
    fields: ["id", "period", "company_id", "status", "held_at", "chair_user_id", "attendees", "minutes"],
    filter: { period: { _eq: period }, company_id: { _eq: companyId } },
    limit: 1,
  });

  const review = reviewRows.rows.length ? mapReview(reviewRows.rows[0]) : null;
  const items = review
    ? (
        await listItems<Record<string, unknown>>("ma_review_item", {
          fields: ["id", "review_id", "sort", "kind", "ref_type", "ref_id", "title", "minutes_alloc", "notes", "decision"],
          filter: { review_id: { _eq: review.id } },
          sort: ["sort"],
          limit: 200,
        })
      ).rows.map(mapItem)
    : [];

  const actions = review
    ? (
        await listItems<Record<string, unknown>>("ma_action", {
          fields: ["id", "exception_id", "company_id", "review_id", "title", "owner_user_id", "due_date", "status", "notes", "done_at"],
          filter: { review_id: { _eq: review.id } },
          sort: ["due_date"],
          limit: 100,
        })
      ).rows.map(mapAction)
    : [];

  const namedActions = await withOwnerNames(actions);

  const scoped = exceptions.filter((row) => company === null || company.kind === "GROUP" || row.company_id === company.id);
  const staleness = sources.map((row) => {
    const last = row.last_sync_at ? new Date(row.last_sync_at).getTime() : null;
    const stale = row.state === "CONNECTED" && last !== null ? Date.now() - last > row.sla_minutes * 60_000 : row.state === "MANUAL" ? true : false;
    return { code: row.code, name: row.name, stale };
  });

  return {
    period,
    company,
    companies,
    review,
    items,
    actions: namedActions,
    planned: review ? [] : planAgenda(scoped.filter((row) => OPEN_STATUSES.includes(row.status)), staleness),
    exceptions: scoped.filter((row) => OPEN_STATUSES.includes(row.status)),
  };
}

/** Opening the meeting freezes the agenda into review items, so minutes attach to a fixed list. */
export async function openReview(
  params: { period?: string; company?: string; actorId: number | null },
): Promise<ReviewDetail> {
  const draft = await loadReview(params);
  if (draft.review) return draft;
  if (draft.planned.length === 0) {
    throw new Error("Nothing on the agenda for that month: no open exception and no stale source.");
  }
  const companyId = draft.company?.id ?? 0;
  const created = await createItem<Record<string, unknown>>("ma_review", {
    period: draft.period,
    company_id: companyId,
    status: "DRAFT",
    attendees: null,
    minutes: null,
    created_at: phtStamp(),
    created_by: params.actorId,
    updated_at: phtStamp(),
    updated_by: params.actorId,
  });
  const reviewId = asNumber(created.id);
  for (const item of draft.planned) {
    await createItem("ma_review_item", {
      review_id: reviewId,
      sort: item.sort,
      kind: item.kind,
      ref_type: item.ref_type,
      ref_id: item.ref_id,
      title: item.title,
      minutes_alloc: item.minutes_alloc,
      notes: null,
      decision: null,
      created_at: phtStamp(),
      created_by: params.actorId,
      updated_at: phtStamp(),
      updated_by: params.actorId,
    });
  }
  return loadReview(params);
}

export async function updateReview(
  id: number,
  patch: { attendees?: string | null; minutes?: string | null; status?: string; chairUserId?: number | null },
  actorId: number | null,
): Promise<ReviewDetail> {
  const row = await getItem<Record<string, unknown>>("ma_review", id, ["id", "period", "company_id"]);
  if (!row) throw new Error("That review does not exist.");
  const payload: Record<string, unknown> = { updated_at: phtStamp(), updated_by: actorId };
  if (patch.attendees !== undefined) payload.attendees = patch.attendees;
  if (patch.minutes !== undefined) payload.minutes = patch.minutes;
  if (patch.chairUserId !== undefined) payload.chair_user_id = patch.chairUserId;
  if (patch.status !== undefined) {
    payload.status = patch.status;
    if (patch.status === "FINAL") payload.held_at = phtStamp();
  }
  await updateItem("ma_review", id, payload);
  const company = (await loadContext()).companies.find((item) => item.id === asNumber(row.company_id));
  return loadReview({ period: asString(row.period), company: company?.code });
}

export async function updateItemRow(
  id: number,
  patch: { notes?: string | null; decision?: string | null; minutesAlloc?: number },
  actorId: number | null,
): Promise<AgendaItem> {
  const payload: Record<string, unknown> = { updated_at: phtStamp(), updated_by: actorId };
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.decision !== undefined) payload.decision = patch.decision;
  if (patch.minutesAlloc !== undefined) payload.minutes_alloc = patch.minutesAlloc;
  const updated = await updateItem<Record<string, unknown>>("ma_review_item", id, payload);
  return mapItem(updated);
}

export async function createAction(
  params: { reviewId?: number | null; exceptionId?: number | null; companyCode?: string; title: string; dueDate?: string | null; notes?: string | null },
  actorId: number | null,
): Promise<ActionRow> {
  const { companies } = await loadContext();
  const company = companies.find((row) => row.code === params.companyCode) ?? companies.find((row) => row.kind === "GROUP") ?? null;
  const created = await createItem<Record<string, unknown>>("ma_action", {
    review_id: params.reviewId ?? null,
    exception_id: params.exceptionId ?? null,
    company_id: company?.id ?? 0,
    title: params.title,
    owner_user_id: actorId,
    due_date: params.dueDate ?? null,
    status: "OPEN",
    notes: params.notes ?? null,
    created_at: phtStamp(),
    created_by: actorId,
    updated_at: phtStamp(),
    updated_by: actorId,
  });
  const names = await ownerNames([actorId]);
  const row = mapAction(created);
  return { ...row, ownerName: actorId ? (names.get(actorId) ?? null) : null };
}

export async function completeAction(id: number, actorId: number | null): Promise<ActionRow> {
  const updated = await updateItem<Record<string, unknown>>("ma_action", id, {
    status: "DONE",
    done_at: phtStamp(),
    updated_at: phtStamp(),
    updated_by: actorId,
  });
  return mapAction(updated);
}
