import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import ts from "typescript";

const dest = new URL("./dist/", import.meta.url);
mkdirSync(dest, { recursive: true });
for (const name of ["ledger", "cash-commands"]) {
  const source = readFileSync(new URL(`../../${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  writeFileSync(new URL(`${name}.mjs`, dest), outputText.replace(/from "\.\/ledger"/g, 'from "./ledger.mjs"'));
}
copyFileSync(new URL("./index.mjs", import.meta.url), new URL("index.mjs", dest));
