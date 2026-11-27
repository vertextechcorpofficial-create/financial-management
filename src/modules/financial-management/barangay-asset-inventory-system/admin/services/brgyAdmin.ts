import { enc, forget, get, num, patch, post, text } from "../../shared/api";

/**
 * Section 2 and Table 5 of the guide: the System Admin sets up the barangays, the offices and
 * the lists, and gives every user a role and a barangay. Table 4 makes the barangay code the
 * stem of the asset ID, so the code is maintained here and nowhere else.
 *
 * Platform users carry UUID ids, so a role row is always matched by email (user_email, compared
 * without case) and the legacy integer user_id column is never written.
 */

type Row = Record<string, unknown>;

export const ADMIN_ROLES = ["barangay_admin", "property_custodian", "encoder", "viewer", "municipal", "system_admin"] as const;
export type AdminRoleName = (typeof ADMIN_ROLES)[number];

const ROLE_SET = new Set<string>(ADMIN_ROLES);

export function isAdminRole(value: string): boolean {
  return ROLE_SET.has(value);
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  status: string | null;
}

export interface AdminRole {
  id: number;
  user_email: string | null;
  barangay_id: number | null;
  role: string;
  status: string;
}

export interface AdminBarangay {
  id: number;
  code: string;
  name: string;
  status: string;
}

export interface AdminOffice {
  id: number;
  barangay_id: number;
  name: string;
  sort: number;
  status: string;
}

export interface AdminCustodian {
  id: number;
  barangay_id: number;
  full_name: string;
  position: string | null;
  status: string;
}

export interface AdminClassification {
  id: number;
  name: string;
  life_span_years: number | null;
  sort: number;
  status: string;
}

export interface AdminItemType {
  id: number;
  name: string;
  classification_id: number;
  status: string;
}

export interface AdminReferenceData {
  barangays: AdminBarangay[];
  offices: AdminOffice[];
  custodians: AdminCustodian[];
  classifications: AdminClassification[];
  itemTypes: AdminItemType[];
}

/* --------------------------------------------------------------- the role table */

const ROLE_FIELDS = "id,user_email,barangay_id,role,status";

function mapUser(row: Row): AdminUser {
  const email = text(row.email).trim();
  const first = text(row.first_name).trim();
  const last = text(row.last_name).trim();
  return {
    id: text(row.id),
    email,
    name: [first, last].filter(Boolean).join(" ") || email,
    status: typeof row.status === "string" ? row.status : null,
  };
}

function mapRole(row: Row): AdminRole {
  const email = text(row.user_email).trim();
  return {
    id: Number(row.id),
    user_email: email || null,
    barangay_id: num(row.barangay_id),
    role: text(row.role),
    status: text(row.status),
  };
}

/** Directus returns a bit column as a Buffer, so a deleted flag can arrive in three shapes. */
function isDeletedFlag(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  if (value && typeof value === "object" && "data" in (value as Record<string, unknown>)) {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return Number(data[0] ?? 0) === 1;
  }
  return false;
}

function mapPlatformUser(row: Row): AdminUser {
  const email = text(row.user_email).trim();
  const name = [text(row.user_fname).trim(), text(row.user_lname).trim()].filter(Boolean).join(" ");
  return {
    id: String(row.user_id ?? email),
    email,
    name: name || email,
    status: row.is_blocked === true ? "blocked" : "active",
  };
}

/**
 * The real logins live in the platform user table, collection "user", which carries user_email.
 * The Directus system users collection only holds a handful of service accounts, so it is the
 * fallback, not the source. A failure returns an empty list so the screen still opens.
 */
export async function listUsers(): Promise<AdminUser[]> {
  const rows = await get<Row[]>(
    "/items/user?fields=user_id,user_email,user_fname,user_lname,is_deleted,is_blocked&limit=-1&sort=user_lname,user_fname"
  ).catch(() => null);
  if (rows) {
    return rows
      .filter((row) => !isDeletedFlag(row.is_deleted))
      .map(mapPlatformUser)
      .filter((user) => user.email.includes("@"));
  }
  try {
    const fallback = await get<Row[]>("/users?fields=id,email,first_name,last_name,status&limit=-1&sort=first_name");
    return (fallback ?? []).filter((row) => text(row.email).includes("@")).map(mapUser);
  } catch {
    return [];
  }
}

export async function listRoles(): Promise<AdminRole[]> {
  const rows = await get<Row[]>("/items/brgy_user_role?sort=user_email&limit=-1&fields=" + ROLE_FIELDS);
  return (rows ?? []).map(mapRole);
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * One row per user is the intent of Table 5, so the existing row for this email is updated and
 * only a user without a row gets a new active one. The email is matched case-insensitively by
 * fetching the candidates and comparing the trimmed values.
 */
export async function saveRole(input: { email: string; role: string; barangayId: number | null }): Promise<AdminRole> {
  // the role cache lives for a minute, so a grant lands on the next request after this call
  forget("roles:");
  const email = text(input.email).trim();
  if (!email) throw new Error("An email is required to assign a role.");
  if (!email.includes("@")) throw new Error("That does not look like an email address: " + email + ".");
  if (!isAdminRole(input.role)) {
    throw new Error("Choose one of the six roles: " + ADMIN_ROLES.join(", ") + ".");
  }
  const requested = num(input.barangayId);
  const barangayId = requested && requested > 0 ? requested : null;

  const rows = await get<Row[]>(
    "/items/brgy_user_role?filter=" + enc({ user_email: { _icontains: email } }) + "&fields=" + ROLE_FIELDS + "&limit=-1"
  );
  // rule 18: one person may hold several roles, so the same email with a different role is a second row
  const existing = (rows ?? []).find((row) => sameEmail(text(row.user_email), email) && text(row.role) === input.role) ?? null;

  const body: Row = { user_email: email, role: input.role, barangay_id: barangayId, status: "active" };
  if (existing) {
    const saved = await patch<Row>("/items/brgy_user_role/" + Number(existing.id), body);
    return mapRole(saved ?? { ...existing, ...body });
  }
  const created = await post<Row>("/items/brgy_user_role", body);
  return mapRole(created ?? body);
}

/** Table 5 says records are kept for audit, so a role is turned inactive and never deleted. */
export async function deactivateRole(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) throw new Error("A role row is required to deactivate.");
  await patch("/items/brgy_user_role/" + id, { status: "inactive" });
  forget("roles:");
}

/* --------------------------------------------------------------- the reference lists */

function mapBarangay(row: Row): AdminBarangay {
  return { id: Number(row.id), code: text(row.code), name: text(row.name), status: text(row.status) };
}

function mapOffice(row: Row): AdminOffice {
  return { id: Number(row.id), barangay_id: Number(row.barangay_id), name: text(row.name), sort: Number(row.sort ?? 0), status: text(row.status) };
}

function mapCustodian(row: Row): AdminCustodian {
  return {
    id: Number(row.id),
    barangay_id: Number(row.barangay_id),
    full_name: text(row.full_name),
    position: (row.position as string) ?? null,
    status: text(row.status),
  };
}

function mapClassification(row: Row): AdminClassification {
  return {
    id: Number(row.id),
    name: text(row.name),
    life_span_years: num(row.life_span_years),
    sort: Number(row.sort ?? 0),
    status: text(row.status),
  };
}

function mapItemType(row: Row): AdminItemType {
  return { id: Number(row.id), name: text(row.name), classification_id: Number(row.classification_id), status: text(row.status) };
}

export async function listReferenceData(): Promise<AdminReferenceData> {
  const [barangays, offices, custodians, classifications, itemTypes] = await Promise.all([
    get<Row[]>("/items/brgy_barangay?sort=code&limit=-1&fields=id,code,name,status"),
    get<Row[]>("/items/brgy_office?sort=barangay_id,sort,name&limit=-1&fields=id,barangay_id,name,sort,status"),
    get<Row[]>("/items/brgy_custodian?sort=barangay_id,full_name&limit=-1&fields=id,barangay_id,full_name,position,status"),
    get<Row[]>("/items/brgy_classification?sort=sort,name&limit=-1&fields=id,name,life_span_years,sort,status"),
    get<Row[]>("/items/brgy_item_type?sort=name&limit=-1&fields=id,name,classification_id,status"),
  ]);
  return {
    barangays: (barangays ?? []).map(mapBarangay),
    offices: (offices ?? []).map(mapOffice),
    custodians: (custodians ?? []).map(mapCustodian),
    classifications: (classifications ?? []).map(mapClassification),
    itemTypes: (itemTypes ?? []).map(mapItemType),
  };
}

const REFERENCE_KINDS = ["barangay", "office", "custodian", "classification", "item_type"] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export interface ReferenceInput {
  kind: string;
  id?: string | number | null;
  name?: string | null;
  code?: string | null;
  district?: string | null;
  contactPerson?: string | null;
  position?: string | null;
  barangayId?: string | number | null;
  classificationId?: string | number | null;
  lifeSpanYears?: string | number | null;
  sort?: string | number | null;
}

export interface SavedReference {
  kind: ReferenceKind;
  id: number;
  name: string;
  code: string | null;
}

function readKind(value: string): ReferenceKind {
  const kind = value as ReferenceKind;
  if (!REFERENCE_KINDS.includes(kind)) {
    throw new Error("Unknown list: " + (value || "(none)") + ". Use one of " + REFERENCE_KINDS.join(", ") + ".");
  }
  return kind;
}

/** Section 5: names are compared without case and without extra spaces. */
function normName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanName(value: string | null | undefined, label: string): string {
  const name = text(value).trim().replace(/\s+/g, " ");
  if (!name) throw new Error("A " + label + " name is required.");
  return name;
}

function requireId(value: number | null, message: string): number {
  if (value === null || !Number.isFinite(value) || value <= 0) throw new Error(message);
  return value;
}

/** True when another row in the same scope already carries this name. */
async function nameTaken(
  collection: string,
  name: string,
  parent: { field: string; id: number } | null,
  excludeId: number | null,
  nameField = "name"
): Promise<boolean> {
  const query = parent
    ? "/items/" + collection + "?filter=" + enc({ [parent.field]: { _eq: parent.id } }) + "&fields=id," + nameField + "&limit=-1"
    : "/items/" + collection + "?fields=id," + nameField + "&limit=-1";
  const rows = await get<Row[]>(query);
  const wanted = normName(name);
  return (rows ?? []).some((row) => Number(row.id) !== Number(excludeId ?? 0) && normName(text(row[nameField])) === wanted);
}

/** Table 4: two barangays with the same code would produce the same asset IDs. */
async function barangayCodeTaken(code: string, excludeId: number | null): Promise<boolean> {
  const rows = await get<Row[]>("/items/brgy_barangay?fields=id,code&limit=-1");
  return (rows ?? []).some((row) => Number(row.id) !== Number(excludeId ?? 0) && text(row.code).trim().toUpperCase() === code);
}

function saved(kind: ReferenceKind, row: Row | null, fallbackId: number | null, name: string, code: string | null): SavedReference {
  return { kind, id: Number(row?.id ?? fallbackId ?? 0), name: text(row?.name) || name, code: code ?? (text(row?.code) || null) };
}

/**
 * Section 2: one editor for every list. A row is updated when an id arrives and inserted
 * otherwise. Nothing is ever deleted, because the guide keeps history for audit.
 */
export async function saveReference(input: ReferenceInput): Promise<SavedReference> {
  // the lists feed every screen, so they cannot outlive a change to them
  forget("lookups:");
  const kind = readKind(input.kind);
  const id = num(input.id);
  if (input.id !== undefined && input.id !== null && input.id !== "" && !id) {
    throw new Error("A valid row id is needed to update a row.");
  }

  if (kind === "barangay") {
    const name = cleanName(input.name, "barangay");
    const code = text(input.code).trim().toUpperCase();
    if (!code) throw new Error("A barangay code is required, for example BRG01.");
    if (await nameTaken("brgy_barangay", name, null, id)) throw new Error("Another barangay already uses the name " + name + ".");
    if (await barangayCodeTaken(code, id)) throw new Error("Another barangay already uses the code " + code + ".");
    const body: Row = { code, name };
    if (input.district !== undefined) body.district = text(input.district).trim() || null;
    if (input.contactPerson !== undefined) body.contact_person = text(input.contactPerson).trim() || null;
    const row = id ? await patch<Row>("/items/brgy_barangay/" + id, body) : await post<Row>("/items/brgy_barangay", body);
    return saved(kind, row ?? null, id, name, code);
  }

  if (kind === "office") {
    const name = cleanName(input.name, "office");
    const barangayId = requireId(num(input.barangayId), "An office must belong to a barangay.");
    if (await nameTaken("brgy_office", name, { field: "barangay_id", id: barangayId }, id)) {
      throw new Error("That barangay already has an office named " + name + ".");
    }
    const body: Row = { barangay_id: barangayId, name };
    if (input.sort !== undefined && input.sort !== null && input.sort !== "") body.sort = num(input.sort) ?? 0;
    const row = id ? await patch<Row>("/items/brgy_office/" + id, body) : await post<Row>("/items/brgy_office", body);
    return saved(kind, row ?? null, id, name, null);
  }

  if (kind === "custodian") {
    const name = cleanName(input.name, "custodian");
    const barangayId = requireId(num(input.barangayId), "A custodian must belong to a barangay.");
    if (await nameTaken("brgy_custodian", name, { field: "barangay_id", id: barangayId }, id, "full_name")) {
      throw new Error("That barangay already has a custodian named " + name + ".");
    }
    const body: Row = { barangay_id: barangayId, full_name: name, position: text(input.position).trim() || null };
    const row = id ? await patch<Row>("/items/brgy_custodian/" + id, body) : await post<Row>("/items/brgy_custodian", body);
    return saved(kind, row ?? null, id, name, null);
  }

  if (kind === "classification") {
    const name = cleanName(input.name, "classification");
    let lifeSpan: number | null = null;
    const raw = input.lifeSpanYears;
    if (raw !== undefined && raw !== null && !(typeof raw === "string" && raw.trim() === "")) {
      const years = Number(raw);
      if (!Number.isFinite(years) || !Number.isInteger(years) || years < 1) {
        throw new Error("The life span must be a whole number of years, 1 or more.");
      }
      lifeSpan = years;
    }
    if (await nameTaken("brgy_classification", name, null, id)) {
      throw new Error("Another classification already uses the name " + name + ".");
    }
    const body: Row = { name };
    if (raw !== undefined) body.life_span_years = lifeSpan;
    if (input.sort !== undefined && input.sort !== null && input.sort !== "") body.sort = num(input.sort) ?? 0;
    const row = id ? await patch<Row>("/items/brgy_classification/" + id, body) : await post<Row>("/items/brgy_classification", body);
    return saved(kind, row ?? null, id, name, null);
  }

  const name = cleanName(input.name, "item type");
  const classificationId = requireId(num(input.classificationId), "Choose the classification this item type belongs to.");
  const classification = await get<Row[]>(
    "/items/brgy_classification?filter=" + enc({ id: { _eq: classificationId } }) + "&fields=id&limit=1"
  );
  if (!classification?.length) throw new Error("That classification does not exist. Add the classification first.");
  if (await nameTaken("brgy_item_type", name, { field: "classification_id", id: classificationId }, id)) {
    throw new Error("That classification already has an item type named " + name + ".");
  }
  const body: Row = { name, classification_id: classificationId };
  const row = id ? await patch<Row>("/items/brgy_item_type/" + id, body) : await post<Row>("/items/brgy_item_type", body);
  return saved(kind, row ?? null, id, name, null);
}
