import { getGitHubConnection, removeGitHubConnection } from "../../../../lib/githubConnector.js";

export async function GET_handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const connection = await getGitHubConnection();
    if (!connection) return res.json({ connected: false });
    return res.json({ connected: true, account: { login: connection.login, name: connection.name, avatarUrl: connection.avatarUrl, scopes: connection.scopes, connectedAt: connection.connectedAt } });
  } catch (error: any) {
    console.error("[github/status]", error?.message || error);
    return res.status(500).json({ error: "Gagal membaca status koneksi GitHub." });
  }
}

export async function DELETE_handler(_req, res) {
  try {
    await removeGitHubConnection();
    return res.json({ success: true, connected: false });
  } catch {
    return res.status(500).json({ error: "Gagal memutus koneksi GitHub." });
  }
}
