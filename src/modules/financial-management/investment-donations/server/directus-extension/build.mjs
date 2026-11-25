import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Compile only the transitive portable engine graph, never Next.js auth/actions
// or client code. Generated output stays inside this extension's dist directory.
const extension = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(extension, "../..");
const output = path.join(extension, "dist");
const seen = new Set();
const destination = source => path.join(output, "module", path.relative(root, source).replace(/\.tsx?$/, ".js"));
function compile(source) {
  const relative = path.relative(root, source);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Extension imports must remain inside the ledger module.");
  if (seen.has(source)) return;
  seen.add(source);
  const contents = readFileSync(source, "utf8");
  const dependencies = [];
  const transform = context => {
    const resolve = value => {
      if (value === "server-only" || value.startsWith("@/") || value.startsWith("next")) throw new Error(`Nonportable dependency: ${value}`);
      if (!value.startsWith(".")) return value;
      const target = path.resolve(path.dirname(source), value);
      const found = [target, `${target}.ts`, `${target}.mjs`, `${target}.js`].find(file => existsSync(file));
      if (!found) throw new Error(`Cannot resolve portable import ${value}`);
      dependencies.push(found);
      return value.replace(/\.ts$/, ".js") + (!path.extname(value) ? ".js" : "");
    };
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = ts.factory.createStringLiteral(resolve(node.moduleSpecifier.text));
        if (ts.isImportDeclaration(node)) return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, specifier, node.attributes);
        return ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, specifier, node.attributes);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (!ts.isStringLiteral(node.arguments[0])) throw new Error("Portable dynamic imports must be literal paths.");
        return ts.factory.updateCallExpression(node, node.expression, node.typeArguments,
          [ts.factory.createStringLiteral(resolve(node.arguments[0].text)), ...node.arguments.slice(1)]);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return sourceFile => ts.visitNode(sourceFile, visit);
  };
  const result = ts.transpileModule(contents, { fileName: source, transformers: { after: [transform] },
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, allowJs: true }, reportDiagnostics: true });
  if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new Error(`Could not compile ${relative}`);
  const target = destination(source);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, result.outputText);
  dependencies.forEach(compile);
}
compile(path.join(extension, "src/index.ts"));
writeFileSync(path.join(output, "index.js"), 'export { default } from "./module/server/directus-extension/src/index.js";\n');
console.log(`Built ${seen.size} portable modules under ${path.relative(root, output)}.`);
