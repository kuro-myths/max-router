// GET /api/browser/detect
// Deteksi browser ringan untuk MAX Router: membaca User-Agent header permintaan
// lalu mengembalikan nama browser, versi, engine, OS, dan jenis perangkat.
// Ini pengganti fitur browser berat (fetch/render/view/search + Chromium headless)
// yang sudah dihapus. Terproteksi sesi dashboard / API key seperti route /api lain.

type BrowserInfo = {
  name: string;
  version: string;
  engine: string;
  os: string;
  device: string;
  bot: boolean;
};

function detectBrowser(ua: string): BrowserInfo {
  const s = String(ua || "");
  const u = s.toLowerCase();

  // Bot / crawler
  const bot = /bot|crawler|spider|crawling|slurp|curl|wget|headless|python-requests|axios|node-fetch|postman/i.test(s);

  // Nama browser (urutan penting — cek turunan Edge/Opera dulu)
  let name = "Tidak dikenal";
  let version = "";
  let engine = "Tidak dikenal";

  const pairs: Array<[RegExp, string, string]> = [
    [/edg(?:e|a|ios)?/([d.]+)/, "Microsoft Edge", "Blink"],
    [/opr/([d.]+)|opera[s/]([d.]+)/, "Opera", "Blink"],
    [/samsungbrowser/([d.]+)/, "Samsung Internet", "Blink"],
    [/miuibrowser/([d.]+)/, "Mi Browser", "Blink"],
    [/opr/([d.]+)/, "Opera", "Blink"],
    [/chrome/([d.]+)/, "Chrome", "Blink"],
    [/crios/([d.]+)/, "Chrome (iOS)", "WebKit"],
    [/firefox/([d.]+)|fxios/([d.]+)/, "Firefox", "Gecko"],
    [/version/([d.]+).*safari/, "Safari", "WebKit"],
    [/safari/([d.]+)/, "Safari", "WebKit"],
    [/msies([d.]+)|trident.*rv:([d.]+)/, "Internet Explorer", "Trident"],
  ];

  for (const [re, n, e] of pairs) {
    const m = s.match(re);
    if (m) {
      name = n;
      engine = e;
      version = (m[1] || m[2] || "").split(".").slice(0, 3).join(".");
      break;
    }
  }

  // Sistem operasi
  let os = "Tidak dikenal";
  if (/windows nt 10/i.test(s)) os = "Windows 10/11";
  else if (/windows nt ([d.]+)/i.test(s)) os = "Windows";
  else if (/android ([d.]+)/i.test(s)) os = "Android " + (s.match(/android ([d.]+)/i)?.[1] ?? "");
  else if (/iphone os ([d_.]+)/i.test(s)) os = "iOS " + (s.match(/iphone os ([d_.]+)/i)?.[1] ?? "").replace(/_/g, ".");
  else if (/ipad|cpu os/i.test(s)) os = "iPadOS";
  else if (/mac os x/i.test(s)) os = "macOS";
  else if (/cros/i.test(s)) os = "ChromeOS";
  else if (/linux/i.test(u)) os = "Linux";

  // Jenis perangkat
  let device = "Desktop";
  if (/iphone|(android.*mobile)|windows phone/i.test(s)) device = "Ponsel";
  else if (/ipad|tablet|android(?!.*mobile)/i.test(s)) device = "Tablet";
  else if (/bot|crawler|spider|curl|wget|headless|python|postman/i.test(s)) device = "Bot/Otomatis";

  return { name, version, engine, os, device, bot };
}

export async function GET(req: any, res: any) {
  const userAgent = String(req.headers["user-agent"] || "");
  const info = detectBrowser(userAgent);

  const clientHints = {
    brands: (req.headers["sec-ch-ua"] as string) || null,
    platform: (req.headers["sec-ch-ua-platform"] as string) || null,
    mobile: (req.headers["sec-ch-ua-mobile"] as string) || null,
  };

  return res.json({
    ok: true,
    userAgent,
    ...info,
    clientHints,
    detectedAt: new Date().toISOString(),
  });
}
