// GET /api/browser/render?url=<target>
// "Chrome sungguhan" untuk MAX Browser: halaman dirender dengan Chromium headless
// di server (JavaScript ikut berjalan), lalu hasil DOM akhir disajikan dari domain
// sendiri sehingga situs yang memblokir iframe tetap tampil dan konten dinamis
// (YouTube, Google, SPA) ikut ter-render. Bila Chromium tidak tersedia/gagal,
// otomatis fallback ke pengambilan HTML statis seperti mode view lama.
// Terproteksi sesi dashboard / API key. Hanya http/https; host privat diblokir.

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

// Cache browser instance: satu Chromium dibagi semua request (hemat memori).
let browserPromise: Promise<any> | null = null;

async function getBrowser(): Promise<any> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = (await import("puppeteer-core")).default;
      const executablePath =
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        process.env.CHROME_PATH ||
        "/usr/bin/chromium-browser";
      return puppeteer.launch({
        executablePath,
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-setuid-sandbox",
          "--no-zygote",
          "--single-process",
          "--mute-audio",
          "--window-size=1280,2000",
        ],
      });
    })().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

async function renderWithChromium(target: URL, timeoutMs = 25000): Promise<{ html: string; finalUrl: string; status: number } | null> {
  let page: any = null;
  let browser: any = null;
  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 2000 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 MaxRouterBrowser/1.0"
    );
    const response = await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    // Beri waktu JavaScript menyelesaikan render (SPA, video player, dsb.)
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const html = await page.content();
    return { html, finalUrl: page.url() || target.toString(), status: response ? response.status() : 200 };
  } catch {
    return null;
  } finally {
    try { if (page) await page.close(); } catch {}
  }
}

async function fetchStatic(target: URL): Promise<{ html: string; finalUrl: string; status: number; contentType: string } | null> {
  try {
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
    return { html: body, finalUrl: upstream.url || target.toString(), status: upstream.status, contentType };
  } catch {
    return null;
  }
}

function buildResponse(res: any, body: string, finalUrl: string, engine: string) {
  const cleaned = body
    .slice(0, 3000000)
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
  res.set("X-Max-Router-Engine", engine);
  return res.status(200).send(html);
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

    // 1) Coba render penuh dengan Chromium (JavaScript jalan).
    const rendered = await renderWithChromium(target);
    if (rendered && rendered.html && rendered.html.length > 0) {
      return buildResponse(res, rendered.html, rendered.finalUrl, "chromium");
    }

    // 2) Fallback: ambil HTML statis (seperti mode view lama).
    const staticResult = await fetchStatic(target);
    if (staticResult && staticResult.html) {
      const isHtml = /html/i.test(staticResult.contentType) || /^\s*<(!doctype|html)/i.test(staticResult.html);
      if (!isHtml) {
        res.set("Content-Type", "text/plain; charset=utf-8");
        return res.status(200).send(staticResult.html.slice(0, 500000));
      }
      return buildResponse(res, staticResult.html, staticResult.finalUrl, "static-fetch");
    }

    const safe = "Gagal merender halaman: Chromium dan pengambilan statis sama-sama gagal (situs mungkin down atau memblokir akses server).";
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(502).send(
      '<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px;color:#222">' +
        "<p><b>Gagal menampilkan halaman.</b></p><p style=\"color:#555\">" + safe + "</p></body></html>"
    );
  } catch (error: any) {
    const message = error?.message || "Gagal merender halaman.";
    const safe = String(message).replace(/[<>&]/g, " ");
    res.set("Content-Type", "text/html; charset=utf-8");
    return res.status(502).send(
      '<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px;color:#222">' +
        "<p><b>Gagal menampilkan halaman.</b></p><p style=\"color:#555\">" + safe + "</p></body></html>"
    );
  }
}
