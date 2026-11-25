// Offline fixture generation from the trusted repository prototype, never from an upload.
/* eslint-disable @typescript-eslint/no-require-imports -- This standalone .cjs tool intentionally uses Node CommonJS. */
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const html = fs.readFileSync("overview.html", "utf8");
const script = html.slice(html.lastIndexOf("<script>") + 8, html.indexOf("/* ---------- Boot ---------- */"));
const stub = { addEventListener() {} };
const math = Object.create(Math);
let seed = 362854;
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : ["2026-11-20T00:00:00Z"])); }
  static now() { return Date.parse("2026-11-20T00:00:00Z"); }
}
const json = vm.runInNewContext(`${script}\nJSON.stringify(seed())`, {
  Math: math, Date: FixtureDate,
  document: { documentElement: { outerHTML: "" }, querySelector: () => stub, ...stub },
  window: stub,
}, { timeout: 5000 });
fs.writeFileSync(path.join(__dirname, "malaya.json"), JSON.stringify(JSON.parse(json), null, 2) + "\n");
