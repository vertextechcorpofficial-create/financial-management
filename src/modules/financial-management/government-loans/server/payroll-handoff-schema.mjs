import assert from "node:assert/strict";

const handoffs = "government_loan_payroll_handoffs";
const requests = "government_loan_requests";
const alias = { field: "payroll_handoffs", type: "alias", meta: { special: ["o2m"], interface: "list-o2m" } };
const field = (field, type, schema = {}) => ({ field, type, schema: { is_nullable: false, ...schema } });
const fields = [
  { ...field("id", "uuid", { is_primary_key: true }), meta: { special: ["uuid"], hidden: true } },
  field("request_id", "integer", { is_unique: true }),
  field("prior_payroll_loan_id", "integer", { is_unique: true, is_nullable: true }),
  field("state", "string", { max_length: 24, is_indexed: true }),
  field("payload", "json"),
  field("delivery", "json"),
  field("updated_at", "dateTime", { is_indexed: true }),
];

async function schema() {
  const args = process.argv.slice(2);
  const apply = args[0] === "--apply";
  assert(!args.length || (apply && args.length === 1), "Run without arguments for a preview, or pass --apply.");
  const base = new URL(process.env.NEXT_PUBLIC_API_BASE_URL);
  assert.equal(base.origin, "http://100.110.197.61:8056", "This setup targets dummy FM Directus.");
  assert(process.env.DIRECTUS_STATIC_TOKEN, "Configure the existing Directus service token.");

  async function request(method, path, body, optional = false) {
    const response = await fetch(new URL(path, base), {
      method, redirect: "error", signal: AbortSignal.timeout(method === "GET" ? 15_000 : 180_000),
      headers: { Authorization: "Bearer " + process.env.DIRECTUS_STATIC_TOKEN, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(error => { throw new Error(method + " " + path.split("?")[0] + " failed with " + error.name); });
    if (optional && [403, 404].includes(response.status)) return null;
    const json = await response.json().catch(() => null);
    assert(response.ok, method + " " + path.split("?")[0] + " returned " + response.status +
      " " + (json?.errors?.[0]?.extensions?.code ?? ""));
    return json?.data;
  }

  const permissions = await request("GET", "/permissions?" + new URLSearchParams({
    fields: "collection", limit: "1", "filter[collection][_in]": [handoffs, "*"].join(","),
  }));
  assert.equal(permissions.length, 0, "Review Directus permissions on the Payroll handoff collections first.");
  await request("GET", "/collections/" + requests);
  const changes = [];
  const hasCollection = await request("GET", "/collections/" + handoffs, undefined, true);
  if (!hasCollection) {
    changes.push(handoffs);
    if (apply) {
      await request("POST", "/collections", { collection: handoffs, fields, schema: {}, meta: { hidden: true, accountability: "activity" } });
      console.log("Created", handoffs);
    }
  }
  let requestLink;
  if (hasCollection || apply) {
    const existing = await request("GET", "/fields/" + handoffs);
    for (const expected of fields) {
      const current = existing.find(row => row.field === expected.field);
      assert(current?.type === expected.type &&
        Object.entries(expected.schema).every(([key, value]) => current.schema?.[key] === value),
        "Unexpected definition for " + handoffs + "." + expected.field);
    }
    requestLink = existing.find(row => row.field === "request_id")?.schema;
  }

  const currentAlias = await request("GET", "/fields/" + requests + "/" + alias.field, undefined, true);
  if (currentAlias) {
    assert.equal(currentAlias.type, alias.type);
    assert(currentAlias.meta?.special?.includes("o2m"));
  } else {
    changes.push(requests + "." + alias.field);
    if (apply) {
      await request("POST", "/fields/" + requests, alias);
      console.log("Created", requests + "." + alias.field);
    }
  }
  const relation = (hasCollection || apply) &&
    await request("GET", "/relations/" + handoffs + "/request_id", undefined, true);
  if (relation) {
    assert.equal(relation.related_collection, requests);
    assert.equal(relation.meta?.one_field, alias.field);
    if (requestLink?.foreign_key_table) {
      assert.equal(requestLink.foreign_key_table, requests);
      assert.equal(requestLink.foreign_key_column, "id");
    }
    if (relation.schema?.on_delete) assert(["RESTRICT", "NO ACTION"].includes(relation.schema.on_delete));
    await request("GET", "/items/" + requests + "?fields=id,payroll_handoffs.id&limit=1&deep[payroll_handoffs][_limit]=1");
  } else {
    changes.push(handoffs + ".request_id relation");
    if (apply) await request("POST", "/relations", {
      collection: handoffs, field: "request_id", related_collection: requests, schema: { on_delete: "RESTRICT" },
      meta: { one_field: alias.field },
    });
  }
  console.log(apply ? "Applied" : "Previewed", changes.length ? changes.join(", ") : "no changes");
}

schema().catch(error => { console.error(error.message); process.exitCode = 1; });
