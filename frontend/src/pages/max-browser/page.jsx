import { useEffect, useState } from "react";
import { Globe, RefreshCw, Copy, Monitor, Smartphone, Tablet, Bot, Check } from "lucide-react";

const API_URL = "/api/browser/detect";

export default function MaxBrowserPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const detect = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_URL, { credentials: "same-origin", cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Gagal mendeteksi browser.");
      setData(json);
    } catch (err) {
      setError(err?.message || "Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { detect(); }, []);

  const copyUA = async () => {
    if (!data?.userAgent) return;
    try { await navigator.clipboard.writeText(data.userAgent); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deviceIcon = data?.bot ? Bot : data?.device === "Ponsel" ? Smartphone : data?.device === "Tablet" ? Tablet : Monitor;

  const rows = data ? [
    { label: "Browser", value: data.name + (data.version ? " " + data.version : "") },
    { label: "Engine", value: data.engine },
    { label: "Sistem Operasi", value: data.os },
    { label: "Perangkat", value: data.bot ? "Bot / Otomatis" : data.device },
    { label: "User-Agent", value: data.userAgent, mono: true },
    { label: "Platform (Client Hints)", value: data.clientHints?.platform || "-", mono: true },
  ] : [];

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe size={22} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-text-main">Deteksi Browser</h1>
            <p className="text-xs text-text-muted">Kenali browser yang kamu pakai untuk membuka dashboard ini.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={detect}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Deteksi Ulang
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        {loading && !data ? (
          <p className="py-8 text-center text-sm text-text-muted">Mendeteksi browser...</p>
        ) : data ? (
          <>
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-bg p-3">
              {(() => {
                const Icon = deviceIcon || Monitor;
                return (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                );
              })()}
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text-main">
                  {data.bot ? "Bot / Otomatis" : data.name} {data.version && !data.bot ? data.version : ""}
                </p>
                <p className="text-xs text-text-muted">{data.os} &middot; {data.bot ? "Bot/Otomatis" : data.device}</p>
              </div>
            </div>

            <dl className="space-y-2">
              {rows.map((row) => (
                <div key={row.label} className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg p-3 sm:flex-row sm:items-center sm:justify-between">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{row.label}</dt>
                  <dd className={("break-all text-right " + (row.mono ? "font-mono text-xs" : "text-sm")) + " text-text-main"}>{row.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={copyUA}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main"
              >
                {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                {copied ? "Tersalin!" : "Salin User-Agent"}
              </button>
            </div>
          </>
        ) : null}
      </section>

      <p className="mt-4 text-center text-[11px] text-text-muted">
        Fitur browser berat (render Chromium, proxy halaman, pencarian web) sudah dihapus dan digantikan deteksi ringan ini.
      </p>
    </div>
  );
}
