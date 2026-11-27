import assert from "node:assert/strict";
import { createRequire } from "node:module";

createRequire(import.meta.url)("dotenv").config({ path: [".env.local", ".env"], quiet: true });
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
const oldSlug = "investment-donations-annual-review";
const modules = await rows("modules", { slug: { _in: [oldSlug, `${oldSlug}-preparer`, `${oldSlug}-approver`, "capital-giving-ledger"] } });
const parent = modules.find(row => row.slug === "capital-giving-ledger");
assert.equal(parent?.id, 2603);
const preparers = modules.filter(row => [oldSlug, `${oldSlug}-preparer`].includes(row.slug));
assert.equal(preparers.length, 1, "Expected one shipped preparation registration.");
const preparer = preparers[0];
assert.equal(preparer.parent_module_id, parent.id);
assert.equal(preparer.subsystem_id, parent.subsystem_id);
const approvals = modules.filter(row => row.slug === `${oldSlug}-approver`);
assert.ok(approvals.length <= 1);
const approval = approvals[0];
if (approval) {
  assert.equal(approval.parent_module_id, parent.id);
  assert.equal(approval.subsystem_id, parent.subsystem_id);
}
const grants = await rows("user_access_modules", { user_id: { _eq: 91458110 } });
const annualGrants = grants.filter(row => [preparer.id, approval?.id].includes(row.module_id));
assert.ok(annualGrants.length <= 1, "Expected at most one dummy annual-review grant; review changed grants before migrating.");
const grant = annualGrants[0];
const definitions = [
  { slug: `${oldSlug}-preparer`, title: "Annual review - Preparer / reviewer", icon_name: "ClipboardList", sort: 11 },
  { slug: `${oldSlug}-approver`, title: "Annual review - Approver", icon_name: "ClipboardCheck", sort: 12 },
].map(row => ({ ...row, subsystem_id: parent.subsystem_id, parent_module_id: parent.id,
  base_path: `${parent.base_path}/${row.slug}`, status: "active" }));
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", preparationModuleId: preparer.id,
  approvalModuleId: approval?.id ?? "new", definitions, dummyGrantId: grant?.id ?? "new",
  dummyGrantFrom: grant?.module_id ?? null, dummyGrantTo: approval?.id ?? "new approver module" }, null, 2));
if (apply) {
  // Preserve existing preparation ACLs by retaining the shipped module ID.
  await request(`items/modules/${preparer.id}`, "PATCH", definitions[0]);
  const target = approval ? await request(`items/modules/${approval.id}`, "PATCH", definitions[1]) :
    await request("items/modules", "POST", definitions[1]);
  const savedGrant = grant ? await request(`items/user_access_modules/${grant.id}`, "PATCH", { module_id: target.id }) :
    await request("items/user_access_modules", "POST", { user_id: 91458110, module_id: target.id });
  const after = await rows("user_access_modules", { user_id: { _eq: 91458110 } });
  assert.deepEqual(after.filter(row => row.id !== savedGrant.id), grants.filter(row => row.id !== grant?.id));
  assert.equal(after.find(row => row.id === savedGrant.id).module_id, target.id);
  assert.ok(!after.some(row => row.module_id === preparer.id), "Dummy must remain approval-only.");
  console.log(JSON.stringify({ preparationModuleId: preparer.id, approvalModuleId: target.id,
    grantId: savedGrant.id, grantCreated: !grant, unrelatedDummyGrantsPreserved: true }));
}
