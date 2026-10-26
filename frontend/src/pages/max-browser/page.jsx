import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, RefreshCw, ExternalLink, Sparkles, StopCircle, ShieldCheck, Zap, Search, ArrowLeft, ArrowRight } from "lucide-react";

const AGENT_SYSTEM_PROMPT = [
  "Kamu adalah MAX Browser, AI agent yang menjelajahi web lewat alat ambil-halaman dan pencarian server.",
  "Aturan:",
  "- Panggil web_search untuk mencari informasi di web; hasilnya berupa daftar tautan dengan judul dan ringkasan.",
  "- Panggil fetch_page untuk membuka URL; hasilnya berisi url, judul, teks halaman (mungkin terpotong), dan daftar tautan.",
  "- Gunakan hasil pencarian dan daftar tautan dari observasi sebelumnya untuk menelusuri halaman lain.",
  "- Satu langkah per giliran, lalu tunggu hasil observasi.",
  "- Halaman diambil tanpa JavaScript, jadi konten dinamis mungkin tidak tersedia; cari tautan alternatif bila ada.",
  "- Saat tugas selesai atau mustahil, panggil finish dengan jawaban ringkas dalam Bahasa Indonesia.",
].join("\n");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Cari di web dengan kata kunci; kembalikan daftar hasil (judul, URL, ringkasan). Gunakan ini saat butuh informasi tapi belum tahu URL-nya.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Kata kunci pencarian" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_page",
      description: "Ambil konten sebuah halaman web dari sisi server (teks + daftar tautan).",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL lengkap http/https" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Akhiri tugas dan berikan jawaban final dalam Bahasa Indonesia.",
      parameters: {
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      },
    },
  },
];

const MAX_STEPS = 10;

function normalizeUrl(value) {
  const target = String(value || "").trim();
  if (!target) return "";
  return /^https?:\/\//i.test(target) ? target : "https://" + target;
}

// Deteksi sederhana: input dianggap URL bila punya skema http(s), atau
// tanpa spasi dan mengandung titik (mis. "example.com"). Sisanya = query pencarian.
function isLikelyUrl(value) {
  const target = String(value || "").trim();
  if (!target) return false;
  if (/^https?:\/\//i.test(target)) return true;
  if (/\s/.test(target)) return false;
  return /^[^\s]+\.[^\s]+(\/|$|:)/.test(target);
}

function renderUrl(full) {
  return "/api/browser/render?url=" + encodeURIComponent(full);
}

export default function MaxBrowserPage() {
  const [url, setUrl] = useState("");
  const [frameUrl, setFrameUrl] = useState("");
  const [mode, setMode] = useState("proxy");
  const [frameKey, setFrameKey] = useState(0);
  const [frameLoading, setFrameLoading] = useState(false);
  const [pageText, setPageText] = useState(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState("");

  // Riwayat navigasi untuk tombol Back / Forward (seperti Chrome).
  const [history, setHistory] = useState([]);
  const [histIndex, setHistIndex] = useState(-1);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searchEngine, setSearchEngine] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [models, setModels] = useState([]);
  const [modelChoice, setModelChoice] = useState("auto");
  const [bestModel, setBestModel] = useState("");

  const [task, setTask] = useState("");
  const [steps, setSteps] = useState([]);
  const [answer, setAnswer] = useState("");
  const [running, setRunning] = useState(false);
  const [agentError, setAgentError] = useState("");
  const stopRef = useRef(false);

  const loadSetup = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/models", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      setModels(Array.isArray(data?.data) ? data.data.filter((item) => item?.id) : []);
    } catch {
      setModels([]);
    }
    try {
      const res = await fetch("/api/agent/config", { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBestModel(data?.best?.id || "");
      }
    } catch {
      setBestModel("");
    }
  }, []);

  useEffect(() => { loadSetup(); }, [loadSetup]);

  // Tautan yang diklik di dalam frame proxy dikirim ke sini via postMessage,
  // lalu halaman baru dimuat ulang lewat proxy dari konteks dashboard.
  useEffect(() => {
    const onMessage = (event) => {
      const nav = event?.data?.__maxBrowserNav;
      if (typeof nav !== "string" || !/^https?:\/\//i.test(nav)) return;
      setUrl(nav);
      setFrameUrl(nav);
      setFrameKey((k) => k + 1);
      setFrameLoading(true);
      setPageText(null);
      setTextError("");
      setHistory((h) => [...h.slice(0, histIndex + 1), nav]);
      setHistIndex((i) => i + 1);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [histIndex]);

  const effectiveModel = modelChoice === "auto" ? (bestModel || models[0]?.id || "") : modelChoice;

  const go = (full, pushHistory = true) => {
    setUrl(full);
    setFrameUrl(full);
    setFrameKey((k) => k + 1);
    setFrameLoading(true);
    setPageText(null);
    setTextError("");
    setSearchResults(null);
    setSearchError("");
    if (pushHistory) {
      setHistory((h) => [...h.slice(0, histIndex + 1), full]);
      setHistIndex((i) => i + 1);
    }
  };

  const goBack = () => {
    if (histIndex <= 0) return;
    const target = history[histIndex - 1];
    setHistIndex((i) => i - 1);
    setUrl(target);
    setFrameUrl(target);
    setFrameKey((k) => k + 1);
    setFrameLoading(true);
    setPageText(null);
  };

  const goForward = () => {
    if (histIndex >= history.length - 1) return;
    const target = history[histIndex + 1];
    setHistIndex((i) => i + 1);
    setUrl(target);
    setFrameUrl(target);
    setFrameKey((k) => k + 1);
    setFrameLoading(true);
    setPageText(null);
  };

  const reload = () => {
    if (!frameUrl) return;
    setFrameKey((k) => k + 1);
    setFrameLoading(true);
  };

  const doSearch = async (query) => {
    const q = String(query || "").trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError("");
    setSearchResults(null);
    setSearchEngine("");
    setSearchQuery(q);
    try {
      const res = await fetch("/api/browser/search?q=" + encodeURIComponent(q), {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Gagal mencari (HTTP " + res.status + ")");
      setSearchResults(Array.isArray(data?.results) ? data.results : []);
      setSearchEngine(data?.engine || "");
      if (data?.note && (!data?.results || data.results.length === 0)) setSearchError(data.note);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error?.message || "Gagal melakukan pencarian.");
    } finally {
      setSearching(false);
    }
  };

  const openUrlOrSearch = (event) => {
    event.preventDefault();
    const raw = String(url || "").trim();
    if (!raw) return;
    if (isLikelyUrl(raw)) {
      go(normalizeUrl(raw));
    } else {
      setSearchQuery(raw);
      doSearch(raw);
    }
  };

  const runSearch = (event) => {
    event.preventDefault();
    const q = String(url || "").trim();
    if (!q) return;
    setSearchQuery(q);
    doSearch(q);
  };

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    if (frameUrl) {
      setFrameKey((k) => k + 1);
      setFrameLoading(true);
    }
  };

  const loadText = async () => {
    const full = normalizeUrl(url);
    if (!full || loadingText || !isLikelyUrl(full)) return;
    setLoadingText(true);
    setTextError("");
    try {
      const res = await fetch("/api/browser/fetch?url=" + encodeURIComponent(full), {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Gagal mengambil halaman (HTTP " + res.status + ")");
      setPageText(data);
    } catch (error) {
      setPageText(null);
      setTextError(error?.message || "Gagal mengambil halaman.");
    } finally {
      setLoadingText(false);
    }
  };

  const fetchPageTool = async (target) => {
    try {
      const res = await fetch("/api/browser/fetch?url=" + encodeURIComponent(String(target || "")), {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.error || "HTTP " + res.status };
      return data;
    } catch (error) {
      return { ok: false, error: error?.message || "gagal mengambil halaman" };
    }
  };

  const webSearchTool = async (query) => {
    try {
      const res = await fetch("/api/browser/search?q=" + encodeURIComponent(String(query || "")), {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.error || "HTTP " + res.status };
      return data;
    } catch (error) {
      return { ok: false, error: error?.message || "gagal mencari" };
    }
  };

  const runAgent = async () => {
    const text = task.trim();
    if (!text || !effectiveModel || running) return;
    stopRef.current = false;
    setRunning(true);
    setAgentError("");
    setAnswer("");
    setSteps([]);
    const messages = [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      { role: "user", content: text },
    ];
    const push = (kind, message) => setSteps((current) => [...current, { kind, message }]);
    try {
      let done = false;
      for (let i = 0; i < MAX_STEPS && !done && !stopRef.current; i++) {
        const res = await fetch("/api/v1/chat/completions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: effectiveModel, messages, tools: TOOLS, temperature: 0.2 }),
        });
        const raw = await res.text();
        let data = null;
        try { data = JSON.parse(raw); } catch {}
        if (!res.ok) throw new Error((data && (data.error?.message || data.error)) || raw || "Request gagal (HTTP " + res.status + ")");
        const msg = data?.choices?.[0]?.message;
        if (!msg) throw new Error("Respons model tidak dikenal.");
        if (msg.content) push("thought", String(msg.content).slice(0, 300));
        const calls = msg.tool_calls || [];
        if (!calls.length) {
          setAnswer(String(msg.content || "(selesai)"));
          done = true;
          break;
        }
        messages.push(msg);
        for (const call of calls) {
          if (stopRef.current) break;
          const name = call?.function?.name || "";
          let args = {};
          try { args = JSON.parse(call?.function?.arguments || "{}"); } catch {}
          if (name === "finish") {
            setAnswer(String(args.answer || "Selesai."));
            done = true;
            break;
          }
          if (name === "web_search") {
            const query = String(args.query || "").slice(0, 200);
            push("action", "Mencari: " + query);
            const observation = await webSearchTool(query);
            const summary = observation.ok === false
              ? "Error: " + observation.error
              : (observation.results || []).slice(0, 8).map((r, idx) => (idx + 1) + ". " + (r.title || r.url) + " — " + r.url).join("\n") || "Tidak ada hasil.";
            push("observation", summary);
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(observation).slice(0, 12000) });
          } else if (name === "fetch_page") {
            push("action", "Membuka " + String(args.url || ""));
            const observation = await fetchPageTool(args.url);
            const summary = observation.ok === false
              ? "Error: " + observation.error
              : "Judul: " + (observation.title || "(tanpa judul)") + " | Teks: " + String(observation.text || "").slice(0, 160) + " | Tautan: " + (observation.links || []).length;
            push("observation", summary);
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(observation).slice(0, 12000) });
          } else {
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "Tool tidak dikenal: " + name }) });
          }
        }
      }
      if (!done && !stopRef.current) {
        setAnswer((current) => current || "Batas langkah tercapai. Jalankan ulang atau perjelas tugas.");
      }
    } catch (error) {
      setAgentError(error?.message || "Agent gagal berjalan.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">MAX Browser</h1>
          <p className="text-xs text-text-muted">Browser Chrome sungguhan di dashboard — render Chromium, pencarian web, dan AI agent.</p>
        </div>
        <button type="button" onClick={loadSetup} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:bg-bg">
          <RefreshCw size={13} /> Perbarui model
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Kolom kiri: mini browser (Chrome-like) */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          {/* Bar alamat + navigasi ala Chrome */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-bg p-1">
              <button
                type="button"
                onClick={goBack}
                disabled={histIndex <= 0}
                title="Kembali"
                className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-2 hover:text-text-main disabled:opacity-30"
              >
                <ArrowLeft size={14} />
              </button>
              <button
                type="button"
                onClick={goForward}
                disabled={histIndex >= history.length - 1}
                title="Maju"
                className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-2 hover:text-text-main disabled:opacity-30"
              >
                <ArrowRight size={14} />
              </button>
              <button
                type="button"
                onClick={reload}
                disabled={!frameUrl}
                title="Muat ulang"
                className="rounded-md px-2 py-1 text-text-muted hover:bg-surface-2 hover:text-text-main disabled:opacity-30"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <form onSubmit={openUrlOrSearch} className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full border border-border bg-bg px-3">
              <Globe size={16} className="text-text-muted" />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Cari di web atau masukkan URL, mis. berita teknologi"
                className="w-full bg-transparent py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={searching}
                title="Cari"
                className="text-text-muted hover:text-primary"
              >
                <Search size={15} />
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={runSearch} disabled={searching || !url.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {searching ? "Mencari..." : "Cari"}
            </button>
            <button
              type="button"
              onClick={loadText}
              disabled={loadingText || !url.trim()}
              className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              {loadingText ? "Mengambil..." : "Ambil Teks"}
            </button>
          </div>

          {textError && <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs">{textError}</p>}
          {searchError && <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs">{searchError}</p>}

          {searchResults !== null && (
            <div className="max-h-[340px] space-y-2 overflow-y-auto rounded-lg border border-border bg-bg p-3">
              <p className="text-xs font-semibold">
                Hasil pencarian untuk <span className="text-primary">{searchQuery}</span> ({(searchResults || []).length} hasil){searchEngine ? " — via " + searchEngine : ""}
              </p>
              {(searchResults || []).length === 0 ? (
                <p className="text-xs text-text-muted">Tidak ada hasil ditemukan. Coba kata kunci lain.</p>
              ) : (
                (searchResults || []).map((result, index) => (
                  <div key={result.url + index} className="rounded-lg border border-border bg-surface px-3 py-2">
                    <button
                      type="button"
                      onClick={() => go(result.url)}
                      className="text-left text-sm font-medium text-primary hover:underline"
                      title="Buka di mini browser (render Chromium)"
                    >
                      {result.title || result.url}
                    </button>
                    <p className="truncate text-[10px] text-text-muted">{result.url}</p>
                    {result.snippet && <p className="mt-1 text-xs text-text-muted">{result.snippet}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {frameUrl ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                <span className="max-w-[60%] truncate">{frameUrl}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-bg p-1">
                    <button
                      type="button"
                      onClick={() => switchMode("proxy")}
                      className={"inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium " + (mode === "proxy" ? "bg-primary text-white" : "text-text-muted hover:text-text-main")}
                      title="Halaman dirender Chromium di server (JavaScript jalan) — bisa untuk situs yang memblokir iframe"
                    >
                      <ShieldCheck size={13} /> Chrome
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("direct")}
                      className={"inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium " + (mode === "direct" ? "bg-primary text-white" : "text-text-muted hover:text-text-main")}
                      title="Situs dibuka langsung apa adanya (lebih cepat)"
                    >
                      <Zap size={13} /> Langsung
                    </button>
                  </div>
                  <button type="button" onClick={() => window.open(frameUrl, "_blank", "noopener")} className="inline-flex items-center gap-1 hover:text-text-main">
                    <ExternalLink size={13} /> Tab baru
                  </button>
                </div>
              </div>
              <div className="relative">
                <iframe
                  key={frameKey}
                  title="MAX Browser"
                  src={mode === "proxy" ? renderUrl(frameUrl) : frameUrl}
                  referrerPolicy="no-referrer"
                  sandbox={mode === "proxy" ? "allow-scripts allow-forms allow-popups" : "allow-scripts allow-forms allow-popups allow-same-origin"}
                  onLoad={() => setFrameLoading(false)}
                  className="h-[440px] w-full rounded-lg border border-border bg-white"
                />
                {frameLoading && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-white/60 text-xs text-text-muted">
                    Merender halaman (Chromium)...
                  </div>
                )}
              </div>
              <p className="text-[11px] text-text-muted">
                {mode === "proxy"
                  ? "Mode Chrome: halaman dirender pakai Chromium headless di server MAX Router (JavaScript ikut berjalan), lalu tampil di sini — situs seperti Google, YouTube, dan app Railway tetap muncul. Klik tautan di dalam frame untuk pindah halaman."
                  : "Mode Langsung: situs dibuka apa adanya, lebih cepat — tapi situs yang memblokir penyematan tidak akan tampil; kalau kosong, pakai mode Chrome."}
              </p>
            </>
          ) : (
            <div className="flex h-[340px] items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-text-muted">
              <span className="max-w-xs px-4">Ketik kata kunci untuk mencari di web, atau masukkan URL untuk membuka halaman.</span>
            </div>
          )}

          {pageText && (
            <div className="max-h-[260px] overflow-y-auto rounded-lg border border-border bg-bg p-3 text-xs">
              <p className="mb-1 font-semibold">{pageText.title || "(tanpa judul)"}</p>
              <p className="whitespace-pre-wrap text-text-muted">{String(pageText.text || "").slice(0, 4000)}</p>
              <p className="mt-2 text-[10px] text-text-muted">{(pageText.links || []).length} tautan ditemukan</p>
            </div>
          )}
        </section>

        {/* Kolom kanan: AI agent web */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-primary" /> AI Agent Web</h2>
              <p className="mt-0.5 text-xs text-text-muted">Agent mencari & menjelajah web lewat server. Model: {effectiveModel || "belum tersedia"}</p>
            </div>
            <select
              value={modelChoice}
              onChange={(e) => setModelChoice(e.target.value)}
              disabled={running}
              className="max-w-[45%] rounded-lg border border-border bg-bg px-2 py-2 text-xs"
              aria-label="Pilih model agent"
            >
              <option value="auto">Otomatis{bestModel ? " — " + bestModel : " (routing default)"}</option>
              {models.map((item) => (
                <option key={item.id} value={item.id}>{item.id}</option>
              ))}
            </select>
          </div>

          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            disabled={running || !effectiveModel}
            placeholder="Contoh: cari 3 berita teknologi terbaru hari ini, lalu rangkum"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runAgent}
              disabled={running || !task.trim() || !effectiveModel}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <Sparkles size={15} /> {running ? "Berjalan..." : "Jalankan Tugas"}
            </button>
            {running && (
              <button type="button" onClick={() => { stopRef.current = true; }} className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium">
                <StopCircle size={15} /> Stop
              </button>
            )}
          </div>

          {agentError && <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs">{agentError}</p>}

          {steps.length > 0 && (
            <ol className="max-h-[300px] space-y-2 overflow-y-auto rounded-lg border border-border bg-bg p-3 text-xs">
              {steps.map((step, index) => (
                <li
                  key={index}
                  className={
                    step.kind === "action"
                      ? "font-medium text-text-main"
                      : step.kind === "observation"
                        ? "text-text-muted"
                        : "italic text-text-muted"
                  }
                >
                  {step.kind === "action" ? "→ " : step.kind === "observation" ? "↳ " : "• "}{step.message}
                </li>
              ))}
            </ol>
          )}

          {answer && (
            <div className="rounded-lg border border-border bg-bg p-3 text-sm">
              <p className="mb-1 text-[10px] font-semibold uppercase text-text-muted">Jawaban</p>
              <p className="whitespace-pre-wrap">{answer}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
