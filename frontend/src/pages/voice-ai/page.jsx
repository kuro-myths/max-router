import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Download, Mic, RefreshCw, Square, Volume2 } from "lucide-react";
import VtuberAvatar from "@/shared/components/vtuber/VtuberAvatar";
import { EMOTIONS, loadSelectedCharacter } from "@/shared/components/vtuber/characters";
import { cn } from "@/shared/utils/cn";

const PHASES = ["IDLE", "LISTENING", "TRANSCRIBING", "THINKING", "SPEAKING"];
const PHASE_LABELS = {
  IDLE: "Siaga",
  LISTENING: "Mendengarkan",
  TRANSCRIBING: "Menyalin Suara",
  THINKING: "Berpikir",
  SPEAKING: "Berbicara",
};
const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const LANGUAGES = [
  { value: "", label: "Otomatis" },
  { value: "id", label: "Indonesia" },
  { value: "en", label: "Inggris" },
  { value: "ja", label: "Jepang" },
  { value: "ko", label: "Korea" },
  { value: "zh", label: "Mandarin" },
];
const SYSTEM_PROMPT =
  "Kamu adalah asisten suara virtual Max Router. Jawab dengan singkat, natural, dan ramah seperti sedang berbicara langsung dengan pengguna.";

function Field({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-text-muted/70">{hint}</span>}
    </label>
  );
}

function LevelMeter({ label, level, icon }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-2">
      <Icon size={15} className="shrink-0 text-text-muted" aria-hidden="true" />
      <span className="w-16 shrink-0 text-[10px] font-semibold uppercase text-text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: Math.round(Math.max(0, Math.min(1, level)) * 100) + "%" }}
        />
      </div>
    </div>
  );
}

export default function VoiceAIPage() {
  const [phase, setPhase] = useState("IDLE");
  const [turns, setTurns] = useState([]);
  const [error, setError] = useState("");
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [sttModel, setSttModel] = useState("whisper-1");
  const [ttsModel, setTtsModel] = useState("tts-1");
  const [voice, setVoice] = useState("alloy");
  const [speed, setSpeed] = useState("1");
  const [language, setLanguage] = useState("");
  const [continuous, setContinuous] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [recSeconds, setRecSeconds] = useState(0);
  const [lastAudioUrl, setLastAudioUrl] = useState(null);
  const [emotion, setEmotion] = useState("neutral");
  const [character, setCharacter] = useState(null);
  const [textDraft, setTextDraft] = useState("");

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const ctxRef = useRef(null);
  const micAnalyserRef = useRef(null);
  const outAnalyserRef = useRef(null);
  const audioRef = useRef(null);
  const recTimerRef = useRef(null);
  const lastAudioUrlRef = useRef(null);
  const waveBufRef = useRef(null);
  const canvasRef = useRef(null);
  const transcriptRef = useRef(null);
  const continuousRef = useRef(false);

  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);

  useEffect(() => {
    setCharacter(loadSelectedCharacter());
    loadModels();
  }, []);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [turns]);

  const pushTurn = useCallback((role, text) => {
    setTurns((current) => [...current, { role, text }]);
  }, []);

  const getCtx = () => {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      ctxRef.current = Ctor ? new Ctor() : null;
    }
    if (ctxRef.current && ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  };

  const loadModels = async () => {
    setModelsLoading(true);
    setModelsError("");
    try {
      const response = await fetch("/api/v1/models", {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const raw = await response.text();
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
      if (!response.ok) {
        throw new Error(data?.error?.message || data?.error || raw || "Gagal mengambil model (HTTP " + response.status + ")");
      }
      const list = Array.isArray(data?.data) ? data.data.filter((item) => item?.id) : [];
      setModels(list);
      setChatModel((current) => (current && list.some((item) => item.id === current) ? current : list[0]?.id || ""));
      if (!list.length) {
        setModelsError("Belum ada model aktif. Tambahkan provider terlebih dahulu di menu Penyedia.");
      }
    } catch (e) {
      setModels([]);
      setChatModel("");
      setModelsError(e instanceof Error ? e.message : "Daftar model gagal dimuat.");
    } finally {
      setModelsLoading(false);
    }
  };

  const drawWave = (analyser) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (w === 0 || h === 0) return;
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(53,34,79,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.strokeStyle = "#ff79b0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (analyser) {
      if (!waveBufRef.current) waveBufRef.current = new Uint8Array(1024);
      const buf = waveBufRef.current;
      const count = analyser.frequencyBinCount;
      analyser.getByteTimeDomainData(buf);
      for (let x = 0; x < w; x++) {
        const i = Math.floor((x * count) / w);
        const v = (buf[i] - 128) / 128;
        const y = h / 2 + v * (h / 2 - 4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    } else {
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
    }
    ctx.stroke();
  };

  useEffect(() => {
    let raf = 0;
    const buf = new Uint8Array(1024);
    const readRms = (analyser) => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
    };
    const tick = () => {
      const mic = micAnalyserRef.current;
      const out = outAnalyserRef.current;
      if (mic) {
        const v = readRms(mic);
        setInputLevel((prev) => (Math.abs(v - prev) > 0.02 ? v : prev));
      }
      if (out) {
        const v = readRms(out);
        setOutputLevel((prev) => (Math.abs(v - prev) > 0.02 ? v : prev));
      }
      drawWave(mic || out);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (phase === "THINKING") setEmotion("thinking");
    else if (phase === "LISTENING") setEmotion("neutral");
    else if (phase === "TRANSCRIBING") setEmotion("surprised");
  }, [phase]);

  const stopMic = () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    micAnalyserRef.current = null;
  };

  const cleanupPlayback = () => {
    outAnalyserRef.current = null;
  };

  const startListening = async () => {
    setError("");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Browser ini tidak mendukung akses mikrofon. Gunakan kolom teks di bawah untuk berbicara dengan AI.");
      return;
    }
    if (!window.MediaRecorder) {
      setError("Browser ini tidak mendukung perekaman audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const ctx = getCtx();
      if (ctx) {
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        micAnalyserRef.current = analyser;
      }
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        handleRecorded();
      };
      recorder.start();
      setPhase("LISTENING");
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch (e) {
      stopMic();
      setPhase("IDLE");
      setEmotion("sad");
      if (e && e.name === "NotAllowedError") {
        setError("Izin mikrofon ditolak. Berikan izin mikrofon pada browser, lalu coba lagi.");
      } else {
        setError("Gagal membuka mikrofon: " + ((e && e.message) || String(e)));
      }
    }
  };

  const stopListening = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    setPhase("TRANSCRIBING");
  };

  const toggleMic = () => {
    if (phase === "LISTENING") {
      stopListening();
    } else if (phase === "IDLE") {
      startListening();
    }
  };

  const interrupt = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    cleanupPlayback();
    setPhase("IDLE");
    setEmotion("neutral");
  };

  const handleRecorded = async () => {
    const type = (recorderRef.current && recorderRef.current.mimeType) || "audio/webm";
    const blob = new Blob(chunksRef.current, { type });
    stopMic();
    if (!blob.size) {
      setError("Rekaman kosong. Coba bicara lebih lama.");
      setPhase("IDLE");
      return;
    }
    setPhase("TRANSCRIBING");
    const fd = new FormData();
    fd.append("file", blob, "speech.webm");
    fd.append("model", sttModel);
    if (language) fd.append("language", language);
    let response = null;
    try {
      response = await fetch("/api/v1/audio/transcriptions", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
    } catch (e) {
      pushTurn("error", "Tidak dapat menghubungi endpoint STT /v1/audio/transcriptions: " + ((e && e.message) || String(e)));
      setPhase("IDLE");
      setEmotion("sad");
      return;
    }
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      pushTurn("error", "STT gagal (HTTP " + response.status + "): " + String(raw || "").slice(0, 220));
      setPhase("IDLE");
      setEmotion("sad");
      return;
    }
    const data = await response.json().catch(() => ({}));
    const text = data.text || data.transcription || "";
    if (!text) {
      pushTurn("error", "STT tidak menghasilkan teks. Pastikan model STT aktif di router.");
      setPhase("IDLE");
      return;
    }
    askAI(text);
  };

  const askAI = async (userText) => {
    if (!userText) return;
    setError("");
    pushTurn("user", userText);
    setPhase("THINKING");
    const history = turns
      .filter((t) => t.role === "user" || t.role === "assistant")
      .slice(-20)
      .map((t) => ({ role: t.role, content: t.text }));
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userText },
    ];
    const body = JSON.stringify({ model: chatModel || undefined, messages, stream: false });
    let response = null;
    try {
      response = await fetch("/api/v1/chat/completions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
      });
    } catch (e) {
      pushTurn("error", "Tidak dapat menghubungi endpoint chat: " + ((e && e.message) || String(e)));
      setPhase("IDLE");
      setEmotion("sad");
      return;
    }
    const raw = await response.text().catch(() => "");
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!response.ok) {
      pushTurn("error", "Chat gagal (HTTP " + response.status + "): " + String(data?.error?.message || data?.error || raw || "").slice(0, 220));
      setPhase("IDLE");
      setEmotion("sad");
      return;
    }
    let reply = String(data?.choices?.[0]?.message?.content || data?.output_text || raw || "").trim();
    let replyEmotion = "happy";
    try {
      if (reply.startsWith("{")) {
        const parsed = JSON.parse(reply);
        if (parsed && typeof parsed.text === "string") {
          if (EMOTIONS.some((e) => e.id === parsed.emotion)) {
            replyEmotion = parsed.emotion;
          }
          reply = parsed.text;
        }
      }
    } catch {
      reply = reply;
    }
    if (!reply) {
      pushTurn("error", "Model tidak menghasilkan jawaban.");
      setPhase("IDLE");
      setEmotion("sad");
      return;
    }
    pushTurn("assistant", reply);
    speak(reply, replyEmotion);
  };

  const speak = async (text, speakEmotion) => {
    setPhase("SPEAKING");
    setEmotion(EMOTIONS.some((e) => e.id === speakEmotion) ? speakEmotion : "happy");
    let response = null;
    try {
      response = await fetch("/api/v1/audio/speech", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ttsModel,
          voice: voice,
          speed: Number(speed) || 1,
          input: text,
          response_format: "mp3",
        }),
      });
    } catch (e) {
      pushTurn("error", "Tidak dapat menghubungi endpoint TTS /v1/audio/speech: " + ((e && e.message) || String(e)));
      setPhase("IDLE");
      setEmotion("sad");
      return;
    }
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      pushTurn("error", "TTS gagal (HTTP " + response.status + "): " + String(raw || "").slice(0, 220));
      setPhase("IDLE");
      setEmotion("sad");
      return;
    }
    const blob = await response.blob().catch(() => null);
    if (!blob || !blob.size) {
      pushTurn("error", "TTS tidak menghasilkan audio.");
      setPhase("IDLE");
      setEmotion("sad");
      return;
    }
    if (lastAudioUrlRef.current) {
      URL.revokeObjectURL(lastAudioUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    lastAudioUrlRef.current = url;
    setLastAudioUrl(url);
    const el = new Audio(url);
    audioRef.current = el;
    try {
      const ctx = getCtx();
      if (ctx) {
        const src = ctx.createMediaElementSource(el);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        outAnalyserRef.current = analyser;
      }
    } catch {
      outAnalyserRef.current = null;
    }
    el.onended = () => {
      cleanupPlayback();
      setPhase("IDLE");
      setEmotion("neutral");
      if (continuousRef.current) {
        startListening();
      }
    };
    el.onerror = () => {
      cleanupPlayback();
      setPhase("IDLE");
      setEmotion("sad");
    };
    try {
      await el.play();
    } catch (e) {
      pushTurn("error", "Pemutaran audio gagal: " + ((e && e.message) || String(e)));
      cleanupPlayback();
      setPhase("IDLE");
    }
  };

  const sendText = () => {
    const text = textDraft.trim();
    if (!text) return;
    setTextDraft("");
    askAI(text);
  };

  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");
  const avatarLevel = phase === "SPEAKING" ? outputLevel : phase === "LISTENING" ? inputLevel * 0.3 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Mic className="text-primary" size={20} aria-hidden="true" />
            Voice AI
          </h1>
          <p className="text-xs text-text-muted">
            Percakapan suara dua arah: STT, router AI, TTS, dan VTuber lip-sync dalam satu ruang kerja.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
          <input
            type="checkbox"
            checked={continuous}
            onChange={(e) => setContinuous(e.target.checked)}
            className="size-4 accent-primary"
          />
          Percakapan berkelanjutan
        </label>
      </div>

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="flex flex-col items-center gap-4 rounded-2xl border-2 border-vibrancy/40 bg-surface p-5">
          <VtuberAvatar
            emotion={emotion}
            speaking={phase === "SPEAKING"}
            audioLevel={avatarLevel}
            palette={character && character.palette}
            size={240}
          />
          <div className="flex items-center gap-2">
            <span className="rounded-full border-2 border-vibrancy/40 bg-bg-alt px-3 py-1 text-xs font-bold">
              {character ? character.name : "Memuat..."}
            </span>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[10px] font-bold uppercase text-white",
                phase === "IDLE" ? "bg-success" : phase === "LISTENING" ? "bg-primary" : phase === "SPEAKING" ? "bg-warning" : "bg-vibrancy",
              )}
            >
              {PHASE_LABELS[phase]}
            </span>
          </div>
          <div className="relative w-full rounded-2xl border-2 border-vibrancy/40 bg-bg-alt px-4 py-3 text-sm">
            <span
              className="absolute -top-2 left-8 h-4 w-4 rotate-45 border-l-2 border-t-2 border-vibrancy/40 bg-bg-alt"
              aria-hidden="true"
            />
            {lastAssistant ? lastAssistant.text : "Halo! Tekan tombol mikrofon dan mulai bicara denganku."}
          </div>
          {lastAudioUrl && (
            <a
              href={lastAudioUrl}
              download="maxrouter-tts.mp3"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-medium hover:bg-surface-2"
            >
              <Download size={14} aria-hidden="true" />
              Unduh audio terakhir
            </a>
          )}
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border-2 border-vibrancy/40 bg-surface p-5">
            <div className="flex flex-wrap items-center gap-5">
              <button
                type="button"
                onClick={toggleMic}
                disabled={phase !== "IDLE" && phase !== "LISTENING"}
                className={cn(
                  "flex size-16 shrink-0 items-center justify-center rounded-full border-2 text-white shadow-lg transition",
                  phase === "LISTENING"
                    ? "animate-pulse border-error bg-error"
                    : "border-primary bg-primary hover:bg-primary-hover",
                )}
                title={phase === "LISTENING" ? "Hentikan rekaman" : "Mulai bicara"}
                aria-label={phase === "LISTENING" ? "Hentikan rekaman" : "Mulai bicara"}
              >
                {phase === "LISTENING" ? <Square size={26} aria-hidden="true" /> : <Mic size={28} aria-hidden="true" />}
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {phase === "LISTENING"
                    ? "Sedang mendengarkan... bicara saja, lalu tekan tombol untuk mengirim."
                    : phase === "IDLE"
                      ? "Tekan mikrofon untuk mulai bicara dengan AI."
                      : PHASE_LABELS[phase] + "..."}
                </p>
                <p className="text-xs text-text-muted">
                  {phase === "LISTENING" ? "Rekaman: " + recSeconds + " detik" : "Mikropon hanya aktif saat fase Mendengarkan."}
                </p>
              </div>
              <button
                type="button"
                onClick={interrupt}
                disabled={phase !== "SPEAKING"}
                className="ml-auto rounded-lg border border-border bg-bg px-3 py-2 text-xs font-medium hover:bg-surface-2 disabled:opacity-40"
              >
                Stop Suara
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {PHASES.map((p) => (
                <span
                  key={p}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[10px] font-bold",
                    phase === p ? "border-primary bg-primary text-white" : "border-border bg-bg text-text-muted",
                  )}
                >
                  {PHASE_LABELS[p]}
                </span>
              ))}
            </div>
            {error && <p className="mt-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">{error}</p>}
          </section>

          <section className="space-y-3 rounded-2xl border-2 border-vibrancy/40 bg-surface p-5">
            <canvas ref={canvasRef} className="h-24 w-full" aria-label="Visualisasi gelombang audio" />
            <LevelMeter label="Mikrofon" level={inputLevel} icon={Mic} />
            <LevelMeter label="Keluaran" level={outputLevel} icon={Volume2} />
          </section>

          <section className="grid gap-3 rounded-2xl border-2 border-vibrancy/40 bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Model Chat" hint="Diambil dari /v1/models milik router.">
              <select
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                disabled={modelsLoading || !models.length}
              >
                {!models.length && <option value="">{modelsLoading ? "Memuat..." : "Belum ada model"}</option>}
                {models.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model STT" hint="Contoh: whisper-1">
              <input
                type="text"
                value={sttModel}
                onChange={(e) => setSttModel(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Model TTS" hint="Contoh: tts-1">
              <input
                type="text"
                value={ttsModel}
                onChange={(e) => setTtsModel(e.target.value)}
                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Suara">
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kecepatan Bicara">
              <select value={speed} onChange={(e) => setSpeed(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                <option value="0.75">0.75x</option>
                <option value="1">1x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
              </select>
            </Field>
            <Field label="Bahasa STT">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-sm">
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                onClick={loadModels}
                disabled={modelsLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                <RefreshCw size={14} aria-hidden="true" />
                Muat ulang model
              </button>
            </div>
          </section>

          {modelsError && (
            <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">{modelsError}</p>
          )}

          <section className="flex h-[360px] flex-col rounded-2xl border-2 border-vibrancy/40 bg-surface">
            <div className="flex-1 space-y-3 overflow-y-auto p-5" ref={transcriptRef}>
              {!turns.length && (
                <div className="flex h-full items-center justify-center text-center">
                  <div className="max-w-sm">
                    <Activity size={32} className="mx-auto mb-2 text-primary" aria-hidden="true" />
                    <p className="text-sm font-semibold">Transkrip percakapan</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Semua ucapan dan jawaban AI akan tampil di sini. Kamu juga bisa mengetik langsung tanpa mikrofon.
                    </p>
                  </div>
                </div>
              )}
              {turns.map((turn, index) => (
                <div
                  key={index}
                  className={
                    turn.role === "user"
                      ? "ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-white"
                      : turn.role === "error"
                        ? "max-w-[85%] rounded-2xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error"
                        : "max-w-[85%] rounded-2xl bg-bg px-4 py-3 text-sm"
                  }
                >
                  <div className="mb-1 text-[10px] font-semibold uppercase opacity-60">
                    {turn.role === "user" ? "Anda" : turn.role === "assistant" ? "Asisten" : "Kesalahan"}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{turn.text}</div>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2 border-t border-border p-4">
              <textarea
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendText();
                  }
                }}
                rows={1}
                placeholder="Atau ketik pesan untuk diucapkan AI..."
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm outline-none"
                disabled={phase === "LISTENING" || phase === "TRANSCRIBING"}
              />
              <button
                type="button"
                onClick={sendText}
                disabled={!textDraft.trim() || phase === "LISTENING" || phase === "TRANSCRIBING"}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Ucapkan
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
