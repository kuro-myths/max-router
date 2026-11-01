/**
 * POST /api/mcp-manager/servers/:id/probe — baca daftar tools server MCP
 * (JSON-RPC initialize + tools/list)
 */
import { probeServerById } from "../../../../../lib/mcpManagerStore.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req, res) {
  try {
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: "ID server wajib diisi" });
    const result = await probeServerById(id);
    res.set("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    console.error("[mcp-manager] probe failed:", error);
    return res.status(400).json({ error: error.message });
  }
}
