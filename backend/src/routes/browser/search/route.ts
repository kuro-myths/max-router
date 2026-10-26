// GET /api/browser/search?q=<query>
// Pencarian web server-side untuk MAX Browser (ala Nanobrowser): ambil halaman
// hasil pencarian DuckDuckGo (HTML) lalu parse menjadi daftar hasil terstruktur.
// Dipakai tombol "Cari" di mini browser dan tool web_search milik AI agent.
// Terproteksi sesi dashboard / API key (bukan proxy terbuka).

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

export async function GET(req: any, res: any) {
  try {
    const query = String(req?.query?.q || "").trim();
    if (!query) return res.status(400).json({ error: "Parameter q wajib diisi." });
    if (query.length > 400) return res.status(400).json({ error: "Kata kunci terlalu panjang." });

    const upstream = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 MaxRouterBrowser/1.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "id,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const body = await upstream.text().catch(() => "");
    if (!upstream.ok && !body) {
      return res.status(502).json({ error: "Mesin pencarian merespons HTTP " + upstream.status });
    }
    const finalUrl = upstream.url || "https://html.duckduckgo.com/html/";

    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const seen = new Set<string>();

    // Setiap hasil dibungkus <div class="result ..."> ... </div> (blok kasar).
    const blocks = body.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"[^>]*>/i).slice(1);
    for (const block of blocks) {
      if (results.length >= 12) break;
      const linkMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        || block.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const href = resolveDdgLink(linkMatch[1], finalUrl);
      if (!href) continue;
      let parsed: URL;
      try {
        parsed = new URL(href);
      } catch {
        continue;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      if (isBlockedHost(parsed.hostname)) continue;
      if (seen.has(parsed.toString())) continue;
      seen.add(parsed.toString());

      const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      results.push({
        title: stripTags(linkMatch[2]).slice(0, 200) || parsed.hostname,
        url: parsed.toString(),
        snippet: snippetMatch ? stripTags(snippetMatch[1]).slice(0, 400) : "",
      });
    }

    // Fallback parser bila struktur blok berubah: ambil semua link hasil.
    if (results.length === 0) {
      for (const match of body.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        if (results.length >= 12) break;
        const href = resolveDdgLink(match[1], finalUrl);
        if (!href) continue;
        let parsed: URL;
        try {
          parsed = new URL(href);
        } catch {
          continue;
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
        if (isBlockedHost(parsed.hostname)) continue;
        if (seen.has(parsed.toString())) continue;
        seen.add(parsed.toString());
        results.push({ title: stripTags(match[2]).slice(0, 200) || parsed.hostname, url: parsed.toString(), snippet: "" });
      }
    }

    return res.json({ ok: true, query, results });
  } catch (error: any) {
    const message =
      error?.name === "TimeoutError"
        ? "Waktu tunggu habis (15 detik)."
        : error?.message || "Gagal melakukan pencarian.";
    return res.status(502).json({ error: message });
  }
}
