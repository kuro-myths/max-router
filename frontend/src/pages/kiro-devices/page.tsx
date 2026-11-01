import { useCallback, useEffect, useState } from "react";

type DeviceResult = {
  commandId?: string;
  type: string;
  ok: boolean;
  error?: string;
  data?: { port?: number };
};

type KiroDevice = {
  id: string;
  name?: string;
  platform?: string;
  bridgeVersion?: string;
  online: boolean;
  kiroRunning: boolean;
  mitmActive: boolean;
  mitmPort?: number;
  lastSeenAt?: number | null;
  results?: DeviceResult[];
};

type StatusBadgeProps = {
  ok: boolean;
  labelOk: string;
  labelOff: string;
  pulse?: boolean;
};

type CommandType = "launch-kiro" | "close-kiro" | "start-mitm" | "stop-mitm" | "open-url";

const REFRESH_MS = 5000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function StatusBadge({ ok, labelOk, labelOff, pulse = false }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        ok ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-black/5 text-text-muted dark:bg-white/5"
      }`}
    >
      <span className={`size-1.5 rounded-full ${ok ? "bg-green-500" : "bg-text-muted/50"} ${pulse && ok ? "animate-pulse" : ""}`} />
      {ok ? labelOk : labelOff}
    </span>
  );
}

function formatLastSeen(ts?: number | null): string {
  if (!ts) return "belum pernah";
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return `${diff} dtk lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  return new Date(ts).toLocaleString();
}

export default function KiroDevicesPage() {
  const [devices, setDevices] = useState<KiroDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, CommandType | null>>({});
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kiro-devices", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { devices?: KiroDevice[] };
      setDevices(Array.isArray(data.devices) ? data.devices : []);
      setError(null);
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const sendCommand = useCallback(async (device: KiroDevice, type: CommandType, payload: Record<string, string> = {}) => {
    setBusy((current) => ({ ...current, [device.id]: type }));
    try {
      const res = await fetch(`/api/kiro-devices/${encodeURIComponent(device.id)}/commands`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error || `Gagal mengirim perintah (${res.status})`);
        return;
      }
      window.setTimeout(() => void load(), REFRESH_MS + 1500);
    } catch (err: unknown) {
      alert(`Gagal mengirim perintah: ${errorMessage(err)}`);
    } finally {
      setBusy((current) => ({ ...current, [device.id]: null }));
    }
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-main">Perangkat Kiro</h1>
          <p className="text-sm text-text-muted">
            Kendalikan Kiro di komputer kamu langsung dari dashboard online.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-main hover:bg-surface-2">
          Muat Ulang
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-text-main mb-2">Hubungkan komputer kamu (satu kali saja)</h2>
        <ol className="list-decimal list-inside space-y-1.5 text-sm text-text-muted">
          <li>Pasang <a className="text-primary underline" href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js 18+</a> di komputer tempat Kiro terpasang.</li>
          <li>Buat API key di dashboard <span className="text-text-main">Keys</span>, lalu unduh repo ini di komputer.</li>
          <li>
            Jalankan bridge:
            <pre className="mt-1 overflow-x-auto rounded-lg bg-black/5 dark:bg-white/5 p-2.5 text-xs text-text-main">node scripts/kiro-device-bridge.mjs --url=https://URL-VERCEL-KAMU --key=sk-...</pre>
          </li>
          <li>Perangkat muncul di halaman ini dan siap menerima perintah.</li>
        </ol>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          Gagal memuat daftar perangkat: {error}
        </div>
      )}

      {devices === null && <p className="text-sm text-text-muted">Memuat perangkat…</p>}
      {devices !== null && devices.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
          Belum ada perangkat terhubung. Jalankan Kiro Bridge di komputer kamu.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(devices || []).map((device) => (
          <div key={device.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-text-main truncate">{device.name || device.id}</h3>
                <p className="text-xs text-text-muted">{device.platform || "unknown"} · bridge v{device.bridgeVersion || "?"}</p>
              </div>
              <StatusBadge ok={device.online} labelOk="Online" labelOff="Offline" pulse />
            </div>

            <div className="flex flex-wrap gap-2">
              <StatusBadge ok={device.kiroRunning} labelOk="Kiro berjalan" labelOff="Kiro tertutup" />
              <StatusBadge ok={device.mitmActive} labelOk={device.mitmPort ? `MITM aktif :${device.mitmPort}` : "MITM aktif"} labelOff="MITM nonaktif" />
            </div>

            <p className="text-xs text-text-muted">Terakhir terlihat: {formatLastSeen(device.lastSeenAt)}</p>

            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!device.online || Boolean(busy[device.id])} onClick={() => void sendCommand(device, "launch-kiro")} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
                {busy[device.id] === "launch-kiro" ? "Mengirim…" : "Buka Kiro"}
              </button>
              <button type="button" disabled={!device.online || Boolean(busy[device.id])} onClick={() => void sendCommand(device, "close-kiro")} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-main hover:bg-surface-2 disabled:opacity-40">
                Tutup Kiro
              </button>
              <button type="button" disabled={!device.online || Boolean(busy[device.id])} onClick={() => void sendCommand(device, device.mitmActive ? "stop-mitm" : "start-mitm")} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-main hover:bg-surface-2 disabled:opacity-40">
                {busy[device.id] === "start-mitm" || busy[device.id] === "stop-mitm" ? "…" : device.mitmActive ? "Stop MITM" : "Start MITM"}
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://… (buka di komputer)"
                value={urlDraft[device.id] || ""}
                onChange={(event) => setUrlDraft((current) => ({ ...current, [device.id]: event.target.value }))}
                className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text-main placeholder:text-text-muted/60"
              />
              <button
                type="button"
                disabled={!device.online || Boolean(busy[device.id]) || !(urlDraft[device.id] || "").trim()}
                onClick={() => void sendCommand(device, "open-url", { url: (urlDraft[device.id] || "").trim() })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-main hover:bg-surface-2 disabled:opacity-40"
              >
                Buka
              </button>
            </div>

            {Array.isArray(device.results) && device.results.length > 0 && (
              <div className="rounded-lg border border-border-subtle bg-bg/50 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1.5">Riwayat perintah</p>
                <ul className="space-y-1 text-xs">
                  {device.results.slice(0, 5).map((result, index) => (
                    <li key={result.commandId || index} className="flex items-center gap-2">
                      <span className={result.ok ? "text-green-500" : "text-red-500"}>{result.ok ? "✓" : "✗"}</span>
                      <span className="text-text-main">{result.type}</span>
                      {!result.ok && result.error && <span className="text-text-muted truncate">— {result.error}</span>}
                      {result.ok && result.type === "start-mitm" && result.data?.port && <span className="text-text-muted">port {result.data.port}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
