import { Activity, Bot, Layers, MessageSquare, Search, Server, BarChart3, SlidersHorizontal, Network, Settings, ArrowUpRight, Zap, X, Filter, CircleAlert, CircleDollarSign, CheckCircle2, RefreshCw, KeyRound, Boxes, Wrench, FileText, Globe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const shortcuts = [
  { title: "Penyedia AI", description: "Tambah dan kelola koneksi penyedia model AI.", href: "/dashboard/providers", icon: Server, tone: "cyan" },
  { title: "Endpoint API", description: "Lihat alamat API untuk menghubungkan aplikasi.", href: "/dashboard/endpoint", icon: Activity, tone: "coral" },
  { title: "Obrolan Kompatibel", description: "Buka antarmuka obrolan yang kompatibel dengan API.", href: "/dashboard/compatible-chat", icon: MessageSquare, tone: "pink" },
  { title: "Deteksi Model", description: "Periksa model yang tersedia dari penyedia.", href: "/dashboard/model-detection", icon: Search, tone: "yellow" },
  { title: "Gabungan Model", description: "Atur urutan model dan strategi cadangan.", href: "/dashboard/combos", icon: Layers, tone: "purple" },
  { title: "Penggunaan", description: "Pantau statistik penggunaan dan permintaan API.", href: "/dashboard/usage", icon: BarChart3, tone: "green" },
  { title: "Parameter", description: "Sesuaikan parameter dan perilaku router.", href: "/dashboard/parameters", icon: SlidersHorizontal, tone: "orange" },
  { title: "Kumpulan Proksi", description: "Kelola kumpulan koneksi proksi.", href: "/dashboard/proxy-pools", icon: Network, tone: "blue" },
  { title: "Otomatisasi", description: "Kelola tugas otomatisasi yang tersedia.", href: "/dashboard/automation", icon: Bot, tone: "lavender" },
  { title: "MAX Browser", description: "Browsing langsung plus AI agent web dari dashboard.", href: "/dashboard/max-browser", icon: Globe, tone: "blue" },
];

const tones = {
  cyan: "bg-[#d9f5f8] text-[#176d78]",
  coral: "bg-[#ffe1d9] text-[#a84432]",
  pink: "bg-[#ffe0ef] text-[#a73570]",
  yellow: "bg-[#fff0bd] text-[#89621b]",
  purple: "bg-[#e8ddff] text-[#6947a6]",
  green: "bg-[#d9f8e8] text-[#20744d]",
  orange: "bg-[#ffe7cc] text-[#94551c]",
  blue: "bg-[#dce9ff] text-[#345da8]",
  lavender: "bg-[#f4dcff] text-[#86469a]",
};

function isErrorItem(item) {
  const status = String(item?.testStatus || item?.status || "").toLowerCase();
  return ["error", "expired", "unavailable", "failed", "failure"].includes(status)
    || Boolean(item?.lastError || item?.error || item?.lastErrorType);
}
function isFreeItem(item) {
  if (item?.isFree === true || item?.free === true || item?.pricing?.free === true) return true;
  const price = Number(item?.inputPrice ?? item?.input_price ?? item?.pricing?.input ?? item?.price);
  if (Number.isFinite(price) && price === 0) return true;
  return /\b(free|gratis)\b/i.test([item?.name, item?.id, item?.provider, item?.model].filter(Boolean).join(" "));
}
function getItemName(item, index) {
  return item?.name || item?.displayName || item?.model || item?.providerName || item?.provider || item?.id || `Layanan ${index + 1}`;
}

export default function DashboardPage() {
  const [connections, setConnections] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [combos, setCombos] = useState([]);
  const [repairing, setRepairing] = useState(false);
  const [autoRepairAttempted, setAutoRepairAttempted] = useState(false);
  const [repairedCount, setRepairedCount] = useState(0);
  const [notice, setNotice] = useState("");
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeMetric, setActiveMetric] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const refreshMetrics = async () => {
    setLoadingMetrics(true);
    setLoadError("");
    try {
      const [connectionsRes, nodesRes, keysRes, combosRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/provider-nodes", { cache: "no-store" }),
        fetch("/api/keys", { cache: "no-store" }),
        fetch("/api/combos", { cache: "no-store" }),
      ]);
      if (!connectionsRes.ok || !nodesRes.ok) throw new Error("Data layanan belum bisa dimuat.");
      const [connectionsData, nodesData, keysData, combosData] = await Promise.all([
        connectionsRes.json(), nodesRes.json(),
        keysRes.ok ? keysRes.json() : Promise.resolve({ keys: [] }),
        combosRes.ok ? combosRes.json() : Promise.resolve({ combos: [] }),
      ]);
      setConnections(Array.isArray(connectionsData.connections) ? connectionsData.connections : []);
      setNodes(Array.isArray(nodesData.nodes) ? nodesData.nodes : []);
      setApiKeys(Array.isArray(keysData.keys) ? keysData.keys : []);
      setCombos(Array.isArray(combosData.combos) ? combosData.combos.filter((item) => !item.kind) : []);
    } catch (error) {
      setLoadError(error?.message || "Gagal memuat ringkasan layanan.");
    } finally {
      setLoadingMetrics(false);
    }
  };
  useEffect(() => { refreshMetrics(); }, []);

  const metrics = useMemo(() => {
    const all = [
      ...nodes.map((item) => ({ ...item, _kind: "node" })),
      ...connections.map((item) => ({ ...item, _kind: "connection" })),
    ];
    const unique = new Map();
    nodes.forEach((item, i) => unique.set(String(item.id || item.name || `node-${i}`), item));
    connections.forEach((item, i) => unique.set(String(item.id || `connection-${i}`), item));
    const modelNames = new Set();
    [...connections, ...nodes].forEach((item) => { if (item?.defaultModel) modelNames.add(String(item.defaultModel)); });
    combos.forEach((combo) => (Array.isArray(combo.models) ? combo.models : []).forEach((model) => modelNames.add(String(model))));
    const recovered = connections.filter((item) => item?.lastErrorAt && !isErrorItem(item));
    return {
      all, services: unique.size, errors: all.filter(isErrorItem), free: all.filter(isFreeItem),
      paid: all.filter((item) => !isFreeItem(item)), providerKeys: connections.filter((item) => item.hasApiKey).length,
      clientKeys: apiKeys.length, models: [...modelNames], combos, recovered,
    };
  }, [connections, nodes, apiKeys, combos]);

  const modalItems = useMemo(() => {
    if (!activeMetric) return [];
    const items = activeMetric === "errors" ? metrics.errors : activeMetric === "free" ? metrics.free : activeMetric === "paid" ? metrics.paid : activeMetric === "providerKeys" ? connections.filter((item) => item.hasApiKey) : activeMetric === "clientKeys" ? apiKeys.map((item) => ({ ...item, _kind: "key" })) : activeMetric === "models" ? metrics.models.map((model) => ({ name: model, model, _kind: "model" })) : activeMetric === "combos" ? metrics.combos.map((combo) => ({ ...combo, _kind: "combo" })) : activeMetric === "recovered" ? metrics.recovered : metrics.all;
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const name = String(item?.name || item?.displayName || item?.model || item?.providerName || item?.provider || item?.id || "Tanpa nama").toLowerCase();
      const provider = String(item?.provider || item?.providerName || "").toLowerCase();
      const status = String(item?.testStatus || item?.status || "").toLowerCase();
      const matchesSearch = !q || name.includes(q) || provider.includes(q) || String(item?.id || "").toLowerCase().includes(q) || (Array.isArray(item?.models) && item.models.some((model) => String(model).toLowerCase().includes(q)));
      const matchesFilter = filter === "all"
        || (filter === "error" && isErrorItem(item))
        || (filter === "free" && isFreeItem(item))
        || (filter === "paid" && !isFreeItem(item))
        || (filter === "active" && ["active", "success", "connected", "available"].includes(status))
        || (filter === "inactive" && ["inactive", "disabled", "expired", "unavailable", "error", "failed"].includes(status));
      return matchesSearch && matchesFilter;
    });
  }, [activeMetric, metrics, search, filter]);
  const openMetric = (metric) => { setActiveMetric(metric); setSearch(""); setFilter("all"); setNotice(""); };

  const repairErrors = async () => {
    if (repairing) return;
    setRepairing(true);
    setNotice("");
    let fixed = 0;
    let cooldownsCleared = 0;
    try {
      const availabilityRes = await fetch("/api/models/availability", { cache: "no-store" });
      const availabilityData = availabilityRes.ok ? await availabilityRes.json() : { models: [] };
      const uniqueCooldowns = new Map();
      for (const item of (Array.isArray(availabilityData.models) ? availabilityData.models : [])) {
        if (item?.provider && item?.model && item.model !== "__all") uniqueCooldowns.set(`${item.provider}:${item.model}`, item);
      }
      for (const item of uniqueCooldowns.values()) {
        if (!item?.provider || !item?.model || item.model === "__all") continue;
        try {
          const res = await fetch("/api/models/availability", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "clearCooldown", provider: item.provider, model: item.model }),
          });
          if (res.ok) cooldownsCleared += 1;
        } catch {}
      }
      for (const item of metrics.errors.filter((entry) => entry?._kind === "connection").slice(0, 10)) {
        if (item?._kind !== "connection" || !item?.id) continue;
        try {
          const res = await fetch(`/api/providers/${encodeURIComponent(item.id)}/test`, { method: "POST" });
          if (res.ok && (await res.json()).valid) fixed += 1;
        } catch {}
      }
      setRepairedCount((count) => count + fixed);
      setNotice(`Pemeriksaan selesai: ${cooldownsCleared} cooldown dibersihkan, ${fixed} koneksi lolos tes. Error yang tersisa perlu diperiksa manual.`);
      await refreshMetrics();
    } finally { setRepairing(false); }
  };

  const makeComboReadme = () => [
    "# README Gabungan Model 9Router", "",
    "Combo adalah alias untuk urutan model. Router dapat menggunakan model berikutnya sebagai cadangan sesuai strategi combo.", "",
    ...metrics.combos.flatMap((combo) => [
      `## ${combo.name}`, "",
      `- Jumlah model: ${(combo.models || []).length}`,
      `- Urutan: ${(combo.models || []).join(" → ") || "Belum ada model"}`,
      `- Gunakan nilai model \`${combo.name}\` pada request API.`, "",
    ]),
    "## Contoh request", "", "```json",
    JSON.stringify({ model: metrics.combos[0]?.name || "nama-combo", messages: [{ role: "user", content: "Halo" }] }, null, 2),
    "```", "",
  ].join("\n");

  const copyComboReadme = async () => {
    try {
      await navigator.clipboard.writeText(makeComboReadme());
      setNotice("README combo berhasil disalin.");
    } catch { setNotice("Clipboard tidak tersedia di browser ini. Coba gunakan HTTPS atau izinkan akses clipboard."); }
  };

  useEffect(() => {
    if (!loadingMetrics && !autoRepairAttempted && metrics.errors.length > 0) {
      setAutoRepairAttempted(true);
      repairErrors();
    }
  }, [loadingMetrics, autoRepairAttempted, metrics.errors.length]);

  return (
    <div className="mr-dashboard-home space-y-3 pb-2">
      <section className="mr-dashboard-home-hero relative overflow-hidden rounded-2xl border-2 border-[#332746] bg-[#fff0f7] p-4 sm:p-5 shadow-[4px_4px_0_rgba(51,39,70,.12)]">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffb0d0]/55" />
        <div className="pointer-events-none absolute left-[58%] top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e8ddff]/75" />
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#e8a0c0] bg-white/80 px-3 py-1 text-xs font-bold text-[#6e3b65]">
              <Zap size={14} /> PUSAT KENDALI 9ROUTER
            </span>
            <h2 className="mt-2 text-xl sm:text-2xl font-black text-[#302344]">Selamat datang di Beranda</h2>
            <p className="mt-1 max-w-xl text-xs sm:text-sm text-[#5c4b68]">Kelola penyedia AI, endpoint, model, dan aktivitas router dari satu tempat.</p>
          </div>
          <Link to="/dashboard/providers" className="inline-flex w-fit shrink-0 items-center gap-2 rounded-xl border-2 border-[#332746] bg-[#ff9fc9] px-4 py-3 text-sm font-bold text-[#302344] shadow-[3px_3px_0_#332746] transition hover:-translate-y-0.5">
            <Server size={17} /> Kelola Penyedia <ArrowUpRight size={16} />
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-extrabold text-[#302344]">Ringkasan Layanan</h2><p className="text-xs text-[#766780]">Klik kartu untuk mencari dan memfilter detail.</p></div>
          <button type="button" onClick={refreshMetrics} disabled={loadingMetrics} className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbbbd6] bg-white px-3 py-2 text-xs font-bold text-[#554261] hover:bg-[#fff0f7]"><RefreshCw size={14} className={loadingMetrics ? "animate-spin" : ""}/> Perbarui</button>
        </div>
        {loadError && <div className="mb-3 rounded-xl border border-[#f2aaa0] bg-[#fff0ed] px-3 py-2 text-xs text-[#9b3d32]">{loadError} Pastikan backend API aktif.</div>}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-5">
          {[
            { id: "services", title: "Jumlah Layanan", value: metrics.services, icon: Server, tone: "bg-[#d9f5f8] text-[#176d78]", desc: "Node dan koneksi" },
            { id: "providerKeys", title: "Key Provider", value: metrics.providerKeys, icon: KeyRound, tone: "bg-[#e8ddff] text-[#6947a6]", desc: "Koneksi dengan API key" },
            { id: "clientKeys", title: "Key Akses API", value: metrics.clientKeys, icon: KeyRound, tone: "bg-[#dce9ff] text-[#345da8]", desc: "Key aplikasi klien" },
            { id: "models", title: "Model Terdaftar", value: metrics.models.length, icon: Bot, tone: "bg-[#d9f5f8] text-[#176d78]", desc: "Model unik yang ditemukan" },
            { id: "combos", title: "Combo Model", value: metrics.combos.length, icon: Boxes, tone: "bg-[#f4dcff] text-[#86469a]", desc: "Gabungan model cadangan" },
            { id: "errors", title: "Jumlah Error", value: metrics.errors.length, icon: CircleAlert, tone: "bg-[#ffe1d9] text-[#a84432]", desc: "Koneksi bermasalah" },
            { id: "recovered", title: "Pernah Pulih", value: metrics.recovered.length + repairedCount, icon: CheckCircle2, tone: "bg-[#d9f8e8] text-[#20744d]", desc: "Status pulih + sesi ini" },
            { id: "free", title: "Layanan Gratis", value: metrics.free.length, icon: CheckCircle2, tone: "bg-[#d9f8e8] text-[#20744d]", desc: "Terindikasi gratis" },
            { id: "paid", title: "Berbayar / Lainnya", value: metrics.paid.length, icon: CircleDollarSign, tone: "bg-[#e8ddff] text-[#6947a6]", desc: "Belum ditandai gratis" },
          ].map((metric) => {
            const Icon = metric.icon;
            return <button key={metric.id} type="button" onClick={() => openMetric(metric.id)} className="group rounded-xl border-2 border-[#3b2c4b] bg-[#fffdf8] p-3 text-left shadow-[3px_3px_0_rgba(51,39,70,.10)] transition hover:-translate-y-0.5 hover:bg-[#fff5fa] sm:p-4">
              <span className="flex items-center justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${metric.tone}`}><Icon size={19}/></span><ArrowUpRight size={16} className="text-[#8b7a96] group-hover:text-[#302344]"/></span>
              <span className="mt-3 block text-xs font-semibold text-[#74667e]">{metric.title}</span>
              <span className="mt-0.5 block text-2xl font-black text-[#302344]">{loadingMetrics ? "…" : metric.value}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-[#8a7c92]">{metric.desc}</span>
            </button>;
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={repairErrors} disabled={repairing || loadingMetrics || metrics.errors.length === 0} className="inline-flex items-center gap-2 rounded-lg border-2 border-[#332746] bg-[#ffb0d0] px-3 py-2 text-xs font-extrabold text-[#302344] shadow-[2px_2px_0_#332746] disabled:cursor-not-allowed disabled:opacity-50"><Wrench size={14} className={repairing ? "animate-spin" : ""}/>{repairing ? "Memeriksa & memulihkan..." : "Periksa & pulihkan error"}</button>
          <button type="button" onClick={copyComboReadme} className="inline-flex items-center gap-2 rounded-lg border border-[#cbbbd6] bg-white px-3 py-2 text-xs font-bold text-[#554261] hover:bg-[#fff0f7]"><FileText size={14}/>Salin README Combo</button>
          {notice && <span role="status" className="text-xs text-[#655270]">{notice}</span>}
        </div>
      </section>

      {activeMetric && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#21182e]/60 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveMetric(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="service-modal-title" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-[#332746] bg-[#fffdf8] shadow-[6px_6px_0_rgba(24,15,35,.25)]">
          <header className="flex items-start justify-between gap-3 border-b border-[#e5d8e8] bg-[#fff0f7] p-4 sm:p-5">
            <div><h2 id="service-modal-title" className="text-lg font-black text-[#302344]">{({services:"Semua Layanan",errors:"Layanan Error",free:"Layanan Gratis",paid:"Layanan Berbayar / Lainnya",providerKeys:"Key Provider",clientKeys:"Key Akses API",models:"Daftar Model",combos:"Daftar Combo Model",recovered:"Layanan yang Pernah Pulih"})[activeMetric]}</h2><p className="mt-1 text-xs text-[#74667e]">{modalItems.length} data cocok dengan pencarian dan filter.</p></div>
            <button type="button" onClick={() => setActiveMetric(null)} aria-label="Tutup popup" className="rounded-lg border border-[#cbbbd6] bg-white p-2 text-[#493656] hover:bg-[#ffe0ef]"><X size={18}/></button>
          </header>
          <div className="space-y-3 border-b border-[#e5d8e8] p-4">
            <label className="flex items-center gap-2 rounded-xl border border-[#cbbbd6] bg-white px-3"><Search size={17} className="shrink-0 text-[#887691]"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama layanan, provider, atau ID..." className="w-full bg-transparent py-2.5 text-sm text-[#302344] outline-none placeholder:text-[#a397ac]"/></label>
            <div className="flex items-center gap-2"><Filter size={16} className="text-[#766780]"/><select value={filter} onChange={(event) => setFilter(event.target.value)} className="w-full rounded-lg border border-[#cbbbd6] bg-white px-3 py-2 text-sm text-[#302344] outline-none"><option value="all">Semua status</option><option value="active">Aktif / tersambung</option><option value="error">Error</option><option value="inactive">Nonaktif / bermasalah</option><option value="free">Gratis</option><option value="paid">Berbayar / lainnya</option></select></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {loadingMetrics ? <p className="py-8 text-center text-sm text-[#766780]">Memuat layanan…</p> : modalItems.length === 0 ? <div className="py-10 text-center"><Search size={24} className="mx-auto mb-2 text-[#b5a5bf]"/><p className="text-sm font-bold text-[#493656]">Tidak ada layanan ditemukan</p><p className="mt-1 text-xs text-[#8a7c92]">Ubah kata pencarian atau filter.</p></div> : <div className="space-y-2">{modalItems.map((item, index) => {
              const name = item?._kind === "key" ? (item.name || `API Key ${index + 1}`) : getItemName(item, index);
              const error = isErrorItem(item);
              const status = item?.testStatus || item?.status || (error ? "error" : item?.isActive === false ? "nonaktif" : item?._kind === "combo" ? `${(item.models || []).length} model` : item?._kind === "model" ? "terdaftar" : item?._kind === "key" ? "tersedia" : "terdaftar");
              return <div key={String(item?.id || item?.name || index)} className="flex items-start gap-3 rounded-xl border border-[#e2d5e7] bg-white p-3">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${error ? "bg-[#ffe1d9] text-[#a84432]" : isFreeItem(item) ? "bg-[#d9f8e8] text-[#20744d]" : "bg-[#e8ddff] text-[#6947a6]"}`}>{error ? <CircleAlert size={18}/> : isFreeItem(item) ? <CheckCircle2 size={18}/> : <Server size={18}/>}</span>
                <span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold text-[#302344]">{name}</span><span className="mt-0.5 block break-all text-[11px] text-[#82748d]">{item?.provider || item?.providerName || item?._kind || "Layanan"}{item?.id ? ` · ${item.id}` : ""}{item?._kind === "key" && item?.machineId ? ` · ${item.machineId}` : ""}</span>{Array.isArray(item?.models) && item.models.length > 0 && <span className="mt-1 block break-words text-[11px] text-[#6947a6]">Model: {item.models.join(" · ")}</span>}{item?._kind === "model" && <span className="mt-1 block text-[11px] text-[#82748d]">Model unik dari layanan atau combo</span>}{item?._kind === "key" && <span className="mt-1 block text-[11px] text-[#82748d]">Key akses aplikasi</span>}{(item?.lastError || item?.error) && <span className="mt-1 block break-words text-xs text-[#a84432]">{String(item.lastError || item.error)}</span>}</span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${error ? "bg-[#ffe1d9] text-[#a84432]" : isFreeItem(item) ? "bg-[#d9f8e8] text-[#20744d]" : "bg-[#e8ddff] text-[#6947a6]"}`}>{String(status).slice(0, 24)}</span>
              </div>;
            })}</div>}
          </div>
          <footer className="flex items-center justify-between border-t border-[#e5d8e8] bg-[#fff9fc] px-4 py-3"><span className="text-xs text-[#82748d]">Total cocok: {modalItems.length}</span><button type="button" onClick={() => setActiveMetric(null)} className="rounded-lg border-2 border-[#332746] bg-[#ffb0d0] px-4 py-2 text-xs font-bold text-[#302344]">Selesai</button></footer>
        </section>
      </div>}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#302344]">Akses Cepat</h2>
            <p className="text-xs text-[#766780]">Pilih menu untuk membuka fitur.</p>
          </div>
          <span className="rounded-full bg-[#e8ddff] px-3 py-1 text-[11px] font-bold text-[#6947a6]">10 fitur</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} to={item.href} className="group flex min-w-0 items-start gap-3 rounded-xl border-2 border-[#3b2c4b] bg-[#fffdf8] p-4 shadow-[3px_3px_0_rgba(51,39,70,.10)] transition duration-150 hover:-translate-y-0.5 hover:bg-[#fff5fa] hover:shadow-[4px_4px_0_rgba(51,39,70,.15)]">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[item.tone]}`}>
                  <Icon size={21} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-extrabold text-[#302344]">
                    <span>{item.title}</span><ArrowUpRight size={15} className="shrink-0 opacity-45 transition group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-[#74667e]">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link to="/dashboard/console-log" className="flex items-center gap-3 rounded-xl border-2 border-[#3b2c4b] bg-[#e7f4ff] p-4 transition hover:bg-[#d9edff]">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#c3e3ff] text-[#315f9b]"><Activity size={20}/></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-[#302344]">Log Konsol</span><span className="block text-xs text-[#5d6880]">Lihat keluaran dan informasi diagnostik.</span></span>
          <ArrowUpRight size={17}/>
        </Link>
        <Link to="/dashboard/profile" className="flex items-center gap-3 rounded-xl border-2 border-[#3b2c4b] bg-[#f5e8ff] p-4 transition hover:bg-[#efdcff]">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#e5caff] text-[#75449a]"><Settings size={20}/></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-[#302344]">Pengaturan & Integrasi</span><span className="block text-xs text-[#766280]">Periksa koneksi dan konfigurasi aplikasi.</span></span>
          <ArrowUpRight size={17}/>
        </Link>
      </section>
    </div>
  );
}
