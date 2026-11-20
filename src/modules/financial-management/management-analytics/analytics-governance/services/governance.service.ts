import "server-only";

import { createItem, deleteItem, listItems, updateItem } from "./directus";
import { NotFoundError, ValidationError } from "./errors";
import { phtStamp } from "../pht";
import type {
  AssignmentRow,
  ChangeRequestRow,
  GrantDomain,
  GovernancePayload,
  KpiOptionRow,
  OrgCompanyRow,
  PolicyRow,
  RoleRow,
} from "../types";

type Row = Record<string, unknown>;

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const str = (value: unknown): string => (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value));

export async function loadGovernance(): Promise<GovernancePayload> {
  const [companiesRes, rolesRes, grantsRes, assignmentsRes, settingsRes, changesRes, usersRes, unitsRes, kpisRes] = await Promise.all([
    listItems<Row>("ma_company", { fields: ["id", "code", "name", "kind", "currency", "revenue_weight", "headcount", "erp_company_id", "is_active"], sort: "sort", limit: 100 }),
    listItems<Row>("ma_role", { fields: ["id", "code", "name", "scope", "description"], sort: "id", limit: 50 }),
    listItems<Row>("ma_role_grant", { fields: ["id", "role_id", "company_id", "domain"], limit: 500 }),
    listItems<Row>("ma_user_role", { fields: ["id", "user_id", "role_id", "company_id"], limit: 500 }),
    listItems<Row>("ma_setting", { fields: ["setting_key", "value", "label", "note"], sort: "setting_key", limit: 200 }),
    listItems<Row>("ma_change_request", { fields: ["id", "entity", "entity_id", "summary", "status", "created_at", "requested_by", "decided_at", "note"], sort: "-id", limit: 100 }),
    listItems<Row>("user", { fields: ["user_id", "user_fname", "user_lname", "user_email"], sort: "user_lname", limit: 400 }),
    listItems<Row>("ma_unit", { fields: ["id", "company_id"], limit: 500 }),
    listItems<Row>("ma_kpi", { fields: ["id", "kpi_key", "name"], sort: "kpi_key", limit: 500 }),
  ]);

  const companies = new Map<number, { code: string; name: string }>();
  for (const row of companiesRes.rows) companies.set(num(row.id), { code: str(row.code), name: str(row.name) });

  const unitsPerCompany = new Map<number, number>();
  for (const unit of unitsRes.rows) {
    const id = num(unit.company_id);
    unitsPerCompany.set(id, (unitsPerCompany.get(id) ?? 0) + 1);
  }

  const grantsByRole = new Map<number, Array<{ companyCode: string; domain: GrantDomain }>>();
  for (const grant of grantsRes.rows) {
    const roleId = num(grant.role_id);
    const list = grantsByRole.get(roleId) ?? [];
    list.push({ companyCode: companies.get(num(grant.company_id))?.code ?? "ALL", domain: str(grant.domain) as GrantDomain });
    grantsByRole.set(roleId, list);
  }

  const roleNames = new Map<number, string>();
  const roles: RoleRow[] = rolesRes.rows.map((row) => {
    const id = num(row.id);
    roleNames.set(id, str(row.name));
    const grants = (grantsByRole.get(id) ?? []).sort((a, b) => a.companyCode.localeCompare(b.companyCode) || a.domain.localeCompare(b.domain));
    return {
      id,
      code: str(row.code),
      name: str(row.name),
      scope: str(row.scope),
      description: row.description === null ? null : str(row.description),
      grants,
    };
  });

  const userLabels = new Map<number, { name: string; email: string }>();
  const users = usersRes.rows.map((row) => {
    const id = num(row.user_id);
    const name = [str(row.user_fname), str(row.user_lname)].filter(Boolean).join(" ") || str(row.user_email);
    userLabels.set(id, { name, email: str(row.user_email) });
    return { id, name, email: str(row.user_email) };
  });

  const assignments: AssignmentRow[] = assignmentsRes.rows.map((row) => {
    const userId = num(row.user_id);
    const companyId = num(row.company_id);
    return {
      id: num(row.id),
      userId,
      name: userLabels.get(userId)?.name ?? `User ${userId}`,
      email: userLabels.get(userId)?.email ?? "",
      roleId: num(row.role_id),
      roleName: roleNames.get(num(row.role_id)) ?? `Role ${num(row.role_id)}`,
      companyId,
      companyLabel: companyId === 0 ? "Every company" : companies.get(companyId)?.name ?? `Company ${companyId}`,
    };
  });

  const policies: PolicyRow[] = settingsRes.rows.map((row) => ({
    key: str(row.setting_key),
    value: str(row.value),
    label: str(row.label) || str(row.setting_key),
    note: row.note === null ? null : str(row.note),
  }));

  const changes: ChangeRequestRow[] = changesRes.rows.map((row) => ({
    id: num(row.id),
    entity: str(row.entity),
    entityId: row.entity_id === null ? null : num(row.entity_id),
    summary: str(row.summary),
    status: str(row.status),
    requestedAt: row.created_at === null ? null : str(row.created_at),
    requestedBy: row.requested_by === null ? null : num(row.requested_by),
    decidedAt: row.decided_at === null ? null : str(row.decided_at),
    note: row.note === null ? null : str(row.note),
  }));

  const kpiOptions: KpiOptionRow[] = kpisRes.rows.map((row) => ({
    id: num(row.id),
    label: `${str(row.kpi_key)} · ${str(row.name)}`,
  }));

  const orgCompanies: OrgCompanyRow[] = companiesRes.rows.map((row) => ({
    id: num(row.id),
    code: str(row.code),
    name: str(row.name),
    kind: str(row.kind),
    currency: str(row.currency),
    revenueWeight: num(row.revenue_weight),
    headcount: num(row.headcount),
    erpCompanyId: row.erp_company_id === null ? null : num(row.erp_company_id),
    isActive: Boolean(row.is_active),
    units: unitsPerCompany.get(num(row.id)) ?? 0,
  }));

  return { roles, assignments, companies: orgCompanies, policies, changes, users, kpis: kpiOptions };
}

export async function createAssignment(input: { userId: number; roleId: number; companyId: number }, actorId: number | null) {
  if (!input.userId) throw new ValidationError("Choose the person this access belongs to.");
  if (!input.roleId) throw new ValidationError("Choose a role.");
  const existing = await listItems<Row>("ma_user_role", {
    fields: ["id"],
    filter: { user_id: { _eq: input.userId }, role_id: { _eq: input.roleId }, company_id: { _eq: input.companyId } },
    limit: 1,
  });
  if (existing.rows.length > 0) throw new ValidationError("That person already holds this role for that scope.");
  const now = phtStamp();
  const created = await createItem<Row>("ma_user_role", {
    user_id: input.userId,
    role_id: input.roleId,
    company_id: input.companyId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });
  return { id: num(created.id) };
}

export async function deleteAssignment(id: number, actorId: number | null) {
  const { rows } = await listItems<Row>("ma_user_role", { fields: ["id"], filter: { id: { _eq: id } }, limit: 1 });
  const row = rows[0];
  if (!row) throw new NotFoundError("That access grant no longer exists.");
  await deleteItem("ma_user_role", id);
  return { id, by: actorId };
}

export async function savePolicy(key: string, value: string, actorId: number | null) {
  const { rows } = await listItems<Row>("ma_setting", { fields: ["id", "setting_key", "value_type"], filter: { setting_key: { _eq: key } }, limit: 1 });
  if (rows.length === 0) throw new NotFoundError("That policy setting does not exist.");
  const id = num(rows[0].id);
  if (str(rows[0].value_type) === "BOOLEAN" && value !== "on" && value !== "off") {
    throw new ValidationError("A switch setting is either on or off.");
  }
  await updateItem("ma_setting", id, { value, updated_at: phtStamp(), updated_by: actorId });
  return { key, value };
}

/** A change of method has to be on the board before it takes effect, so it is raised here. */
export async function raiseChange(input: { summary: string; kpiId: number | null }, actorId: number | null) {
  const summary = input.summary.trim();
  if (summary.length < 10) throw new ValidationError("Say what changes, in at least a sentence.");
  if (summary.length > 500) throw new ValidationError("Keep the summary under 500 characters.");
  const now = phtStamp();
  const created = await createItem<Row>("ma_change_request", {
    entity: "ma_kpi",
    entity_id: input.kpiId,
    summary,
    status: "PENDING",
    requested_by: actorId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });
  return { id: num(created.id) };
}

export async function decideChange(id: number, status: string, note: string | null, actorId: number | null) {
  if (status !== "APPROVED" && status !== "REJECTED") {
    throw new ValidationError("A decision is either approved or rejected.");
  }
  const { rows } = await listItems<Row>("ma_change_request", { fields: ["id", "status"], filter: { id: { _eq: id } }, limit: 1 });
  const row = rows[0];
  if (!row) throw new NotFoundError("That change request no longer exists.");
  if (str(row.status) !== "PENDING") throw new ValidationError("That change has already been decided.");
  await updateItem("ma_change_request", id, {
    status,
    note,
    decided_by: actorId,
    decided_at: phtStamp(),
    updated_at: phtStamp(),
    updated_by: actorId,
  });
  return { id, status };
}
