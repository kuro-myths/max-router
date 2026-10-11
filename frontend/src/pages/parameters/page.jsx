import { useEffect, useMemo, useState } from "react";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "Tidak diberikan provider";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function extractModels(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

export default function ParametersPage() {
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [modelsResponse, providersResponse] = await Promise.all([
        fetch("/api/v1/models", { cache: "no-store" }),
        fetch("/api/providers", { cache: "no-store" }),
      ]);
      if (!modelsResponse.ok) throw new Error("Gagal memuat model");
      const [modelsData, providersData] = await Promise.all([
        modelsResponse.json(),
        providersResponse.ok ? providersResponse.json() : Promise.resolve({ connections: [] }),
      ]);
      setModels(extractModels(modelsData));
      setProviders(Array.isArray(providersData.connections) ? providersData.connections : []);
    } catch {
      setModels([]);
      setProviders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const providerForModel = (model) => {
    const owner = String(model?.owned_by || "");
    const prefix = String(model?.id || "").split("/")[0];
    const candidates = [owner, prefix].filter(Boolean);
    for (const connection of providers) {
      const data = connection.providerSpecificData || {};
      const identifiers = [connection.provider, data.prefix, data.nodeName, connection.name]
        .filter(Boolean).map((value) => String(value).toLowerCase());
      if (candidates.some((candidate) => identifiers.includes(candidate.toLowerCase()))) {
        return connection.name || data.nodeName || AI_PROVIDERS[connection.provider]?.name || connection.provider;
      }
    }
    for (const candidate of candidates) {
      const config = getProviderByAlias(candidate) || AI_PROVIDERS[candidate];
      if (config?.name) return config.name;
    }
    if (owner === "combo") return "Gabungan";
    return owner || "Tidak diketahui";
  };

  const filtered = useMemo(() => models.filter((model) => {
    const q = query.trim().toLowerCase();
    return !q || String(model.id || "").toLowerCase().includes(q) || providerForModel(model).toLowerCase().includes(q);
  }), [models, query, providers]);

  const parameters = useMemo(() => {
    const map = new Map();
    for (const model of models) {
      const values = model.supported_parameters || model.supportedParameters || model.metadata?.supportedParameters || [];
      if (Array.isArray(values)) for (const value of values) {
        const key = String(value);
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [models]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 p-5 lg:p-7">
      <div>
        <h1 className="text-2xl font-semibold text-text-main">Parameter</h1>
        <p className="mt-1 text-sm text-text-muted">Parameter yang benar-benar dilaporkan oleh model kompatibel yang terhubung.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="text-xs text-text-muted">Model</div>
          <div className="mt-1 text-2xl font-semibold">{models.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="text-xs text-text-muted">Parameter unik</div>
          <div className="mt-1 text-2xl font-semibold">{parameters.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <div className="text-xs text-text-muted">Status</div>
          <div className="mt-1 text-sm font-medium">{loading ? "Memuat..." : "Terhubung ke /v1/models"}</div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
        <section className="min-h-0 overflow-auto rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="mb-3 text-sm font-semibold">Parameter terdeteksi</h2>
          {parameters.length === 0 ? (
            <p className="text-sm text-text-muted">Provider belum memberikan parameter yang didukung.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {parameters.map(([name, count]) => (
                <span key={name} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                  {name} <span className="text-text-muted">×{count}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="min-h-0 overflow-auto rounded-xl border border-border bg-surface-1 p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold">Parameter per model</h2>
            <div className="flex gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari model..." className="rounded-lg border border-border bg-bg px-3 py-2 text-xs outline-none" />
              <button onClick={load} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-2">Perbarui</button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="text-sm text-text-muted">{loading ? "Memuat model..." : "Belum ada model."}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((model) => {
                const values = model.supported_parameters || model.supportedParameters || model.metadata?.supportedParameters || [];
                return (
                  <div key={model.id} className="min-w-0 rounded-lg border border-border-subtle bg-surface-2/40 p-3">
                    <div className="break-all font-mono text-xs leading-snug">{model.id}</div>
                    <div className="mt-2 text-[11px] text-text-muted">Berasal dari layanan: <span className="font-semibold text-text-main">{providerForModel(model)}</span></div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Array.isArray(values) && values.length ? values.map((value) => (
                        <span key={String(value)} className="rounded bg-bg px-2 py-1 text-[11px]">{String(value)}</span>
                      )) : <span className="text-xs text-text-muted">{formatValue(values)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
