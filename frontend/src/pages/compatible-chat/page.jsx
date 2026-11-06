import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Plus, RefreshCw, Send, Trash2, Download, Clock3, Paperclip, FileText, Github, X, Sparkles } from "lucide-react";
import VtuberAvatar from "@/shared/components/vtuber/VtuberAvatar";


const githubToolDefinitions = [
 {type:"function",function:{name:"github_list_repositories",description:"List accessible GitHub repositories, including private repositories.",parameters:{type:"object",properties:{page:{type:"integer"},per_page:{type:"integer"}},additionalProperties:false}}},
 {type:"function",function:{name:"github_list_files",description:"List files and directories in a repository folder.",parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},path:{type:"string"},branch:{type:"string"}},required:["owner","repo"],additionalProperties:false}}},
 {type:"function",function:{name:"github_read_file",description:"Read source code from a repository file.",parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},path:{type:"string"},branch:{type:"string"}},required:["owner","repo","path"],additionalProperties:false}}},
 {type:"function",function:{name:"github_list_branches",description:"List repository branches.",parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"}},required:["owner","repo"],additionalProperties:false}}},
 {type:"function",function:{name:"github_create_branch",description:"Create a branch; requires user confirmation.",parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},branch:{type:"string"},from:{type:"string"}},required:["owner","repo","branch"],additionalProperties:false}}},
 {type:"function",function:{name:"github_update_file",description:"Update or create a file on a branch; requires user confirmation.",parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},path:{type:"string"},content:{type:"string"},sha:{type:"string"},branch:{type:"string"},message:{type:"string"}},required:["owner","repo","path","content","branch","message"],additionalProperties:false}}},
 {type:"function",function:{name:"github_create_pull_request",description:"Create a pull request; requires user confirmation.",parameters:{type:"object",properties:{owner:{type:"string"},repo:{type:"string"},title:{type:"string"},body:{type:"string"},head:{type:"string"},base:{type:"string"},draft:{type:"boolean"}},required:["owner","repo","title","head","base"],additionalProperties:false}}}
];

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
  const [githubToolsEnabled, setGithubToolsEnabled] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);

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

  const canSend = useMemo(() => Boolean((input.trim() || attachments.length) && model && !busy), [input, attachments, model, busy]);

  async function addAttachments(fileList) {
    const files = Array.from(fileList || []);
    const accepted = [];
    for (const file of files) {
      if (file.size > 4 * 1024 * 1024) { setNotice(`${file.name}: ukuran maksimal 4 MB.`); continue; }
      const isImage = file.type.startsWith("image/") && ["image/png","image/jpeg","image/webp","image/gif"].includes(file.type);
      const isText = /^(text\/|application\/(json|xml|javascript))/.test(file.type) || /\.(txt|md|json|csv|log|xml|html|css|js|jsx|ts|tsx|py|sql|yml|yaml)$/i.test(file.name);
      if (!isImage && !isText) { setNotice(`${file.name}: format belum didukung. Gunakan gambar atau file teks/kode.`); continue; }
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          if (isImage) reader.readAsDataURL(file);
          else reader.readAsText(file);
        });
        accepted.push(isImage
          ? { id: makeId(), name: file.name, type: file.type, size: file.size, dataUrl: data }
          : { id: makeId(), name: file.name, type: file.type, size: file.size, text: String(data) });
      } catch { setNotice(`Gagal membaca ${file.name}.`); }
    }
    if (accepted.length) {
      setAttachments((current) => [...current, ...accepted].slice(0, 6));
      setNotice(`${accepted.length} lampiran ditambahkan. Maksimal 6 file per pesan.`);
    }
    setComposerMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(id) {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }
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
    const next = [...messages, { role: "user", content: text, attachments: attachments.map(({ id, name, type, size }) => ({ id, name, type, size })), createdAt: new Date().toISOString() }];
    const history = next.filter((message) => message.role === "user" || message.role === "assistant").map(({ role, content }) => ({ role, content }));
    const currentAttachments = attachments;
    const textFiles = currentAttachments.filter((item) => item.text).map((item) => `\\n\\n[Isi file: ${item.name}]\\n${item.text}`).join("");
    const imageParts = currentAttachments.filter((item) => item.dataUrl).map((item) => ({ type: "image_url", image_url: { url: item.dataUrl } }));
    const promptText = text + textFiles;
    history[history.length - 1] = { role: "user", content: imageParts.length ? [{ type: "text", text: promptText }, ...imageParts] : promptText };
    setAttachments([]);
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      let working = history;
      let finalText = "";
      let completed = false;
      for (let turn = 0; turn < 6; turn++) {
        const response = await fetch("/api/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "include",
          body: JSON.stringify({ model, messages: working, stream: false,
            ...(githubToolsEnabled ? { tools: githubToolDefinitions, tool_choice: "auto" } : {}) }),
        });
        const raw = await response.text();
        let data = null;
        try { data = JSON.parse(raw); } catch {}
        if (!response.ok) throw new Error(data?.error?.message || data?.error || raw || "Request chat gagal.");
        const message = data?.choices?.[0]?.message;
        const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
        if (!calls.length) { finalText = message?.content ?? data?.output_text ?? raw; completed = true; break; }
        working = [...working, { role: "assistant", content: message.content || null, tool_calls: calls }];
        for (const call of calls) {
          const name = call.function?.name;
          let args = {};
          try { args = JSON.parse(call.function?.arguments || "{}"); } catch {}
          const writeTool = ["github_create_branch","github_update_file","github_create_pull_request"].includes(name);
          if (writeTool) {
            const summary = name + "\n" + JSON.stringify(args, null, 2).slice(0, 5000);
            if (!window.confirm("AI meminta operasi tulis GitHub:\n\n" + summary + "\n\nIzinkan operasi ini?")) {
              working.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok:false, denied:true, message:"User menolak operasi tulis." }) });
              continue;
            }
          }
          const toolResponse = await fetch("/api/connectors/github/tools", {
            method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Accept:"application/json"},
            body:JSON.stringify({name,arguments:args,confirmed:writeTool})
          });
          const toolRaw = await toolResponse.text();
          let toolData = {};
          try { toolData = JSON.parse(toolRaw); } catch { toolData = {error:toolRaw}; }
          working.push({ role:"tool",tool_call_id:call.id,content:JSON.stringify(toolData) });
        }
      }
      if (!completed) finalText = "Batas 6 putaran tool tercapai. Minta AI melanjutkan dari hasil yang sudah diperoleh.";
      setMessages((current) => [...current, { role:"assistant",content:String(finalText || "(tidak ada respons)"),createdAt:new Date().toISOString() }]);
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
            <div className="max-w-md"><div className="mx-auto mb-2 flex h-40 w-36 items-center justify-center overflow-hidden"><VtuberAvatar size={144} emotion="happy"/></div><h2 className="text-lg font-black text-[#302344]">{modelsLoading ? "Menghubungkan model..." : "Mulai percakapan baru"}</h2><p className="mt-1 text-sm text-[#82748d]">{modelsError || "Pilih model, ketik pesan, dan percakapan akan tersimpan otomatis di browser."}</p><button type="button" onClick={startConversation} className="mt-4 inline-flex items-center gap-2 rounded-lg border-2 border-[#332746] bg-[#ffb0d0] px-4 py-2 text-xs font-bold text-[#302344] shadow-[2px_2px_0_#332746]"><Plus size={14}/>Chat baru</button></div>
          </div>}
          {messages.map((message, index) => <div key={`${message.createdAt || index}-${index}`} className={message.role === "user" ? "ml-auto max-w-[88%] rounded-2xl border-2 border-[#3b2c4b] bg-[#ffb0d0] px-4 py-3 text-sm text-[#302344] shadow-[2px_2px_0_rgba(51,39,70,.12)]" : message.role === "error" ? "max-w-[90%] rounded-2xl border border-[#e8a39a] bg-[#fff0ed] px-4 py-3 text-sm text-[#9b3d32]" : "max-w-[90%] rounded-2xl border border-[#e0d4e7] bg-[#f4effb] px-4 py-3 text-sm text-[#302344]"}>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase opacity-60">{message.role === "assistant" && <VtuberAvatar size={30} emotion="neutral"/>}<span>{message.role === "user" ? "Anda" : message.role === "assistant" ? "Max Router AI" : "Kesalahan"}</span>{message.createdAt && <span className="font-normal normal-case">{formatDate(message.createdAt)}</span>}</div>
            <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>\n            {message.attachments?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{message.attachments.map((item) => <span key={item.id} className="inline-flex items-center gap-1 rounded-lg border border-[#cbbbd6] bg-white/70 px-2 py-1 text-[10px]"><FileText size={12}/>{item.name}</span>)}</div>}
          </div>)}
          {busy && <div className="flex items-center gap-2 text-xs text-[#82748d]"><VtuberAvatar size={34} emotion="thinking"/><span className="h-2 w-2 animate-pulse rounded-full bg-[#ff79b0]"/>Kuro sedang menyusun jawaban...</div>}
        </div>
        <form onSubmit={sendMessage} className="border-t border-[#e5d8e8] bg-[#fff9fc] p-3 sm:p-4">
          <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv,.log,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.sql,.yml,.yaml" className="hidden" onChange={(e) => addAttachments(e.target.files)}/>
          {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{attachments.map((item) => <span key={item.id} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[#d9c9e2] bg-white px-2.5 py-1.5 text-[11px] text-[#554261]"><span className="truncate">{item.name}</span><button type="button" onClick={() => removeAttachment(item.id)} aria-label={`Hapus lampiran ${item.name}`} className="rounded-full p-0.5 hover:bg-[#ffe3ef]"><X size={12}/></button></span>)}</div>}
          <div className="relative flex items-end gap-2 rounded-2xl border-2 border-[#cbbbd6] bg-white p-2 shadow-[0_4px_18px_rgba(59,44,75,.06)] focus-within:border-[#9b78b8]">
            <button type="button" onClick={() => setComposerMenuOpen((value) => !value)} disabled={busy} aria-label="Buka menu tambah" aria-expanded={composerMenuOpen} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[#332746] transition-all ${composerMenuOpen ? "rotate-45 bg-[#302344] text-white" : "bg-[#ffb0d0] text-[#302344] shadow-[2px_2px_0_#332746] hover:-translate-y-0.5 hover:bg-[#ffc6df]"}`}><Plus size={21}/></button>
            {composerMenuOpen && <div className="absolute bottom-[calc(100%+12px)] left-0 z-30 w-[min(340px,calc(100vw-36px))] overflow-hidden rounded-2xl border border-[#d8c7e1] bg-[#fffdf8] p-2 shadow-[0_16px_50px_rgba(42,29,59,.22)]">
              <div className="flex items-center justify-between px-3 pb-2 pt-1"><div><p className="text-xs font-black text-[#302344]">Tambahkan ke percakapan</p><p className="text-[10px] text-[#8d7d98]">Lampiran, konteks, dan alat kerja</p></div><Sparkles size={17} className="text-[#e879aa]"/></div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#fff0f7]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#ffe2ef] text-[#a83d70]"><Paperclip size={17}/></span><span className="min-w-0"><b className="block text-xs text-[#302344]">Lampirkan file atau gambar</b><small className="text-[10px] text-[#8d7d98]">PNG, JPG, WebP, GIF, teks, kode · maks. 4 MB/file</small></span></button>
              <button type="button" onClick={() => { setGithubToolsEnabled((value) => !value); setComposerMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#fff0f7]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eee8f8] text-[#554261]"><Github size={18}/></span><span className="min-w-0 flex-1"><b className="block text-xs text-[#302344]">GitHub AI Tools</b><small className="text-[10px] text-[#8d7d98]">Baca repository, edit file, branch, dan PR</small></span><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${githubToolsEnabled ? "bg-[#d9f5e7] text-[#18734a]" : "bg-[#eee8f8] text-[#766781]"}`}>{githubToolsEnabled ? "AKTIF" : "NONAKTIF"}</span></button>
              <a href="/dashboard/connectors" onClick={() => setComposerMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#fff0f7]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e7f5ff] text-[#2672a6]"><Bot size={17}/></span><span><b className="block text-xs text-[#302344]">Kelola konektor</b><small className="text-[10px] text-[#8d7d98]">Hubungkan GitHub dan layanan lain</small></span></a>
              <div className="mx-2 mt-1 border-t border-[#eee5f1] px-1 pt-2 text-[9px] text-[#9a8ca3]">Fitur yang belum tersedia tidak ditampilkan sebagai tombol aktif.</div>
            </div>}
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} rows={2} placeholder={model ? "Tulis pesan... (Enter untuk kirim, Shift+Enter untuk baris baru)" : "Pilih provider/model terlebih dahulu..."} className="min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#302344] outline-none placeholder:text-[#a397ac]" disabled={!model || busy || modelsLoading}/>
            <button type="submit" disabled={!canSend} className="inline-flex items-center gap-2 rounded-xl border-2 border-[#332746] bg-[#ff9fc9] px-4 py-3 text-xs font-black text-[#302344] shadow-[2px_2px_0_#332746] transition hover:-translate-y-0.5 hover:bg-[#ffc1dc] disabled:opacity-40"><Send size={14}/>Kirim</button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[#93859b]"><span>Jangan masukkan password atau API key ke percakapan.</span><span>{messages.length} pesan</span></div>
        </form>
      </section>
    </div>
  );
}
