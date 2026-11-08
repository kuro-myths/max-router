import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FileJson, LoaderCircle, Upload, X } from "lucide-react";
import { Card } from "@/shared/components";

const PROVIDER_MAP = { "github-copilot": "github" };
const SUPPORTED = new Set(["kiro", "github", "cursor", "codebuddy", "qoder"]);

function getPreview(payload) {
  const rows = Array.isArray(payload?.providerConnections) ? payload.providerConnections : [];
  const providers = {};
  let supported = 0;
  let withoutCredentials = 0;
  let unsupported = 0;
  for (const row of rows) {
    const source = String(row?.provider || row?.sourcePlatform || "unknown");
    const provider = PROVIDER_MAP[source.toLowerCase()] || source.toLowerCase();
    providers[source] = (providers[source] || 0) + 1;
    const data = row?.sourceData || {};
    const hasCredentials = Boolean(row?.accessToken || row?.refreshToken || row?.serviceToken || data?.access_token || data?.refresh_token || data?.github_access_token || data?.copilot_token);
    if (SUPPORTED.has(provider) && hasCredentials) supported += 1;
    else if (SUPPORTED.has(provider)) withoutCredentials += 1;
    else unsupported += 1;
  }
  return { total: rows.length, supported, withoutCredentials, unsupported, providers };
}

export default function Import9RouterPage() {
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const providerRows = useMemo(() => Object.entries(preview?.providers || {}).sort((a, b) => b[1] - a[1]), [preview]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    setResult(null);
    setError("");
    setPayload(null);
    setPreview(null);
    setFileName("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
      setError("Pilih file berekstensi .json.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed?.providerConnections)) throw new Error("Struktur JSON tidak cocok. Array providerConnections tidak ditemukan.");
      if (parsed.providerConnections.length > 1000) throw new Error("File berisi lebih dari 1.000 koneksi.");
      setPayload(parsed);
      setPreview(getPreview(parsed));
      setFileName(file.name);
    } catch (err) {
      setError(err?.message || "File JSON tidak dapat dibaca.");
    }
  };

  const importAccounts = async () => {
    if (!payload || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/providers/import-9router", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Impor gagal.");
      setResult(data);
    } catch (err) {
      setError(err?.message || "Impor gagal. Silakan coba kembali.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Database size={16} /> MIGRASI KONEKSI</div>
        <h1 className="mt-2 text-2xl font-bold text-text-main">Impor akun 9Router</h1>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">Pindahkan koneksi OAuth dari backup 9Router/Cockpit ke Max Router. Impor ini hanya menambahkan atau memperbarui koneksi; data lain seperti API key, model, pengaturan, dan proxy tidak akan dihapus.</p>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary"><Upload size={22} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-text-main">Pilih file backup JSON</h2>
            <p className="mt-1 text-sm text-text-muted">File dibaca di browser untuk menampilkan ringkasan. Token hanya dikirim ke backend Max Router saat kamu menekan tombol impor.</p>
            <label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-subtle bg-surface-2/50 px-4 py-6 text-center transition hover:border-primary/60 hover:bg-primary/5">
              <FileJson size={30} className="mb-2 text-primary" />
              <span className="text-sm font-semibold text-text-main">{fileName || "Pilih file JSON 9Router"}</span>
              <span className="mt-1 text-xs text-text-muted">Format JSON · Maksimal 1.000 koneksi</span>
              <input type="file" accept=".json,application/json" onChange={handleFile} className="sr-only" />
            </label>
            {fileName && <button type="button" onClick={() => { setPayload(null); setPreview(null); setFileName(""); setResult(null); }} className="mt-3 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-main"><X size={14} /> Hapus pilihan file</button>}
          </div>
        </div>
      </Card>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" /><div><p className="text-sm font-semibold text-text-main">Keamanan dan kompatibilitas</p><p className="mt-1 text-sm text-text-muted">Backup berisi kredensial OAuth. Jangan bagikan file atau unggah ke repository. Provider yang belum didukung Max Router akan dilewati. Token kedaluwarsa mungkin perlu refresh atau login ulang; impor tidak menjamin token masih valid.</p></div></div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">{error}</div>}

      {preview && (
        <Card>
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-text-main">Pratinjau impor</h2><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{preview.total} koneksi ditemukan</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-surface-2 p-4"><p className="text-xs text-text-muted">Siap diproses</p><p className="mt-1 text-2xl font-bold text-text-main">{preview.supported}</p></div>
            <div className="rounded-xl bg-surface-2 p-4"><p className="text-xs text-text-muted">Tanpa kredensial</p><p className="mt-1 text-2xl font-bold text-text-main">{preview.withoutCredentials}</p></div>
            <div className="rounded-xl bg-surface-2 p-4"><p className="text-xs text-text-muted">Provider tak didukung</p><p className="mt-1 text-2xl font-bold text-text-main">{preview.unsupported}</p></div>
            <div className="rounded-xl bg-surface-2 p-4"><p className="text-xs text-text-muted">Jenis provider</p><p className="mt-1 text-2xl font-bold text-text-main">{providerRows.length}</p></div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {providerRows.map(([provider, count]) => <div key={provider} className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm"><span className="truncate text-text-main">{provider}</span><span className="ml-3 font-mono text-text-muted">{count}</span></div>)}
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-muted">Koneksi yang sudah ada dengan provider dan email sama akan diperbarui, bukan digandakan.</p>
            <button type="button" onClick={importAccounts} disabled={busy || preview.supported === 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? <><LoaderCircle size={17} className="animate-spin" /> Mengimpor...</> : <><Upload size={17} /> Impor {preview.supported} koneksi</>}
            </button>
          </div>
        </Card>
      )}

      {result && (
        <Card>
          <div className="flex items-center gap-2 text-emerald-500"><CheckCircle2 size={20} /><h2 className="font-semibold">Impor selesai</h2></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2 p-4"><p className="text-xs text-text-muted">Ditambahkan</p><p className="text-2xl font-bold text-text-main">{result.importedCount}</p></div>
            <div className="rounded-xl bg-surface-2 p-4"><p className="text-xs text-text-muted">Diperbarui</p><p className="text-2xl font-bold text-text-main">{result.updatedCount}</p></div>
            <div className="rounded-xl bg-surface-2 p-4"><p className="text-xs text-text-muted">Dilewati</p><p className="text-2xl font-bold text-text-main">{result.skippedCount}</p></div>
          </div>
          {result.skipped && Object.keys(result.skipped).length > 0 && <div className="mt-4 space-y-1"><p className="text-sm font-semibold text-text-main">Rincian yang dilewati</p>{Object.entries(result.skipped).map(([reason, count]) => <p key={reason} className="text-xs text-text-muted">{reason}: {count}</p>)}</div>}
          <p className="mt-4 text-sm text-text-muted">{result.message}</p>
          <a href="/dashboard/providers" className="mt-4 inline-flex rounded-xl border border-border-subtle px-4 py-2 text-sm font-semibold text-text-main hover:bg-surface-2">Buka penyedia</a>
        </Card>
      )}
    </div>
  );
}
