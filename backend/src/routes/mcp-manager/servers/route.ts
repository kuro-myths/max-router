/**
 * GET    /api/mcp-manager/servers — daftar semua server MCP
 * POST   /api/mcp-manager/servers — tambah server MCP baru
 */
import { listServers, createServer } from "../../../lib/mcpManagerStore.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req, res) {
  try {
    const servers = await listServers();
    res.set("Cache-Control", "no-store");
    return res.json({ servers });
  } catch (error) {
    console.error("[mcp-manager] list failed:", error);
    return res.status(500).json({ error: error.message });
  }
}

export async function POST(req, res) {
  try {
    const server = await createServer(req.body || {});
    return res.status(201).json({ ok: true, server });
  } catch (error) {
    console.error("[mcp-manager] create failed:", error);
    return res.status(400).json({ error: error.message });
  }
}
