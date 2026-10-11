
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
    return await res.json();
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
  const notify = useNotificationStore();
  const searchQuery = useHeaderSearchStore((s) => s.query);
  const registerSearch = useHeaderSearchStore((s) => s.register);
  const unregisterSearch = useHeaderSearchStore((s) => s.unregister);

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

  const handleBatchTest = async (mode, providerId = null) => {
    if (testingMode) return;
    setTestingMode(mode === "provider" ? providerId : mode);
    setTestResults(null);
    try {
      const res = await fetch("/api/providers/test-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, providerId }),
      });
      const data = await res.json();
      setTestResults(data);
      if (data.summary) {
        const { passed, failed, total } = data.summary;
        if (failed === 0) notify.success(`Semua ${total} pengujian berhasil`);
        else notify.warning(`${passed}/${total} berhasil, ${failed} gagal`);
      }
    } catch (error) {
      setTestResults({ error: "Permintaan pengujian gagal" });
      notify.error("Pengujian penyedia gagal");
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

    for (const node of providerNodes) {
      const haystack = [
        node.id,
        node.name,
        node.baseUrl,
        node.providerSpecificData?.nodeName,
      ].filter(Boolean).join(" ").toLowerCase();

      if (haystack.includes("xkiro")) add(node.id || "xkiro", "xKiro", "apikey", node);
      if (haystack.includes("atria")) add(node.id || "atria", "Atria", "apikey", node);
    }

    for (const connection of connections) {
      const haystack = [
        connection.provider,
        connection.name,
        connection.email,
        connection.providerSpecificData?.nodeName,
        connection.providerSpecificData?.baseUrl,
      ].filter(Boolean).join(" ").toLowerCase();

      if (haystack.includes("xkiro")) add(connection.provider || "xkiro", "xKiro", connection.authType, null);
      if (haystack.includes("atria")) add(connection.provider || "atria", "Atria", connection.authType, null);
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

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Penyedia</h1>
          <p className="text-sm text-text-muted">Kelola integrasi tersimpan dan tambahkan provider OpenAI/Anthropic Compatible.</p>
        </div>
        <Button icon="add" onClick={() => setIsAddCompatibleOpen(true)}>
          Tambah Kompatibel
        </Button>
      </div>

      {!hasAnyResult && (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <span className="material-symbols-outlined text-[32px] text-text-muted mb-2">
            cloud_off
          </span>
          <p className="text-text-muted text-sm">Belum ada integrasi xKiro atau Atria yang tersimpan.</p>
        </div>
      )}

      {savedProviderEntries.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg sm:text-xl font-semibold">Integrasi Tersimpan</h2>
            <p className="text-sm text-text-muted">
              Hanya koneksi xKiro dan Atria yang tersimpan di MAX Router.
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
    const validResults = validation.results.filter((item) => item.valid && item.baseUrl).map((item) => ({ ...item, apiKey: keys[item.keyIndex] })).filter((item) => item.apiKey);
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
        const nodeData = await nodeRes.json();
        if (!nodeRes.ok || !nodeData?.node?.id) {
          throw new Error(nodeData?.error || "Gagal membuat provider.");
        }

        const providerRes = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: nodeData.node.id,
            batch: group.map((item) => ({ apiKey: item.apiKey })),
          }),
        });
        const providerData = await providerRes.json();
        if (!providerRes.ok) {
          throw new Error(providerData?.error || "Gagal menyimpan API key.");
        }
        createdCount += Number(providerData.createdCount || group.length);
      }

      setMessage(createdCount + " API key valid berhasil disimpan.");
      await onCreated();
      setTimeout(onClose, 500);
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
          onChange={(e) => setBaseUrl(e.target.value)}
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
            onChange={(e) => setApiKeys(e.target.value)}
            onKeyDownCapture={(e) => { if (e.key === "Enter") e.stopPropagation(); }}
            rows={7}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs"
            placeholder={"key-pertama\\nkey-kedua\\nkey-ketiga"}
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
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2">
                <div className="text-[11px] text-text-muted">Model terdeteksi</div>
                <div className="text-lg font-semibold text-text-main">{validation.modelCount ?? validation.models?.length ?? 0}</div>
              </div>
              <div className="rounded-lg bg-sky-500/10 px-3 py-2">
                <div className="text-[11px] text-text-muted">Gratis</div>
                <div className="text-lg font-semibold text-emerald-500">{validation.freeModelCount ?? 0}</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 px-3 py-2">
                <div className="text-[11px] text-text-muted">Berbayar</div>
                <div className="text-lg font-semibold text-amber-500">{validation.paidModelCount ?? 0}</div>
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
                <div className="mb-2 text-xs font-medium text-text-muted">Model yang terdeteksi</div>
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
                        {model.priceClass === "free" ? "Gratis" : model.priceClass === "paid" ? "Berbayar" : "Harga tidak diketahui"}
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
  if (results.error && !results.results) {
    return (
      <div className="text-center py-6">
        <span className="material-symbols-outlined text-red-500 text-[32px] mb-2 block">
          error
        </span>
        <p className="text-sm text-red-400">{results.error}</p>
      </div>
    );
  }

  const { summary, mode } = results;
  const items = results.results || [];
  const modeLabel =
    {
      oauth: "OAuth",
      free: "Free",
      apikey: "Kunci API",
      provider: "Penyedia",
      all: "Semua",
    }[mode] || mode;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {summary && (
        <div className="flex flex-wrap items-center gap-2 text-xs mb-1 sm:gap-3">
          <span className="text-text-muted">{modeLabel} Test</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
            {summary.passed} berhasil
          </span>
          {summary.failed > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
              {summary.failed} gagal
            </span>
          )}
          <span className="text-text-muted sm:ml-auto">
            {summary.total} diuji
          </span>
        </div>
      )}
      {items.map((r, i) => (
        <div
          key={r.connectionId || i}
          className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-black/[0.03] px-3 py-2 text-xs dark:bg-white/[0.03] sm:flex-nowrap"
        >
          <span
            className={`material-symbols-outlined text-[16px] ${r.valid ? "text-emerald-500" : "text-red-500"}`}
          >
            {r.valid ? "check_circle" : "error"}
          </span>
          <div className="min-w-0 flex-[1_1_160px]">
            <span className="block truncate font-medium sm:inline">
              {r.connectionName}
            </span>
            <span className="block truncate text-text-muted sm:ml-1.5 sm:inline">
              ({r.provider})
            </span>
          </div>
          {r.latencyMs !== undefined && (
            <span className="shrink-0 text-text-muted font-mono tabular-nums">
              {r.latencyMs}ms
            </span>
          )}
          <span
            className={`shrink-0 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
              r.valid
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {r.valid ? "OK" : r.diagnosis?.type || "ERROR"}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-center py-4 text-text-muted text-sm">
          Tidak ada koneksi aktif pada kelompok ini.
        </div>
      )}
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
