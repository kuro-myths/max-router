import { useEffect, useState } from "react";
import { Check, ExternalLink, PersonStanding, Play, Square, Sparkles } from "lucide-react";
import VtuberAvatar from "@/shared/components/vtuber/VtuberAvatar";
import {
  CHARACTERS,
  EMOTIONS,
  getCharacter,
  loadSelectedCharacter,
  saveSelectedCharacter,
} from "@/shared/components/vtuber/characters";
import { cn } from "@/shared/utils/cn";

const TABS = [
  { id: "library", label: "Character Library" },
  { id: "expression", label: "Ekspresi & Lip-Sync" },
  { id: "rigging", label: "Rigging & Adapter" },
];

const ADAPTERS = [
  {
    name: "Prosedural 2D (bawaan)",
    status: "AKTIF",
    detail: "Avatar SVG komik dengan 8 ekspresi, kedipan otomatis, dan lip-sync berbasis level audio. Berjalan tanpa dependensi 3D.",
  },
  {
    name: "VRM (@pixiv/three-vrm)",
    status: "BELUM TERPASANG",
    detail: "Avatar humanoid 3D dengan blendshape standar VRM. Direncanakan sebagai VrmAdapter dengan pemuatan model dari Character Library.",
  },
  {
    name: "GLB / GLTF (three.js)",
    status: "BELUM TERPASANG",
    detail: "Model 3D dengan skeleton dan animasi. Direncanakan sebagai GlbAdapter terpisah agar tidak saling bergantung dengan VRM.",
  },
  {
    name: "Live2D (Cubism SDK)",
    status: "OPSIONAL",
    detail: "Karakter anime 2D. Membutuhkan lisensi dan SDK terpisah, sehingga tidak diaktifkan secara bawaan.",
  },
  {
    name: "Face Tracking (MediaPipe Tasks Vision)",
    status: "RENCANA",
    detail: "Tracking wajah via webcam untuk mengendalikan ekspresi dan arah pandang avatar. Akan meminta izin kamera secara eksplisit.",
  },
];

const STATUS_STYLE = {
  AKTIF: "border-success/40 bg-success/10 text-success",
  "BELUM TERPASANG": "border-border bg-bg text-text-muted",
  OPSIONAL: "border-warning/40 bg-warning/10 text-warning",
  RENCANA: "border-primary/40 bg-primary/10 text-primary",
};

export default function VtuberStudioPage() {
  const [tab, setTab] = useState("library");
  const [selectedId, setSelectedId] = useState("mika");
  const [emotion, setEmotion] = useState("happy");
  const [testing, setTesting] = useState(false);
  const [testLevel, setTestLevel] = useState(0);

  useEffect(() => {
    const initial = loadSelectedCharacter();
    setSelectedId(initial.id);
  }, []);

  useEffect(() => {
    if (!testing) {
      setTestLevel(0);
      return undefined;
    }
    let t = 0;
    const timer = setInterval(() => {
      t += 0.35;
      setTestLevel((Math.sin(t) * 0.5 + 0.5) * 0.95);
    }, 60);
    return () => clearInterval(timer);
  }, [testing]);

  const selected = getCharacter(selectedId);
  const builtinChars = CHARACTERS.filter((c) => c.type === "builtin");
  const catalogChars = CHARACTERS.filter((c) => c.type === "catalog" || c.type === "reference");
  const activeGesture = (EMOTIONS.find((e) => e.id === emotion) || EMOTIONS[0]).gesture;

  const selectCharacter = (id) => {
    setSelectedId(id);
    saveSelectedCharacter(id);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <PersonStanding className="text-primary" size={20} aria-hidden="true" />
          VTuber Studio
        </h1>
        <p className="text-xs text-text-muted">
          Kelola karakter virtual Max Router: pilih karakter, uji ekspresi, dan pantau rencana adapter rigging.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-xl border-2 px-4 py-2 text-xs font-bold transition",
              tab === t.id
                ? "border-primary bg-primary text-white"
                : "border-vibrancy/40 bg-surface text-text-muted hover:bg-surface-2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "library" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Sparkles size={16} className="text-primary" aria-hidden="true" />
              Karakter Bawaan
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {builtinChars.map((c) => (
                <article
                  key={c.id}
                  className={cn(
                    "relative rounded-2xl border-2 bg-surface p-4",
                    selectedId === c.id ? "border-primary" : "border-vibrancy/40",
                  )}
                >
                  {selectedId === c.id && (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
                      <Check size={11} aria-hidden="true" /> Aktif
                    </span>
                  )}
                  <div className="flex justify-center py-2">
                    <VtuberAvatar
                      emotion={selectedId === c.id ? "happy" : "neutral"}
                      palette={c.palette}
                      size={140}
                    />
                  </div>
                  <h3 className="text-center text-sm font-bold">{c.name}</h3>
                  <p className="mt-1 min-h-[32px] text-center text-[11px] text-text-muted">{c.description}</p>
                  <div className="mt-2 flex justify-center gap-1">
                    <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                      {c.expressions.length} ekspresi
                    </span>
                    <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                      {c.license}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectCharacter(c.id)}
                    disabled={selectedId === c.id}
                    className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {selectedId === c.id ? "Sedang digunakan" : "Pilih Karakter"}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold">Katalog Eksternal (Gratis)</h2>
            <p className="mb-3 text-xs text-text-muted">
              Katalog karakter VRM gratis dari GitHub. Setelah adapter VRM terpasang, karakter dari katalog ini dapat
              diunduh dan diimpor langsung ke Max Router. Selalu periksa lisensi tiap model sebelum digunakan.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalogChars.map((c) => (
                <article key={c.id} className="rounded-2xl border-2 border-vibrancy/40 bg-surface p-4">
                  <h3 className="text-sm font-bold">{c.name}</h3>
                  <p className="mt-1 min-h-[32px] text-[11px] text-text-muted">{c.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-semibold uppercase text-text-muted">
                      {c.format}
                    </span>
                    <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                      {c.license}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={c.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-[11px] font-semibold hover:bg-surface-2"
                    >
                      <ExternalLink size={12} aria-hidden="true" /> {c.sourceName}
                    </a>
                    <a
                      href={c.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-[11px] font-semibold hover:bg-surface-2"
                    >
                      Galeri Unduhan
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "expression" && (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="flex flex-col items-center gap-4 rounded-2xl border-2 border-vibrancy/40 bg-surface p-5">
            <VtuberAvatar
              emotion={emotion}
              speaking={testing}
              audioLevel={testLevel}
              palette={selected.palette}
              size={260}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTesting((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white",
                  testing ? "bg-error" : "bg-primary hover:bg-primary-hover",
                )}
              >
                {testing ? <Square size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                {testing ? "Stop Uji" : "Uji Bicara"}
              </button>
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-2xl border-2 border-vibrancy/40 bg-surface p-5">
              <h2 className="mb-3 text-sm font-bold">Pilih Ekspresi</h2>
              <div className="flex flex-wrap gap-2">
                {EMOTIONS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEmotion(e.id)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-2 text-xs font-bold transition",
                      emotion === e.id
                        ? "border-primary bg-primary text-white"
                        : "border-vibrancy/40 bg-bg text-text-muted hover:bg-surface-2",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-text-muted">
                Gesture otomatis: <span className="font-bold text-text-main">{activeGesture}</span>. Tombol Uji Bicara
                mensimulasikan level audio sehingga mulut karakter bergerak seperti lip-sync.
              </p>
            </section>

            <section className="rounded-2xl border-2 border-vibrancy/40 bg-surface p-5">
              <h2 className="mb-3 text-sm font-bold">Metadata Emosi dari AI</h2>
              <p className="mb-2 text-xs text-text-muted">
                AI dapat membalas dengan metadata terstruktur. Nilai divalidasi terhadap daftar yang diizinkan sebelum
                diterapkan ke avatar, dan tidak pernah dieksekusi sebagai kode.
              </p>
              <pre className="overflow-x-auto rounded-xl border border-border bg-bg p-4 text-[11px] leading-relaxed">
{JSON.stringify({ text: "Halo! Ada yang bisa kubantu hari ini?", emotion: emotion, gesture: activeGesture, animation: testing ? "talking" : "idle" }, null, 2)}
              </pre>
            </section>
          </div>
        </div>
      )}

      {tab === "rigging" && (
        <div className="space-y-4">
          <p className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-text-muted">
            Status di bawah mengacu pada dependensi frontend saat ini: avatar procedural 2D sudah aktif dan langsung
            dipakai di menu Voice AI. Adapter 3D belum terpasang dan akan ditambahkan bertahap tanpa mengganggu avatar
            procedural.
          </p>
          {ADAPTERS.map((a) => (
            <section key={a.name} className="rounded-2xl border-2 border-vibrancy/40 bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{a.name}</h3>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-[10px] font-bold",
                    STATUS_STYLE[a.status] || STATUS_STYLE.RENCANA,
                  )}
                >
                  {a.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-text-muted">{a.detail}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
