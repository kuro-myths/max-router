import { useEffect, useMemo, useState } from "react";
import { Card, Badge, Button, Input } from "@/shared/components";

const inferCapabilities = (model) => {
  const id = String(model?.id || "").toLowerCase();
  const text = JSON.stringify(model || {}).toLowerCase();
  const caps = new Set();
  if (/vision|image[_ -]?input|multimodal/.test(text) || /vision|vl|4o|gemini|claude-3|claude-4/.test(id)) caps.add("Visi");
  if (/video/.test(text) || /video|veo|sora|kling|seedance/.test(id)) caps.add("Video");
  if (/function|tool/.test(text) || /tool|function/.test(id)) caps.add("Pemanggilan fungsi");
  if (/json/.test(text) || /json/.test(id)) caps.add("Mode JSON");
  if (/stream/.test(text)) caps.add("Streaming");
  if (/context|long/.test(text) || /1m|128k|200k|256k|512k|1000k/.test(id)) caps.add("Konteks panjang (>100k)");
  if (/code|coder|coding|program/.test(text) || /coder|code|dev/.test(id)) caps.add("Kode");
  if (/reason/.test(text) || /reason|thinking|r1|o1|o3|o4/.test(id)) caps.add("Penalaran");
  return [...caps];
};

const enrich = (model) => {
  const meta = model?.metadata || model?.capabilities || model;
  return {
    ...model,
    contextWindow: meta?.context_window ?? meta?.contextWindow ?? meta?.context_length ?? meta?.max_context ?? null,
    maxOutput: meta?.max_output ?? meta?.maxOutput ?? meta?.max_tokens ?? null,
    releaseDate: meta?.release_date ?? meta?.releaseDate ?? null,
    input: meta?.input ?? meta?.modalities?.input ?? null,
    pricing: meta?.pricing ?? null,
    priceClass: meta?.priceClass ?? (meta?.free === true ? "free" : meta?.paid === true ? "paid" : "unknown"),
    capabilities: Array.isArray(meta?.capabilities) ? meta.capabilities : inferCapabilities(model),
    parameters: meta?.supported_parameters ?? meta?.supportedParameters ?? [],
    description: meta?.description || meta?.description_text || "",
  };
};

export default function ModelDetectionPage() {
  const [models, setModels] = useState([]);
  const [query, setQuery] = useState("");
  const [priceFilter, setPriceFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/v1/models", { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal mengambil daftar model.");
      const data = await res.json();
      setModels((data.data || []).map(enrich));
    } catch (e) { setError(e.message || "Gagal mendeteksi model."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      const matchesQuery = !q || String(m.id).toLowerCase().includes(q) || String(m.owned_by || "").toLowerCase().includes(q);
      const cls = m.priceClass || "unknown";
      const matchesPrice = priceFilter === "all" || (priceFilter === "free" && (cls === "free" || cls === "both")) || (priceFilter === "paid" && (cls === "paid" || cls === "both")) || (priceFilter === "unknown" && cls === "unknown");
      return matchesQuery && matchesPrice;
    });
  }, [models, query, priceFilter]);

  const counts = useMemo(() => ({ all: models.length, free: models.filter(m => m.priceClass === "free" || m.priceClass === "both").length, paid: models.filter(m => m.priceClass === "paid" || m.priceClass === "both").length, unknown: models.filter(m => !m.priceClass || m.priceClass === "unknown").length }), [models]);

  return <div className="mx-auto w-full max-w-6xl p-4 sm:p-5">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold">Deteksi Model AI</h1>
        <p className="mt-1 text-xs text-text-muted">Daftar model yang tersedia, kemampuan, serta klasifikasi harga gratis dan berbayar.</p>
      </div>
      <Button variant="secondary" onClick={load} disabled={loading}>{loading ? "Mendeteksi..." : "Perbarui"}</Button>
    </div>
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><button onClick={() => setPriceFilter("all")} className={"rounded-xl border p-3 text-left transition "+(priceFilter==="all"?"border-violet-400 bg-violet-50 ring-1 ring-violet-200":"border-border bg-background hover:bg-surface-2")}><div className="text-[10px] text-text-muted">Semua model</div><div className="text-xl font-bold text-violet-700">{counts.all}</div></button><button onClick={() => setPriceFilter("free")} className={"rounded-xl border p-3 text-left transition "+(priceFilter==="free"?"border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200":"border-border bg-background hover:bg-surface-2")}><div className="text-[10px] text-emerald-700">Gratis / punya opsi gratis</div><div className="text-xl font-bold text-emerald-700">{counts.free}</div></button><button onClick={() => setPriceFilter("paid")} className={"rounded-xl border p-3 text-left transition "+(priceFilter==="paid"?"border-pink-400 bg-pink-50 ring-1 ring-pink-200":"border-border bg-background hover:bg-surface-2")}><div className="text-[10px] text-pink-700">Berbayar / punya opsi berbayar</div><div className="text-xl font-bold text-pink-700">{counts.paid}</div></button><button onClick={() => setPriceFilter("unknown")} className={"rounded-xl border p-3 text-left transition "+(priceFilter==="unknown"?"border-amber-400 bg-amber-50 ring-1 ring-amber-200":"border-border bg-background hover:bg-surface-2")}><div className="text-[10px] text-amber-700">Harga belum diketahui</div><div className="text-xl font-bold text-amber-700">{counts.unknown}</div></button></div><div className="mb-4"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama model atau penyedia..." /></div><div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-text-muted"><span>Filter harga:</span>{[["all","Semua"],["free","Gratis"],["paid","Berbayar"],["unknown","Belum diketahui"]].map(([value,label])=><button key={value} onClick={()=>setPriceFilter(value)} className={"rounded-full border px-3 py-1 "+(priceFilter===value?"border-violet-400 bg-violet-100 font-semibold text-violet-800":"border-border bg-background hover:bg-surface-2")}>{label}</button>)}<span className="ml-auto">Menampilkan {filtered.length} dari {models.length} model</span></div>
    {error && <Card className="mb-5 p-4"><span className="text-red-500">{error}</span></Card>}
    {!loading && !error && filtered.length === 0 && <Card className="p-6"><span className="text-text-muted">Belum ada model kompatibel yang terdeteksi.</span></Card>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {filtered.map((model) => <Card key={model.id} className="min-w-0 p-2.5">
        <button className="w-full text-left" onClick={() => setSelected(selected?.id === model.id ? null : model)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="break-all text-sm font-semibold leading-snug">{model.id}</h2><div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-text-muted"><span>{model.owned_by || "Penyedia kompatibel"}</span><span className={"rounded-full border px-2 py-0.5 font-semibold "+(model.priceClass==="free"?"border-emerald-300 bg-emerald-50 text-emerald-700":model.priceClass==="paid"?"border-pink-300 bg-pink-50 text-pink-700":model.priceClass==="both"?"border-violet-300 bg-violet-50 text-violet-700":"border-amber-300 bg-amber-50 text-amber-700")}>{model.priceClass === "free" ? "Gratis" : model.priceClass === "paid" ? "Berbayar" : model.priceClass === "both" ? "Gratis + berbayar" : "Harga belum diketahui"}</span></div></div>
            <div className="flex flex-wrap gap-1.5">{model.capabilities.map((cap) => <Badge key={cap} size="sm" variant="success">{cap}</Badge>)}</div>
          </div>
        </button>
        {selected?.id === model.id && <div className="mt-3 grid gap-2 border-t border-border-subtle pt-3 md:grid-cols-2">
          <Info label="Deskripsi" value={model.description || "Tidak diberikan provider"} wide />
          <Info label="Jendela konteks" value={model.contextWindow ?? "Tidak diberikan provider"} />
          <Info label="Keluaran maksimum" value={model.maxOutput ?? "Tidak diberikan provider"} />
          <Info label="Tanggal rilis" value={model.releaseDate || "Tidak diberikan provider"} />
          <Info label="Masukan" value={Array.isArray(model.input) ? model.input.join(", ") : model.input || "Tidak diberikan provider"} />
          <Info label="Kategori harga" value={model.priceClass === "free" ? "Gratis" : model.priceClass === "paid" ? "Berbayar" : model.priceClass === "both" ? "Tersedia versi gratis dan berbayar" : "Belum dapat dipastikan dari data penyedia"} /><Info label="Rincian harga" value={format(model.pricing) || "Penyedia tidak mengirim rincian harga"} />
          <Info label="Kemampuan" value={model.capabilities.join(", ") || "Belum dapat dideteksi"} wide />
          <Info label="Parameter yang didukung" value={Array.isArray(model.parameters) && model.parameters.length ? model.parameters.join(" · ") : "Tidak diberikan provider"} wide />
        </div>}
      </Card>)}
    </div>
  </div>;
}

function Info({ label, value, wide }) {
  return <div className={wide ? "md:col-span-2" : ""}><div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-text-muted">{label}</div><div className="mt-1 text-sm font-medium break-words">{String(value)}</div></div></div>;
}
function format(value) { return value == null ? "" : typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value); }
