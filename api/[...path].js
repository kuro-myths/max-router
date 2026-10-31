import { register } from "node:module";

export const config = { maxDuration: 60, api: { bodyParser: false } };

// Daftarkan resolver alias "@/..." -> backend/dist SEBELUM backend diimpor.
// Tanpa ini, semua route yang mengimpor "@/lib/..." gagal dimuat di runtime
// Vercel (autoRouter melewatkannya -> endpoint 404 "Not found").
register("./vercel-alias.mjs", import.meta.url);

let appPromise;

export default async function handler(req, res) {
  try {
    appPromise ||= import("../backend/dist/vercel.js").then((mod) => mod.default);
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    console.error("[vercel-handler] backend import failed:", error);
    return res.status(500).json({ error: "Backend initialization failed" });
  }
}
