import { useEffect, useMemo, useState } from "react";
import { Card, Badge, Button, Input } from "@/shared/components";

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");
const inferParameterCount = (model) => {
  const meta = model?.metadata && typeof model.metadata === "object" ? model.metadata : model;
  const explicit = first(meta?.parameter_count, meta?.parameterCount, meta?.num_parameters, meta?.parameters_count, meta?.model_parameters, meta?.params_count);
  if (explicit !== undefined) return { value: explicit, source: "provider" };
  const id = String(model?.id || "");
  const match = id.match(/(?:^|[-_./])([0-9]+(?:\.[0-9]+)?)(b|bn|m|mn)(?:[-_./]|$)/i);
  if (match) return { value: Number(match[1]) * (/m/i.test(match[2]) ? 1e6 : 1e9), source: "name-estimate" };
  return { value: null, source: "unknown" };
};
const inferCapabilities = (model) => {
  const id = String(model?.id || "").toLowerCase();
  const raw = JSON.stringify(model || {}).toLowerCase();
  const caps = new Set(Array.isArray(model?.capabilities) ? model.capabilities : []);
  const has = (pattern) => pattern.test(raw) || pattern.test(id);
  if (has(/vision|image[_ -]?input|multimodal|\bvl\b/)) caps.add("Vision");
  if (has(/video|veo|sora|kling|seedance/)) caps.add("Video");
  if (has(/audio|speech|\bstt\b|\btts\b/)) caps.add("Audio");
  if (has(/function|tool[_ -]?calling|tools/)) caps.add("Tool calling");
  if (has(/json[_ -]?mode|structured[_ -]?output/)) caps.add("Structured output");
  if (has(/stream/)) caps.add("Streaming");
  if (has(/code|coder|coding|program/)) caps.add("Coding");
  if (has(/reason|thinking/)) caps.add("Reasoning");
  if (has(/embedding/)) caps.add("Embedding");
  return [...caps];
};
const enrich = (model) => {
  const meta = model?.metadata && typeof model.metadata === "object" && !Array.isArray(model.metadata) ? model.metadata : model || {};
  const params = first(meta?.supported_parameters, meta?.supportedParameters, model?.supported_parameters, model?.supportedParameters, []);
  const parameterCount = inferParameterCount({ ...model, metadata: meta });
  return {
    ...model,
    contextWindow: first(meta.context_window, meta.contextWindow, meta.context_length, meta.max_context, model?.context_window),
    maxOutput: first(meta.max_output_tokens, meta.max_output, meta.maxOutput, meta.max_tokens, model?.max_output),
    maxInput: first(meta.max_input_tokens, meta.max_input, meta.maxInput, meta.max_input_length),
    parameterCount: parameterCount.value,
    parameterSource: parameterCount.source,
    architecture: first(meta.architecture, meta.model_architecture, meta.family),
    releaseDate: first(meta.release_date, meta.releaseDate),
    input: first(meta.input, meta.modalities?.input, model?.input),
    output: first(meta.output, meta.modalities?.output, model?.output),
    pricing: first(meta.pricing, model?.pricing),
    priceClass: first(meta.priceClass, model?.priceClass, meta.free === true ? "free" : meta.paid === true ? "paid" : "unknown"),
    capabilities: inferCapabilities({ ...model, ...meta }),
    parameters: Array.isArray(params) ? params : [],
    description: first(meta.description, meta.description_text, model?.description, ""),
  };
};
const number = (value) => {
  if (value === null || value === undefined || value === "") return "Tidak diketahui";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n >= 1e12) return (n / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " T";
  if (n >= 1e9) return (n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " B";
  if (n >= 1e6) return (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
  return n.toLocaleString("id-ID");
};
const format = (value) => value == null ? "" : typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);

export default function ModelDetectionPage() {
  const [models, setModels] = useState([]);
  const [query, setQuery] = useState("");
  const [capFilter, setCapFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/v1/models", { cache: "no-store" });
      if (!res.ok) throw new Error("Gagal mengambil katalog model (" + res.status + ").");
      const data = await res.json();
      setModels((data.data || []).map(enrich));
    } catch (e) { setError(e.message || "Gagal mendeteksi model."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      const haystack = [m.id, m.owned_by, m.description, m.architecture, ...(m.capabilities || [])].join(" ").toLowerCase();
      const price = priceFilter === "all" || (priceFilter === "free" && ["free","both"].includes(m.priceClass)) || (priceFilter === "paid" && ["paid","both"].includes(m.priceClass)) || (priceFilter === "unknown" && (!m.priceClass || m.priceClass === "unknown"));
      const cap = capFilter === "all" || (m.capabilities || []).some((v) => v.toLowerCase().includes(capFilter));
      return (!q || haystack.includes(q)) && price && cap;
    });
  }, [models, query, priceFilter, capFilter]);
  const counts = useMemo(() => ({
    all: models.length,
    free: models.filter(m => ["free","both"].includes(m.priceClass)).length,
    paid: models.filter(m => ["paid","both"].includes(m.priceClass)).length,
    vision: models.filter(m => m.capabilities.includes("Vision")).length,
    audio: models.filter(m => m.capabilities.includes("Audio")).length,
    reasoning: models.filter(m => m.capabilities.includes("Reasoning")).length,
  }), [models]);
  return <div className="mx-auto w-full max-w-7xl p-4 sm:p-5">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-xl font-semibold">AI Model Intelligence</h1><p className="mt-1 text-xs text-text-muted">Deteksi katalog, parameter, batas token, modalitas, kemampuan, dan harga model dari provider aktif.</p></div>
      <Button variant="secondary" onClick={load} disabled={loading}>{loading ? "Memindai..." : "Pindai ulang"}</Button>
    </div>
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {[["Semua model",counts.all,"all"],["Gratis / opsi gratis",counts.free,"free"],["Berbayar / opsi berbayar",counts.paid,"paid"],["Vision",counts.vision,"vision"],["Audio",counts.audio,"audio"],["Reasoning",counts.reasoning,"reasoning"]].map(([label,value,key])=><button key={key} onClick={()=>key==="vision"||key==="audio"||key==="reasoning"?setCapFilter(capFilter===key?"all":key):setPriceFilter(key)} className="rounded-xl border border-border bg-background p-3 text-left hover:bg-surface-2"><div className="text-[10px] text-text-muted">{label}</div><div className="text-xl font-bold">{value}</div></button>)}
    </div>
    <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Cari model, provider, arsitektur, kemampuan..." />
      <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={priceFilter} onChange={e=>setPriceFilter(e.target.value)}><option value="all">Semua harga</option><option value="free">Gratis</option><option value="paid">Berbayar</option><option value="unknown">Harga tidak diketahui</option></select>
      <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={capFilter} onChange={e=>setCapFilter(e.target.value)}><option value="all">Semua kemampuan</option>{["vision","audio","video","coding","reasoning","tool calling","structured output","embedding"].map(x=><option key={x} value={x}>{x}</option>)}</select>
    </div>
    <div className="mb-3 text-[11px] text-text-muted">{loading ? "Memuat katalog..." : "Menampilkan " + filtered.length + " dari " + models.length + " model"} · Data yang tidak disediakan provider ditandai tidak diketahui, bukan ditebak.</div>
    {error && <Card className="mb-4 p-4"><span className="text-red-500">{error}</span></Card>}
    {!loading && !error && filtered.length===0 && <Card className="p-6"><span className="text-text-muted">Tidak ada model yang cocok. Pastikan provider aktif dan endpoint model dapat diakses.</span></Card>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map(model=><Card key={model.id} className="min-w-0 p-3">
        <button className="w-full text-left" onClick={()=>setSelected(selected?.id===model.id?null:model)}>
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-all text-sm font-semibold">{model.id}</h2><p className="mt-1 text-[11px] text-text-muted">{model.owned_by || "Provider tidak diketahui"}{model.architecture ? " · "+model.architecture : ""}</p></div><Badge size="sm" variant={model.priceClass==="free"?"success":"secondary"}>{model.priceClass==="free"?"Gratis":model.priceClass==="paid"?"Berbayar":model.priceClass==="both"?"Free + Paid":"Harga N/A"}</Badge></div>
          <div className="mt-3 grid grid-cols-3 gap-2"><Metric label="Context" value={number(model.contextWindow)} /><Metric label="Max output" value={number(model.maxOutput)} /><Metric label="Parameter" value={number(model.parameterCount)} /></div>
          <div className="mt-2 flex flex-wrap gap-1">{model.capabilities.map(cap=><Badge key={cap} size="sm">{cap}</Badge>)}</div>
        </button>
        {selected?.id===model.id && <div className="mt-3 grid gap-2 border-t border-border-subtle pt-3 sm:grid-cols-2">
          <Info label="Deskripsi" value={model.description || "Tidak disediakan"} wide />
          <Info label="Jumlah parameter" value={number(model.parameterCount)+(model.parameterSource==="name-estimate"?" (perkiraan dari ID model)":model.parameterSource==="provider"?" (metadata provider)":" (tidak dipublikasikan)")} />
          <Info label="Arsitektur / keluarga" value={model.architecture || "Tidak diketahui"} />
          <Info label="Context window" value={number(model.contextWindow)} />
          <Info label="Max input token" value={number(model.maxInput)} />
          <Info label="Max output token" value={number(model.maxOutput)} />
          <Info label="Input modality" value={format(model.input)||"Tidak diketahui"} />
          <Info label="Output modality" value={format(model.output)||"Tidak diketahui"} />
          <Info label="Tanggal rilis" value={model.releaseDate||"Tidak diketahui"} />
          <Info label="Harga" value={format(model.pricing)||"Tidak dipublikasikan provider"} />
          <Info label="Parameter API yang didukung" value={model.parameters.join(" · ")||"Tidak dipublikasikan provider"} wide />
          <Info label="Capabilities" value={model.capabilities.join(", ")||"Belum terdeteksi"} wide />
        </div>}
      </Card>)}
    </div>
  </div>;
}
function Metric({label,value}) { return <div className="rounded-lg bg-surface-2 p-2"><div className="text-[10px] text-text-muted">{label}</div><div className="mt-1 break-words text-xs font-semibold">{value}</div></div>; }
function Info({label,value,wide}) { return <div className={wide?"sm:col-span-2":""}><div className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-text-muted">{label}</div><div className="mt-1 break-words text-sm font-medium">{String(value)}</div></div></div>; }
