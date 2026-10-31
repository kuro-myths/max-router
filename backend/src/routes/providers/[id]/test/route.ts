
import { testSingleConnection } from "./testUtils.js";

// POST /api/providers/[id]/test - Test connection
export async function POST_handler(req, res, { params }) {
  try {
    const { id } = await params;
    // Frontend mengirim { connectionId } di body; id di URL adalah id penyedia.
    let connectionId = id;
    try {
      const body = typeof req.json === "function" ? await req.json() : req.body;
      if (body?.connectionId) connectionId = body.connectionId;
    } catch { /* body opsional */ }

    const result = await testSingleConnection(connectionId);

    if (result.error === "Connection not found") {
      return res.status(404).json({ error: "Connection not found" });
    }

    return res.json({
      valid: result.valid,
      error: result.error,
      refreshed: result.refreshed || false,
      latencyMs: result.latencyMs ?? null,
      connection: result.connection || null,
    });
  } catch (error) {
    console.log("Error testing connection:", error);
    return res.status(500).json({ error: "Test failed" });
  }
}
