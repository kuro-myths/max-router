import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Button } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LOG_LEVEL_COLORS = {
  LOG: "text-emerald-400",
  INFO: "text-sky-400",
  WARN: "text-amber-300",
  ERROR: "text-rose-400",
  DEBUG: "text-violet-400",
};

function getLevel(line) {
  const match = String(line).match(/\[(LOG|INFO|WARN|ERROR|DEBUG)\]/i);
  if (match) return match[1].toUpperCase();
  if (/\berror\b|exception|failed|failure/i.test(line)) return "ERROR";
  if (/\bwarn(?:ing)?\b/i.test(line)) return "WARN";
  if (/\bdebug\b/i.test(line)) return "DEBUG";
  if (/\binfo\b/i.test(line)) return "INFO";
  return "LOG";
}

function colorLine(line) {
  return <span className={LOG_LEVEL_COLORS[getLevel(line)] || "text-emerald-400"}>{line}</span>;
}

const HELP = [
  { command: "help", description: "Tampilkan daftar perintah" },
  { command: "clear", description: "Bersihkan tampilan log (log buffer server juga dibersihkan)" },
  { command: "status", description: "Ringkasan koneksi dan jumlah log" },
  { command: "test all", description: "Uji semua koneksi layanan aktif dan tampilkan hasil dalam tabel" },
  { command: "logs", description: "Tampilkan semua log yang tersimpan" },
  { command: "table", description: "Tampilkan log dalam bentuk tabel" },
  { command: "filter error", description: "Tampilkan log error saja" },
  { command: "filter warn", description: "Tampilkan log peringatan saja" },
  { command: "filter info", description: "Tampilkan log informasi saja" },
  { command: "filter all", description: "Hapus filter level" },
  { command: "search kata", description: "Cari kata di dalam log" },
  { command: "export json", description: "Unduh log sebagai JSON" },
  { command: "export csv", description: "Unduh log sebagai CSV" },
];

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("Ketik help untuk melihat perintah yang tersedia. Terminal ini hanya menjalankan perintah bawaan yang aman, bukan shell sistem.");
  const [view, setView] = useState("terminal");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [history, setHistory] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [testingAll, setTestingAll] = useState(false);
  const logRef = useRef(null);
  const commandRef = useRef(null);

  const getSource = (line) => {
    const text = String(line);
    const match = text.match(/(?:provider|service|layanan|connection|penyedia)\s*[:=]\s*["']?([a-zA-Z0-9._ -]+)/i);
    if (match) return match[1].trim().replace(/["']$/, "");
    const known = ["openai", "anthropic", "claude", "gemini", "google ai studio", "openrouter", "xkiro", "groq", "deepseek", "mistral", "ollama", "cohere"];
    return known.find((name) => text.toLowerCase().includes(name)) || "Sumber tidak tercatat";
  };

  const runTestAll = async () => {
    setTestingAll(true);
    setOutput("Menjalankan pengujian semua koneksi layanan aktif...");
    try {
      const response = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pengujian gagal");
      setTestResults(data.results || []);
      setView("table");
      setOutput("Pengujian selesai: " + (data.summary?.passed || 0) + " berhasil, " + (data.summary?.failed || 0) + " gagal, dari " + (data.summary?.total || 0) + " koneksi.");
      (data.results || []).forEach((result) => console[result.valid ? "info" : "error"]("[TEST] provider=" + result.provider + " service=" + result.connectionName + " status=" + (result.valid ? "BERHASIL" : "GAGAL") + (result.error ? " error=" + result.error : "")));
    } catch (error) {
      setOutput("Gagal menguji layanan: " + (error?.message || "Kesalahan tidak diketahui"));
      console.error("[TEST] Gagal menguji semua layanan:", error);
    } finally {
      setTestingAll(false);
    }
  };

  const visibleLogs = useMemo(() => logs.filter((line) => {
    const levelMatches = levelFilter === "ALL" || getLevel(line) === levelFilter;
    const searchMatches = !searchText || String(line).toLowerCase().includes(searchText.toLowerCase());
    return levelMatches && searchMatches;
  }), [logs, levelFilter, searchText]);

  const handleClear = async () => {
    try {
      const response = await fetch("/api/translator/console-logs", { method: "DELETE" });
      if (!response.ok) throw new Error("Server menolak permintaan hapus log.");
      setLogs([]);
      setOutput("Log berhasil dibersihkan.");
    } catch (err) {
      setOutput("Gagal membersihkan log: " + err.message);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");
    es.onopen = () => setConnected(true);
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "init") setLogs((msg.logs || []).slice(-CONSOLE_LOG_CONFIG.maxLines));
        else if (msg.type === "line") setLogs((prev) => [...prev, msg.line].slice(-CONSOLE_LOG_CONFIG.maxLines));
        else if (msg.type === "clear") setLogs([]);
      } catch {
        setOutput("Data log dari server tidak dapat dibaca.");
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    if (logRef.current && view === "terminal") logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, view]);

  const runCommand = async (rawCommand) => {
    const raw = String(rawCommand || "").trim();
    if (!raw) return;
    setHistory((prev) => [...prev, raw].slice(-50));
    const [name, ...rest] = raw.split(/\s+/);
    const arg = rest.join(" ");
    const normalized = name.toLowerCase();

    if (normalized === "help" || normalized === "?") {
      setOutput("Daftar perintah selalu tersedia pada panel bantuan di bawah terminal.");
    } else if (normalized === "clear" || normalized === "cls") {
      await handleClear();
      setView("terminal");
    } else if (normalized === "test" && arg.toLowerCase() === "all") {
      await runTestAll();
    } else if (normalized === "status") {
      setView("terminal");
      setOutput("STATUS KONSOL\nKoneksi log: " + (connected ? "TERHUBUNG" : "TERPUTUS") + "\nJumlah log tersimpan: " + logs.length + "\nLog error: " + logs.filter((line) => getLevel(line) === "ERROR").length + "\nPeringatan: " + logs.filter((line) => getLevel(line) === "WARN").length + "\nBatas buffer: " + CONSOLE_LOG_CONFIG.maxLines);
    } else if (normalized === "logs") {
      setView("terminal"); setLevelFilter("ALL"); setSearchText(""); setOutput("Menampilkan seluruh log yang tersimpan.");
    } else if (normalized === "table") {
      setView("table"); setOutput("Log ditampilkan sebagai tabel.");
    } else if (normalized === "filter") {
      const levels = { error: "ERROR", warn: "WARN", warning: "WARN", info: "INFO", debug: "DEBUG", log: "LOG", all: "ALL" };
      const next = levels[arg.toLowerCase()];
      if (next) { setLevelFilter(next); setView("terminal"); setOutput("Filter log: " + (next === "ALL" ? "semua level" : next) + "."); }
      else setOutput("Gunakan: filter error | warn | info | debug | all");
    } else if (normalized === "search") {
      setSearchText(arg); setLevelFilter("ALL"); setView("terminal"); setOutput(arg ? "Pencarian log: " + arg : "Kata pencarian dikosongkan.");
    } else if (normalized === "export") {
      const format = arg.toLowerCase();
      if (format === "json") {
        downloadFile("9router-logs.json", JSON.stringify(logs.map((message) => ({ level: getLevel(message), message })), null, 2), "application/json");
        setOutput("Ekspor JSON dimulai.");
      } else if (format === "csv") {
        const quote = (value) => '"' + String(value).replace(/"/g, '""') + '"';
        const csv = ["level,message", ...logs.map((line) => quote(getLevel(line)) + "," + quote(line))].join("\n");
        downloadFile("9router-logs.csv", csv, "text/csv;charset=utf-8");
        setOutput("Ekspor CSV dimulai.");
      } else setOutput("Gunakan: export json atau export csv");
    } else {
      setOutput("Perintah tidak dikenal: " + raw + "\nKetik help untuk daftar perintah. Perintah sistem/shell dan evaluasi JavaScript tidak didukung demi keamanan.");
    }
    setCommand("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    runCommand(command);
  };

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={"h-2.5 w-2.5 rounded-full " + (connected ? "bg-emerald-500" : "bg-rose-500")} />
            Terminal Log
            <span className="text-xs font-normal text-text-muted">{connected ? "Terhubung langsung" : "Menyambungkan ulang..."}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setOutput("Daftar perintah selalu tersedia pada panel bantuan.")}>Bantuan</Button>
            <Button size="sm" variant="outline" disabled={testingAll} onClick={runTestAll}>{testingAll ? "Menguji..." : "Uji semua layanan"}</Button>
            <Button size="sm" variant="outline" onClick={() => { setView("table"); setOutput("Log ditampilkan sebagai tabel."); }}>Tampilan tabel</Button>
            <Button size="sm" variant="outline" onClick={() => runCommand("export csv")}>Ekspor CSV</Button>
            <Button size="sm" variant="outline" icon="delete" onClick={handleClear}>Bersihkan log</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <label className="text-xs text-text-muted" htmlFor="console-level-filter">Level</label>
          <select id="console-level-filter" name="console-level-filter" className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="ALL">Semua</option><option value="ERROR">Error</option><option value="WARN">Peringatan</option><option value="INFO">Info</option><option value="DEBUG">Debug</option><option value="LOG">Log</option>
          </select>
          <label className="text-xs text-text-muted" htmlFor="console-search">Cari</label>
          <input id="console-search" name="console-search" className="min-w-[150px] flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Cari pesan log..." />
          <span className="text-xs text-text-muted">{visibleLogs.length} / {logs.length} baris</span>
        </div>
        {output && <div className="mx-4 mb-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950 whitespace-pre-wrap">{output}</div>}
        {view === "help" ? (
          <div className="mx-4 mb-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2"><tr><th className="px-3 py-2">Perintah</th><th className="px-3 py-2">Fungsi</th></tr></thead>
              <tbody>{HELP.map((item) => <tr key={item.command} className="border-t border-border"><td className="px-3 py-2 font-mono text-primary">{item.command}</td><td className="px-3 py-2">{item.description}</td></tr>)}</tbody>
            </table>
          </div>
        ) : view === "table" ? (
          <div className="mx-4 mb-4 max-h-[calc(100vh-390px)] overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-2"><tr><th className="px-3 py-2">No.</th><th className="px-3 py-2">Level</th><th className="px-3 py-2">Layanan</th><th className="px-3 py-2">Pesan</th></tr></thead>
              <tbody>{visibleLogs.map((line, i) => <tr key={i} className="border-t border-border align-top"><td className="px-3 py-2">{i + 1}</td><td className={"px-3 py-2 font-semibold " + (LOG_LEVEL_COLORS[getLevel(line)] || "text-text-main")}>{getLevel(line)}</td><td className="px-3 py-2">{getSource(line)}</td><td className="whitespace-pre-wrap break-all px-3 py-2 font-mono">{line}</td></tr>)}</tbody>
            </table>
            {visibleLogs.length === 0 && <div className="p-5 text-center text-sm text-text-muted">Tidak ada log yang cocok.</div>}
          </div>
        ) : (
          <div ref={logRef} className="mx-4 mb-3 h-[calc(100vh-390px)] min-h-[220px] overflow-y-auto rounded-lg bg-[#171421] p-4 font-mono text-xs">
            {visibleLogs.length === 0 ? <span className="text-slate-400">Belum ada log yang cocok dengan filter.</span> : <div className="space-y-0.5">{visibleLogs.map((line, i) => <div key={i} className="break-words">{colorLine(line)}</div>)}</div>}
          </div>
        )}
        {testResults.length > 0 && <div className="mx-4 mb-4 overflow-x-auto rounded-lg border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-3 py-2 text-sm font-semibold"><span>Hasil uji semua layanan</span><span className="text-xs font-normal">{testResults.filter((r) => r.valid).length} berhasil · {testResults.filter((r) => !r.valid).length} gagal · {testResults.length} total</span></div>
          <table className="w-full text-left text-xs"><thead className="bg-surface-2"><tr><th className="px-3 py-2">Layanan</th><th className="px-3 py-2">Penyedia</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Waktu (ms)</th><th className="px-3 py-2">Pesan</th></tr></thead>
          <tbody>{testResults.map((r, i) => <tr key={r.connectionId || i} className="border-t border-border"><td className="px-3 py-2">{r.connectionName || "—"}</td><td className="px-3 py-2">{r.provider || "—"}</td><td className={"px-3 py-2 font-semibold " + (r.valid ? "text-emerald-600" : "text-rose-600")}>{r.valid ? "BERHASIL" : "GAGAL"}</td><td className="px-3 py-2">{r.latencyMs ?? "—"}</td><td className="max-w-[360px] whitespace-pre-wrap break-words px-3 py-2">{r.error || r.diagnosis?.message || "Uji koneksi berhasil"}</td></tr>)}</tbody></table>
        </div>}
        <div className="mx-4 mb-4 overflow-x-auto rounded-lg border border-border">
          <div className="bg-surface-2 px-3 py-2 text-sm font-semibold">Bantuan perintah (selalu tersedia)</div>
          <table className="w-full text-left text-xs"><thead><tr><th className="px-3 py-2">Perintah</th><th className="px-3 py-2">Fungsi</th></tr></thead>
          <tbody>{HELP.map((item) => <tr key={item.command} className="border-t border-border"><td className="px-3 py-2 font-mono text-primary">{item.command}</td><td className="px-3 py-2">{item.description}</td></tr>)}</tbody></table>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
          <label htmlFor="console-command" className="self-center font-mono text-sm text-primary">›</label>
          <input ref={commandRef} id="console-command" name="console-command" value={command} onChange={(e) => setCommand(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm" placeholder="Ketik perintah, contoh: help, table, filter error..." autoComplete="off" />
          <Button type="submit" size="sm">Jalankan</Button>
        </form>
      </Card>
    </div>
  );
}
