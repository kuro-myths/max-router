/**
 * PATCH  /api/mcp-manager/servers/:id — edit server MCP
 * DELETE /api/mcp-manager/servers/:id — hapus server MCP
 */
import { updateServer, deleteServer } from "../../../../lib/mcpManagerStore.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(req, res) {
  try {
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: "ID server wajib diisi" });
    const server = await updateServer(id, req.body || {});
    return res.json({ ok: true, server });
  } catch (error) {
    console.error("[mcp-manager] update failed:", error);
    return res.status(400).json({ error: error.message });
  }
}

export async function DELETE(req, res) {
  try {
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: "ID server wajib diisi" });
    const result = await deleteServer(id);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error("[mcp-manager] delete failed:", error);
    return res.status(400).json({ error: error.message });
  }
}
