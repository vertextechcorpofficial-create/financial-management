import assert from "node:assert/strict";
import test from "node:test";
import { transact } from "./dist/index.mjs";

function database() {
  let tables = {
    cgl_registers: [{ name: "policy", payload: { intFwt: 20 } }],
    cgl_periods: [{ month_start: "2025-01-01", closed_at: "2025-02-01" }],
    cgl_journal_entries: [], cgl_journal_lines: [], cgl_audit_events: [],
  };
  return {
    failAudit: false,
    get tables() { return tables; },
    async transaction(callback) {
      const failAudit = this.failAudit;
      const draft = structuredClone(tables);
      const trx = table => {
        let filter = () => true;
        const query = {
          where(values) { filter = row => Object.entries(values).every(([key, value]) => row[key] === value); return query; },
          whereNotNull(key) { filter = row => row[key] != null; return query; },
          forUpdate() { return query; },
          orderBy() { return query; },
          async first() { return draft[table].find(filter); },
          async select() { return draft[table].filter(filter); },
          async insert(values) {
            if (table === "cgl_audit_events" && failAudit) throw new Error("Audit write failed");
            draft[table].push(...[values].flat());
          },
          async update(values) { draft[table].filter(filter).forEach(row => Object.assign(row, values)); },
        };
        return query;
      };
      const result = await callback(trx);
      tables = draft;
      return result;
    },
  };
}

const interest = { type: "interest", actor: 1, date: "2026-11-20", amount: 10000, account: "1000", memo: "" };

test("posts a balanced receipt and allows only a different actor to reverse it once", async () => {
  const db = database();
  assert.deepEqual(await transact(db, interest), { number: 1 });
  const [entry] = db.tables.cgl_journal_entries;
  assert.equal(entry.sealed, 1);
  assert.equal(db.tables.cgl_audit_events.length, 1);
  assert.deepEqual(db.tables.cgl_journal_lines.map(line => [line.account, line.debit, line.credit]), [
    ["1000", 800000, 0], ["5300", 200000, 0], ["4010", 0, 1000000],
  ]);
  const reverse = { type: "reverse", id: entry.id, date: interest.date, reason: "Duplicate receipt" };
  await assert.rejects(transact(db, { ...reverse, actor: 1 }), /different administrator/);
  assert.deepEqual(await transact(db, { ...reverse, actor: 2 }), { number: 2 });
  assert.equal(db.tables.cgl_journal_entries[1].reverses_id, entry.id);
  assert.equal(db.tables.cgl_audit_events[1].action, "reversed");
  await assert.rejects(transact(db, { ...reverse, actor: 2 }), /not eligible/);
});

test("rejects a closed date and rolls back header and lines when audit insertion fails", async () => {
  const db = database();
  await assert.rejects(transact(db, { ...interest, date: "2025-01-06" }), /closed/);
  db.failAudit = true;
  await assert.rejects(transact(db, interest), /Audit write failed/);
  assert.equal(db.tables.cgl_journal_entries.length, 0);
  assert.equal(db.tables.cgl_journal_lines.length, 0);
  assert.equal(db.tables.cgl_audit_events.length, 0);
});
