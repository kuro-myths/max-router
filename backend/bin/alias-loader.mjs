import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// dist selalu satu tingkat di atas folder bin (backend/dist),
// jadi tidak bergantung pada process.cwd() yang berbeda antara lokal dan Vercel.
function findDistDir() {
  const fromLoader = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "dist");
  if (fs.existsSync(fromLoader)) return fromLoader;
  return path.resolve(process.cwd(), "dist");
}

const distDir = findDistDir();

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const target = path.join(distDir, specifier.slice(2));
  const candidates = [target, `${target}.js`, path.join(target, "index.js")];
  const match = candidates.find((candidate) => fs.existsSync(candidate));

  if (!match) {
    return nextResolve(specifier, context);
  }

  return { shortCircuit: true, url: pathToFileURL(match).href };
}
