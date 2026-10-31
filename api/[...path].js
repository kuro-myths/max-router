export const config = { maxDuration: 60, api: { bodyParser: false } };

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
