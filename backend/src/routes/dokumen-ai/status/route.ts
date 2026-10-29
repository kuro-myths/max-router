// GET /api/dokumen-ai/status
// Endpoint status untuk chat-dokumen-ai (Kuro AI): dipakai untuk membedakan
// instance router ONLINE (Railway) vs LOKAL (localhost) dan memastikan
// integrasi AI tetap sinkron baik online maupun offline.
import { getConsumers, getLastSync } from "../../../lib/dokumenAiRegistry.js";

export const dynamic = "force-dynamic";

export async function GET(req: any, res: any) {
  const consumers = getConsumers();
  res.json({
    ok: true,
    service: "max-router",
    // Instance ini sendiri: deployment Railway = online, selain itu lokal.
    scope: process.env.RAILWAY_PUBLIC_DOMAIN ? "online" : "local",
    version: "3.0.0",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    consumers: {
      count: consumers.length,
      lastSeen: consumers.map((c) => ({ app: c.app, baseUrl: c.baseUrl, mode: c.mode, lastSeen: c.lastSeen })),
    },
    lastSync: getLastSync(),
    hint: "chat-dokumen-ai memanggil GET /api/health untuk probe cepat; "
      + "endpoint ini memberi info sinkron lebih lengkap.",
  });
}
