
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import {
  Card,
  CardSkeleton,
  Badge,
  Button,
  Input,
  Modal,
  Toggle,
} from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import {
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
} from "@/shared/constants/providers";
import { getErrorCode, getRelativeTime } from "@/shared/utils";
import { useNotificationStore } from "@/store/notificationStore";
import { useHeaderSearchStore } from "@/store/headerSearchStore";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";

const VALIDATION_TIMEOUT_MS = 15000;

const FAILED_ARCHIVE_KEY = "max-router-failed-service-tests";
const PENDING_DELETE_KEY = "max-router-pending-failed-account-deletions";

function readPendingFailedDeletes() {
  try {
    const value = JSON.parse(window.localStorage.getItem(PENDING_DELETE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && item.id) : [];
  } catch {
    return [];
  }
}

function writePendingFailedDeletes(items) {
  window.localStorage.setItem(PENDING_DELETE_KEY, JSON.stringify(items.slice(0, 1000)));
}

function saveFailedArchiveLocal(items) {
  const previous = JSON.parse(window.localStorage.getItem(FAILED_ARCHIVE_KEY) || "[]");
  const merged = new Map();
  for (const item of [...(Array.isArray(items) ? items : []), ...(Array.isArray(previous) ? previous : [])]) {
    if (item?.id) merged.set(String(item.id), { ...merged.get(String(item.id)), ...item });
  }
  window.localStorage.setItem(FAILED_ARCHIVE_KEY, JSON.stringify([...merged.values()].slice(0, 1000)));
}

async function persistFailedArchive(archive) {
  const response = await fetch("/api/providers/failed-archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archive }),
  });
  if (!response.ok) throw new Error("Arsip JSON gagal disimpan ke database (HTTP " + response.status + ").");
  return true;
}

// Queue is written before any destructive request. It survives refresh/reopen and retries
// only explicitly verified authentication failures; transient 429/5xx/network errors stay.
async function resumePendingFailedDeletes(notify, setConnections) {
  // Never delete provider accounts automatically from an HTTP status. A 403 may
  // mean suspension/security lock, and OAuth 401 may be refreshable/re-authorizable.
  // Clear legacy destructive queues created by older versions.
  writePendingFailedDeletes([]);
  return;
  const pending = readPendingFailedDeletes();
  if (!pending.length) return;
  const completed = [];
  const remaining = [];
  for (let start = 0; start < pending.length; start += 4) {
    const batch = pending.slice(start, start + 4);
    const outcomes = await Promise.all(batch.map(async (record) => {
      try {
        const response = await fetch("/api/providers/" + encodeURIComponent(String(record.id)), { method: "DELETE" });
        return { record, ok: response.ok || response.status === 404, status: response.status };
      } catch {
        return { record, ok: false, status: 0 };
      }
    }));
    for (const outcome of outcomes) {
      if (outcome.ok) completed.push({ ...outcome.record, removedFromActiveServices: true, deleteHttpStatus: outcome.status });
      else remaining.push({ ...outcome.record, removedFromActiveServices: false, deleteHttpStatus: outcome.status });
    }
  }

  writePendingFailedDeletes(remaining);
  const allRecords = [...completed, ...remaining];
  saveFailedArchiveLocal(allRecords);
  const archive = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "Max Router / antrean penghapusan akun gagal",
    summary: {
      failed: allRecords.length,
      deletedFromActiveServices: completed.length,
      deleteFailed: remaining.length,
      pendingAfterReload: remaining.length,
    },
    failedServices: allRecords,
  };
  let serverSaved = false;
  try { await persistFailedArchive(archive); serverSaved = true; }
  catch (error) { console.warn("Failed deletion archive sync:", error); }

  try {
    const refreshed = await fetch("/api/providers", { cache: "no-store" });
    if (refreshed.ok) {
      const data = await refreshed.json();
      setConnections(data.connections || []);
    }
  } catch (error) {
    console.warn("Provider refresh after cleanup failed:", error);
  }

  if (completed.length) {
    notify.success(
      completed.length + " akun error berhasil dihapus" +
      (remaining.length ? "; " + remaining.length + " akan dicoba lagi saat halaman dibuka." : ".") +
      (serverSaved ? " Arsip tersimpan di database." : " Arsip tetap tersimpan lokal."),
      "Pembersihan otomatis dilanjutkan",
    );
  } else if (remaining.length) {
    notify.warning(remaining.length + " penghapusan masih tertunda. Sistem akan mencoba lagi saat halaman dibuka.", "Pembersihan tertunda");
  }
}



async function fetchProviderNodeValidation(payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  try {
    const res = await fetch("/api/provider-nodes/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data) {
      return { error: (data && data.error) || ("Pemeriksaan gagal (HTTP " + res.status + ").") };
    }
    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getStatusDisplay(connected, error, errorCode) {
  const parts = [];
  if (connected > 0) {
    parts.push(
      <Badge key="connected" variant="success" size="sm" dot>
        {connected} Tersambung
      </Badge>,
    );
  }
  if (error > 0) {
    const errText = errorCode
      ? `${error} Kesalahan (${errorCode})`
      : `${error} Kesalahan`;
    parts.push(
      <Badge key="error" variant="error" size="sm" dot>
        {errText}
      </Badge>,
    );
  }
  if (parts.length === 0) {
    return <span className="text-text-muted">Belum ada koneksi</span>;
  }
  return parts;
}

function getConnectionErrorTag(connection) {
  if (!connection) return null;

  const explicitType = connection.lastErrorType;
  if (explicitType === "runtime_error") return "RUNTIME";
  if (
    explicitType === "upstream_auth_error" ||
    explicitType === "auth_missing" ||
    explicitType === "token_refresh_failed" ||
    explicitType === "token_expired"
  )
    return "AUTH";
  if (explicitType === "upstream_rate_limited") return "429";
  if (explicitType === "upstream_unavailable") return "5XX";
  if (explicitType === "network_error") return "NET";

  const numericCode = Number(connection.errorCode);
  if (Number.isFinite(numericCode) && numericCode >= 400)
    return String(numericCode);

  const fromMessage = getErrorCode(connection.lastError);
  if (fromMessage === "401" || fromMessage === "403") return "AUTH";
  if (fromMessage && fromMessage !== "ERR") return fromMessage;

  const msg = (connection.lastError || "").toLowerCase();
  if (
    msg.includes("runtime") ||
    msg.includes("not runnable") ||
    msg.includes("not installed")
  )
    return "RUNTIME";
  if (
    msg.includes("invalid api key") ||
    msg.includes("token invalid") ||
    msg.includes("revoked") ||
    msg.includes("unauthorized")
  )
    return "AUTH";

  return "ERR";
}

export default function ProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [providerNodes, setProviderNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [authFilter, setAuthFilter] = useState("all");

  const [testingMode, setTestingMode] = useState(null);
  const [testResults, setTestResults] = useState(null);
  const [isAddCompatibleOpen, setIsAddCompatibleOpen] = useState(false);
  const [isAddLoginServiceOpen, setIsAddLoginServiceOpen] = useState(false);
  const [loginServiceName, setLoginServiceName] = useState("");
  const [loginServiceUrl, setLoginServiceUrl] = useState("");
  const [loginServices, setLoginServices] = useState([]);
  const notify = useNotificationStore();
  const searchQuery = useHeaderSearchStore((s) => s.query);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("max-router-login-services") || "[]");
      if (Array.isArray(saved)) setLoginServices(saved.filter((item) => item && typeof item.name === "string" && typeof item.url === "string"));
    } catch {
      setLoginServices([]);
    }
  }, []);

  const saveLoginServices = (items) => {
    setLoginServices(items);
    try { window.localStorage.setItem("max-router-login-services", JSON.stringify(items)); } catch { /* storage may be disabled */ }
  };

  const handleAddLoginService = (event) => {
    event?.preventDefault();
    const name = loginServiceName.trim();
    const rawUrl = loginServiceUrl.trim();
    let parsed;
    try { parsed = new URL(rawUrl); } catch { notify.error("Masukkan URL layanan yang valid"); return; }
    if (!["https:", "http:"].includes(parsed.protocol)) { notify.error("URL harus menggunakan HTTP atau HTTPS"); return; }
    if (!name) { notify.error("Masukkan nama layanan"); return; }
    const next = [...loginServices, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, url: parsed.href }];
    saveLoginServices(next);
    setLoginServiceName("");
    setLoginServiceUrl("");
    setIsAddLoginServiceOpen(false);
    notify.success(`Layanan ${name} ditambahkan`);
  };

  useEffect(() => {
    registerSearch("Cari provider...");
    return () => unregisterSearch();
  }, [registerSearch, unregisterSearch]);

  const matchSearch = (name) => {
    const query = [searchQuery, localSearch].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
    const normalizedName = String(name || "").toLowerCase();
    return query.every((term) => normalizedName.includes(term));
  };

  const sortByPriority = (entries, authType) =>
    [...entries].sort(([ka, a], [kb, b]) => {
      const sa = getProviderStats(ka, authType);
      const sb = getProviderStats(kb, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  const sortItemsByPriority = (items, authType) =>
    [...items].sort((a, b) => {
      const sa = getProviderStats(a.id, authType);
      const sb = getProviderStats(b.id, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [connectionsRes, nodesRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/provider-nodes"),
        ]);
        const connectionsData = await connectionsRes.json();
        const nodesData = await nodesRes.json();
        if (connectionsRes.ok)
          setConnections(connectionsData.connections || []);
        if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
      } catch (error) {
        console.log("Error fetching data:", error);
      } finally {
        setLoading(false);
        // Continue queued deletions after reload/navigation. Queue is browser-persistent.
        resumePendingFailedDeletes(notify, setConnections).catch((error) => {
          console.warn("Could not resume failed-account cleanup:", error);
          notify.warning("Antrean penghapusan belum selesai. Sistem akan mencoba lagi saat halaman dibuka.", "Pembersihan tertunda");
        });
      }
    };
    fetchData();
  }, []);

  const getProviderStats = (providerId, authType) => {
    const providerConnections = connections.filter(
      (c) => c.provider === providerId && (c.authType === authType || (providerId === "codebuddy" && c.authType === "apikey")),
    );

    const getEffectiveStatus = (conn) => {
      const isCooldown = Object.entries(conn).some(
        ([k, v]) =>
          k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now(),
      );
      return conn.testStatus === "unavailable" && !isCooldown
        ? "active"
        : conn.testStatus;
    };

    const connected = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return status === "active" || status === "success";
    }).length;

    const errorConns = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return (
        status === "error" || status === "expired" || status === "unavailable"
      );
    });

    const error = errorConns.length;
    const total = providerConnections.length;
    const allDisabled =
      total > 0 && providerConnections.every((c) => c.isActive === false);

    const latestError = errorConns.sort(
      (a, b) => new Date(b.lastErrorAt || 0) - new Date(a.lastErrorAt || 0),
    )[0];
    const errorCode = latestError ? getConnectionErrorTag(latestError) : null;
    const errorTime = latestError?.lastErrorAt
      ? getRelativeTime(latestError.lastErrorAt)
      : null;

    return { connected, error, total, errorCode, errorTime, allDisabled };
  };

  // Toggle all connections for a provider on/off
  const handleToggleProvider = async (providerId, authType, newActive) => {
    const providerConns = connections.filter(
      (c) => c.provider === providerId && c.authType === authType,
    );
    setConnections((prev) =>
      prev.map((c) =>
        c.provider === providerId && c.authType === authType
          ? { ...c, isActive: newActive }
          : c,
      ),
    );
    await Promise.allSettled(
      providerConns.map((c) =>
        fetch(`/api/providers/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        }),
      ),
    );
  };

  // Hapus semua koneksi yang status pengujiannya memang gagal.
  // Akun yang hanya terkena cooldown/rate-limit sementara tidak dianggap gagal permanen
  // kecuali hasil tes terakhir secara eksplisit menandainya error/expired.
  const getDeletableAuthErrors = () => connections.filter((connection) => {
    const status = String(connection.testStatus || "").toLowerCase();
    return ["error", "expired", "unavailable"].includes(status);
  });

  const handleCleanupAuthErrors = async () => {
    if (testingMode) return;
    const pending = getDeletableAuthErrors();
    if (!pending.length) {
      notify.info("Tidak ada akun berstatus error atau expired yang perlu dibersihkan.");
      return;
    }
    if (!window.confirm("Hapus " + pending.length + " akun yang status pengujiannya error/expired? Metadata aman disimpan terlebih dahulu. Akun aktif dan belum terverifikasi tidak ikut dihapus.")) return;

    setTestingMode("cleanup");
    try {
      const testedAt = new Date().toISOString();
      const records = pending.map((connection) => ({
        id: String(connection.id),
        name: connection.name || connection.email || "Layanan tanpa nama",
        provider: connection.provider || null,
        authType: connection.authType || null,
        endpoint: connection.providerSpecificData?.baseUrl || null,
        model: connection.defaultModel || null,
        result: "failed",
        verified: true,
        httpStatus: Number(connection.errorCode || getErrorCode(connection.lastError)) || null,
        errorCode: getConnectionErrorTag(connection),
        reason: String(connection.lastError || "Kredensial ditolak provider").slice(0, 1000),
        testedAt: connection.lastErrorAt || testedAt,
      }));
      // Persist archive and deletion queue BEFORE calling DELETE, so refresh cannot lose the work.
      saveFailedArchiveLocal(records);
      writePendingFailedDeletes([...readPendingFailedDeletes(), ...records].filter((item, index, all) => all.findIndex((entry) => String(entry.id) === String(item.id)) === index));
      const archive = { schemaVersion: 1, generatedAt: testedAt, source: "Max Router / Pembersihan akun error", summary: { failed: records.length, pendingAfterReload: records.length }, failedServices: records };
      try { await persistFailedArchive(archive); }
      catch (error) { console.warn("Archive database sync failed; local queue remains durable:", error); }
      await resumePendingFailedDeletes(notify, setConnections);
    } catch (error) {
      notify.error(error?.message || "Pembersihan akun error gagal.");
    } finally {
      setTestingMode(null);
    }
  };

  const handleBatchTest = async (mode, providerId = null) => {
    if (testingMode) return;
    setTestingMode(mode === "provider" ? providerId : mode);
    const accumulated = [];
    const seenConnectionIds = new Set();
    let total = null;
    let offset = 0;
    const summary = { total: 0, passed: 0, failed: 0, unverified: 0 };
    setTestResults({ mode, results: [], summary, progress: { completed: 0, total: 0 }, running: true });
    notify.info("Pengujian dimulai. Semua akun tersimpan akan diperiksa, termasuk akun nonaktif.", "Uji semua akun");
    try {
      let done = false;
      while (!done) {
        const res = await fetch("/api/providers/test-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, providerId, offset, limit: 8 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || data?.diagnosis?.message || "Pengujian penyedia gagal");
        if (total === null) total = Number(data.inventory?.total ?? data.pagination?.total ?? data.summary?.total ?? 0);
        for (const item of data.results || []) {
          const key = item.connectionId || item.id;
          if (key && seenConnectionIds.has(key)) continue;
          if (key) seenConnectionIds.add(key);
          accumulated.push(item);
        }
        summary.total = accumulated.length;
        summary.passed = accumulated.filter((item) => item.valid && item.verified !== false).length;
        summary.unverified = accumulated.filter((item) => item.valid && item.verified === false).length;
        summary.failed = accumulated.filter((item) => !item.valid).length;
        const nextOffset = Number(data.pagination?.nextOffset ?? offset + (data.results || []).length);
        done = data.pagination ? data.pagination.done : nextOffset >= total;
        if (!done && nextOffset <= offset) {
          throw new Error("Pengujian terhenti karena penanda halaman tidak bergerak. Tidak ada akun yang akan ditandai selesai secara keliru.");
        }
        offset = nextOffset;
        setTestResults({
          mode, results: [...accumulated], summary: { ...summary },
          testedAt: data.testedAt || new Date().toISOString(),
          progress: { completed: accumulated.length, total: total ?? accumulated.length },
          running: !done,
        });
        if (!data.pagination && (data.results || []).length === 0) done = true;
      }

      if (total !== null && accumulated.length !== total) {
        throw new Error(`Pengujian belum lengkap: ${accumulated.length} dari ${total} akun menerima hasil. Jalankan ulang untuk melanjutkan pemeriksaan.`);
      }

      // Only definitive authentication rejection is auto-deleted. Queue + metadata are
      // persisted before DELETE so a page reload cannot cancel the remaining cleanup.
      const failedResults = accumulated.filter((item) => item.valid === false);
      const currentById = new Map(connections.map((connection) => [String(connection.id), connection]));
      const failedRecords = failedResults.map((item) => {
        const id = String(item.connectionId || item.id || "");
        const connection = currentById.get(id);
        return {
          id,
          name: item.connectionName || connection?.name || connection?.email || "Layanan tanpa nama",
          provider: item.provider || connection?.provider || null,
          authType: connection?.authType || null,
          endpoint: connection?.providerSpecificData?.baseUrl || null,
          model: connection?.defaultModel || null,
          result: "failed",
          verified: item.verified === true,
          httpStatus: item.statusCode ?? item.httpStatus ?? null,
          errorCode: item.errorCode || null,
          reason: String(item.error || item.message || item.reason || "Uji layanan gagal").slice(0, 1000),
          testedAt: item.testedAt || new Date().toISOString(),
        };
      }).filter((item) => item.id);

      // Keep failed accounts and credentials for diagnosis/recovery. HTTP 403
      // includes suspended accounts; it must never trigger automatic deletion.
      const deletableRecords = [];
      let deletedCount = 0;
      let deleteFailedCount = 0;
      if (failedRecords.length) {
        saveFailedArchiveLocal(failedRecords);
        const archive = {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          source: "Max Router / Uji Semua Penyedia",
          summary: { tested: summary.total, passed: summary.passed, unverified: summary.unverified, failed: failedRecords.length, autoDeleteEligible: deletableRecords.length },
          failedServices: failedRecords,
        };
        try { await persistFailedArchive(archive); }
        catch (archiveError) { console.warn("Server archive save failed; local archive retained:", archiveError); }

        if (deletableRecords.length) {
          const queue = [...readPendingFailedDeletes(), ...deletableRecords];
          writePendingFailedDeletes(queue.filter((item, index, all) => all.findIndex((entry) => String(entry.id) === String(item.id)) === index));
          const before = readPendingFailedDeletes().length;
          await resumePendingFailedDeletes(notify, setConnections);
          const after = readPendingFailedDeletes().length;
          deleteFailedCount = after;
          deletedCount = Math.max(0, before - after);
        }

        // Preserve all failed test details in local storage; no API credentials are stored.
        try {
          const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json;charset=utf-8" });
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = "max-router-failed-services-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(objectUrl);
        } catch (downloadError) {
          console.warn("JSON download unavailable; local/database archive remains:", downloadError);
        }
      }

      for (const item of accumulated) {
        const id = String(item.connectionId || item.id || "");
        if (deletableRecords.some((record) => record.id === id) && !readPendingFailedDeletes().some((record) => record.id === id)) {
          item.removedFromActiveServices = true;
        }
      }

      const refreshed = await fetch("/api/providers", { cache: "no-store" });
      if (refreshed.ok) {
        const refreshedData = await refreshed.json();
        setConnections(refreshedData.connections || []);
      }

      if (summary.failed === 0 && summary.unverified === 0) notify.success(`Semua ${summary.total} akun selesai diuji dan berhasil diverifikasi.`, "Uji semua selesai");
      else notify.warning(`Selesai menguji ${summary.total} akun: ${summary.passed} berhasil, ${summary.unverified} belum terverifikasi, ${summary.failed} gagal. Akun gagal dipertahankan agar bisa diperbaiki; tidak ada penghapusan otomatis berdasarkan HTTP 401/403. Arsip JSON disimpan lokal dan disinkronkan ke database bila tersedia.`, "Hasil uji semua");
    } catch (error) {
      setTestResults((current) => ({
        ...(current || {}),
        mode,
        results: accumulated,
        summary: { ...summary },
        progress: { completed: accumulated.length, total: total ?? accumulated.length },
        running: false,
        error: error?.message || "Permintaan pengujian gagal",
      }));
      notify.error(error?.message || "Pengujian penyedia gagal");
    } finally {
      setTestingMode(null);
    }
  };

  const compatibleProviders = providerNodes
    .filter((node) => node.type === "openai-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Provider Compatible",
      color: "#10A37F",
      textIcon: "OC",
      iconUrl: node.iconUrl || node.providerSpecificData?.iconUrl,
      apiType: node.apiType,
    }))
    .filter((p) => matchSearch(p.name));

  const anthropicCompatibleProviders = providerNodes
    .filter((node) => node.type === "anthropic-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Provider Compatible",
      color: "#D97757",
      textIcon: "AC",
      iconUrl: node.iconUrl || node.providerSpecificData?.iconUrl,
    }))
    .filter((p) => matchSearch(p.name));

  // Hanya tampilkan integrasi yang benar-benar tersimpan.
  // Katalog OAuth/API/TTS/Search/Image bawaan tidak dirender di halaman ini.
  const savedProviderEntries = (() => {
    const candidates = new Map();

    const add = (providerId, name, authType = "apikey", node = null) => {
      if (!providerId) return;
      const key = String(providerId).trim();
      if (!key) return;
      const existing = candidates.get(key);
      candidates.set(key, {
        id: key,
        name: name || existing?.name || key,
        authType: authType || existing?.authType || "apikey",
        node: node || existing?.node || null,
      });
    };

    // Render every compatible provider node, not only the legacy xKiro/Atria entries.
    // Nodes are the canonical provider definitions; connections hold their saved API keys.
    for (const node of providerNodes) {
      if (node.type === "openai-compatible" || node.type === "anthropic-compatible") {
        add(node.id, node.name || "Penyedia Kompatibel", "apikey", node);
      }
    }

    for (const connection of connections) {
      const providerId = String(connection.provider || "");
      const isCompatible =
        providerId.startsWith(OPENAI_COMPATIBLE_PREFIX) ||
        providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
      if (!isCompatible) continue;
      const node = providerNodes.find((item) => item.id === providerId) || null;
      add(providerId, node?.name || connection.name || providerId, connection.authType || "apikey", node);
    }

    return [...candidates.values()].filter((entry) => matchSearch(entry.name));
  })();

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const availableAuthTypes = [...new Set(savedProviderEntries.map((entry) => entry.authType || "apikey"))];
  const totalSavedKeys = savedProviderEntries.reduce((sum, entry) => sum + getProviderStats(entry.id, entry.authType).total, 0);
  const visibleProviderEntries = savedProviderEntries.filter((entry) => {
    if (authFilter !== "all" && (entry.authType || "apikey") !== authFilter) return false;
    const stats = getProviderStats(entry.id, entry.authType);
    if (statusFilter === "connected") return stats.connected > 0;
    if (statusFilter === "error") return stats.error > 0;
    if (statusFilter === "disabled") return stats.allDisabled;
    if (statusFilter === "not-connected") return stats.total === 0 || (stats.connected === 0 && stats.error === 0);
    return true;
  });
  const hasAnyResult = savedProviderEntries.length > 0;
  const oauthConnections = connections.filter((connection) => connection.authType === "oauth");
  const oauthProviderGroups = [...oauthConnections.reduce((groups, connection) => {
    const id = String(connection.provider || "unknown");
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(connection);
    return groups;
  }, new Map()).entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Penyedia</h1>
          <p className="text-sm text-text-muted">Kelola API Base URL dan API key untuk penyedia kompatibel, atau tambahkan URL masuk layanan AI.</p>
          <p className="text-xs text-text-muted">{savedProviderEntries.length} penyedia · {totalSavedKeys} kunci API tersimpan</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon="science" onClick={() => handleBatchTest("all")} disabled={!!testingMode}>
            {testingMode === "all" ? "Menguji Semua..." : "Uji Semua Penyedia"}
          </Button>
          <Button icon="delete" onClick={handleCleanupAuthErrors} disabled={!!testingMode}>
            {testingMode === "cleanup" ? "Membersihkan..." : `Hapus akun error (${getDeletableAuthErrors().length})`}
          </Button>
          <Button icon="add" onClick={() => setIsAddCompatibleOpen(true)}>
            Tambah Kompatibel
          </Button>
          <Button icon="login" onClick={() => setIsAddLoginServiceOpen(true)}>
            Tambah Layanan Masuk
          </Button>
        </div>
      </div>

      {loginServices.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Layanan Masuk Tersimpan</h2>
            <span className="text-xs text-text-muted">{loginServices.length} layanan</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {loginServices.map((service) => (
              <article key={service.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-text-main">{service.name}</h3>
                  <p className="truncate text-xs text-text-muted">{service.url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a href={service.url} target="_blank" rel="noopener noreferrer" className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20" aria-label={`Buka ${service.name}`} title="Buka layanan">
                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  </a>
                  <button type="button" onClick={() => saveLoginServices(loginServices.filter((item) => item.id !== service.id))} className="inline-flex size-9 items-center justify-center rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-500" aria-label={`Hapus ${service.name}`} title="Hapus layanan">
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {oauthConnections.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold">Integrasi OAuth</h2>
              <p className="text-sm text-text-muted">Pilih penyedia untuk membuka halaman detail, mengelola akun, dan melihat status koneksi.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">{oauthConnections.length} akun tersimpan</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {oauthProviderGroups.map(([providerId, accounts]) => {
              const active = accounts.filter((account) => account.isActive !== false).length;
              const tested = accounts.filter((account) => account.testStatus === "success").length;
              const failed = accounts.filter((account) => ["error", "expired", "unavailable"].includes(account.testStatus)).length;
              const displayName = providerId.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
              const iconProvider = {
                id: providerId,
                name: displayName,
                color: "#7C3AED",
                textIcon: displayName.slice(0, 2).toUpperCase(),
              };
              return (
                <Link key={providerId} to={`/dashboard/providers/${encodeURIComponent(providerId)}`} className="group min-w-0">
                  <Card padding="xs" className="h-full cursor-pointer transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <ProviderIcon
                          src={`/providers/${providerId}.png`}
                          alt={displayName}
                          size={32}
                          className="max-h-8 max-w-8 rounded-lg object-contain"
                          fallbackText={iconProvider.textIcon}
                          fallbackColor={iconProvider.color}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-text-main">{displayName}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          <Badge variant="default" size="sm">{accounts.length} akun</Badge>
                          <Badge variant={active > 0 ? "success" : "default"} size="sm" dot>{active} aktif</Badge>
                          {failed > 0 ? <Badge variant="error" size="sm" dot>{failed} gagal</Badge> : <Badge variant={tested === accounts.length ? "success" : "default"} size="sm">{tested}/{accounts.length} teruji</Badge>}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-text-muted transition-transform group-hover:translate-x-1">chevron_right</span>
                    </div>
                    <p className="mt-3 text-xs text-text-muted">Klik untuk mengelola akun dan koneksi</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <Modal
        isOpen={isAddLoginServiceOpen}
        onClose={() => setIsAddLoginServiceOpen(false)}
        title="Tambah Layanan Masuk"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsAddLoginServiceOpen(false)}>Batal</Button>
            <Button onClick={handleAddLoginService}>Simpan Layanan</Button>
          </>
        }
      >
        <form onSubmit={handleAddLoginService} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="login-service-name" className="text-sm font-medium text-text-main">Nama layanan</label>
            <Input id="login-service-name" value={loginServiceName} onChange={(event) => setLoginServiceName(event.target.value)} placeholder="Contoh: Claude" required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="login-service-url" className="text-sm font-medium text-text-main">URL halaman masuk</label>
            <Input id="login-service-url" type="url" value={loginServiceUrl} onChange={(event) => setLoginServiceUrl(event.target.value)} placeholder="https://claude.ai/login" required />
            <p className="text-xs leading-5 text-text-muted">Masukkan URL login atau registrasi. Layanan disimpan di browser ini dan dibuka di tab baru; akun tidak otomatis masuk ke Max Router.</p>
          </div>
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1}>Simpan</button>
        </form>
      </Modal>

      {!hasAnyResult && (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <span className="material-symbols-outlined text-[32px] text-text-muted mb-2">
            cloud_off
          </span>
          <p className="text-text-muted text-sm">Belum ada API key atau penyedia kompatibel yang tersimpan. Akun OAuth ditampilkan pada bagian Akun OAuth tersimpan jika tersedia.</p>
        </div>
      )}

      {savedProviderEntries.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg sm:text-xl font-semibold">Integrasi Tersimpan</h2>
            <p className="text-sm text-text-muted">
              Daftar API key dan penyedia kompatibel yang tersimpan di MAX Router.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="provider-search" className="text-xs font-medium text-text-muted">Cari penyedia</label>
              <Input id="provider-search" value={localSearch} onChange={(event) => setLocalSearch(event.target.value)} placeholder="Nama penyedia..." />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="provider-status-filter" className="text-xs font-medium text-text-muted">Saring status</label>
              <select id="provider-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-brand-500/40">
                <option value="all">Semua status</option>
                <option value="connected">Tersambung</option>
                <option value="error">Ada kesalahan</option>
                <option value="disabled">Dinonaktifkan</option>
                <option value="not-connected">Belum tersambung</option>
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="provider-auth-filter" className="text-xs font-medium text-text-muted">Jenis autentikasi</label>
              <select id="provider-auth-filter" value={authFilter} onChange={(event) => setAuthFilter(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-brand-500/40">
                <option value="all">Semua jenis</option>
                {availableAuthTypes.map((type) => <option key={type} value={type}>{type === "apikey" ? "Kunci API" : type === "oauth" ? "Masuk OAuth" : type}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-text-muted sm:col-span-3">
              <span>Menampilkan {visibleProviderEntries.length} dari {savedProviderEntries.length} penyedia</span>
              {(localSearch || statusFilter !== "all" || authFilter !== "all") && <button type="button" onClick={() => { setLocalSearch(""); setStatusFilter("all"); setAuthFilter("all"); }} className="rounded-lg px-2 py-1 font-semibold text-brand-500 hover:bg-surface-2">Hapus semua saringan</button>}
            </div>
          </div>

          {visibleProviderEntries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="font-medium">Penyedia tidak ditemukan</p>
              <p className="mt-1 text-sm text-text-muted">Ubah kata pencarian atau saringan yang dipilih.</p>
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {visibleProviderEntries.map((entry) => {
              const info = {
                id: entry.id,
                name: entry.name,
                color: entry.name.toLowerCase().includes("xkiro") ? "#7C3AED" : "#0EA5E9",
                textIcon: entry.name.toLowerCase().includes("xkiro") ? "XK" : "AT",
                ...(entry.node || {}),
              };

              return (
                <ApiKeyProviderCard
                  key={entry.id}
                  providerId={entry.id}
                  provider={info}
                  stats={getProviderStats(entry.id, entry.authType)}
                  authType={entry.authType}
                  onToggle={(active) =>
                    handleToggleProvider(entry.id, entry.authType, active)
                  }
                />
              );
            })}
          </div>
          )}
        </div>
      )}


      <AddCompatibleModal
        isOpen={isAddCompatibleOpen}
        onClose={() => setIsAddCompatibleOpen(false)}
        onCreated={async () => {
          try {
            const [connectionsRes, nodesRes] = await Promise.all([
              fetch("/api/providers"),
              fetch("/api/provider-nodes"),
            ]);
            const connectionsData = await connectionsRes.json();
            const nodesData = await nodesRes.json();
            if (connectionsRes.ok) setConnections(connectionsData.connections || []);
            if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
          } catch (error) {
            console.log("Error refreshing providers:", error);
          }
        }}
      />

      {/* Hasil Pengujian Modal */}
      {testResults && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[6vh] sm:pt-[10vh]"
          onClick={() => setTestResults(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative bg-surface border border-border rounded-xl w-full max-w-[600px] max-h-[86vh] sm:max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-border bg-surface/95 backdrop-blur-sm rounded-t-xl">
              <h3 className="font-semibold">Hasil Pengujian</h3>
              <button
                onClick={() => setTestResults(null)}
                className="p-1 rounded-lg hover:bg-bg text-text-muted hover:text-text-main transition-colors"
                aria-label="Tutup hasil pengujian"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-5">
              <ProviderTestResultsView results={testResults} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderCard({ providerId, provider, stats, authType, onToggle }) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isNoAuth = !!provider.noAuth;

  const dotColors = {
    free: "bg-green-500",
    oauth: "bg-blue-500",
    apikey: "bg-amber-500",
    compatible: "bg-orange-500",
  };
  const dotLabels = {
    free: "Free",
    oauth: "OAuth",
    apikey: "Kunci API",
    compatible: "Kompatibel",
  };

  return (
    <Link to={`/dashboard/providers/${providerId}`} className="group min-w-0">
      <Card
        padding="xs"
        className={`h-full hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors cursor-pointer ${allDisabled ? "opacity-50" : ""}`}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="size-8 shrink-0 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: `${provider.color?.length > 7 ? provider.color : provider.color + "15"}`,
              }}
            >
              <ProviderIcon
                src={provider.iconUrl || (provider.id === "codebuddy" || provider.id === "cb" ? "/providers/codebuddy.svg" : `/providers/${provider.id}.png`)}
                alt={provider.name}
                size={30}
                className="object-contain rounded-lg max-w-[32px] max-h-[32px]"
                fallbackText={
                  provider.textIcon || provider.id.slice(0, 2).toUpperCase()
                }
                fallbackColor={provider.color}
              />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{provider.name}</h3>
              <div className="flex min-w-0 items-center gap-1.5 text-xs flex-wrap">
                {allDisabled ? (
                  <Badge variant="default" size="sm">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">
                        pause_circle
                      </span>
                      Disabled
                    </span>
                  </Badge>
                ) : isNoAuth ? (
                  <Badge variant="success" size="sm" dot>Siap</Badge>
                ) : (
                  <>
                    <Badge variant="default" size="sm">
                      {stats.total} Key
                    </Badge>
                    {getStatusDisplay(connected, error, errorCode)}
                    {errorTime && (
                      <span className="text-text-muted">{errorTime}</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {stats.total > 0 && (
              <div
                className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle(!allDisabled ? false : true);
                }}
              >
                <Toggle
                  size="sm"
                  checked={!allDisabled}
                  onChange={() => {}}
                  title={allDisabled ? "Aktifkan penyedia" : "Nonaktifkan penyedia"}
                />
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

ProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
};

function ApiKeyProviderCard({
  providerId,
  provider,
  stats,
  authType,
  onToggle,
}) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isCompatible = providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
  const isAnthropicCompatible = providerId.startsWith(
    ANTHROPIC_COMPATIBLE_PREFIX,
  );

  const dotColors = {
    free: "bg-green-500",
    oauth: "bg-blue-500",
    apikey: "bg-amber-500",
    compatible: "bg-orange-500",
  };
  const dotLabels = {
    free: "Free",
    oauth: "OAuth",
    apikey: "Kunci API",
    compatible: "Kompatibel",
  };

  const getIconPath = () => {
    if (provider.id === "codebuddy" || provider.id === "cb") {
      return "/providers/codebuddy.svg";
    }
    if (isCompatible)
      return provider.apiType === "responses"
        ? "/providers/oai-r.png"
        : "/providers/oai-cc.png";
    if (isAnthropicCompatible) return "/providers/anthropic-m.png";
    return `/providers/${provider.id}.png`;
  };

  return (
    <Link to={`/dashboard/providers/${providerId}`} className="group min-w-0">
      <Card
        padding="xs"
        className={`h-full hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors cursor-pointer ${allDisabled ? "opacity-50" : ""}`}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="size-8 shrink-0 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: `${provider.color?.length > 7 ? provider.color : provider.color + "15"}`,
              }}
            >
              <ProviderIcon
                src={getIconPath()}
                alt={provider.name}
                size={30}
                className="object-contain rounded-lg max-w-[30px] max-h-[30px]"
                fallbackText={
                  provider.textIcon || provider.id.slice(0, 2).toUpperCase()
                }
                fallbackColor={provider.color}
              />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{provider.name}</h3>
              <div className="flex min-w-0 items-center gap-1.5 text-xs flex-wrap">
                {allDisabled ? (
                  <Badge variant="default" size="sm">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">
                        pause_circle
                      </span>
                      Disabled
                    </span>
                  </Badge>
                ) : (
                  <>
                    <Badge variant="default" size="sm">
                      {stats.total} Key
                    </Badge>
                    {getStatusDisplay(connected, error, errorCode)}
                    {isCompatible && (
                      <Badge variant="default" size="sm">
                        {provider.apiType === "responses"
                          ? "Responses"
                          : "Chat"}
                      </Badge>
                    )}
                    {isAnthropicCompatible && (
                      <Badge variant="default" size="sm">
                        Messages
                      </Badge>
                    )}
                    {errorTime && (
                      <span className="text-text-muted">{errorTime}</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {stats.total > 0 && (
              <div
                className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle(!allDisabled ? false : true);
                }}
              >
                <Toggle
                  size="sm"
                  checked={!allDisabled}
                  onChange={() => {}}
                  title={allDisabled ? "Aktifkan penyedia" : "Nonaktifkan penyedia"}
                />
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

ApiKeyProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
    apiType: PropTypes.string,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
};

function AddCompatibleModal({ isOpen, onClose, onCreated }) {
  const [baseUrl, setBaseUrl] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [apiKeys, setApiKeys] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setBaseUrl("");
      setIconUrl("");
      setApiKeys("");
      setChecking(false);
      setSaving(false);
      setValidation(null);
      setMessage("");
    }
  }, [isOpen]);

  const keyLines = () => Array.from(new Set(
    apiKeys.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  ));

  const handleCheck = async () => {
    const keys = keyLines();
    if (!baseUrl.trim() || !keys.length) {
      setMessage("Isi Base URL dan minimal satu API key.");
      return;
    }

    setChecking(true);
    setMessage("");
    setValidation(null);
    try {
      const data = await fetchProviderNodeValidation({
        baseUrl: baseUrl.trim(),
        apiKeys: keys,
      });
      if (data.error && !data.results) {
        setMessage(data.error);
        return;
      }
      setValidation(data);
      if (data.validCount > 0) {
        setMessage(
          data.validCount === data.total
            ? "Semua API key valid."
            : data.validCount + " key valid, " + data.invalidCount + " key tidak valid."
        );
      } else {
        setMessage(data.error || "Tidak ada API key yang valid.");
      }
    } catch (error) {
      setMessage(error?.name === "AbortError" ? "Pemeriksaan timeout (>15 detik)." : "Gagal memeriksa API key.");
    } finally {
      setChecking(false);
    }
  };

  const slugify = (value) => {
    const slug = value.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "provider";
  };

  const handleSave = async () => {
    if (!validation?.results?.length || validation.validCount === 0) {
      setMessage("Periksa API key terlebih dahulu.");
      return;
    }

    const keys = keyLines();
    const validResults = validation.results
      .filter((item) => item.valid && item.baseUrl && item.keyIndex >= 0 && item.keyIndex < keys.length)
      .map((item) => ({ ...item, apiKey: keys[item.keyIndex] }))
      .filter((item) => item.apiKey);
    if (!validResults.length) {
      setMessage("Tidak ada key valid untuk disimpan.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const groups = new Map();
      for (const item of validResults) {
        const groupKey = (item.detectedType || "openai-compatible") + "|" + item.baseUrl;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push(item);
      }

      let createdCount = 0;
      let skippedDuplicateCount = 0;
      let groupIndex = 0;

      for (const [, group] of groups) {
        groupIndex += 1;
        const detectedType = group[0].detectedType || "openai-compatible";
        const detectedBaseUrl = group[0].baseUrl;
        const providerName = (() => {
          try {
            const hostname = new URL(detectedBaseUrl).hostname.toLowerCase().replace(/^www\./, "");
            if (hostname === "generativelanguage.googleapis.com") return "Google AI Studio";
            const labels = hostname.split(".").filter(Boolean);
            const ignored = new Set(["api", "gateway", "openai", "compatible", "llm"]);
            const candidate = labels.length > 2 && ignored.has(labels[0]) ? labels[1] : labels.length > 2 ? labels[labels.length - 2] : labels[0];
            return (candidate || "penyedia-ai").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
          } catch { return "Penyedia AI"; }
        })();
        const prefix = slugify(providerName) + (groups.size > 1 ? "-" + groupIndex : "");

        const nodeRes = await fetch("/api/provider-nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: providerName + (groups.size > 1 ? " " + groupIndex : ""),
            prefix,
            iconUrl: iconUrl.trim(),
            baseUrl: detectedBaseUrl,
            type: detectedType,
            apiType: "chat",
          }),
        });
        let nodeData = null;
        try { nodeData = await nodeRes.json(); } catch { nodeData = null; }
        if (!nodeRes.ok || !nodeData?.node?.id) {
          throw new Error(nodeData?.error || ("Gagal membuat provider (HTTP " + nodeRes.status + ")."));
        }

        const providerRes = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: nodeData.node.id,
            // Unique names prevent name-based upserts from overwriting keys in the same batch.
            batch: group.map((item, index) => ({
              apiKey: item.apiKey,
              name: group.length > 1 ? providerName + " Key " + (index + 1) : providerName,
            })),
          }),
        });
        let providerData = null;
        try { providerData = await providerRes.json(); } catch { providerData = null; }
        if (!providerRes.ok) {
          throw new Error(providerData?.error || ("Gagal menyimpan API key (HTTP " + providerRes.status + ")."));
        }
        createdCount += Number(providerData.createdCount || 0);
        skippedDuplicateCount += Number(providerData.skippedDuplicateCount || 0);
      }

      if (createdCount > 0) {
        setMessage(
          createdCount + " API key baru berhasil disimpan." +
          (skippedDuplicateCount > 0 ? " " + skippedDuplicateCount + " key duplikat dilewati karena sudah tersimpan." : "")
        );
        await onCreated();
        window.setTimeout(onClose, 1200);
      } else {
        setMessage("Tidak ada key baru yang disimpan. Semua key valid tersebut sudah tersimpan sebelumnya.");
        await onCreated();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal menyimpan provider.");
    } finally {
      setSaving(false);
    }
  };

  const statusIcon = (result) => result.valid ? "check_circle" : "cancel";
  const statusClass = (result) => result.valid ? "text-green-500" : "text-red-500";

  return (
    <Modal isOpen={isOpen} title="Tambah Provider Compatible" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Input
          label="Base URL"
          value={baseUrl}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            if (validation) { setValidation(null); setMessage("Base URL berubah — jalankan Tes Key ulang sebelum menyimpan."); }
          }}
          placeholder="https://generativelanguage.googleapis.com/v1beta"
          hint="Google AI Studio akan diarahkan otomatis ke endpoint OpenAI-compatible yang benar. Nama penyedia dideteksi dari alamat."
        />
        <Input
          label="URL ikon resmi (opsional)"
          value={iconUrl}
          onChange={(e) => setIconUrl(e.target.value)}
          placeholder="https://chatgpt.com"
          hint="Gunakan URL HTTPS resmi provider."
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Kunci API (satu atau semua)</label>
          <textarea
            value={apiKeys}
            onChange={(e) => {
              setApiKeys(e.target.value);
              if (validation) { setValidation(null); setMessage("Kunci API berubah — jalankan Tes Key ulang sebelum menyimpan."); }
            }}
            onKeyDownCapture={(e) => { if (e.key === "Enter") e.stopPropagation(); }}
            rows={7}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs"
            placeholder={"key-pertama\nkey-kedua\nkey-ketiga"}
            spellCheck={false}
          />
          <p className="text-xs text-text-muted">Tempel banyak kunci sekaligus, satu kunci per baris. Baris kosong dan kunci duplikat diabaikan; kunci yang gagal validasi tidak disimpan.</p>
        </div>

        {validation?.results?.length > 0 && (
          <div className="rounded-lg border border-border bg-bg/50 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">Hasil pemeriksaan</span>
              <span className="text-text-muted">
                {validation.validCount}/{validation.total} valid
                {validation.detectedVersion ? " · " + validation.detectedVersion : ""}
                {validation.detectedType ? " · " + (validation.detectedType === "anthropic-compatible" ? "Anthropic Messages" : "OpenAI-compatible") : ""}
              </span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2">
                <div className="text-[11px] text-text-muted">Model terdeteksi</div>
                <div className="text-lg font-semibold text-text-main">{validation.modelCount ?? validation.models?.length ?? 0}</div>
              </div>
              <div className="rounded-lg bg-sky-500/10 px-3 py-2">
                <div className="text-[11px] text-text-muted">Paket gratis tersedia</div>
                <div className="text-lg font-semibold text-emerald-500">{validation.freeModelCount ?? 0}</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 px-3 py-2">
                <div className="text-[11px] text-text-muted">Paket berbayar tersedia</div>
                <div className="text-lg font-semibold text-amber-500">{validation.paidModelCount ?? 0}</div>
              </div>
              <div className="rounded-lg bg-violet-500/10 px-3 py-2">
                <div className="text-[11px] text-text-muted">Gratis & berbayar</div>
                <div className="text-lg font-semibold text-violet-500">{validation.bothPricingModelCount ?? 0}</div>
              </div>
              <div className="rounded-lg bg-surface-2 px-3 py-2">
                <div className="text-[11px] text-text-muted">Harga tidak diketahui</div>
                <div className="text-lg font-semibold text-text-main">{validation.unknownPricingModelCount ?? 0}</div>
              </div>
            </div>
            {(validation.supportedParameters?.length > 0 || validation.models?.some((model) => Array.isArray(model.supportedParameters) && model.supportedParameters.length > 0)) && (
              <div className="mb-3 rounded-lg border border-border bg-surface-2/50 p-2">
                <div className="mb-2 text-xs font-medium text-text-muted">Parameter yang terdeteksi</div>
                <div className="flex flex-wrap gap-1.5">
                  {(validation.supportedParameters || Array.from(new Set(validation.models.flatMap((model) => Array.isArray(model.supportedParameters) ? model.supportedParameters : [])))).map((parameter) => (
                    <span key={parameter} className="rounded bg-primary/10 px-2 py-1 text-[11px] text-primary">{parameter}</span>
                  ))}
                </div>
              </div>
            )}
            {validation.models?.length > 0 && (
              <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface-2/50 p-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-text-muted">Model yang terdeteksi</span>
                  {validation.pricingSource && <a href={validation.pricingSource} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">Sumber harga resmi</a>}
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {validation.models.map((model) => (
                    <div key={model.id} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs">
                      <span className="min-w-0 truncate font-mono">{model.id}</span>
                      <span className={
                        model.priceClass === "free"
                          ? "shrink-0 text-emerald-500"
                          : model.priceClass === "paid"
                            ? "shrink-0 text-amber-500"
                            : "shrink-0 text-text-muted"
                      }>
                        {model.priceClass === "free" ? "Paket gratis" : model.priceClass === "paid" ? "Berbayar saja" : model.priceClass === "both" ? "Gratis & berbayar" : "Harga belum diketahui"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex max-h-44 flex-col gap-2 overflow-y-auto">
              {validation.results.map((result, index) => (
                <div key={result.keyPreview + "-" + index} className="flex items-center gap-2 text-xs">
                  <span className={"material-symbols-outlined text-[17px] " + statusClass(result)}>{statusIcon(result)}</span>
                  <span className="font-mono">{result.keyPreview}</span>
                  <span className={result.valid ? "text-green-500" : "text-red-500"}>
                    {result.valid ? "Valid" : "Tidak valid"}
                  </span>
                  {result.detectedVersion && <span className="text-text-muted">({result.detectedVersion})</span>}
                  {result.error && <span className="truncate text-text-muted">{result.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {message && <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">{message}</div>}

        <div className="flex gap-2">
          <Button
            fullWidth
            variant="secondary"
            onClick={handleCheck}
            disabled={checking || saving || !baseUrl.trim() || !keyLines().length}
          >
            {checking ? "Mendeteksi..." : "Tes Key & Deteksi Model"}
          </Button>
          <Button
            fullWidth
            onClick={handleSave}
            disabled={saving || checking || !validation?.validCount}
          >
            {saving ? "Menyimpan..." : "Simpan Key Valid"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

AddCompatibleModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreated: PropTypes.func.isRequired,
};

function ProviderTestResultsView({ results }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState({});
  const [deletedIds, setDeletedIds] = useState({});
  const [deletingIds, setDeletingIds] = useState({});
  const [deletingAll, setDeletingAll] = useState(false);

  // Keep a local, credential-free recovery copy of completed failed-test results.
  useEffect(() => {
    if (results.running || !Array.isArray(results.results)) return;
    const failed = results.results.filter((item) => item && item.valid === false).map((item) => ({
      id: String(item.connectionId || item.id || ""),
      name: String(item.connectionName || "Koneksi tanpa nama"),
      provider: String(item.provider || ""),
      authType: String(item.authType || ""),
      httpStatus: item.statusCode ?? null,
      errorCode: item.errorCode || null,
      reason: String(item.error || item.diagnosis?.message || "Uji layanan gagal"),
      diagnosis: item.diagnosis?.type || null,
      testedAt: item.testedAt || results.testedAt || new Date().toISOString(),
    }));
    if (!failed.length) return;
    try {
      const key = "max-router-failed-service-tests";
      const previous = JSON.parse(window.localStorage.getItem(key) || "[]");
      const merged = new Map();
      for (const item of [...failed, ...(Array.isArray(previous) ? previous : [])]) {
        const identity = item.id || [item.provider, item.name, item.testedAt].join("|");
        if (!merged.has(identity)) merged.set(identity, item);
      }
      window.localStorage.setItem(key, JSON.stringify(Array.from(merged.values()).slice(0, 1000)));
    } catch (error) {
      console.warn("Local failed-account backup could not be saved:", error);
    }
  }, [results]);

  const handleDeleteAllFailed = async () => {
    const pending = items.filter((item) => item.valid === false && item.connectionId && !deletedIds[item.connectionId]);
    if (!pending.length || deletingAll) return;
    const confirmed = window.confirm(
      `Hapus ${pending.length} akun yang gagal dari layanan aktif? Arsip JSON lokal tetap disimpan. Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;
    setDeletingAll(true);
    const removed = [];
    const failed = [];
    try {
      for (let start = 0; start < pending.length; start += 4) {
        const chunk = pending.slice(start, start + 4);
        const outcomes = await Promise.all(chunk.map(async (item) => {
          const id = String(item.connectionId);
          try {
            const response = await fetch(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return { id, ok: true };
          } catch (error) {
            return { id, ok: false, error: error.message };
          }
        }));
        removed.push(...outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.id));
        failed.push(...outcomes.filter((outcome) => !outcome.ok));
      }
      setDeletedIds((current) => ({
        ...current,
        ...Object.fromEntries(removed.map((id) => [id, true])),
      }));
      if (removed.length) {
        try {
          const key = "max-router-failed-service-tests";
          const previous = JSON.parse(window.localStorage.getItem(key) || "[]");
          const deletedSet = new Set(removed);
          const next = (Array.isArray(previous) ? previous : []).map((item) => ({
            ...item,
            removedFromActiveServices: deletedSet.has(String(item.id)),
          }));
          window.localStorage.setItem(key, JSON.stringify(next.slice(0, 1000)));
        } catch (error) {
          console.warn("Could not update local archive deletion status:", error);
        }
      }
      window.alert(`Selesai: ${removed.length} akun dihapus, ${failed.length} gagal dihapus. Arsip lokal tetap tersedia.`);
    } finally {
      setDeletingAll(false);
    }
  };

  const handleDeleteFailedAccount = async (item, rowId) => {
    const id = item.connectionId || item.id;
    if (!id || deletingIds[rowId] || deletedIds[rowId]) return;
    setDeletingIds((current) => ({ ...current, [rowId]: true }));
    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setDeletedIds((current) => ({ ...current, [rowId]: true }));
    } catch (error) {
      window.alert(`Akun gagal dihapus: ${error.message}`);
    } finally {
      setDeletingIds((current) => ({ ...current, [rowId]: false }));
    }
  };
  if (results.error && !results.results) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 font-semibold text-red-500">
          <span className="material-symbols-outlined">error</span>
          Pengujian tidak dapat dijalankan
        </div>
        <p className="mt-2 text-sm text-text-main">{results.error}</p>
        {results.statusCode && <p className="mt-1 text-xs text-text-muted">HTTP {results.statusCode}</p>}
      </div>
    );
  }

  const { summary, mode } = results;
  const items = results.results || [];
  const modeLabel = {
    oauth: "OAuth", free: "Free", apikey: "Kunci API",
    provider: "Penyedia", compatible: "Kompatibel", all: "Semua koneksi",
  }[mode] || mode;
  const filteredItems = items.filter((item) => {
    const status = !item.valid ? "failed" : item.verified === false ? "unverified" : "passed";
    const matchesStatus = filter === "all" || filter === status;
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || [item.connectionName, item.provider, item.error, item.diagnosis?.message, item.diagnosis?.type]
      .some((value) => String(value || "").toLowerCase().includes(needle));
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <span className="block text-xs text-text-muted">Diperiksa</span>
            <strong className="text-xl tabular-nums">{summary.total}</strong>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <span className="block text-xs text-text-muted">Berhasil</span>
            <strong className="text-xl text-emerald-500 tabular-nums">{summary.passed}</strong>
          </div>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <span className="block text-xs text-text-muted">Gagal</span>
            <strong className="text-xl text-red-500 tabular-nums">{summary.failed}</strong>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <span className="block text-xs text-text-muted">Belum terverifikasi</span>
            <strong className="text-xl text-amber-500 tabular-nums">{summary.unverified || 0}</strong>
          </div>
        </div>
      )}
      {results.progress && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-text-main">{results.running ? "Pengujian sedang berjalan..." : "Pengujian selesai"}</span>
            <span className="tabular-nums text-text-muted">{results.progress.completed} / {results.progress.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: (results.progress.total ? Math.min(100, (results.progress.completed / results.progress.total) * 100) : 0) + "%" }} />
          </div>
          {results.running && <p className="mt-2 text-[11px] text-text-muted">Koneksi diuji bertahap untuk mencegah timeout dan mengurangi tekanan pada database.</p>}
        </div>
      )}
      {results.error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-500">Batch berhenti: {results.error}. Hasil yang sudah selesai tetap ditampilkan.</div>}
      {items.some((item) => item.valid === false && item.connectionId && !deletedIds[item.connectionId]) && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-main">Kelola akun gagal</p>
            <p className="text-xs text-text-muted">Akun gagal dapat dihapus sekaligus. Salinan metadata tersimpan otomatis di local storage browser ini.</p>
          </div>
          <button
            type="button"
            onClick={handleDeleteAllFailed}
            disabled={deletingAll}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-wait disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-base">delete_sweep</span>
            {deletingAll ? "Menghapus bertahap..." : `Hapus semua akun gagal (${items.filter((item) => item.valid === false && item.connectionId && !deletedIds[item.connectionId]).length})`}
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <label htmlFor="provider-test-search" className="sr-only">Cari hasil pengujian</label>
          <Input id="provider-test-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari akun, provider, atau pesan error..." />
        </div>
        <label htmlFor="provider-test-filter" className="sr-only">Filter hasil</label>
        <select id="provider-test-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text-main">
          <option value="all">Semua hasil ({items.length})</option>
          <option value="passed">Berhasil ({items.filter((item) => item.valid && item.verified !== false).length})</option>
          <option value="failed">Gagal ({items.filter((item) => !item.valid).length})</option>
          <option value="unverified">Belum terverifikasi ({items.filter((item) => item.valid && item.verified === false).length})</option>
        </select>
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{modeLabel} · {filteredItems.length} dari {items.length} hasil</span>
        <span>{results.testedAt ? new Date(results.testedAt).toLocaleString() : ""}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {filteredItems.map((r, i) => {
          const rowId = r.connectionId || String(i);
          const isOpen = !!expanded[rowId];
          const statusLabel = !r.valid ? "GAGAL" : r.verified === false ? "BELUM DIVERIFIKASI" : "BERHASIL";
          const statusClass = !r.valid ? "bg-red-500/15 text-red-500" : r.verified === false ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500";
          return (
            <div key={rowId} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-3 sm:flex-nowrap">
                <span className={`material-symbols-outlined text-lg ${!r.valid ? "text-red-500" : r.verified === false ? "text-amber-500" : "text-emerald-500"}`}>
                  {!r.valid ? "error" : r.verified === false ? "help" : "check_circle"}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text-main">{r.connectionName || "Koneksi tanpa nama"}</span>
                  <span className="block truncate text-xs text-text-muted">{r.provider} · {r.authType || "auth tidak diketahui"}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.statusCode && <span className="font-mono text-xs text-text-muted">HTTP {r.statusCode}</span>}
                  <span className="font-mono text-xs text-text-muted">{r.latencyMs ?? 0} ms</span>
                  <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusClass}`}>{statusLabel}</span>
                </div>
                {!r.valid && r.connectionId && (
                  <button
                    type="button"
                    disabled={!!deletingIds[rowId] || !!deletedIds[rowId]}
                    onClick={() => handleDeleteFailedAccount(r, rowId)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 px-2 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Hapus akun gagal dari layanan aktif"
                  >
                    <span className="material-symbols-outlined text-base">{deletedIds[rowId] ? "check_circle" : "delete"}</span>
                    {deletedIds[rowId] ? "Terhapus" : deletingIds[rowId] ? "Menghapus..." : "Hapus akun"}
                  </button>
                )}
                <button type="button" onClick={() => setExpanded((current) => ({ ...current, [rowId]: !current[rowId] }))} aria-expanded={isOpen} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-500 hover:bg-surface-2">
                  <span>{isOpen ? "Tutup log" : "Detail & log"}</span>
                  <span className="material-symbols-outlined text-base">{isOpen ? "expand_less" : "expand_more"}</span>
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-border bg-surface-2 p-3 text-xs">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div><span className="text-text-muted">Diagnosis</span><p className="mt-0.5 font-medium text-text-main">{r.diagnosis?.type || (r.valid ? "connection_ok" : "provider_error")}</p></div>
                    <div><span className="text-text-muted">Waktu tes</span><p className="mt-0.5 text-text-main">{r.testedAt ? new Date(r.testedAt).toLocaleString() : "Tidak tersedia"}</p></div>
                    <div><span className="text-text-muted">Refresh token</span><p className="mt-0.5 text-text-main">{r.refreshed ? "Berhasil diperbarui" : "Tidak dilakukan"}</p></div>
                    <div><span className="text-text-muted">HTTP</span><p className="mt-0.5 text-text-main">{r.statusCode || "Tidak ada respons HTTP"}</p></div>
                  </div>
                  {(r.error || r.diagnosis?.message) && (
                    <div className="mt-3 rounded-lg border border-red-500/15 bg-red-500/5 p-3">
                      <p className="font-semibold text-text-main">Pesan error / diagnosis</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-text-muted">{r.error || r.diagnosis?.message}</p>
                      {r.error && r.diagnosis?.message && <p className="mt-1 whitespace-pre-wrap break-words text-text-muted">{r.diagnosis.message}</p>}
                    </div>
                  )}
                  {r.diagnosis?.action && <p className="mt-2 text-text-muted">Tindakan: {r.diagnosis.action}</p>}
                  {!r.error && !r.diagnosis?.message && <p className="mt-2 text-emerald-500">Pemeriksaan koneksi berhasil. Ini belum tentu merupakan uji generasi model.</p>}
                </div>
              )}
            </div>
          );
        })}
        {filteredItems.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-muted">Tidak ada hasil yang cocok dengan filter.</div>}
      </div>
    </div>
  );
}
ProviderTestResultsView.propTypes = {
  results: PropTypes.shape({
    mode: PropTypes.string,
    results: PropTypes.array,
    summary: PropTypes.shape({
      total: PropTypes.number,
      passed: PropTypes.number,
      failed: PropTypes.number,
    }),
    error: PropTypes.string,
  }).isRequired,
};
