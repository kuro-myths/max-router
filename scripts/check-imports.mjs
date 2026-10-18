#!/usr/bin/env node
// Dependency-free import health check.
//
// Why: backend/tsconfig.json uses `noCheck: true`, so `npm run typecheck` never
// notices a missing module. Production runs plain Node ESM, which additionally
// rejects relative specifiers without a file extension (the alias loader only
// handles "@/..."). This script fails CI for both classes of mistake.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const targets = [
  { dir: "backend/src", alias: "backend/src", strictEsm: true },
  { dir: "backend/open-sse", alias: "backend/src", strictEsm: true },
  { dir: "frontend/src", alias: "frontend/src", strictEsm: false }, // bundled by Vite
];
const SOURCE = /\.(js|jsx|ts|tsx|mjs)$/;
const SKIP = new Set(["node_modules", "dist", ".git"]);
const IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*)['"]([^'"\n]+)['"]/g;

const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
function candidates(base) {
  const list = [base];
  for (const ext of [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"]) list.push(base + ext);
  for (const ext of [".js", ".jsx", ".ts", ".tsx"]) list.push(path.join(base, "index" + ext));
  if (base.endsWith(".js")) for (const ext of [".ts", ".tsx", ".jsx"]) list.push(base.slice(0, -3) + ext);
  return list;
}

const problems = [];
function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, fn) : SOURCE.test(e.name) && fn(p);
  }
}

for (const { dir, alias, strictEsm } of targets) {
  walk(path.join(root, dir), (file) => {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      for (const m of line.matchAll(IMPORT_RE)) {
        const spec = m[1];
        const rel = path.relative(root, file) + ":" + (i + 1);
        if (spec.startsWith("@/")) {
          const base = path.join(root, alias, spec.slice(2));
          if (!candidates(base).some(isFile)) problems.push(`${rel}  unresolved alias import "${spec}"`);
        } else if (spec.startsWith("./") || spec.startsWith("../")) {
          const base = path.resolve(path.dirname(file), spec);
          if (!candidates(base).some(isFile)) problems.push(`${rel}  unresolved import "${spec}"`);
          else if (strictEsm && !isFile(base) && !/\.(cjs)$/.test(file) && !(base.endsWith(".js") && !isFile(base)))
            problems.push(`${rel}  relative import "${spec}" needs an explicit file extension in Node ESM`);
        }
      }
    });
  });
}

if (problems.length) {
  console.error(`Import check failed (${problems.length}):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("Import check passed: no unresolved imports, no extensionless relative imports in backend ESM.");
