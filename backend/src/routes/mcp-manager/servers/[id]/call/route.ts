/**
 * POST /api/mcp-manager/servers/:id/call — jalankan tool di server MCP
 * Body: { tool: "nama_tool", args: { ... } }
 */
import { callToolById } from "../../../../../lib/mcpManagerStore.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req, res) {
  try {
    const { id } = req.params || {};
    const body = req.body || {};
    if (!id) return res.status(400).json({ error: "ID server wajib diisi" });
    if (!body.tool) return res.status(400).json({ error: "Nama tool wajib diisi" });
    const result = await callToolById(id, body.tool, body.args);
    return res.json({ ok: true, result });
  } catch (error) {
    console.error("[mcp-manager] call failed:", error);
    return res.status(400).json({ error: error.message });
  }
}
