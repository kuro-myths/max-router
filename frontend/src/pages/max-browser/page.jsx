import { useEffect, useState } from "react";
import { Globe, ExternalLink, Clock, X } from "lucide-react";

const HISTORY_KEY = "maxrouter.browser.history";
const QUICK_LINKS = [
  { label: "Google", url: "https://www.google.com" },
  { label: "YouTube", url: "https://www.youtube.com" },
  { label: "GitHub", url: "https://github.com" },
  { label: "Wikipedia", url: "https://id.wikipedia.org" },
  { label: "Mistral", url: "https://mistral.ai" },
];

function normalizeUrl(input) {
  const value = String(input || "").trim();
  if (!value) return null;
  const looksLikeDomain = /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
  let candidate = looksLikeDomain ? value : "https://" + value;
  if (candidate.startsWith("//")) candidate = "https:" + candidate;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch (err) {
    return null;
  }
}

export default function MaxBrowserPage() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved)) setHistory(saved.slice(0, 12));
    } catch (err) { /* ignore */ }
  }, []);

  const open = (raw) => {
    const url = normalizeUrl(raw);
    if (!url) {
      setError("Alamat tidak valid. Contoh: example.com atau https://example.com");
      return;
    }
    setError("");
    window.open(url, "_blank", "noopener,noreferrer");
    const next = [url, ...history.filter((h) => h !== url)].slice(0, 12);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch (err) { /* ignore */ }
  };

  const removeHistory = (url) => {
    const next = history.filter((h) => h !== url);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch (err) { /* ignore */ }
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Globe size={22} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-text-main">Buka Website</h1>
          <p className="text-xs text-text-muted">Ketik alamatnya, situs resminya terbuka di tab baru — semua fitur &amp; klik di dalamnya berfungsi normal.</p>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <form
          onSubmit={(e) => { e.preventDefault(); open(input); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(""); }}
            placeholder="contoh: github.com atau https://mistral.ai"
            spellCheck={false}
            autoComplete="off"
            className="flex-1 min-w-0 rounded-lg border border-border bg-bg px-3 py-2.5 font-mono text-sm text-text-main placeholder:text-text-muted/60 outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <ExternalLink size={15} aria-hidden="true" />
            Buka
          </button>
        </form>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Situs cepat</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.url}
                type="button"
                onClick={() => open(link.url)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted"><Clock size={11} className="mr-1 inline" aria-hidden="true" />Riwayat</p>
            <ul className="space-y-1">
              {history.map((url) => (
                <li key={url} className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2">
                  <button
                    type="button"
                    onClick={() => open(url)}
                    className="min-w-0 flex-1 truncate text-left font-mono text-xs text-text-main hover:text-primary"
                  >
                    {url}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHistory(url)}
                    className="shrink-0 text-text-muted hover:text-red-500"
                    aria-label={"Hapus " + url + " dari riwayat"}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <p className="mt-4 text-center text-[11px] text-text-muted">
        Situs dibuka langsung di browsermu (tab baru), bukan lewat proxy server — jadi login, klik, dan semua interaksi berjalan seperti biasa.
      </p>
    </div>
  );
}
