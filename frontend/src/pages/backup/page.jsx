import { useRef, useState } from "react";
import { Archive, CheckCircle2, Cloud, Database, Download, FileJson, HardDriveUpload, LoaderCircle, ShieldAlert, Upload } from "lucide-react";
import { Card } from "@/shared/components";

const COUNT_KEYS = [
  ["providerConnections", "Koneksi AI"],
  ["providerNodes", "Definisi penyedia"],
  ["proxyPools", "Proxy pools"],
  ["apiKeys", "API keys"],
  ["combos", "Gabungan model"],
  ["customModels", "Model kustom"],
];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function makeFilename() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return "max-router-backup-" + now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "_" + pad(now.getHours()) + pad(now.getMinutes()) + ".json";
}

export default function BackupPage() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const data = payload?.format === "max-router-backup" ? payload.data : payload;
  const counts = data ? COUNT_KEYS.map(([key, label]) => ({ key, label, count: Array.isArray(data[key]) ? data[key].length : 0 })) : [];

  async function downloadBackup() {
    setBusy("download"); setMessage(""); setError("");
    try {
      const response = await fetch("/api/backup", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Backup gagal diunduh.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || makeFilename();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = filename;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("Backup berhasil dibuat: " + filename + " (" + formatBytes(blob.size) + ").");
    } catch (err) { setError(err.message || "Backup gagal dibuat."); }
    finally { setBusy(""); }
  }

  async function chooseFile(selected) {
    setFile(selected || null); setPayload(null); setResult(null); setMessage(""); setError("");
    if (!selected) return;
    try {
      if (selected.size > 16 * 1024 * 1024) throw new Error("Ukuran file maksimal 16 MB.");
      const parsed = JSON.parse(await selected.text());
      const data = parsed?.format === "max-router-backup" ? parsed.data : parsed;
      if (!data || typeof data !== "object" || !Array.isArray(data.providerConnections) ||
          !Array.isArray(data.providerNodes) || !Array.isArray(data.proxyPools) ||
          !Array.isArray(data.apiKeys) || !Array.isArray(data.combos)) {
        throw new Error("Struktur file tidak dikenali sebagai backup Max Router.");
      }
      setPayload(parsed);
    } catch (err) { setError(err.message || "File JSON tidak valid."); }
  }

  async function restoreBackup() {
    if (!payload) return;
    const confirmed = window.confirm("PERINGATAN: Restore akan mengganti data koneksi, penyedia, proxy, API key, model, dan pengaturan saat ini. Pastikan Anda sudah mengunduh backup terbaru. Lanjutkan?");
    if (!confirmed) return;
    setBusy("restore"); setMessage(""); setError(""); setResult(null);
    try {
      const response = await fetch("/api/backup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, confirmReplace: "REPLACE" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Restore gagal.");
      setResult(body.restored || {});
      setMessage(body.message || "Restore berhasil.");
    } catch (err) { setError(err.message || "Restore gagal."); }
    finally { setBusy(""); }
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary"><Archive size={17}/> PENGELOLAAN DATA</div>
        <h1 className="mt-2 text-2xl font-bold text-text-main">Backup &amp; Restore</h1>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">Simpan seluruh konfigurasi Max Router ke satu file JSON atau pulihkan dari backup sebelumnya. Nama file dan isi backup dibuat otomatis dari database aktif.</p>
      </header>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><Cloud size={25}/></div>
            <div><h2 className="text-lg font-semibold">Database aktif</h2><p className="text-sm text-text-muted">Data diambil langsung dari database Max Router yang terhubung.</p></div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 size={15}/> Terhubung melalui server</span>
        </div>
        <div className="mt-5 rounded-xl border border-border-subtle bg-surface-2 p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Database size={17}/> Lokasi penyimpanan</div>
          <p className="mt-1 text-sm text-text-muted">Database cloud / server aktif — detail kredensial dan alamat internal disembunyikan demi keamanan.</p>
        </div>
        <button type="button" onClick={downloadBackup} disabled={!!busy} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {busy === "download" ? <LoaderCircle size={17} className="animate-spin"/> : <Download size={17}/>} {busy === "download" ? "Membuat backup..." : "Download Backup"}
        </button>
      </Card>

      <Card>
        <div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600"><HardDriveUpload size={23}/></div><div><h2 className="text-lg font-semibold">Import Backup</h2><p className="text-sm text-text-muted">Pilih file backup JSON. Sistem akan membaca dan menghitung data otomatis.</p></div></div>
        <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => chooseFile(event.target.files?.[0])}/>
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-subtle bg-surface-2 px-4 py-8 text-center hover:border-primary/50">
          <Upload size={26} className="text-primary"/><span className="font-semibold">{file ? file.name : "Pilih file backup"}</span><span className="text-xs text-text-muted">{file ? formatBytes(file.size) : "JSON · Maksimal 16 MB"}</span>
        </button>

        {payload && <section className="mt-5 rounded-xl border border-border-subtle p-4">
          <div className="flex items-center gap-2 font-semibold"><FileJson size={18}/> Pratinjau isi backup</div>
          <p className="mt-1 break-all text-xs text-text-muted">{file?.name} · {payload.generatedAt ? new Date(payload.generatedAt).toLocaleString("id-ID") : "Format JSON kompatibel"}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {counts.map((item) => <div key={item.key} className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-text-muted">{item.label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{item.count.toLocaleString("id-ID")}</p></div>)}
          </div>
          <button type="button" onClick={restoreBackup} disabled={!!busy} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
            {busy === "restore" ? <LoaderCircle size={17} className="animate-spin"/> : <Upload size={17}/>} {busy === "restore" ? "Memulihkan data..." : "Pulihkan Backup"}
          </button>
        </section>}
      </Card>

      {(message || error) && <div role={error ? "alert" : "status"} className={"rounded-xl border p-4 text-sm " + (error ? "border-red-500/30 bg-red-500/10 text-red-600" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700")}>{error || message}</div>}
      {result && <Card><h3 className="font-semibold">Data berhasil dipulihkan</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{COUNT_KEYS.map(([key,label]) => <div key={key} className="rounded-lg bg-surface-2 p-3 text-sm"><span className="text-text-muted">{label}</span><strong className="ml-2 tabular-nums">{(result[key] ?? 0).toLocaleString("id-ID")}</strong></div>)}</div></Card>}

      <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-text-muted"><ShieldAlert size={20} className="shrink-0 text-amber-600"/><p><strong className="text-text-main">Penting:</strong> file backup berisi kredensial provider dan API key. Simpan secara privat, jangan unggah ke repositori publik. Restore mengganti data aktif secara penuh; unduh backup terbaru sebelum memulihkan.</p></div>
    </main>
  );
}
