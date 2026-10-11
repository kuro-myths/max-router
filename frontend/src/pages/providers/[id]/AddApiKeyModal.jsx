
import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Badge, Input, Modal, Select } from "@/shared/components";
import { AI_PROVIDERS } from "@/shared/constants/providers";

const BULK_PLACEHOLDER = `name1|sk-key1\nname2|sk-key2\nsk-key-only-auto-named`;
const VALIDATION_TIMEOUT_MS = 15000;

async function fetchValidation(payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  try {
    const res = await fetch("/api/providers/validate", {
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

export default function AddApiKeyModal({ isOpen, provider, providerName, isCompatible, isAnthropic, authType, authHint, website, proxyPools, error, onSave, onBulkDone, onClose }) {
  const NONE_PROXY_POOL_VALUE = "__none__";
  const isOllamaLocal = provider === "ollama-local";
  const isCookie = authType === "cookie";
  const isXaiApiKey = provider === "xai" && !isCookie;
  const credentialLabel = isCookie ? "Nilai Cookie" : "Kunci API";
  const credentialPlaceholder = isCookie
    ? (provider === "grok-web" ? "sso=xxxxx... or just the raw value" : "eyJhbGciOi...")
    : (isXaiApiKey ? "xai-..." : "");

  const isAzure = provider === "azure";
  const isCloudflareAi = provider === "cloudflare-ai";
  const providerRegions = AI_PROVIDERS?.[provider]?.regions || null;
  const defaultRegion = AI_PROVIDERS?.[provider]?.defaultRegion || providerRegions?.[0]?.id || "";

  const [formData, setFormData] = useState({
    name: "",
    apiKey: "",
    email: "",
    defaultModel: "",
    priority: 1,
    proxyPoolId: NONE_PROXY_POOL_VALUE,
    ollamaHostUrl: "",
  });
  const [azureData, setAzureData] = useState({
    azureEndpoint: "",
    apiVersion: "2024-10-01-preview",
    deployment: "",
    organization: "",
  });
  const [cloudflareData, setCloudflareData] = useState({ accountId: "" });
  const [region, setRegion] = useState(defaultRegion);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [validationError, setValidationError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("single"); // "single" | "bulk"
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null); // { success, failed }

  const buildProviderSpecificData = () => {
    if (isOllamaLocal && formData.ollamaHostUrl.trim()) {
      return { baseUrl: formData.ollamaHostUrl.trim() };
    }
    if (isAzure) {
      return {
        azureEndpoint: azureData.azureEndpoint,
        apiVersion: azureData.apiVersion,
        deployment: azureData.deployment,
        organization: azureData.organization,
      };
    }
    if (isCloudflareAi) {
      return { accountId: cloudflareData.accountId };
    }
    if (providerRegions && region) {
      return { region };
    }
    return undefined;
  };

  const handleValidate = async () => {
    setValidating(true);
    let settled = false;
    const fallbackId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setValidationResult("failed");
      setValidationError("Waktu pemeriksaan habis (>15 detik)");
      setValidating(false);
    }, VALIDATION_TIMEOUT_MS + 500);
    try {
      const data = await fetchValidation({
        provider,
        apiKey: formData.apiKey,
        defaultModel: formData.defaultModel.trim() || undefined,
        providerSpecificData: buildProviderSpecificData(),
      });
      if (settled) return;
      settled = true;
      setValidationResult(data.valid ? "success" : "failed");
      setValidationError(data.valid ? "" : (data.error || "Pemeriksaan gagal"));
    } catch (error) {
      if (settled) return;
      settled = true;
      setValidationResult("failed");
      setValidationError(error.name === "AbortError" ? "Validation timeout (>15s)" : "Kesalahan jaringan");
    } finally {
      window.clearTimeout(fallbackId);
      if (settled) setValidating(false);
    }
  };

  const handleSubmit = async () => {
    if (!provider) return;
    if (!isOllamaLocal && !formData.apiKey) return;
    if (!isOllamaLocal) {
      // Non-ollama providers require a name
      if (!formData.name) return;
    }
    if (isCompatible && !formData.defaultModel.trim()) return;

    setSaving(true);
    try {
      let isValid = false;
      try {
        setValidating(true);
        setValidationResult(null);
        setValidationError("");
        const data = await fetchValidation({
          provider,
          apiKey: formData.apiKey,
          defaultModel: formData.defaultModel.trim() || undefined,
          providerSpecificData: buildProviderSpecificData(),
        });
        isValid = !!data.valid;
        setValidationResult(isValid ? "success" : "failed");
        setValidationError(isValid ? "" : (data.error || "Validation failed"));
      } catch (error) {
        setValidationResult("failed");
        setValidationError(error.name === "AbortError" ? "Validation timeout (>15s)" : "Network error");
      } finally {
        setValidating(false);
      }

      await onSave({
        name: formData.name || (isOllamaLocal ? "Ollama Local" : ""),
        apiKey: formData.apiKey,
        email: provider === "codebuddy" ? formData.email : undefined,
        defaultModel: isCompatible ? formData.defaultModel.trim() : undefined,
        priority: formData.priority,
        proxyPoolId: formData.proxyPoolId === NONE_PROXY_POOL_VALUE ? null : formData.proxyPoolId,
        testStatus: isValid ? "active" : "unknown",
        providerSpecificData: buildProviderSpecificData()
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSubmit = async () => {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setSaving(true);
    setBulkResult(null);
    let success = 0;
    let failed = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let apiKey = "";
      let email = "";
      let name = "";

      if (provider === "codebuddy") {
        const parts = line.includes("|") ? line.split("|") : line.split(":");
        if (parts.length >= 2) {
          if (parts.length === 3) {
            name = parts[0].trim();
            email = parts[1].trim();
            apiKey = parts[2].trim();
          } else {
            email = parts[0].trim();
            apiKey = parts[1].trim();
            name = email;
          }
        } else {
          apiKey = parts[0].trim();
          name = `Key ${i + 1}`;
        }
      } else {
        const parts = line.split("|");
        apiKey = parts.length >= 2 ? parts.slice(1).join("|").trim() : parts[0].trim();
        const baseName = parts.length >= 2 ? parts[0].trim() : "Key";
        name = `${baseName} ${i + 1}`;
      }

      try {
        const res = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            apiKey,
            email: email || undefined,
            name,
            priority: 1,
            testStatus: "unknown",
          }),
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setSaving(false);
    setBulkResult({ success, failed });
    if (success > 0 && onBulkDone) onBulkDone();
  };

  if (!provider) return null;

  return (
    <Modal isOpen={isOpen} title={`Tambah ${credentialLabel} ${providerName || provider}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Mode switcher */}
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "single" ? "primary" : "ghost"} onClick={() => { setMode("single"); setBulkResult(null); }}>Satuan</Button>
          <Button size="sm" variant={mode === "bulk" ? "primary" : "ghost"} onClick={() => { setMode("bulk"); setBulkResult(null); }}>Tambah Massal</Button>
        </div>

        {mode === "bulk" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">
              {provider === "codebuddy"
                ? <>Satu kunci per baris. Format: <code>email:apiKey</code> atau <code>nama|email|apiKey</code>.</>
                : <>Satu kunci per baris. Format: <code>nama|apiKey</code> atau cukup <code>apiKey</code> (nama dibuat otomatis berdasarkan urutan).</>
              }
            </p>
            <textarea
              className="w-full rounded border border-accent/30 bg-sidebar p-2 text-sm font-mono resize-y min-h-[140px] focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={BULK_PLACEHOLDER}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            {bulkResult && (
              <div className={`text-sm font-medium ${bulkResult.failed > 0 ? "text-yellow-400" : "text-green-400"}`}>
                ✓ {bulkResult.success} berhasil ditambahkan{bulkResult.failed > 0 ? `, ✗ ${bulkResult.failed} gagal` : ""}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleBulkSubmit} fullWidth disabled={saving || !bulkText.trim()}>
                {saving ? "Menambahkan..." : "Tambah Semua Kunci"}
              </Button>
              <Button onClick={onClose} variant="ghost" fullWidth>Batal</Button>
            </div>
          </div>
        )}

        {mode === "single" && (<>
        {provider === "codebuddy" && (
          <Input
            label="Email / ID Akun"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="your-codebuddy-email@example.com"
          />
        )}
        <Input
          label="Nama"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={isOllamaLocal ? "Ollama Local" : "Kunci Produksi"}
        />
        {isOllamaLocal && (
          <div className="flex gap-2">
            <Input
              label="Ollama Host URL"
              value={formData.ollamaHostUrl}
              onChange={(e) => setFormData({ ...formData, ollamaHostUrl: e.target.value })}
              placeholder="http://localhost:11434"
              className="flex-1"
            />
            <div className="pt-6">
              <Button onClick={handleValidate} disabled={validating || saving} variant="secondary">
                {validating ? "Memeriksa..." : "Periksa"}
              </Button>
            </div>
          </div>
        )}
        {!isOllamaLocal && (
          <div className="flex gap-2">
            <Input
              label={credentialLabel}
              type={isCookie ? "text" : "password"}
              value={formData.apiKey}
              onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
              placeholder={credentialPlaceholder}
              className="flex-1"
            />
            <div className="pt-6">
              <Button onClick={handleValidate} disabled={!formData.apiKey || validating || saving} variant="secondary">
                {validating ? "Memeriksa..." : "Periksa"}
              </Button>
            </div>
          </div>
        )}
        {isXaiApiKey && (
          <p className="text-xs text-text-muted">
            Gunakan kunci API xAI langsung dari console.x.ai. Kunci ini berbeda dari autentikasi OAuth Grok Build.
          </p>
        )}
        {isCookie && authHint && (
          <p className="text-xs text-text-muted">
            {authHint}
            {website && (
              <>
                {" "}
                <a href={website} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Buka {website.replace(/^https?:\/\//, "")}
                </a>
              </>
            )}
          </p>
        )}
        {providerRegions && (
          <Select
            label="Wilayah"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            options={providerRegions.map((r) => ({ value: r.id, label: r.label }))}
          />
        )}
        {isCompatible && (
          <Input
            label="Model Bawaan"
            value={formData.defaultModel}
            onChange={(e) => setFormData({ ...formData, defaultModel: e.target.value })}
            placeholder={isAnthropic ? "claude-3-5-sonnet-latest" : "gpt-4o-mini"}
          />
        )}
        {isOllamaLocal && (
          <p className="text-xs text-text-muted">
            Kosongkan untuk menggunakan <code>http://localhost:11434</code>. Untuk Ollama jarak jauh, masukkan URL host lengkap (misalnya <code>http://192.168.1.10:11434</code>).
          </p>
        )}
        {validationResult && (
          <div className="flex flex-col gap-1">
            <Badge variant={validationResult === "success" ? "success" : "error"}>
              {validationResult === "success" ? "Valid" : "Tidak valid"}
            </Badge>
            {validationResult === "failed" && validationError && (
              <span className="text-sm text-red-500">{validationError}</span>
            )}
          </div>
        )}
        {error && (
          <p className="text-xs text-red-500 break-words">{error}</p>
        )}
        {isCompatible && (
          <p className="text-xs text-text-muted">
            Masukkan ID model persis seperti yang diminta endpoint kompatibel. Model ini akan disimpan sebagai model bawaan koneksi.
          </p>
        )}
        {isCloudflareAi && (
          <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
            <h3 className="font-semibold mb-3 text-sm">AI Cloudflare Workers</h3>
            <Input
              label="ID Akun"
              value={cloudflareData.accountId}
              onChange={(e) => setCloudflareData({ ...cloudflareData, accountId: e.target.value })}
              placeholder="abc123def456..."
            />
            <p className="text-xs text-text-muted mt-2">
              Temukan ID Akun di bilah sisi kanan pada <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">dash.cloudflare.com</a>
            </p>
          </div>
        )}
        {isAzure && (
          <div className="bg-sidebar/50 p-4 rounded-lg border border-accent/20">
            <h3 className="font-semibold mb-3 text-sm">Konfigurasi Azure OpenAI</h3>
            <div className="flex flex-col gap-3">
              <Input
                label="Endpoint Azure"
                value={azureData.azureEndpoint}
                onChange={(e) => setAzureData({ ...azureData, azureEndpoint: e.target.value })}
                placeholder="https://your-resource.openai.azure.com"
              />
              <Input
                label="Nama Deployment"
                value={azureData.deployment}
                onChange={(e) => setAzureData({ ...azureData, deployment: e.target.value })}
                placeholder="gpt-4"
              />
              <Input
                label="Versi API"
                value={azureData.apiVersion}
                onChange={(e) => setAzureData({ ...azureData, apiVersion: e.target.value })}
                placeholder="2024-10-01-preview"
              />
              <Input
                label="Organisasi"
                value={azureData.organization}
                onChange={(e) => setAzureData({ ...azureData, organization: e.target.value })}
                placeholder="ID Organisasi"
              />
            </div>
          </div>
        )}

        <Input
          label="Prioritas"
          type="number"
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: Number.parseInt(e.target.value) || 1 })}
        />

        <Select
          label="Kelompok Proxy"
          value={formData.proxyPoolId}
          onChange={(e) => setFormData({ ...formData, proxyPoolId: e.target.value })}
          options={[
            { value: NONE_PROXY_POOL_VALUE, label: "Tidak ada" },
            ...(proxyPools || []).map((pool) => ({ value: pool.id, label: pool.name })),
          ]}
          placeholder="Tidak ada"
        />

        {(proxyPools || []).length === 0 && (
          <p className="text-xs text-text-muted">
            Belum ada kelompok proxy aktif. Buat terlebih dahulu melalui halaman Kelompok Proxy.
          </p>
        )}

        <p className="text-xs text-text-muted">
          Kolom proxy manual lama masih didukung oleh API untuk menjaga kompatibilitas.
        </p>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth disabled={saving || (!isOllamaLocal && (!formData.name || !formData.apiKey)) || (isCompatible && !formData.defaultModel.trim()) || (isAzure && (!azureData.azureEndpoint || !azureData.deployment || !azureData.organization)) || (isCloudflareAi && !cloudflareData.accountId)}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
          <Button onClick={onClose} variant="ghost" fullWidth>
            Batal
          </Button>
        </div>
        </>)}
      </div>
    </Modal>
  );
}

AddApiKeyModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  provider: PropTypes.string,
  providerName: PropTypes.string,
  isCompatible: PropTypes.bool,
  isAnthropic: PropTypes.bool,
  authType: PropTypes.string,
  authHint: PropTypes.string,
  website: PropTypes.string,
  proxyPools: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
  })),
  error: PropTypes.string,
  onSave: PropTypes.func.isRequired,
  onBulkDone: PropTypes.func,
  onClose: PropTypes.func.isRequired,
};
