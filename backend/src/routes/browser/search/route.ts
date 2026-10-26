// GET /api/browser/search?q=<query>
// Pencarian web server-side untuk MAX Browser (ala Nanobrowser). IP datacenter
// (Railway) sering diblokir satu mesin, jadi dicoba berurutan dengan fallback:
// DuckDuckGo Lite → DuckDuckGo HTML → Mojeek → Bing. Hasil dinormalisasi menjadi
// daftar { title, url, snippet }. Terproteksi sesi dashboard / API key.

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function stripTags(html: string): string {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .trim();
}

function isBlockedHost(hostname: string): boolean {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (/^(127|10)\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h === "[::1]" || h === "0.0.0.0") return true;
  return false;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 MaxRouterBrowser/1.0";

// Tautan DuckDuckGo berbentuk redirect: /l/?uddg=<url terenkode>&rut=...
function resolveDdgLink(href: string, base: string): string | null {
  try {
    const abs = new URL(href, base);
    if (abs.hostname.endsWith("duckduckgo.com") && abs.pathname.startsWith("/l/")) {
      const target = abs.searchParams.get("uddg");
      if (target) return target;
    }
    return abs.toString();
  } catch {
    return null;
  }
}

function normalizeResult(urlRaw: string, title: string, snippet: string): { title: string; url: string; snippet: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(urlRaw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isBlockedHost(parsed.hostname)) return null;
  const final = parsed.toString();
  return {
    title: (title || parsed.hostname).slice(0, 200),
    url: final,
    snippet: (snippet || "").slice(0, 400),
  };
}

type Result = { title: string; url: string; snippet: string };

async function searchDdgLite(query: string): Promise<Result[]> {
  const res = await fetch("https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query), {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html", "Accept-Language": "id,en;q=0.8" },
    body: "q=" + encodeURIComponent(query),
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.text();
  const results: Result[] = [];
  for (const m of body.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = resolveDdgLink(m[1], res.url || "https://lite.duckduckgo.com/");
    if (!href) continue;
    const t = stripTags(m[2]);
    if (!t || href.startsWith("https://lite.duckduckgo.com") || href.includes("duckduckgo.com/?")) continue;
    const r = normalizeResult(href, t, "");
    if (r && !results.some((x) => x.url === r.url)) results.push(r);
    if (results.length >= 12) break;
  }
  return results;
}

async function searchDdgHtml(query: string): Promise<Result[]> {
  const res = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "id,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.text();
  const base = res.url || "https://html.duckduckgo.com/html/";
  const results: Result[] = [];
  const blocks = body.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"[^>]*>/i).slice(1);
  for (const block of blocks) {
    if (results.length >= 12) break;
    const linkMatch =
      block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const href = resolveDdgLink(linkMatch[1], base);
    if (!href) continue;
    const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const r = normalizeResult(href, stripTags(linkMatch[2]), snippetMatch ? stripTags(snippetMatch[1]) : "");
    if (r && !results.some((x) => x.url === r.url)) results.push(r);
  }
  return results;
}

async function searchMojeek(query: string): Promise<Result[]> {
  const res = await fetch("https://www.mojeek.com/search?q=" + encodeURIComponent(query), {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "id,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.text();
  const results: Result[] = [];
  for (const m of body.matchAll(/<a[^>]+class="ob"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (results.length >= 12) break;
    const r = normalizeResult(m[1], stripTags(m[2]), "");
    if (r && !results.some((x) => x.url === r.url)) results.push(r);
  }
  return results;
}

async function searchBing(query: string): Promise<Result[]> {
  const res = await fetch("https://www.bing.com/search?q=" + encodeURIComponent(query) + "&count=15", {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "id,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.text();
  const results: Result[] = [];
  const blocks = body.split(/<li[^>]+class="[^"]*b_algo[^"]*"[^>]*>/i).slice(1);
  for (const block of blocks) {
    if (results.length >= 12) break;
    const linkMatch = block.match(/<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const r = normalizeResult(linkMatch[1], stripTags(linkMatch[2]), snippetMatch ? stripTags(snippetMatch[1]) : "");
    if (r && !results.some((x) => x.url === r.url)) results.push(r);
  }
  return results;
}

export async function GET(req: any, res: any) {
  try {
    const query = String(req?.query?.q || "").trim();
    if (!query) return res.status(400).json({ error: "Parameter q wajib diisi." });
    if (query.length > 400) return res.status(400).json({ error: "Kata kunci terlalu panjang." });

    const engines: Array<{ name: string; run: (q: string) => Promise<Result[]> }> = [
      { name: "duckduckgo-lite", run: searchDdgLite },
      { name: "duckduckgo-html", run: searchDdgHtml },
      { name: "mojeek", run: searchMojeek },
      { name: "bing", run: searchBing },
    ];

    const tried: string[] = [];
    for (const engine of engines) {
      let results: Result[] = [];
      try {
        results = await engine.run(query);
      } catch {
        tried.push(engine.name + ":gagal");
        continue;
      }
      if (results.length > 0) {
        return res.json({ ok: true, query, engine: engine.name, results });
      }
      tried.push(engine.name + ":kosong");
    }

    return res.json({
      ok: true,
      query,
      engine: "none",
      results: [],
      note: "Semua mesin pencarian tidak mengembalikan hasil (kemungkinan diblokir untuk IP server). Coba kata kunci lain.",
      tried,
    });
  } catch (error: any) {
    const message = error?.name === "TimeoutError" ? "Waktu tunggu habis." : error?.message || "Gagal melakukan pencarian.";
    return res.status(502).json({ error: message });
  }
}
