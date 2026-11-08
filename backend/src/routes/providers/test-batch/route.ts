
import { getProviderConnections } from "../../../models/index.js";
import {
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
} from "../../../shared/constants/providers.js";
import { testSingleConnection } from "../[id]/test/testUtils.js";

function getAuthGroup(providerId, connection = null) {
  // Prioritize authType from connection if available
  if (connection?.authType) {
    if (connection.authType === "oauth") {
      // Check if it's a free provider
      if (FREE_PROVIDERS[providerId]) return "free";
      return "oauth";
    }
    return connection.authType;
  }
  
  // Fallback to constants
  if (FREE_PROVIDERS[providerId]) return "free";
  if (OAUTH_PROVIDERS[providerId]) return "oauth";
  if (APIKEY_PROVIDERS[providerId]) return "apikey";
  if (
    typeof providerId === "string" &&
    (providerId.startsWith(OPENAI_COMPATIBLE_PREFIX) || providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX))
  )
    return "compatible";
  return "apikey";
}

function isCompatibleProvider(providerId) {
  return (
    typeof providerId === "string" &&
    (providerId.startsWith(OPENAI_COMPATIBLE_PREFIX) || providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX))
  );
}

// POST /api/providers/test-batch - Test multiple connections by group
export async function POST_handler(req, res) {
  try {
    const body = req.body;
    const { mode, providerId } = body;
    const offset = Math.max(0, Number.parseInt(body.offset, 10) || 0);
    const requestedLimit = Number.parseInt(body.limit, 10) || 6;
    const limit = Math.min(8, Math.max(1, requestedLimit));

    if (!mode) {
      return res.status(400).json({ error: "mode is required" });
    }

    // "all" must use a stable complete inventory. Testing can deactivate rejected
    // credentials (HTTP 401); filtering active rows here changes the offset pages
    // between requests and silently skips the remaining accounts.
    const allConnections = await getProviderConnections(mode === "all" ? {} : { isActive: true });
    allConnections.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    let connectionsToTest = [];
    if (mode === "provider" && providerId) {
      connectionsToTest = allConnections.filter((c) => c.provider === providerId);
    } else if (mode === "oauth") {
      connectionsToTest = allConnections.filter((c) => getAuthGroup(c.provider, c) === "oauth");
    } else if (mode === "free") {
      connectionsToTest = allConnections.filter((c) => getAuthGroup(c.provider, c) === "free");
    } else if (mode === "apikey") {
      connectionsToTest = allConnections.filter((c) => getAuthGroup(c.provider, c) === "apikey");
    } else if (mode === "compatible") {
      connectionsToTest = allConnections.filter((c) => isCompatibleProvider(c.provider));
    } else if (mode === "all") {
      connectionsToTest = allConnections;
    } else {
      return res.status(400).json(
        { error: "Invalid mode. Use: provider, oauth, free, apikey, compatible, all" }
      );
    }

    const totalCount = connectionsToTest.length;
    connectionsToTest = connectionsToTest.slice(offset, offset + limit);

    if (connectionsToTest.length === 0) {
      return res.json({
        mode,
        providerId: providerId || null,
        results: [],
        summary: { total: 0, passed: 0, unverified: 0, failed: 0 },
        pagination: { offset, limit, total: totalCount, nextOffset: offset, done: true },
        testedAt: new Date().toISOString(),
      });
    }

    // Run a small worker pool instead of testing accounts serially.
    // Six concurrent checks keeps large OAuth imports responsive without
    // overwhelming provider APIs or the database connection pool.
    const results = new Array(connectionsToTest.length);
    let nextIndex = 0;
    const concurrency = Math.min(2, connectionsToTest.length);

    async function worker() {
      while (true) {
        const index = nextIndex++;
        if (index >= connectionsToTest.length) return;
        const conn = connectionsToTest[index];
        try {
          const data = await testSingleConnection(conn.id);
          results[index] = {
            provider: conn.provider,
            connectionId: conn.id,
            connectionName: conn.name || conn.email || conn.provider,
            authType: conn.authType || getAuthGroup(conn.provider, conn),
            valid: data.valid,
            verified: data.verified !== false,
            latencyMs: data.latencyMs || 0,
            error: data.error || null,
            diagnosis: data.diagnosis || null,
            statusCode: data.statusCode || null,
            testedAt: data.testedAt || new Date().toISOString(),
          };
        } catch (error) {
          results[index] = {
            provider: conn.provider,
            connectionId: conn.id,
            connectionName: conn.name || conn.email || conn.provider,
            authType: conn.authType || getAuthGroup(conn.provider, conn),
            valid: false,
            latencyMs: 0,
            error: error?.message || "Pengujian gagal",
            diagnosis: { type: "network_error", source: "local", code: null, message: error?.message || "Pengujian gagal" },
            statusCode: null,
            testedAt: new Date().toISOString(),
          };
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    return res.json({
      mode,
      providerId: providerId || null,
      results,
      pagination: { offset, limit, total: totalCount, nextOffset: offset + results.length, done: offset + results.length >= totalCount },
      testedAt: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: results.filter((r) => r.valid && r.verified !== false).length,
        unverified: results.filter((r) => r.valid && r.verified === false).length,
        failed: results.filter((r) => !r.valid).length,
      },
    });
  } catch (error) {
    console.log("Error in batch test:", error);
    return res.status(500).json({ error: error?.message || "Batch test failed", diagnosis: { type: "batch_internal_error", message: "Batch pengujian gagal di server. Periksa log backend." } });
  }
}
