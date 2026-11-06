import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, Clapperboard, Download, Film, ImagePlus, LoaderCircle,
  Play, Sparkles, Trash2, Upload, WandSparkles, X,
} from "lucide-react";

type Panel = {
  id: string;
  file: File;
  preview: string;
  prompt: string;
  duration: number;
  videoUrl?: string;
  status: "ready" | "generating" | "done" | "error";
  error?: string;
};

const DEFAULT_MOTION =
  "Animate this comic panel as a cinematic anime shot. Preserve the original character design, face, outfit, colors, line art and scene composition. Add subtle natural character movement, expressive eyes and hair motion, atmospheric depth and a gentle camera push-in. No new characters, no scene change, no text distortion.";

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Gagal membaca gambar."));
    reader.onerror = () => reject(new Error("Gagal membaca gambar."));
    reader.readAsDataURL(file);
  });
}

export default function ComicStudio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [model, setModel] = useState("leonardo/leo-kling-3");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [apiKey, setApiKey] = useState(() => {
    try { return sessionStorage.getItem("comic-studio-api-key") || ""; } catch { return ""; }
  });
  const [globalPrompt, setGlobalPrompt] = useState(DEFAULT_MOTION);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"panels" | "results">("panels");

  const completed = panels.filter((panel) => panel.status === "done" && panel.videoUrl).length;
  const canGenerate = panels.length > 0 && !generating;

  const totalDuration = useMemo(
    () => panels.reduce((sum, panel) => sum + panel.duration, 0),
    [panels],
  );

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    if (!files.length) {
      setNotice("Pilih file gambar PNG, JPG, WEBP, atau GIF.");
      return;
    }
    const additions: Panel[] = [];
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        setNotice(`${file.name} melebihi batas 20 MB.`);
        continue;
      }
      try {
        additions.push({
          id: makeId(), file, preview: await readAsDataUrl(file),
          prompt: "", duration: 5, status: "ready",
        });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Gagal memuat gambar.");
      }
    }
    setPanels((current) => [...current, ...additions]);
    setActiveTab("panels");
    if (inputRef.current) inputRef.current.value = "";
  }

  function patchPanel(id: string, patch: Partial<Panel>) {
    setPanels((current) => current.map((panel) => panel.id === id ? { ...panel, ...patch } : panel));
  }

  function movePanel(index: number, direction: -1 | 1) {
    setPanels((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removePanel(id: string) {
    setPanels((current) => current.filter((panel) => panel.id !== id));
  }

  async function generateVideos() {
    if (!panels.length || generating) return;
    if (!apiKey.trim()) {
      setNotice("Masukkan API key Max Router terlebih dahulu. API key hanya disimpan selama sesi browser.");
      return;
    }
    setGenerating(true);
    setNotice("");
    setPanels((current) => current.map((panel) => ({ ...panel, status: "ready", error: undefined })));
    try { sessionStorage.setItem("comic-studio-api-key", apiKey.trim()); } catch { /* session storage may be disabled */ }

    for (const panel of panels) {
      setPanels((current) => current.map((item) => item.id === panel.id ? { ...item, status: "generating" } : item));
      try {
        const prompt = [globalPrompt.trim(), panel.prompt.trim()].filter(Boolean).join("\n\n");
        const response = await fetch("/v1/video/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          body: JSON.stringify({
            model,
            prompt,
            image_url: panel.preview,
            aspect_ratio: aspectRatio,
            size: aspectRatio,
            duration: panel.duration,
          }),
        });
        const raw = await response.text();
        let payload: any;
        try { payload = JSON.parse(raw.trim()); } catch {
          throw new Error(raw.trim().slice(0, 220) || `HTTP ${response.status}: respons kosong`);
        }
        if (!response.ok || payload?.error) {
          throw new Error(payload?.error?.message || `Video API gagal (HTTP ${response.status})`);
        }
        const videoUrl = payload?.data?.[0]?.url || payload?.url || payload?.urls?.[0];
        if (!videoUrl) throw new Error("Provider tidak mengembalikan URL video.");
        setPanels((current) => current.map((item) => item.id === panel.id ? { ...item, status: "done", videoUrl } : item));
        setActiveTab("results");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Gagal membuat video.";
        setPanels((current) => current.map((item) => item.id === panel.id ? { ...item, status: "error", error: message } : item));
      }
    }
    setGenerating(false);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-10 text-text-main">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles size={14} /> MAX ROUTER CREATIVE STUDIO
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Comic <span className="text-primary">to Video</span></h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">
              Ubah panel manga dan komik menjadi motion video. Susun urutan cerita, atur gerakan kamera, lalu generate klip per panel melalui provider video Max Router.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[330px]">
            <Stat label="Panel" value={panels.length} />
            <Stat label="Video jadi" value={completed} />
            <Stat label="Durasi rencana" value={`${totalDuration}s`} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
              <TabButton active={activeTab === "panels"} onClick={() => setActiveTab("panels")}>Storyboard ({panels.length})</TabButton>
              <TabButton active={activeTab === "results"} onClick={() => setActiveTab("results")}>Hasil video ({completed})</TabButton>
            </div>
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110">
              <ImagePlus size={16} /> Tambah panel
            </button>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={(event) => event.target.files && addFiles(event.target.files)} />
          </div>

          {activeTab === "panels" ? (
            panels.length === 0 ? (
              <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }} className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border bg-surface/70 p-8 text-center transition hover:border-primary/60 hover:bg-primary/5">
                <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Upload size={28} /></span>
                <strong className="text-lg">Upload halaman atau panel komik</strong>
                <span className="mt-2 max-w-sm text-sm text-text-muted">Seret file ke sini atau klik untuk memilih beberapa gambar. Maksimal 20 MB per gambar.</span>
                <span className="mt-4 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted">PNG · JPG · WEBP · GIF</span>
              </button>
            ) : (
              <div className="space-y-3">
                {panels.map((panel, index) => (
                  <article key={panel.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                    <div className="grid gap-0 sm:grid-cols-[190px_minmax(0,1fr)]">
                      <div className="relative min-h-[190px] bg-black/5">
                        <img src={panel.preview} alt={`Panel ${index + 1}`} className="absolute inset-0 h-full w-full object-contain" />
                        <span className="absolute left-3 top-3 rounded-lg bg-black/75 px-2 py-1 text-xs font-bold text-white">SCENE {String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <div className="min-w-0 space-y-3 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{panel.file.name}</h3><p className="text-xs text-text-muted">{(panel.file.size / 1024 / 1024).toFixed(2)} MB · {panel.duration} detik</p></div>
                          <div className="flex shrink-0 items-center gap-1">
                            <IconButton title="Naikkan urutan" disabled={index === 0 || generating} onClick={() => movePanel(index, -1)}><ArrowUp size={15} /></IconButton>
                            <IconButton title="Turunkan urutan" disabled={index === panels.length - 1 || generating} onClick={() => movePanel(index, 1)}><ArrowDown size={15} /></IconButton>
                            <IconButton title="Hapus panel" disabled={generating} onClick={() => removePanel(panel.id)} danger><Trash2 size={15} /></IconButton>
                          </div>
                        </div>
                        <label className="block text-xs font-semibold text-text-muted">Arahan gerakan khusus panel</label>
                        <textarea value={panel.prompt} onChange={(event) => patchPanel(panel.id, { prompt: event.target.value })} placeholder="Contoh: karakter menoleh perlahan, rambut tertiup angin, kamera zoom ke mata..." rows={2} className="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary" />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-xs text-text-muted">Durasi
                            <select value={panel.duration} onChange={(event) => patchPanel(panel.id, { duration: Number(event.target.value) })} className="rounded-lg border border-border bg-bg px-2 py-1.5 text-text-main">
                              {[5, 10].map((value) => <option key={value} value={value}>{value} detik</option>)}
                            </select>
                          </label>
                          <PanelStatus panel={panel} />
                        </div>
                        {panel.error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{panel.error}</p>}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {panels.filter((panel) => panel.videoUrl).map((panel, index) => (
                <article key={panel.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <video src={panel.videoUrl} controls playsInline className="aspect-video w-full bg-black object-contain" />
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div><p className="text-sm font-semibold">Scene {index + 1}</p><p className="text-xs text-text-muted">{panel.file.name}</p></div>
                    <a href={panel.videoUrl} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-surface-2"><Download size={14} /> Simpan</a>
                  </div>
                </article>
              ))}
              {!completed && <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-text-muted">Belum ada video. Generate storyboard untuk melihat hasil di sini.</div>}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-4 flex items-center gap-2"><WandSparkles size={18} className="text-primary" /><h2 className="font-semibold">Pengaturan animasi</h2></div>
            <label className="mb-1.5 block text-xs font-semibold text-text-muted">Model video</label>
            <select value={model} onChange={(event) => setModel(event.target.value)} disabled={generating} className="mb-4 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm">
              <option value="leonardo/leo-kling-3">Leonardo · Kling 3.0</option>
              <option value="leonardo/leo-kling-3-turbo">Leonardo · Kling 3.0 Turbo</option>
              <option value="leonardo/leo-veo-3.1">Leonardo · Veo 3.1</option>
              <option value="leonardo/leo-seedance-2">Leonardo · Seedance 2.0</option>
              <option value="leonardo/leo-sora-2-pro">Leonardo · Sora 2 Pro</option>
            </select>
            <label className="mb-1.5 block text-xs font-semibold text-text-muted">Format video</label>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {["9:16", "16:9", "1:1"].map((ratio) => <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)} disabled={generating} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${aspectRatio === ratio ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:bg-surface-2"}`}>{ratio}</button>)}
            </div>
            <label className="mb-1.5 block text-xs font-semibold text-text-muted">Arahan gerakan global</label>
            <textarea value={globalPrompt} onChange={(event) => setGlobalPrompt(event.target.value)} rows={7} disabled={generating} className="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2 text-xs leading-5 outline-none focus:border-primary" />
            <p className="mt-2 text-[11px] leading-5 text-text-muted">Arahan global diterapkan ke semua panel. Tambahkan arahan khusus untuk gerakan tiap scene.</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">Koneksi Max Router</h2>
            <label className="mb-1.5 block text-xs text-text-muted">API key</label>
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Masukkan API key Max Router" autoComplete="off" className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-primary" />
            <p className="mt-2 text-[11px] leading-5 text-text-muted">Key disimpan di session browser dan dikirim langsung ke endpoint Max Router. Jangan bagikan key ini.</p>
          </div>

          <button type="button" onClick={generateVideos} disabled={!canGenerate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            {generating ? <><LoaderCircle size={17} className="animate-spin" /> Membuat video...</> : <><Clapperboard size={17} /> Generate {panels.length} scene</>}
          </button>
          {generating && <p className="text-center text-xs text-text-muted">Proses dilakukan berurutan agar provider tidak menerima lonjakan permintaan.</p>}
          {notice && <p role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-600">{notice}</p>}
          <div className="rounded-xl bg-surface-2 p-3 text-xs leading-5 text-text-muted">
            <strong className="text-text-main">Catatan hasil</strong><br />
            Setiap panel menghasilkan satu klip video. Penggabungan seluruh scene, voice-over, subtitle, dan musik menjadi satu MP4 masih memerlukan tahap editor/renderer lanjutan.
          </div>
        </aside>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-border bg-bg/70 p-3"><p className="text-[11px] text-text-muted">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-primary text-white" : "text-text-muted hover:bg-surface-2"}`}>{children}</button>;
}

function IconButton({ title, disabled, onClick, danger, children }: { title: string; disabled?: boolean; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className={`rounded-lg border border-border p-2 disabled:opacity-30 ${danger ? "text-red-500 hover:bg-red-500/10" : "text-text-muted hover:bg-surface-2"}`}>{children}</button>;
}

function PanelStatus({ panel }: { panel: Panel }) {
  if (panel.status === "generating") return <span className="inline-flex items-center gap-1 text-xs text-primary"><LoaderCircle size={13} className="animate-spin" /> Generating</span>;
  if (panel.status === "done") return <span className="inline-flex items-center gap-1 text-xs text-green-600"><Play size={13} /> Selesai</span>;
  if (panel.status === "error") return <span className="inline-flex items-center gap-1 text-xs text-red-500"><X size={13} /> Gagal</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-text-muted"><Film size={13} /> Siap</span>;
}
