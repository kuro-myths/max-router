import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Cari direktori dist backend: saat berjalan lokal cwd = backend/,
// di Vercel serverless cwd = root proyek (dist ada di backend/dist).
function findBackendDist() {
  const candidates = [
    path.resolve(process.cwd(), "backend", "dist"),
    path.resolve(process.cwd(), "dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const distDir = findBackendDist();

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/") || !distDir) {
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
