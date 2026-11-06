import { makeKv } from "../../../lib/db/helpers/kvStore.js";

const conversationsStore = makeKv("chatConversations");
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES_PER_CONVERSATION = 500;

function normalizeConversation(value) {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id.trim()) {
    throw new Error("ID percakapan tidak valid.");
  }
  return {
    id: value.id.slice(0, 120),
    title: String(value.title || "Percakapan baru").slice(0, 180),
    model: String(value.model || "").slice(0, 240),
    messages: Array.isArray(value.messages) ? value.messages.slice(-MAX_MESSAGES_PER_CONVERSATION) : [],
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || new Date().toISOString(),
  };
}

export async function GET(_req, res) {
  try {
    const items = Object.values(await conversationsStore.getAll())
      .filter((item) => item && typeof item.id === "string")
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    return res.json({ data: items });
  } catch (error) {
    console.error("[chat/conversations] load failed:", error);
    return res.status(500).json({ error: "Gagal memuat riwayat percakapan." });
  }
}

export async function POST_handler(req, res) {
  try {
    const raw = req.body?.conversations;
    if (!Array.isArray(raw)) return res.status(400).json({ error: "conversations harus berupa array." });
    if (raw.length > MAX_CONVERSATIONS) return res.status(413).json({ error: "Maksimal 100 percakapan." });
    const normalized = raw.map(normalizeConversation);
    const incoming = new Set(normalized.map((item) => item.id));
    const existing = await conversationsStore.getAll();
    for (const id of Object.keys(existing)) {
      if (!incoming.has(id)) await conversationsStore.remove(id);
    }
    await conversationsStore.setMany(Object.fromEntries(normalized.map((item) => [item.id, item])));
    return res.json({ success: true, count: normalized.length });
  } catch (error) {
    console.error("[chat/conversations] save failed:", error);
    return res.status(400).json({ error: error instanceof Error ? error.message : "Gagal menyimpan riwayat." });
  }
}

export async function DELETE_handler(req, res) {
  try {
    const id = String(req.query?.id || "");
    if (!id) return res.status(400).json({ error: "ID percakapan wajib diisi." });
    await conversationsStore.remove(id);
    return res.json({ success: true });
  } catch (error) {
    console.error("[chat/conversations] delete failed:", error);
    return res.status(500).json({ error: "Gagal menghapus percakapan." });
  }
}
