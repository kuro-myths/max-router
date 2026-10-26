// GET /api/browser/fetch?url=<target>
// Alat untuk halaman MAX Browser di dashboard: ambil halaman web dari sisi server,
// ekstrak teks + daftar tautan untuk dibaca AI agent. Terproteksi sesi dashboard /
// API key (bukan proxy terbuka). Hanya http/https; host privat/lokal diblokir.

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

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function GET(req: any, res: any) {
  try {
    const raw = String(req?.query?.url || "").trim();
    if (!raw) return res.status(400).json({ error: "Parameter url wajib diisi." });
    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return res.status(400).json({ error: "URL tidak valid." });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return res.status(400).json({ error: "Hanya URL http/https yang didukung." });
    }
    if (isBlockedHost(target.hostname)) {
      return res.status(400).json({ error: "Host privat/lokal tidak diizinkan." });
    }

    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MaxRouterBrowser/1.0",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const contentType = String(upstream.headers.get("content-type") || "");
    const body = await upstream.text().catch(() => "");
    const finalUrl = upstream.url || target.toString();
    const isHtml = /html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(body);

    if (!isHtml) {
      return res.json({
        ok: true,
        url: finalUrl,
        status: upstream.status,
        contentType,
        title: "",
        text: body.slice(0, 20000),
        links: [],
      });
    }

    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1]).trim().slice(0, 200) : "";

    const links: Array<{ href: string; text: string }> = [];
    const seen = new Set<string>();
    for (const match of body.matchAll(/<a\s[^>]*href=["']([^"'\s#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      try {
        const abs = new URL(match[1], finalUrl);
        if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
        if (seen.has(abs.href)) continue;
        seen.add(abs.href);
        links.push({ href: abs.href, text: htmlToText(match[2]).slice(0, 80) });
        if (links.length >= 60) break;
      } catch {
        continue;
      }
    }

    return res.json({
      ok: true,
      url: finalUrl,
      status: upstream.status,
      contentType,
      title,
      text: htmlToText(body).slice(0, 20000),
      links,
    });
  } catch (error: any) {
    const message =
      error?.name === "TimeoutError"
        ? "Waktu tunggu habis (15 detik)."
        : error?.message || "Gagal mengambil halaman.";
    return res.status(502).json({ error: message });
  }
}
