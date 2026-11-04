import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, Bot, MessageSquare, Plus, RefreshCw, Send, Trash2, Download, Clock3 } from "lucide-react";

const STORAGE_KEY = "max-router.chat.conversations.v1";
const makeId = () => globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makeConversation = () => ({ id: makeId(), title: "Percakapan baru", model: "", messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
function readConversations() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages)) : [];
  } catch { return []; }
}
function titleFromMessage(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > 42 ? clean.slice(0, 39) + "…" : clean || "Percakapan baru";
}
function formatDate(value) {
  try { return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
  catch { return ""; }
}

export default function CompatibleChatPage() {
  const [conversations, setConversations] = useState(readConversations);
  const [activeId, setActiveId] = useState(() => readConversations()[0]?.id || "");
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState(() => readConversations()[0]?.messages || []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); }
    catch { setNotice("Penyimpanan browser penuh atau dinonaktifkan. Ekspor percakapan agar tidak hilang."); }
  }, [conversations]);

  useEffect(() => {
    if (!activeId) return;
    setConversations((current) => current.map((item) => item.id === activeId ? { ...item, messages, model: model || item.model, updatedAt: new Date().toISOString(), title: item.title === "Percakapan baru" ? titleFromMessage(messages.find((m) => m.role === "user")?.content) : item.title } : item));
  }, [messages, activeId, model]);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError("");
    try {
      const response = await fetch("/api/v1/models", { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
      const raw = await response.text();
      let data = null;
      try { data = JSON.parse(raw); } catch {}
      if (!response.ok) throw new Error(data?.error?.message || data?.error || raw || `Gagal mengambil model (HTTP ${response.status})`);
      const list = Array.isArray(data?.data) ? data.data.filter((item) => item?.id) : [];
      setModels(list);
      setModel((current) => current && list.some((item) => item.id === current) ? current : list[0]?.id || "");
      if (!list.length) setModelsError("Belum ada model aktif. Tambahkan provider kompatibel terlebih dahulu.");
    } catch (error) {
      setModels([]);
      setModel("");
      setModelsError(error instanceof Error ? error.message : "Daftar model gagal dimuat.");
    } finally { setModelsLoading(false); }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  const canSend = useMemo(() => Boolean(input.trim() && model && !busy), [input, model, busy]);
  const activeConversation = conversations.find((item) => item.id === activeId);

  function startConversation() {
    const item = makeConversation();
    setConversations((current) => [item, ...current]);
    setActiveId(item.id);
    setMessages([]);
    setModel((current) => current || models[0]?.id || "");
    setNotice("");
  }

  function openConversation(item) {
    if (busy) return;
    setActiveId(item.id);
    setMessages(item.messages || []);
    setModel(item.model && models.some((entry) => entry.id === item.model) ? item.model : models[0]?.id || "");
    setNotice("");
  }

  function deleteConversation(id) {
    if (busy) return;
    const next = conversations.filter((item) => item.id !== id);
    setConversations(next);
    if (activeId === id) {
      const replacement = next[0];
      setActiveId(replacement?.id || "");
      setMessages(replacement?.messages || []);
      setModel(replacement?.model || models[0]?.id || "");
    }
  }

  function exportConversation() {
    const payload = { title: activeConversation?.title || "Percakapan Max Router", model, exportedAt: new Date().toISOString(), messages };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `max-router-chat-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!canSend) return;
    const text = input.trim();
    let conversationId = activeId;
    if (!conversationId) {
      const item = makeConversation();
      conversationId = item.id;
      setConversations((current) => [item, ...current]);
      setActiveId(item.id);
    }
    const next = [...messages, { role: "user", content: text, createdAt: new Date().toISOString() }];
    const history = next.filter((message) => message.role === "user" || message.role === "assistant").map(({ role, content }) => ({ role, content }));
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ model, messages: history, stream: false }),
      });
      const raw = await response.text();
      let data = null;
      try { data = JSON.parse(raw); } catch {}
      if (!response.ok) {
        setMessages((current) => [...current, { role: "error", content: data?.error?.message || data?.error || raw || `Request gagal (HTTP ${response.status})`, createdAt: new Date().toISOString() }]);
        return;
      }
      const answer = data?.choices?.[0]?.message?.content ?? data?.output_text ?? raw;
      setMessages((current) => [...current, { role: "assistant", content: String(answer || "(tidak ada respons)"), createdAt: new Date().toISOString() }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "error", content: error instanceof Error ? error.message : String(error), createdAt: new Date().toISOString() }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid h-[calc(100vh-8rem)] min-h-[560px] grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-[#3b2c4b] bg-[#302344] text-white">
        <div className="flex items-center justify-between gap-2 border-b border-white/15 p-3">
          <div><p className="text-sm font-black">Percakapan</p><p className="text-[10px] text-white/60">{conversations.length} tersimpan di browser</p></div>
          <button type="button" onClick={startConversation} disabled={busy} aria-label="Percakapan baru" className="rounded-lg border border-white/20 bg-[#ff9fc9] p-2 text-[#302344] hover:bg-[#ffc1dc] disabled:opacity-40"><Plus size={17}/></button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {!conversations.length && <p className="px-2 py-5 text-center text-xs text-white/55">Belum ada riwayat. Mulai percakapan baru.</p>}
          {conversations.slice().sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).map((item) => (
            <div key={item.id} className={`group flex items-center gap-1 rounded-xl border p-2 ${activeId === item.id ? "border-[#ff9fc9]/70 bg-white/15" : "border-transparent hover:bg-white/10"}`}>
              <button type="button" onClick={() => openConversation(item)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs font-bold">{item.title || "Percakapan baru"}</span>
                <span className="mt-1 flex items-center gap-1 text-[10px] text-white/55"><Clock3 size={10}/>{formatDate(item.updatedAt || item.createdAt)} · {item.messages?.length || 0} pesan</span>
              </button>
              <button type="button" onClick={() => deleteConversation(item.id)} disabled={busy} aria-label={`Hapus ${item.title}`} className="rounded-md p-1.5 text-white/45 opacity-100 hover:bg-red-400/20 hover:text-red-200 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-20"><Trash2 size={13}/></button>
            </div>
          ))}
        </div>
        <div className="border-t border-white/15 p-3 text-[10px] leading-relaxed text-white/55">Riwayat disimpan lokal pada browser ini, bukan disinkronkan ke server.</div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-[#3b2c4b] bg-[#fffdf8] shadow-[3px_3px_0_rgba(51,39,70,.10)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5d8e8] bg-[#fff7fb] px-4 py-3">
          <div className="min-w-0"><h1 className="truncate text-sm font-black text-[#302344]">{activeConversation?.title || "Chat AI"}</h1><p className="text-[10px] text-[#82748d]">OpenAI-compatible · riwayat percakapan lokal</p></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={loadModels} disabled={modelsLoading} title="Muat ulang model" className="rounded-lg border border-[#cbbbd6] bg-white p-2 text-[#554261] hover:bg-[#fff0f7] disabled:opacity-50"><RefreshCw size={15} className={modelsLoading ? "animate-spin" : ""}/></button>
            <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!models.length || busy || modelsLoading} aria-label="Pilih model" className="max-w-[44vw] rounded-lg border border-[#cbbbd6] bg-white px-2.5 py-2 text-xs text-[#302344] sm:max-w-[260px]">
              {!models.length && <option value="">{modelsLoading ? "Memuat model..." : "Belum ada model"}</option>}
              {models.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
            </select>
            <button type="button" onClick={exportConversation} disabled={!messages.length} title="Ekspor percakapan JSON" className="rounded-lg border border-[#cbbbd6] bg-white p-2 text-[#554261] hover:bg-[#fff0f7] disabled:opacity-40"><Download size={15}/></button>
          </div>
        </header>
        {modelsError && <div className="border-b border-[#f0c5bd] bg-[#fff0ed] px-4 py-2 text-xs text-[#9b3d32]">{modelsError}</div>}
        {notice && <div role="status" className="border-b border-[#ead7a6] bg-[#fff8df] px-4 py-2 text-xs text-[#806021]">{notice}</div>}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {!messages.length && <div className="flex h-full min-h-[220px] items-center justify-center text-center">
            <div className="max-w-md"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#3b2c4b] bg-[#ffe0ef] text-[#8d4673]"><Bot size={27}/></div><h2 className="text-lg font-black text-[#302344]">{modelsLoading ? "Menghubungkan model..." : "Mulai percakapan baru"}</h2><p className="mt-1 text-sm text-[#82748d]">{modelsError || "Pilih model, ketik pesan, dan percakapan akan tersimpan otomatis di browser."}</p><button type="button" onClick={startConversation} className="mt-4 inline-flex items-center gap-2 rounded-lg border-2 border-[#332746] bg-[#ffb0d0] px-4 py-2 text-xs font-bold text-[#302344] shadow-[2px_2px_0_#332746]"><Plus size={14}/>Chat baru</button></div>
          </div>}
          {messages.map((message, index) => <div key={`${message.createdAt || index}-${index}`} className={message.role === "user" ? "ml-auto max-w-[88%] rounded-2xl border-2 border-[#3b2c4b] bg-[#ffb0d0] px-4 py-3 text-sm text-[#302344] shadow-[2px_2px_0_rgba(51,39,70,.12)]" : message.role === "error" ? "max-w-[90%] rounded-2xl border border-[#e8a39a] bg-[#fff0ed] px-4 py-3 text-sm text-[#9b3d32]" : "max-w-[90%] rounded-2xl border border-[#e0d4e7] bg-[#f4effb] px-4 py-3 text-sm text-[#302344]"}>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase opacity-60">{message.role === "user" ? "Anda" : message.role === "assistant" ? "Max Router AI" : "Kesalahan"}{message.createdAt && <span className="font-normal normal-case">{formatDate(message.createdAt)}</span>}</div>
            <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>
          </div>)}
          {busy && <div className="flex items-center gap-2 text-xs text-[#82748d]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#ff79b0]"/>AI sedang menyusun jawaban...</div>}
        </div>
        <form onSubmit={sendMessage} className="border-t border-[#e5d8e8] bg-[#fff9fc] p-3 sm:p-4">
          <div className="flex items-end gap-2 rounded-xl border-2 border-[#cbbbd6] bg-white p-2 focus-within:border-[#9b78b8]">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} rows={2} placeholder={model ? "Tulis pesan... (Enter untuk kirim, Shift+Enter untuk baris baru)" : "Pilih provider/model terlebih dahulu..."} className="min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#302344] outline-none placeholder:text-[#a397ac]" disabled={!model || busy || modelsLoading}/>
            <button type="submit" disabled={!canSend} className="inline-flex items-center gap-2 rounded-lg border-2 border-[#332746] bg-[#ff9fc9] px-4 py-3 text-xs font-black text-[#302344] shadow-[2px_2px_0_#332746] disabled:opacity-40"><Send size={14}/>Kirim</button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[#93859b]"><span>Jangan masukkan password atau API key ke percakapan.</span><span>{messages.length} pesan</span></div>
        </form>
      </section>
    </div>
  );
}
