import { createProviderConnection, getProviderConnections } from "../../../models/index.js";
import { AI_PROVIDERS } from "../../../shared/constants/providers.js";

const PROVIDER_MAP = {
  "github-copilot": "github",
};

function normalizeImportedProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  return PROVIDER_MAP[raw] || raw;
}

function summarizeSkip(skipped, provider, reason) {
  const key = provider + ": " + reason;
  skipped[key] = (skipped[key] || 0) + 1;
}

export async function POST_handler(req, res) {
  try {
    const payload = req.body?.payload || req.body;
    const incoming = payload?.providerConnections;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "File tidak memiliki array providerConnections." });
    }
    if (incoming.length > 1000) {
      return res.status(413).json({ error: "Maksimal 1.000 koneksi per impor." });
    }

    const skipped = {};
    const priorities = new Map();
    let importedCount = 0;
    let updatedCount = 0;
    const existingEmailsByProvider = new Map();

    for (const item of incoming) {
      if (!item || typeof item !== "object") {
        summarizeSkip(skipped, "unknown", "format koneksi tidak valid");
        continue;
      }

      const sourceProvider = String(item.provider || item.sourcePlatform || "unknown");
      const provider = normalizeImportedProvider(sourceProvider);
      if (!AI_PROVIDERS[provider]) {
        summarizeSkip(skipped, sourceProvider, "provider belum didukung Max Router");
        continue;
      }

      const sourceData = item.sourceData && typeof item.sourceData === "object" ? item.sourceData : {};
      const accessToken = item.accessToken || sourceData.access_token || sourceData.github_access_token || "";
      const refreshToken = item.refreshToken || sourceData.refresh_token || "";
      const serviceToken = item.serviceToken || sourceData.copilot_token || "";
      if (!accessToken && !refreshToken && !serviceToken) {
        summarizeSkip(skipped, sourceProvider, "kredensial tidak tersedia");
        continue;
      }

      const email = String(item.email || sourceData.email || sourceData.github_email || "").trim();
      if (!existingEmailsByProvider.has(provider)) {
        const current = await getProviderConnections({ provider });
        existingEmailsByProvider.set(provider, new Set(current.filter((connection) => connection.authType === "oauth" && connection.email).map((connection) => connection.email.toLowerCase())));
      }
      const existingEmails = existingEmailsByProvider.get(provider);
      const existing = Boolean(email && existingEmails.has(email.toLowerCase()));

      const priority = (priorities.get(provider) || 0) + 1;
      priorities.set(provider, priority);

      const providerSpecificData = {
        importSource: "9router-cockpit-json",
        sourcePlatform: item.sourcePlatform || sourceProvider,
      };
      if (provider === "kiro") {
        const profileArn = sourceData.kiro_profile_raw?.arn || sourceData.profileArn || item.profileArn;
        if (profileArn) providerSpecificData.profileArn = profileArn;
        providerSpecificData.authMethod = sourceData.login_provider || "imported";
      }

      await createProviderConnection({
        provider,
        authType: "oauth",
        name: String(item.name || email || (provider + " account " + priority)),
        email: email || null,
        accessToken,
        refreshToken,
        serviceToken: serviceToken || undefined,
        expiresAt: item.expiresAt || sourceData.expires_at || undefined,
        expiresIn: Number.isFinite(Number(item.expiresIn)) ? Number(item.expiresIn) : undefined,
        scope: item.scope || undefined,
        projectId: item.projectId || undefined,
        priority,
        isActive: item.isActive !== false,
        testStatus: "unknown",
        providerSpecificData,
      });

      if (existing) updatedCount += 1;
      else importedCount += 1;
      if (email) existingEmails.add(email.toLowerCase());
    }

    return res.json({
      success: true,
      total: incoming.length,
      importedCount,
      updatedCount,
      skippedCount: Object.values(skipped).reduce((sum, count) => sum + count, 0),
      skipped,
      message: "Impor selesai. Status token belum diuji; gunakan uji koneksi sebelum mengirim permintaan.",
    });
  } catch (error) {
    console.error("[9RouterImport] Import failed:", error?.message || error);
    return res.status(500).json({ error: "Impor gagal. Periksa format file dan log server." });
  }
}
