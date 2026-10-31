import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Card, Badge, Button, Modal, Select, Toggle, EditConnectionModal, ConfirmModal } from "@/shared/components";

// Compact usage loader. The backend already exposes per-connection allowance,
// local model usage and wallet data, so the table can stay dense without losing detail.
function ConnectionTableRow({
  connection,
  index,
  total,
  proxyPools,
  isSelected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onUpdateProxy,
  onEdit,
  onDelete,
  onTest,
  testing,
}) {
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);

  const loadUsage = useCallback(async () => {
    if (!connection.id || connection.isActive === false) return;
    setUsageLoading(true);
    try {
      const res = await fetch("/api/usage/" + encodeURIComponent(connection.id), { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data && !data.error) setUsage(data);
    } catch {
      // Usage is supplementary; connection management must continue to work.
    } finally {
      setUsageLoading(false);
    }
  }, [connection.id, connection.isActive]);

  useEffect(() => {
    loadUsage();
    const timer = window.setInterval(loadUsage, 60000);
    return () => window.clearInterval(timer);
  }, [loadUsage]);

  const formatNumber = (value) =>
    value === null || value === undefined ? "—" : Number(value).toLocaleString("id-ID");

  const free = usage?.free_tokens || {};
  const shortWindow = Array.isArray(usage?.windows)
    ? usage.windows.find((window) => window.kind === "short")
    : null;
  const modelUsage = usage?.local?.byModel || {};
  const model = connection.defaultModel || Object.keys(modelUsage)[0] || "—";
  const selectedModelUsage = modelUsage[model];
  const proxyPool = proxyPools.find((pool) => pool.id === connection.providerSpecificData?.proxyPoolId);

  const status =
    connection.isActive === false
      ? "nonaktif"
      : connection.testStatus === "active" || connection.testStatus === "success"
        ? "aktif"
        : connection.testStatus === "error" || connection.testStatus === "unavailable"
          ? "error"
          : "belum diuji";

  const statusVariant = status === "aktif" ? "success" : status === "error" ? "error" : "default";
  const keyText = connection.apiKey
    ? "••••" + String(connection.apiKey).slice(-4)
    : connection.email
      ? connection.email
      : "Tidak ada key";

  return (
    <tr className={`border-t border-border/70 align-top hover:bg-white/[0.02] ${connection.isActive === false ? "opacity-60" : ""}`}>
      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(connection.id)}
          aria-label={`Pilih koneksi ${index + 1}`}
          className="size-4 accent-primary"
        />
      </td>
      <td className="px-3 py-3 text-center">
        <div className="flex flex-col items-center">
          <span className="text-xs font-semibold">#{index + 1}</span>
          <div className="mt-1 flex">
            <button
              type="button"
              disabled={index === 0}
              onClick={onMoveUp}
              className="rounded p-0.5 text-text-muted hover:text-primary disabled:opacity-25"
              title="Naikkan prioritas"
            >
              <span className="material-symbols-outlined text-[16px]">keyboard_arrow_up</span>
            </button>
            <button
              type="button"
              disabled={index === total - 1}
              onClick={onMoveDown}
              className="rounded p-0.5 text-text-muted hover:text-primary disabled:opacity-25"
              title="Turunkan prioritas"
            >
              <span className="material-symbols-outlined text-[16px]">keyboard_arrow_down</span>
            </button>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 min-w-[170px]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-text-muted">key</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" title={connection.name || connection.email || "Koneksi"}>
              {connection.name || connection.email || "Koneksi tanpa nama"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={statusVariant} size="sm" dot>{status === "aktif" ? "Aktif" : status === "nonaktif" ? "Nonaktif" : status === "error" ? "Error" : "Belum diuji"}</Badge>
              {proxyPool && <Badge variant="default" size="sm">Proxy: {proxyPool.name}</Badge>}
            </div>
          </div>
        </div>
        {connection.lastError && (
          <div className="mt-2 max-w-[300px] truncate text-[10px] text-red-500" title={connection.lastError}>
            {connection.lastError}
          </div>
        )}
      </td>
      <td className="px-3 py-3 min-w-[150px]">
        <div className="font-mono text-xs text-text-main">{keyText}</div>
        <div className="mt-1 text-[10px] text-text-muted">
          {connection.authType || "apikey"} · priority {connection.priority ?? index}
        </div>
      </td>
      <td className="px-3 py-3 min-w-[280px]">
        {usage ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border bg-sidebar/20 px-2 py-1.5">
              <div className="text-[9px] text-text-muted">Paket</div>
              <div className="truncate text-[11px] font-medium">{usage.plan || "Tanpa paket"}</div>
            </div>
            <div className="rounded-md border border-border bg-sidebar/20 px-2 py-1.5">
              <div className="text-[9px] text-text-muted">Token gratis</div>
              <div className="text-[11px] font-medium">{formatNumber(free.remaining)}{free.limit_per_day ? ` / ${formatNumber(free.limit_per_day)}` : ""}</div>
            </div>
            <div className="rounded-md border border-border bg-sidebar/20 px-2 py-1.5">
              <div className="text-[9px] text-text-muted">Request lokal</div>
              <div className="text-[11px] font-medium">{formatNumber(selectedModelUsage?.requests)}</div>
            </div>
            <div className="rounded-md border border-border bg-sidebar/20 px-2 py-1.5">
              <div className="text-[9px] text-text-muted">Saldo</div>
              <div className="text-[11px] font-medium">{usage.wallet?.balance_usd != null ? "$" + usage.wallet.balance_usd : "—"}</div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-text-muted">{usageLoading ? "Memuat pemakaian..." : connection.isActive === false ? "Koneksi nonaktif" : "Belum ada data pemakaian"}</div>
        )}
      </td>
      <td className="px-3 py-3 min-w-[230px]">
        <div className="font-mono text-[11px] truncate" title={model}>{model}</div>
        {selectedModelUsage && (
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-text-muted">
            <span>In {formatNumber(selectedModelUsage.inputTokens)}</span>
            <span>Out {formatNumber(selectedModelUsage.outputTokens)}</span>
            <span>Cache {formatNumber(selectedModelUsage.cacheReadTokens)}</span>
          </div>
        )}
        {shortWindow && (
          <div className="mt-1 text-[10px] text-text-muted">
            Jendela: {shortWindow.remaining_usd != null ? "$" + shortWindow.remaining_usd : "—"}
          </div>
        )}
      </td>
      <td className="px-3 py-3 min-w-[230px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1.5 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[14px] ${testing ? "animate-spin" : ""}`}>{testing ? "progress_activity" : "play_arrow"}</span>
            {testing ? "Tes..." : "Tes"}
          </button>
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[10px] text-text-muted hover:text-primary">
            <span className="material-symbols-outlined text-[14px]">edit</span> Edit
          </button>
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-md border border-red-500/20 px-2 py-1.5 text-[10px] text-red-500 hover:bg-red-500/10">
            <span className="material-symbols-outlined text-[14px]">delete</span> Hapus
          </button>
          <Toggle size="sm" checked={connection.isActive ?? true} onChange={onToggleActive} title={connection.isActive === false ? "Aktifkan" : "Nonaktifkan"} />
          {(proxyPools.length > 0) && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setProxyOpen((open) => !open)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[10px] text-text-muted hover:text-primary"
              >
                <span className="material-symbols-outlined text-[14px]">lan</span> Proxy
              </button>
              {proxyOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-bg p-1 shadow-xl">
                  <button type="button" onClick={() => { onUpdateProxy(null); setProxyOpen(false); }} className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-surface-2">Tanpa proxy</button>
                  {proxyPools.map((pool) => (
                    <button key={pool.id} type="button" onClick={() => { onUpdateProxy(pool.id); setProxyOpen(false); }} className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-surface-2">{pool.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-1 text-[10px] text-text-muted">
          Diuji: {connection.lastTested ? new Date(connection.lastTested).toLocaleString("id-ID") : "belum"}
        </div>
      </td>
    </tr>
  );
}

ConnectionTableRow.propTypes = {
  connection: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  proxyPools: PropTypes.array,
  isSelected: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onUpdateProxy: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onTest: PropTypes.func.isRequired,
  testing: PropTypes.bool,
};

function AddApiKeyModal({ isOpen, provider, providerName, proxyPools, onSave, onClose }) {
  const [formData, setFormData] = useState({
    name: "",
    apiKey: "",
    priority: 1,
    proxyPoolId: "__none__",
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFormData({ name: "", apiKey: "", priority: 1, proxyPoolId: "__none__" });
      setResult(null);
      setSaveError("");
      setSaving(false);
    }
  }, [isOpen]);

  const testKey = async () => {
    if (!formData.apiKey) return;
    setTesting(true);
    try {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: formData.apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      setResult(data.valid ? { ok: true, text: "Key valid" } : { ok: false, text: data.error || "Key tidak valid" });
    } catch (error) {
      setResult({ ok: false, text: error.message || "Validasi gagal" });
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    if (!formData.name.trim() || !formData.apiKey.trim() || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave({
        name: formData.name.trim(),
        apiKey: formData.apiKey.trim(),
        priority: Number(formData.priority) || 1,
        proxyPoolId: formData.proxyPoolId === "__none__" ? null : formData.proxyPoolId,
        testStatus: result?.ok ? "active" : "unknown",
      });
    } catch (error) {
      setSaveError(error?.message || "Gagal menyimpan API key. Periksa koneksi dan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={`Tambah key — ${providerName || provider}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs text-text-muted">Nama</label>
          <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" placeholder="Production Key" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-muted">API Key</label>
          <div className="flex gap-2">
            <input type="password" value={formData.apiKey} onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary" placeholder="Masukkan API key" />
            <Button variant="secondary" onClick={testKey} disabled={!formData.apiKey || testing}>{testing ? "Tes..." : "Tes key"}</Button>
          </div>
        </div>
        {result && <Badge variant={result.ok ? "success" : "error"}>{result.text}</Badge>}
        {saveError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{saveError}</div>}
        <div>
          <label className="mb-1 block text-xs text-text-muted">Prioritas</label>
          <input type="number" min="0" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <Select
          label="Proxy Pool"
          value={formData.proxyPoolId}
          onChange={(e) => setFormData({ ...formData, proxyPoolId: e.target.value })}
          options={[{ value: "__none__", label: "Tanpa proxy" }, ...proxyPools.map((pool) => ({ value: pool.id, label: pool.name }))]}
        />
        <div className="flex gap-2">
          <Button fullWidth onClick={submit} disabled={!formData.name.trim() || !formData.apiKey.trim() || saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          <Button fullWidth variant="ghost" onClick={onClose} disabled={saving}>Batal</Button>
        </div>
      </div>
    </Modal>
  );
}

AddApiKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  provider: PropTypes.string.isRequired,
  providerName: PropTypes.string,
  proxyPools: PropTypes.array,
  onSave: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default function ConnectionsCard({ providerId, isOAuth = false, providerName }) {
  const [connections, setConnections] = useState([]);
  const [proxyPools, setProxyPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [providerStrategy, setProviderStrategy] = useState(null);
  const [providerStickyLimit, setProviderStickyLimit] = useState("1");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [keyFilter, setKeyFilter] = useState("all");
  const [sortBy, setSortBy] = useState("priority");
  const [selectedIds, setSelectedIds] = useState([]);
  const [testingIds, setTestingIds] = useState([]);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const [connRes, proxyRes, settingsRes] = await Promise.all([
        fetch("/api/providers", { cache: "no-store" }),
        fetch("/api/proxy-pools?isActive=true", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const connData = await connRes.json().catch(() => ({}));
      const proxyData = await proxyRes.json().catch(() => ({}));
      const settingsData = settingsRes.ok ? await settingsRes.json().catch(() => ({})) : {};
      if (connRes.ok) setConnections((connData.connections || []).filter((connection) => connection.provider === providerId));
      if (proxyRes.ok) setProxyPools(proxyData.proxyPools || []);
      const override = (settingsData.providerStrategies || {})[providerId] || {};
      setProviderStrategy(override.fallbackStrategy || null);
      setProviderStickyLimit(override.stickyRoundRobinLimit != null ? String(override.stickyRoundRobinLimit) : "1");
    } catch (error) {
      console.error("ConnectionsCard fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  const saveStrategy = async (strategy, stickyLimit) => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = res.ok ? await res.json().catch(() => ({})) : {};
      const current = data.providerStrategies || {};
      const override = {};
      if (strategy) override.fallbackStrategy = strategy;
      if (strategy === "round-robin" && stickyLimit !== "") override.stickyRoundRobinLimit = Number(stickyLimit) || 3;
      const updated = { ...current };
      if (Object.keys(override).length === 0) delete updated[providerId];
      else updated[providerId] = override;
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerStrategies: updated }),
      });
    } catch (error) {
      console.error("saveStrategy error:", error);
    }
  };

  const handleTest = async (id) => {
    setTestingIds((prev) => [...new Set([...prev, id])]);
    try {
      await fetch(`/api/providers/${id}/test`, { method: "POST" });
      await fetch_();
    } catch (error) {
      console.error("test connection error:", error);
    } finally {
      setTestingIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleTestAll = async () => {
    if (testingIds.length || connections.length === 0) return;
    for (const connection of connections) {
      await handleTest(connection.id);
    }
  };

  const handleDelete = (id) => {
    setConfirmState({
      title: "Hapus koneksi",
      message: "Koneksi ini akan dihapus dari database. Lanjutkan?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
          if (res.ok) {
            setConnections((prev) => prev.filter((connection) => connection.id !== id));
            setSelectedIds((prev) => prev.filter((item) => item !== id));
          }
        } catch (error) {
          console.error("delete connection error:", error);
        }
      },
    });
  };

  const handleToggleActive = async (id, isActive) => {
    const previous = connections.find((connection) => connection.id === id);
    setConnections((prev) => prev.map((connection) => connection.id === id ? { ...connection, isActive } : connection));
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) setConnections((prev) => prev.map((connection) => connection.id === id ? previous : connection));
    } catch {
      setConnections((prev) => prev.map((connection) => connection.id === id ? previous : connection));
    }
  };

  const handleUpdateProxy = async (id, proxyPoolId) => {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyPoolId: proxyPoolId || null }),
      });
      if (res.ok) {
        setConnections((prev) => prev.map((connection) =>
          connection.id === id
            ? { ...connection, providerSpecificData: { ...(connection.providerSpecificData || {}), proxyPoolId: proxyPoolId || null } }
            : connection
        ));
      }
    } catch (error) {
      console.error("proxy update error:", error);
    }
  };

  const handleMove = async (index, direction) => {
    const sorted = [...connections].sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0));
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    setConnections(sorted.map((connection, idx) => ({ ...connection, priority: idx })));
    try {
      await Promise.all(sorted.map((connection, idx) =>
        fetch(`/api/providers/${connection.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: idx }),
        })
      ));
    } catch {
      await fetch_();
    }
  };

  const handleUpdateConnection = async (formData) => {
    if (!selectedConnection) return;
    try {
      const res = await fetch(`/api/providers/${selectedConnection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetch_();
        setShowEditModal(false);
        setSelectedConnection(null);
      }
    } catch (error) {
      console.error("update connection error:", error);
    }
  };

  const handleSaveApiKey = async (formData) => {
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: providerId, ...formData }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || `Gagal menyimpan API key (HTTP ${res.status}).`);
    }
    if (data.createdCount === 0 && data.skippedDuplicateCount > 0) {
      throw new Error(data.message || "API key ini sudah tersimpan untuk provider tersebut.");
    }
    await fetch_();
    setShowAddModal(false);
    return data;
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const filteredConnections = connections
    .filter((connection) => {
      const haystack = [
        connection.name,
        connection.email,
        connection.apiKey,
        connection.defaultModel,
        connection.lastError,
      ].filter(Boolean).join(" ").toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (statusFilter === "active" && connection.isActive === false) return false;
      if (statusFilter === "inactive" && connection.isActive !== false) return false;
      if (statusFilter === "error" && !["error", "unavailable", "expired"].includes(connection.testStatus)) return false;
      if (statusFilter === "untested" && ["active", "success"].includes(connection.testStatus)) return false;
      if (keyFilter === "with-key" && !connection.apiKey) return false;
      if (keyFilter === "without-key" && connection.apiKey) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name") return String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""));
      if (sortBy === "status") return String(a.testStatus || "").localeCompare(String(b.testStatus || ""));
      if (sortBy === "tested") return new Date(b.lastTested || 0) - new Date(a.lastTested || 0);
      return Number(a.priority ?? 0) - Number(b.priority ?? 0);
    });

  const allFilteredSelected = filteredConnections.length > 0 && filteredConnections.every((connection) => selectedIds.includes(connection.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredConnections.some((connection) => connection.id === id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...filteredConnections.map((connection) => connection.id)])]);
    }
  };

  const bulkToggle = async (isActive) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    await Promise.all(ids.map((id) => handleToggleActive(id, isActive)));
    setSelectedIds([]);
  };

  const bulkDelete = () => {
    if (!selectedIds.length) return;
    setConfirmState({
      title: "Hapus koneksi terpilih",
      message: `Sebanyak ${selectedIds.length} koneksi akan dihapus permanen dari database.`,
      onConfirm: async () => {
        const ids = [...selectedIds];
        setConfirmState(null);
        await Promise.all(ids.map((id) => fetch(`/api/providers/${id}`, { method: "DELETE" })));
        setSelectedIds([]);
        await fetch_();
      },
    });
  };

  if (loading) {
    return <Card><div className="h-28 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" /></Card>;
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Koneksi API Key</h2>
                <Badge size="sm">{connections.length} koneksi</Badge>
              </div>
              <p className="mt-1 text-xs text-text-muted">Kelola key, status, pemakaian, prioritas, proxy, dan pengujian tanpa menampilkan prefix internal.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" icon="add" onClick={() => setShowAddModal(true)}>Tambah Key</Button>
              <button
                type="button"
                onClick={handleTestAll}
                disabled={testingIds.length > 0 || connections.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[15px] ${testingIds.length ? "animate-spin" : ""}`}>{testingIds.length ? "progress_activity" : "playlist_play"}</span>
                {testingIds.length ? `Menguji ${testingIds.length}/${connections.length}` : "Tes Semua"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(220px,1fr)_160px_160px_160px]">
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] text-text-muted">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-xs outline-none focus:border-primary"
                placeholder="Cari nama, email, model, error..."
              />
            </div>
            <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={[
              { value: "all", label: "Semua status" },
              { value: "active", label: "Aktif" },
              { value: "inactive", label: "Nonaktif" },
              { value: "error", label: "Error" },
              { value: "untested", label: "Belum diuji" },
            ]} />
            <Select label="API Key" value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)} options={[
              { value: "all", label: "Semua key" },
              { value: "with-key", label: "Ada key" },
              { value: "without-key", label: "Tanpa key" },
            ]} />
            <Select label="Urutkan" value={sortBy} onChange={(e) => setSortBy(e.target.value)} options={[
              { value: "priority", label: "Prioritas" },
              { value: "name", label: "Nama" },
              { value: "status", label: "Status" },
              { value: "tested", label: "Terakhir diuji" },
            ]} />
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <span className="text-xs font-medium">{selectedIds.length} dipilih</span>
              <button type="button" onClick={() => bulkToggle(true)} className="rounded-md border border-border px-2 py-1 text-[10px] hover:text-primary">Aktifkan</button>
              <button type="button" onClick={() => bulkToggle(false)} className="rounded-md border border-border px-2 py-1 text-[10px] hover:text-primary">Nonaktifkan</button>
              <button type="button" onClick={bulkDelete} className="rounded-md border border-red-500/20 px-2 py-1 text-[10px] text-red-500 hover:bg-red-500/10">Hapus terpilih</button>
              <button type="button" onClick={() => setSelectedIds([])} className="ml-auto text-[10px] text-text-muted hover:text-text-main">Batal pilih</button>
            </div>
          )}
        </div>

        {filteredConnections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <span className="material-symbols-outlined text-[30px] text-text-muted">key_off</span>
            <p className="mt-2 text-sm font-medium">{connections.length ? "Tidak ada koneksi yang cocok" : "Belum ada API key"}</p>
            <p className="mt-1 text-xs text-text-muted">{connections.length ? "Ubah filter atau pencarian." : "Tambahkan key pertama untuk provider ini."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1250px] border-collapse text-left">
              <thead className="bg-sidebar/60">
                <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                  <th className="px-3 py-3 text-center"><input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="size-4 accent-primary" aria-label="Pilih semua" /></th>
                  <th className="px-3 py-3 text-center">No</th>
                  <th className="px-3 py-3">Nama</th>
                  <th className="px-3 py-3">API Key</th>
                  <th className="px-3 py-3">Pemakaian & Sisa</th>
                  <th className="px-3 py-3">Model / I-O</th>
                  <th className="px-3 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredConnections.map((connection, index) => (
                  <ConnectionTableRow
                    key={connection.id}
                    connection={connection}
                    index={index}
                    total={filteredConnections.length}
                    proxyPools={proxyPools}
                    isSelected={selectedIds.includes(connection.id)}
                    onSelect={toggleSelect}
                    onMoveUp={() => handleMove(index, -1)}
                    onMoveDown={() => handleMove(index, 1)}
                    onToggleActive={(active) => handleToggleActive(connection.id, active)}
                    onUpdateProxy={(poolId) => handleUpdateProxy(connection.id, poolId)}
                    onEdit={() => { setSelectedConnection(connection); setShowEditModal(true); }}
                    onDelete={() => handleDelete(connection.id)}
                    onTest={() => handleTest(connection.id)}
                    testing={testingIds.includes(connection.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddApiKeyModal
        isOpen={showAddModal}
        provider={providerId}
        providerName={providerName}
        proxyPools={proxyPools}
        onSave={handleSaveApiKey}
        onClose={() => setShowAddModal(false)}
      />

      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        proxyPools={proxyPools}
        onSave={handleUpdateConnection}
        onClose={() => { setShowEditModal(false); setSelectedConnection(null); }}
      />

      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Konfirmasi"}
        message={confirmState?.message || ""}
        variant="danger"
      />
    </>
  );
}

ConnectionsCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  isOAuth: PropTypes.bool,
  providerName: PropTypes.string,
};
