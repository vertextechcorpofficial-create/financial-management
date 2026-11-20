import "server-only";

import { asNumber, asNumberOrNull, asString, createItem, listItems, updateItem } from "./directus";
import { DEFAULT_POLICY, forecast, statusOf } from "./engine";
import type {
  AlertPolicyRow,
  AlertRow,
  AlertSeverity,
  AlertsPayload,
  AlertState,
  KpiRow,
  PeriodPoint,
  Policy,
  Rollup,
} from "../types";

type Json = Record<string, unknown>;

const KPI_FIELDS = [
  "id",
  "kpi_key",
  "name",
  "company_id",
  "tier",
  "domain",
  "unit",
  "polarity",
  "rule_type",
  "threshold",
  "watch_band",
  "dp",
  "rollup",
  "owner_position",
  "source_codes",
  "definition",
  "is_active",
  "sort",
];

function mapKpi(row: Json): KpiRow {
  return {
    id: asNumber(row.id),
    kpi_key: asString(row.kpi_key),
    name: asString(row.name),
    company_id: asNumber(row.company_id),
    tier: asString(row.tier) as KpiRow["tier"],
    domain: asString(row.domain),
    unit: asString(row.unit) || null,
    polarity: asString(row.polarity) as KpiRow["polarity"],
    rule_type: asString(row.rule_type) as KpiRow["rule_type"],
    threshold: asNumberOrNull(row.threshold),
    watch_band: asNumberOrNull(row.watch_band),
    dp: asNumber(row.dp),
    rollup: asString(row.rollup) as Rollup,
    owner_position: asString(row.owner_position) || null,
    source_codes: asString(row.source_codes) || null,
    definition: asString(row.definition) || null,
    is_active: row.is_active === true || row.is_active === 1 || row.is_active === "1",
    sort: asNumber(row.sort),
  };
}

function mapAlert(row: Json, companyCodes: Map<number, string>, kpiNames: Map<number, string>): AlertRow {
  const companyIdRaw = asNumberOrNull(row.company_id);
  const companyId = companyIdRaw === 0 ? null : companyIdRaw;
  const kpiId = asNumberOrNull(row.kpi_id);
  return {
    id: asNumber(row.id),
    dedupe_key: asString(row.dedupe_key),
    type: asString(row.type),
    company_id: companyId,
    // A zero company is the group row, not a company we failed to name.
    companyCode: companyIdRaw === 0 ? "Group" : companyId === null ? null : (companyCodes.get(companyId) ?? null),
    kpi_id: kpiId,
    kpiName: kpiId === null ? null : (kpiNames.get(kpiId) ?? null),
    exception_id: asNumberOrNull(row.exception_id),
    severity: (asString(row.severity) || "INFO") as AlertSeverity,
    message: asString(row.message),
    channel: asString(row.channel),
    recipients: asString(row.recipients) || null,
    state: (asString(row.state) || "UNREAD") as AlertState,
    sent_at: asString(row.sent_at) || null,
    acked_at: asString(row.acked_at) || null,
    created_at: asString(row.created_at),
  };
}

async function loadPolicy(): Promise<Policy> {
  const rows = await listItems<Json>("ma_setting", { fields: ["setting_key", "value"], limit: 200 });
  const map = new Map<string, string>();
  for (const row of rows.rows) map.set(asString(row.setting_key), asString(row.value));
  const flag = (key: string, fallback: boolean) => {
    const raw = (map.get(key) ?? "").toLowerCase();
    if (!raw) return fallback;
    return ["on", "true", "1", "yes"].includes(raw);
  };
  const number = (key: string, fallback: number) => {
    const raw = Number(map.get(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  };
  return {
    seasonalTargets: flag("seasonal_targets", DEFAULT_POLICY.seasonalTargets),
    sustainedRule: flag("sustained_rule", DEFAULT_POLICY.sustainedRule),
    confirmPeriods: number("confirm_periods", DEFAULT_POLICY.confirmPeriods),
    spikeMultiple: number("spike_multiple", DEFAULT_POLICY.spikeMultiple),
    memoDeadlineDays: number("memo_deadline_days", DEFAULT_POLICY.memoDeadlineDays),
    toleranceReadings: number("tolerance_readings", DEFAULT_POLICY.toleranceReadings),
  };
}

export async function loadAlerts(params: { state?: string; type?: string; page?: number; size?: number } = {}): Promise<AlertsPayload> {
  const [alertRows, policyRows, companyRows, kpiRows] = await Promise.all([
    listItems<Json>("ma_alert", { fields: ["*"], sort: "-created_at", limit: 500 }),
    listItems<Json>("ma_alert_policy", { fields: ["*"], sort: "type", limit: 50 }),
    listItems<Json>("ma_company", { fields: ["id", "code"], limit: 50 }),
    listItems<Json>("ma_kpi", { fields: ["id", "name"], limit: 2000 }),
  ]);

  const companyCodes = new Map<number, string>();
  for (const row of companyRows.rows) companyCodes.set(asNumber(row.id), asString(row.code));
  const kpiNames = new Map<number, string>();
  for (const row of kpiRows.rows) kpiNames.set(asNumber(row.id), asString(row.name));

  const all = alertRows.rows.map((row) => mapAlert(row, companyCodes, kpiNames));
  const counts = {
    unread: all.filter((row) => row.state === "UNREAD").length,
    read: all.filter((row) => row.state === "READ").length,
    acked: all.filter((row) => row.state === "ACKED").length,
    high: all.filter((row) => row.severity === "HIGH" && row.state !== "ACKED").length,
  };

  const filtered = all.filter((row) => {
    if (params.state && params.state !== "ALL") {
      if (params.state === "OPEN" ? row.state === "ACKED" : row.state !== params.state) return false;
    }
    if (params.type && params.type !== "ALL" && row.type !== params.type) return false;
    return true;
  });

  const policies: AlertPolicyRow[] = policyRows.rows.map((row) => ({
    id: asNumber(row.id),
    type: asString(row.type),
    is_enabled: row.is_enabled === true || row.is_enabled === 1 || row.is_enabled === "1",
    channel: asString(row.channel),
    recipients: asString(row.recipients) || null,
    lead_days: asNumber(row.lead_days),
  }));

  const size = params.size && params.size > 0 ? params.size : 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / size));
  const page = Math.min(Math.max(1, params.page ?? 1), pageCount);

  return {
    alerts: filtered.slice((page - 1) * size, page * size),
    total: filtered.length,
    page,
    size,
    pageCount,
    counts,
    policies,
    types: [...new Set(all.map((row) => row.type))].sort(),
    generatedAt: new Date().toISOString(),
  };
}

interface Draft {
  key: string;
  type: string;
  severity: AlertSeverity;
  companyId: number | null;
  kpiId: number | null;
  exceptionId: number | null;
  message: string;
}

export async function generateAlerts(actorId: number | null) {
  const [policy, kpiRows, readingRows, targetRows, exceptionRows, sourceRows, changeRows, existing] =
    await Promise.all([
      loadPolicy(),
      listItems<Json>("ma_kpi", { fields: KPI_FIELDS, limit: 2000 }),
      listItems<Json>("ma_kpi_actual", { fields: ["kpi_id", "period", "value"], sort: "period", limit: 20000 }),
      listItems<Json>("ma_kpi_target", { fields: ["kpi_id", "period", "target"], limit: 20000 }),
      listItems<Json>("ma_exception", {
        fields: ["id", "company_id", "kpi_id", "status", "period_end", "escalated_level", "memo_due_date"],
        limit: 2000,
      }),
      listItems<Json>("ma_source", { fields: ["code", "name", "steward", "state", "last_sync_at", "sla_minutes"], limit: 50 }),
      listItems<Json>("ma_change_request", { fields: ["id", "summary", "status"], limit: 200 }),
      listItems<Json>("ma_alert", { fields: ["dedupe_key"], limit: 5000 }),
    ]);

  const seen = new Set(existing.rows.map((row) => asString(row.dedupe_key)));
  const kpis = kpiRows.rows.map(mapKpi).filter((row) => row.is_active);
  const targets = new Map<string, number>();
  for (const row of targetRows.rows) {
    targets.set(`${asNumber(row.kpi_id)}|${asString(row.period)}`, asNumber(row.target));
  }
  const series = new Map<number, PeriodPoint[]>();
  for (const row of readingRows.rows) {
    const kpiId = asNumber(row.kpi_id);
    const month = asString(row.period);
    const list = series.get(kpiId) ?? [];
    list.push({ period: month, actual: asNumber(row.value), target: targets.get(`${kpiId}|${month}`) ?? null });
    series.set(kpiId, list);
  }
  for (const list of series.values()) list.sort((a, b) => a.period.localeCompare(b.period));

  const drafts: Draft[] = [];

  for (const kpi of kpis) {
    const points = series.get(kpi.id) ?? [];
    if (points.length === 0) continue;
    const index = points.length - 1;
    const status = statusOf(kpi, points, index, policy);
    const period = points[index].period;

    if (status.code === "CONFIRMED") {
      const favourable = status.label.toLowerCase().startsWith("favorable");
      drafts.push({
        key: `brk:${kpi.company_id}:${kpi.kpi_key}:${period}`,
        type: "BREACH",
        severity: favourable ? "MEDIUM" : "HIGH",
        companyId: kpi.company_id,
        kpiId: kpi.id,
        exceptionId: null,
        message: `${kpi.name} is ${favourable ? "favorable but needs a memo" : "confirmed over its limit"} for ${period}. ${status.label}.`,
      });
    } else if (status.code === "PROVISIONAL") {
      drafts.push({
        key: `prov:${kpi.kpi_key}@${period}`,
        type: "PROVISIONAL",
        severity: "MEDIUM",
        companyId: kpi.company_id,
        kpiId: kpi.id,
        exceptionId: null,
        message: `${kpi.name} entered a provisional run in ${period}. ${status.label}.`,
      });
    } else if (points.length >= 12) {
      const result = forecast(points, kpi, 1);
      const chance = result.breachProbability;
      if (result.enoughHistory && chance !== null && chance > 0.6) {
        drafts.push({
          key: `risk:${kpi.kpi_key}@${period}`,
          type: "FORECAST_RISK",
          severity: "MEDIUM",
          companyId: kpi.company_id,
          kpiId: kpi.id,
          exceptionId: null,
          message: `${kpi.name} has a ${Math.round(chance * 100)}% chance of breaching next month.`,
        });
      }
    }
  }

  for (const row of exceptionRows.rows) {
    const level = asNumber(row.escalated_level);
    if (level >= 1) {
      drafts.push({
        key: `esc:${asNumber(row.id)}:${level}`,
        type: "ESCALATION",
        severity: "HIGH",
        companyId: asNumberOrNull(row.company_id),
        kpiId: asNumberOrNull(row.kpi_id),
        exceptionId: asNumber(row.id),
        message: `Exception ${asNumber(row.id)} reached escalation level ${level} with no memo filed.`,
      });
    }
    if (asString(row.status) === "CLOSED") {
      drafts.push({
        key: `close:${asNumber(row.id)}`,
        type: "CLOSED",
        severity: "INFO",
        companyId: asNumberOrNull(row.company_id),
        kpiId: asNumberOrNull(row.kpi_id),
        exceptionId: asNumber(row.id),
        message: `Exception ${asNumber(row.id)} closed after the readings came back inside tolerance.`,
      });
    }
  }

  for (const row of sourceRows.rows) {
    const lastSync = asString(row.last_sync_at);
    const sla = asNumberOrNull(row.sla_minutes);
    const minutes = lastSync ? (Date.now() - new Date(`${lastSync}Z`).getTime()) / 60000 : null;
    const stale = minutes === null || (sla !== null && minutes > sla);
    if (stale) {
      drafts.push({
        key: `stale:${asString(row.code)}:${lastSync || "never"}`,
        type: "STALE_DATA",
        severity: "MEDIUM",
        companyId: 0,
        kpiId: null,
        exceptionId: null,
        message: `${asString(row.name)} is past its freshness limit (${lastSync ? `last sync ${lastSync}` : "never synced"}). Steward: ${asString(row.steward) || "unassigned"}.`,
      });
    }
  }

  for (const row of changeRows.rows) {
    if (asString(row.status) !== "PENDING") continue;
    drafts.push({
      key: `signoff:${asNumber(row.id)}`,
      type: "SIGN_OFF",
      severity: "INFO",
      // A change is raised against the method, not a company, so it belongs to the group row.
      companyId: 0,
      kpiId: null,
      exceptionId: null,
      message: `Change awaiting sign-off: ${asString(row.summary).replace(/\.+$/, "")}.`,
    });
  }

  const policies = new Map<string, AlertPolicyRow>();
  const policyRows = await listItems<Json>("ma_alert_policy", { fields: ["*"], limit: 50 });
  for (const row of policyRows.rows) {
    policies.set(asString(row.type), {
      id: asNumber(row.id),
      type: asString(row.type),
      is_enabled: row.is_enabled === true || row.is_enabled === 1 || row.is_enabled === "1",
      channel: asString(row.channel),
      recipients: asString(row.recipients) || null,
      lead_days: asNumber(row.lead_days),
    });
  }

  const byType: Record<string, number> = {};
  let created = 0;
  let skipped = 0;
  for (const draft of drafts) {
    if (seen.has(draft.key)) {
      skipped += 1;
      continue;
    }
    const rule = policies.get(draft.type);
    if (rule && !rule.is_enabled) {
      skipped += 1;
      continue;
    }
    await createItem<Json>("ma_alert", {
      dedupe_key: draft.key,
      type: draft.type,
      company_id: draft.companyId,
      kpi_id: draft.kpiId,
      exception_id: draft.exceptionId,
      severity: draft.severity,
      message: draft.message,
      channel: rule?.channel ?? "IN_APP",
      recipients: rule?.recipients ?? null,
      state: "UNREAD",
      sent_at: new Date().toISOString().slice(0, 19),
      acked_at: null,
      acked_by: null,
      created_at: new Date().toISOString().slice(0, 19),
      created_by: actorId,
      updated_at: new Date().toISOString().slice(0, 19),
      updated_by: actorId,
    });
    seen.add(draft.key);
    created += 1;
    byType[draft.type] = (byType[draft.type] ?? 0) + 1;
  }

  return { created, skipped, byType, drafted: drafts.length };
}

export async function setAlertState(id: number, state: AlertState, actorId: number | null) {
  const now = new Date().toISOString().slice(0, 19);
  const payload: Json = { state, updated_at: now, updated_by: actorId };
  if (state === "ACKED") {
    payload.acked_at = now;
    payload.acked_by = actorId;
  }
  await updateItem<Json>("ma_alert", id, payload);
  return { id, state };
}

export async function setAlertPolicy(id: number, body: { isEnabled?: boolean; channel?: string }, actorId: number | null) {
  const payload: Json = { updated_at: new Date().toISOString().slice(0, 19), updated_by: actorId };
  if (typeof body.isEnabled === "boolean") payload.is_enabled = body.isEnabled;
  if (body.channel) payload.channel = body.channel;
  await updateItem<Json>("ma_alert_policy", id, payload);
  return { id };
}
