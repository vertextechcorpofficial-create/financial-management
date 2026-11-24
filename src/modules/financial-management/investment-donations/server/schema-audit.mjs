// Read-only: SELECT and SHOW only. Never applies migrations or grants.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function migrationManifest() {
  const files = ["period-events.mysql.sql", "annual-review.mysql.sql", "reconciliation.mysql.sql"];
  const tables = [];
  const triggers = [];
  for (const file of files) {
    const sql = await readFile(new URL(file, import.meta.url), "utf8");
    for (const match of sql.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\) ENGINE=/g)) {
      const columns = [...match[2].matchAll(/^\s{4}(\w+)\s+(BIGINT UNSIGNED|INT UNSIGNED|VARCHAR\(\d+\)|DATETIME\(\d+\)|DATE|JSON)[^\r\n]*/gm)]
        .map(column => ({ name: column[1], definition: column[0].trim() }));
      tables.push({ file, name: match[1], columns,
        constraints: [...match[2].matchAll(/CONSTRAINT (\w+)/g)].map(item => item[1]),
        indexes: [...match[2].matchAll(/(?:UNIQUE KEY|INDEX) (\w+)/g)].map(item => item[1]) });
    }
    for (const match of sql.matchAll(/CREATE TRIGGER (\w+) BEFORE (UPDATE|DELETE) ON (\w+)/g)) {
      triggers.push({ name: match[1], event: match[2], table: match[3] });
    }
  }
  return { tables, triggers };
}

export async function auditDatabase(connection) {
  const manifest = await migrationManifest();
  const [[identity]] = await connection.query("SELECT DATABASE() AS db, VERSION() AS version");
  if (!identity.db) throw new Error("No database selected.");
  const issues = [];
  const tables = [];
  for (const expected of manifest.tables) {
    const [rows] = await connection.execute(
      "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      [expected.name]);
    if (!rows.length) {
      issues.push(`${expected.name}: missing table`);
      continue;
    }
    const [[definition]] = await connection.query(`SHOW CREATE TABLE \`${expected.name}\``);
    const ddl = definition["Create Table"].replaceAll("`", "");
    for (const column of expected.columns) {
      const actual = rows.find(row => row.COLUMN_NAME === column.name);
      if (!actual) { issues.push(`${expected.name}.${column.name}: missing column`); continue; }
      const expectedType = column.definition.slice(column.name.length + 1).match(/^(BIGINT UNSIGNED|INT UNSIGNED|VARCHAR\(\d+\)|DATETIME\(\d+\)|DATE|JSON)/i)[0].toLowerCase();
      if (actual.COLUMN_TYPE.toLowerCase() !== expectedType) {
        issues.push(`${expected.name}.${column.name}: expected ${expectedType}, found ${actual.COLUMN_TYPE}`);
      }
      const nullable = !/NOT NULL|PRIMARY KEY/.test(column.definition);
      if ((actual.IS_NULLABLE === "YES") !== nullable) issues.push(`${expected.name}.${column.name}: nullability differs`);
      if (/AUTO_INCREMENT/.test(column.definition) && !actual.EXTRA.includes("auto_increment")) issues.push(`${expected.name}.${column.name}: missing auto increment`);
      if (/PRIMARY KEY/.test(column.definition) && actual.COLUMN_KEY !== "PRI") issues.push(`${expected.name}.${column.name}: missing primary key`);
      if (/DEFAULT CURRENT_TIMESTAMP\(3\)/.test(column.definition) &&
          !/^current_timestamp\(3\)$/i.test(actual.COLUMN_DEFAULT ?? "")) issues.push(`${expected.name}.${column.name}: missing timestamp default`);
    }
    for (const name of [...expected.constraints, ...expected.indexes]) {
      if (!ddl.includes(name)) issues.push(`${expected.name}: missing constraint/index ${name}`);
    }
    if (!/ENGINE=InnoDB/i.test(ddl)) issues.push(`${expected.name}: must use InnoDB`);
    tables.push({ table: expected.name, columns: rows.length, definition: ddl });
  }
  const [triggers] = await connection.query(
    "SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()");
  for (const expected of manifest.triggers) {
    const actual = triggers.find(row => row.TRIGGER_NAME === expected.name);
    if (!actual || actual.EVENT_MANIPULATION !== expected.event || actual.EVENT_OBJECT_TABLE !== expected.table ||
        !/SIGNAL SQLSTATE '45000'/i.test(actual.ACTION_STATEMENT)) issues.push(`${expected.name}: missing or unexpected append-only trigger`);
  }
  const [grants] = await connection.query("SHOW GRANTS FOR CURRENT_USER()");
  // Do not print account identifiers, passwords or connection URIs.
  const privileges = grants.map(row => Object.values(row)[0].split(/ TO /i)[0]);
  const grantIssues = auditPrivileges(privileges, identity.db);
  issues.push(...grantIssues);
  return { database: identity.db, version: identity.version, tables, privileges, issues,
    note: "Review CHECK expressions and effective inherited-role privileges before release; named objects alone do not prove equivalent behavior." };
}

export function auditPrivileges(grants, database) {
  const required = {
    cgl_registers: ["SELECT", "UPDATE"], cgl_periods: ["SELECT", "INSERT", "UPDATE"],
    cgl_journal_entries: ["SELECT", "INSERT", "UPDATE"], cgl_journal_lines: ["SELECT", "INSERT"],
    cgl_audit_events: ["SELECT", "INSERT"], cgl_reconciliations: ["SELECT", "INSERT", "UPDATE"],
    cgl_reconciliation_events: ["SELECT", "INSERT"], cgl_period_events: ["SELECT", "INSERT"],
    cgl_annual_review_events: ["SELECT", "INSERT"],
  };
  const issues = [];
  const parsed = grants.flatMap(grant => {
    const match = grant.replaceAll("`", "").match(/^GRANT (.+) ON ([^. ]+)\.([^ ]+)/i);
    if (!match) { issues.push("Inherited role grant requires DBA review."); return []; }
    return [{ privileges: match[1].split(",").map(value => value.trim().toUpperCase()), db: match[2], table: match[3] }];
  });
  for (const [table, needs] of Object.entries(required)) {
    const effective = new Set(parsed.filter(grant => (grant.db === database || grant.db === "*") &&
      (grant.table === table || grant.table === "*")).flatMap(grant => grant.privileges));
    for (const privilege of needs) {
      if (!effective.has(privilege) && !effective.has("ALL PRIVILEGES")) issues.push(`${table}: missing direct ${privilege} grant (inherited roles need separate review)`);
    }
    if ([...effective].some(privilege => privilege !== "USAGE" && !needs.includes(privilege))) {
      issues.push(`${table}: excessive privileges; use the dedicated-account grant template`);
    }
  }
  return issues;
}

async function auditDirectus() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new Error("Directus configuration missing");
  const manifest = await migrationManifest();
  const results = [];
  for (const table of manifest.tables) {
    const response = await fetch(`${base}/fields/${table.name}`, { headers: { Authorization: `Bearer ${token}` },
      redirect: "error", signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    const columns = body.data ?? [];
    results.push({ table: table.name, status: response.status,
      missingColumns: table.columns.filter(expected => !columns.some(column => column.field === expected.name)).map(column => column.name),
      fields: columns.map(column => ({ name: column.field, type: column.schema?.data_type,
        nullable: column.schema?.is_nullable, primary: column.schema?.is_primary_key })) });
  }
  return { endpoint: new URL(base).origin, results,
    unverified: ["SQL grants", "CHECK expressions", "indexes", "append-only triggers"],
    status: "Partial metadata check only; direct MySQL audit still required." };
}

async function main() {
  if (process.argv.includes("--directus")) {
    console.log(JSON.stringify(await auditDirectus(), null, 2));
    process.exitCode = 2;
    return;
  }
  const uri = process.env.CGL_MYSQL_URL;
  if (!uri) {
    console.error("BLOCKED: CGL_MYSQL_URL is not configured. No SQL was executed.");
    process.exitCode = 2;
    return;
  }
  const { default: mysql } = await import("mysql2/promise");
  const connection = await mysql.createConnection(uri);
  try {
    const result = await auditDatabase(connection);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.issues.length ? 1 : 0;
  } finally { await connection.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error("Database audit failed:", error.code ?? error.name); process.exitCode = 1; });
}
