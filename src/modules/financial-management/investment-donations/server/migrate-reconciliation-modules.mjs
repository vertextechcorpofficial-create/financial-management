import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("dotenv").config({ path: [".env.local", ".env"], quiet: true });
const apply = process.argv.includes("--apply");
const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
const token = process.env.DIRECTUS_STATIC_TOKEN;
assert.ok(base && token, "Directus configuration is required.");
async function request(path, method = "GET", body) {
  const response = await fetch(`${base}/${path}`, { method, redirect: "error",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  assert.ok(response.ok, `${method} ${path.split("?")[0]}: HTTP ${response.status}`);
  return response.status === 204 ? undefined : (await response.json()).data;
}
const rows = (collection, filter) => request(`items/${collection}?${new URLSearchParams({ filter: JSON.stringify(filter), limit: "-1" })}`);
const oldSlug = "investment-donations-monthly-reconciliation";
const prefix = `${oldSlug}-`;
const modules = await rows("modules", { slug: { _in: [oldSlug, `${prefix}reconciliator`, `${prefix}approver`, "capital-giving-ledger"] } });
const parent = modules.find(row => row.slug === "capital-giving-ledger");
assert.equal(parent?.id, 2603);
const old = modules.find(row => row.slug === oldSlug || row.slug === `${prefix}reconciliator`);
assert.equal(old?.id, 2611);
assert.equal(old.parent_module_id, parent.id);
const approval = modules.find(row => row.slug === `${prefix}approver`);
const grants = await rows("user_access_modules", { user_id: { _eq: 91458110 } });
const grant = grants.find(row => row.id === 3561);
assert.ok(grant && [old.id, approval?.id].includes(grant.module_id), "Dummy grant has changed; review before migrating.");
const definitions = [
  { slug: `${prefix}reconciliator`, title: "Monthly reconciliation - Reconciliator", icon_name: "Scale", sort: 8 },
  { slug: `${prefix}approver`, title: "Monthly reconciliation - Approver", icon_name: "ClipboardCheck", sort: 9 },
].map(row => ({ ...row, subsystem_id: parent.subsystem_id, parent_module_id: parent.id,
  base_path: `${parent.base_path}/${row.slug}`, status: "active" }));
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", preparationModule: old.id,
  definitions, approvalModule: approval?.id ?? "new", dummyGrant: { id: grant.id, from: grant.module_id, to: approval?.id ?? "new approver module" },
  untouchedDummyGrants: grants.filter(row => row.id !== grant.id).map(row => ({ id: row.id, module_id: row.module_id })) }, null, 2));
if (apply) {
  // Reuse the shipped preparation ID so existing non-dummy ACLs retain their scope.
  await request(`items/modules/${old.id}`, "PATCH", definitions[0]);
  if (approval) {
    assert.equal(approval.parent_module_id, parent.id);
    assert.equal(approval.subsystem_id, parent.subsystem_id);
  }
  const target = approval ? await request(`items/modules/${approval.id}`, "PATCH", definitions[1]) :
    await request("items/modules", "POST", definitions[1]);
  await request(`items/user_access_modules/${grant.id}`, "PATCH", { module_id: target.id });
  const after = await rows("user_access_modules", { user_id: { _eq: 91458110 } });
  assert.deepEqual(after.filter(row => row.id !== grant.id), grants.filter(row => row.id !== grant.id));
  assert.equal(after.find(row => row.id === grant.id).module_id, target.id);
  assert.ok(!after.some(row => row.module_id === old.id), "Dummy must remain approval-only.");
  console.log(JSON.stringify({ preparationModuleId: old.id, approvalModuleId: target.id,
    movedGrantId: grant.id, unrelatedDummyGrantsPreserved: true }));
}
