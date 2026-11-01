import { useCallback, useEffect, useState } from "react";

/**
 * MCP Manager — kelola server MCP dari dashboard:
 * tambah, edit, hapus, aktif/nonaktif, baca daftar tools (probe),
 * dan jalankan tool langsung dari dashboard.
 */

const API = "/api/mcp-manager/servers";

const EMPTY_FORM = {
  name: "",
  description: "",
  transport: "http",
  url: "",
  command: "",
  argsText: "",
  headersText: "",
  enabled: true,
};

function transportBadge(t) {
  const cls = t === "http" ? "bg-green-500/10 text-green-600" : t === "sse" ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600";
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${cls}`}>{t}</span>;
}

export default function McpManagerPage() {
  const [servers, setServers] = useState(null);
  const [error, setError] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState({}); // id -> bool
  const [tools, setTools] = useState({}); // id -> { ok, tools?, error? }
  const [openTool, setOpenTool] = useState(null); // `${id}:${toolName}`
  const [callState, setCallState] = useState({}); // key -> { loading, result, error }

  const load = useCallback(async () => {
    try {
      const res = await fetch(API, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setServers(data.servers || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setFormError(null); setEditorOpen(true); };
  const openEdit = (s) => {
    setForm({
      name: s.name,
      description: s.description || "",
      transport: s.transport,
      url: s.url || "",
      command: s.command || "",
      argsText: Array.isArray(s.args) ? s.args.join("\n") : "",
      headersText: s.headers && Object.keys(s.headers).length ? JSON.stringify(s.headers, null, 2) : "",
      enabled: s.enabled !== false,
    });
    setEditingId(s.id);
    setFormError(null);
    setEditorOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    let headers = {};
    let args = [];
    try {
      if (form.headersText.trim()) headers = JSON.parse(form.headersText);
      if (form.argsText.trim()) args = form.argsText.split(/\s*\n\s*/).filter(Boolean);
    } catch (err) {
      setFormError("JSON headers / daftar args tidak valid: " + err.message);
      setSaving(false);
      return;
    }
    try {
      const payload = {
        name: form.name,
        description: form.description,
        transport: form.transport,
        url: form.url,
        command: form.command,
        args,
        headers,
        enabled: form.enabled,
      };
      const res = await fetch(editingId ? `${API}/${encodeURIComponent(editingId)}` : API, {
        method: editingId ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEditorOpen(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (s) => {
    await fetch(`${API}/${encodeURIComponent(s.id)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: s.enabled === false }),
    });
    load();
  };

  const remove = async (s) => {
    if (!confirm(`Hapus server MCP "${s.name}"?`)) return;
    await fetch(`${API}/${encodeURIComponent(s.id)}`, { method: "DELETE", credentials: "same-origin" });
    load();
  };

  const probe = async (s) => {
    setProbing((p) => ({ ...p, [s.id]: true }));
    try {
      const res = await fetch(`${API}/${encodeURIComponent(s.id)}/probe`, { method: "POST", credentials: "same-origin" });
      const data = await res.json();
      setTools((t) => ({ ...t, [s.id]: data }));
      load();
    } catch (err) {
      setTools((t) => ({ ...t, [s.id]: { ok: false, error: err.message } }));
    } finally {
      setProbing((p) => ({ ...p, [s.id]: false }));
    }
  };

  const runTool = async (s, toolName, argsText) => {
    const key = `${s.id}:${toolName}`;
    let args = {};
    try { if (argsText.trim()) args = JSON.parse(argsText); }
    catch { setCallState((c) => ({ ...c, [key]: { error: "Argumen bukan JSON valid" } })); return; }
    setCallState((c) => ({ ...c, [key]: { loading: true } }));
    try {
      const res = await fetch(`${API}/${encodeURIComponent(s.id)}/call`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, args }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCallState((c) => ({ ...c, [key]: { result: data.result } }));
    } catch (err) {
      setCallState((c) => ({ ...c, [key]: { error: err.message } }));
    }
  };

  const field = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-main";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-main">MCP Manager</h1>
          <p className="text-sm text-text-muted">Tambah, edit, baca tools, dan jalankan server MCP — semua dari dashboard.</p>
        </div>
        <button type="button" onClick={openCreate} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          + Tambah Server
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {servers === null && <p className="text-sm text-text-muted">Memuat…</p>}
      {servers !== null && servers.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
          Belum ada server MCP. Klik "Tambah Server" untuk mulai — contoh: server MCP HTTP seperti Context7, Firecrawl, atau server MCP kamu sendiri.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {(servers || []).map((s) => {
          const t = tools[s.id];
          return (
            <div key={s.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text-main truncate">{s.name}</h3>
                    {transportBadge(s.transport)}
                    {!s.enabled && <span className="text-[10px] text-text-muted">(nonaktif)</span>}
                  </div>
                  <p className="text-xs text-text-muted truncate">{s.description || s.url || s.command}</p>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                  <input type="checkbox" checked={s.enabled !== false} onChange={() => toggleEnabled(s)} className="size-3.5" />
                  aktif
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => openEdit(s)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-main hover:bg-surface-2">Edit</button>
                <button type="button" onClick={() => probe(s)} disabled={probing[s.id]} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-main hover:bg-surface-2 disabled:opacity-40">
                  {probing[s.id] ? "Membaca…" : "Baca Tools"}
                </button>
                <button type="button" onClick={() => remove(s)} className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-600 hover:bg-red-500/10">Hapus</button>
              </div>

              {s.lastProbe && (
                <p className="text-[11px] text-text-muted">
                  Probe terakhir: {s.lastProbe.ok ? `✓ ${s.lastProbe.toolCount} tools` : `✗ ${s.lastProbe.error || "gagal"}`}
                </p>
              )}

              {t && !t.ok && t.error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{t.error}</p>
              )}

              {t?.ok && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-text-main">{(t.tools || []).length} tools ditemukan</p>
                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                    {(t.tools || []).map((tool) => {
                      const key = `${s.id}:${tool.name}`;
                      const isOpen = openTool === key;
                      const cs = callState[key] || {};
                      return (
                        <div key={tool.name} className="rounded-lg border border-border-subtle bg-bg/50">
                          <button type="button" onClick={() => setOpenTool(isOpen ? null : key)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                            <span className="truncate text-xs font-medium text-text-main">{tool.name}</span>
                            <span className="text-text-muted text-xs">{isOpen ? "▲" : "▼"}</span>
                          </button>
                          {isOpen && (
                            <div className="border-t border-border-subtle px-3 py-2.5 space-y-2">
                              {tool.description && <p className="text-[11px] text-text-muted">{tool.description}</p>}
                              {tool.inputSchema && (
                                <details className="text-[10px] text-text-muted">
                                  <summary className="cursor-pointer">Skema input</summary>
                                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                                </details>
                              )}
                              <textarea
                                placeholder='Argumen JSON, contoh: {"query": "hello"}'
                                rows={2}
                                className={`${field} text-xs font-mono`}
                                id={`args-${key}`}
                              />
                              <button
                                type="button"
                                onClick={() => runTool(s, tool.name, (document.getElementById(`args-${key}`) || {}).value || "")}
                                disabled={cs.loading}
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
                              >
                                {cs.loading ? "Menjalankan…" : "Jalankan Tool"}
                              </button>
                              {cs.error && <pre className="rounded bg-red-500/10 p-2 text-[10px] text-red-600 whitespace-pre-wrap">{cs.error}</pre>}
                              {cs.result && (
                                <pre className="max-h-48 overflow-auto rounded bg-black/5 dark:bg-white/5 p-2 text-[10px] text-text-main whitespace-pre-wrap">
                                  {JSON.stringify(cs.result, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Editor modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditorOpen(false)}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-5 space-y-3"
          >
            <h2 className="text-lg font-semibold text-text-main">{editingId ? "Edit Server MCP" : "Tambah Server MCP"}</h2>

            <div>
              <label className="mb-1 block text-xs text-text-muted">Nama *</label>
              <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. context7" required />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted">Deskripsi</label>
              <input className={field} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="opsional" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted">Transport</label>
              <select className={field} value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })}>
                <option value="http">HTTP / Streamable HTTP (bisa dibaca & dijalankan dari cloud)</option>
                <option value="sse">SSE (perlu koneksi lokal)</option>
                <option value="stdio">Stdio (dijalankan di komputer via bridge)</option>
              </select>
            </div>
            {(form.transport === "http" || form.transport === "sse") && (
              <div>
                <label className="mb-1 block text-xs text-text-muted">URL server *</label>
                <input className={field} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://mcp.example.com/mcp" required />
              </div>
            )}
            {form.transport === "stdio" && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Command * (npx / uvx / python / node / docker)</label>
                  <input className={field} value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="npx" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-muted">Args (satu per baris)</label>
                  <textarea className={field} rows={2} value={form.argsText} onChange={(e) => setForm({ ...form, argsText: e.target.value })} placeholder={"-y\n@mcp/server-filesystem"} />
                </div>
              </>
            )}
            <div>
              <label className="mb-1 block text-xs text-text-muted">Headers (JSON, opsional — mis. Authorization)</label>
              <textarea className={`${field} font-mono text-xs`} rows={3} value={form.headersText} onChange={(e) => setForm({ ...form, headersText: e.target.value })} placeholder='{"Authorization": "Bearer ..."}' />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-main">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="size-4" />
              Aktifkan server
            </label>

            {formError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{formError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-text-main hover:bg-surface-2">Batal</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
                {saving ? "Menyimpan…" : editingId ? "Simpan" : "Tambahkan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
