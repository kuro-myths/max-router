// GET /api/browser/view?url=<target>
// Mode Render untuk mini-browser MAX Browser: server mengambil HTML halaman lalu
// menyajikannya dari domain sendiri, sehingga situs yang memblokir penyematan
// (X-Frame-Options / CSP frame-ancestors — mis. Google, YouTube, app Railway)
// tetap bisa tampil di dalam dashboard. Terproteksi sesi dashboard / API key.
// Hanya http/https; host privat/lokal diblokir. Tautan yang diklik di dalam frame
// dikirim ke parent lewat postMessage, lalu dimuat ulang lewat proxy.

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

const NAV_SCRIPT = [
  "<script>",
  "(function () {",
  "  document.addEventListener(\"click\", function (event) {",
  "    var node = event.target;",
  "    while (node && node.tagName !== \"A\") node = node.parentNode;",
  "    if (!node || !node.getAttribute) return;",
  "    var raw = node.getAttribute(\"href\");",
  "    if (!raw || raw.charAt(0) === \"#\") return;",
  "    if (node.getAttribute(\"target\") === \"_blank\") return;",
  "    event.preventDefault();",
  "    try { parent.postMessage({ __maxBrowserNav: String(node.href) }, \"*\"); } catch (err) {}",
  "  }, true);",
  "})();",
  "</script>",
].join("\n");

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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 MaxRouterBrowser/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "id,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const contentType = String(upstream.headers.get("content-type") || "");
    const body = await upstream.text().catch(() => "");
    const finalUrl = upstream.url || target.toString();
    const isHtml = /html/i.test(contentType) || /^\s*<(!doctype|html)/i.test(body);

    if (!isHtml) {
      res.set("Content-Type", "text/plain; charset=utf-8");
      return res.status(200).send(body.slice(0, 500000));
    }

    const cleaned = body
      .slice(0, 2000000)
      .replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, " ")
      .replace(/<meta[^>]+http-equiv=["']?x-frame-options["']?[^>]*>/gi, " ");

    const baseTag = '<base href="' + finalUrl.replace(/"/g, "&quot;") + '">';
    const inject = baseTag + NAV_SCRIPT;

    let html: string;
    if (/<head[^>]*>/i.test(cleaned)) {
      html = cleaned.replace(/<head[^>]*>/i, (match) => match + inject);
    } else if (/<html[^>]*>/i.test(cleaned)) {
      html = cleaned.replace(/<html[^>]*>/i, (match) => match + "<head>" + inject + "</head>");
    } else {
      html = "<html><head>" + inject + "</head><body>" + cleaned + "</body></html>";
    }

    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Content-Security-Policy", "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; media-src * data: blob:; frame-ancestors 'self'");
    res.set("Cache-Control", "no-store");
    return res.status(200).send(html);
  } catch (error: any) {
    const message =
      error?.name === "TimeoutError" ? "Waktu tunggu habis (15 detik)." : error?.message || "Gagal mengambil halaman.";
    const safe = String(message).replace(/[<>&]/g, " ");
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(502).send(
      '<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px;color:#222">' +
        "<p><b>Gagal menampilkan halaman.</b></p><p style=\"color:#555\">" + safe + "</p></body></html>"
    );
  }
}
