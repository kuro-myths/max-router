import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from "react";

const API = "/api/mcp-manager/servers";

type Transport = "http" | "sse" | "stdio";
type McpServer = {
  id: string;
  name: string;
  description?: string;
  transport: Transport;
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  enabled?: boolean;
  lastProbe?: { ok: boolean; toolCount?: number; error?: string } | null;
};
type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};
type ProbeResult = { ok: boolean; tools?: McpTool[]; error?: string };
type CallResult = { loading?: boolean; result?: unknown; error?: string };
type FormValues = {
  name: string;
  description: string;
  transport: Transport;
  url: string;
  command: string;
  argsText: string;
  headersText: string;
  enabled: boolean;
};
type ApiError = { error?: string };

const EMPTY_FORM: FormValues = {
  name: "", description: "", transport: "http", url: "", command: "",
  argsText: "", headersText: "", enabled: true,
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function transportBadge(transport: Transport) {
  const cls = transport === "http" ? "bg-green-500/10 text-green-600" : transport === "sse" ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600";
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${cls}`}>{transport}</span>;
}

export default function McpManagerPage() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState<Record<string, boolean>>({});
  const [tools, setTools] = useState<Record<string, ProbeResult>>({});
  const [openTool, setOpenTool] = useState<string | null>(null);
  const [callState, setCallState] = useState<Record<string, CallResult>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(API, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { servers?: McpServer[] };
      setServers(Array.isArray(data.servers) ? data.servers : []);
      setError(null);
    } catch (err: unknown) {
      setError(messageOf(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setFormError(null); setEditorOpen(true); };
  const openEdit = (server: McpServer) => {
    setForm({
      name: server.name,
      description: server.description || "",
      transport: server.transport,
      url: server.url || "",
      command: server.command || "",
      argsText: Array.isArray(server.args) ? server.args.join("\n") : "",
      headersText: server.headers && Object.keys(server.headers).length ? JSON.stringify(server.headers, null, 2) : "",
      enabled: server.enabled !== false,
    });
    setEditingId(server.id);
    setFormError(null);
    setEditorOpen(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    let headers: Record<string, string> = {};
    let args: string[] = [];
    try {
      if (form.headersText.trim()) {
        const parsed: unknown = JSON.parse(form.headersText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Headers harus berupa objek JSON.");
        headers = parsed as Record<string, string>;
      }
      if (form.argsText.trim()) args = form.argsText.split(/\s*\n\s*/).filter(Boolean);
    } catch (err: unknown) {
      setFormError("JSON headers / daftar args tidak valid: " + messageOf(err));
      setSaving(false);
      return;
    }
    try {
      const payload = { name: form.name, description: form.description, transport: form.transport, url: form.url, command: form.command, args, headers, enabled: form.enabled };
      const res = await fetch(editingId ? `${API}/${encodeURIComponent(editingId)}` : API, {
        method: editingId ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch((): ApiError => ({}))) as ApiError;
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEditorOpen(false);
      await load();
    } catch (err: unknown) {
      setFormError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (server: McpServer) => {
    try {
      const res = await fetch(`${API}/${encodeURIComponent(server.id)}`, {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: server.enabled === false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err: unknown) { setError(messageOf(err)); }
  };

  const remove = async (server: McpServer) => {
    if (!confirm(`Hapus server MCP "${server.name}"?`)) return;
    try {
      const res = await fetch(`${API}/${encodeURIComponent(server.id)}`, { method: "DELETE", credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err: unknown) { setError(messageOf(err)); }
  };

  const probe = async (server: McpServer) => {
    setProbing((current) => ({ ...current, [server.id]: true }));
    try {
      const res = await fetch(`${API}/${encodeURIComponent(server.id)}/probe`, { method: "POST", credentials: "same-origin" });
      const data = (await res.json()) as ProbeResult;
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTools((current) => ({ ...current, [server.id]: data }));
      await load();
    } catch (err: unknown) {
      setTools((current) => ({ ...current, [server.id]: { ok: false, error: messageOf(err) } }));
    } finally {
      setProbing((current) => ({ ...current, [server.id]: false }));
    }
  };

  const runTool = async (server: McpServer, toolName: string, argsText: string) => {
    const key = `${server.id}:${toolName}`;
    let args: Record<string, unknown> = {};
    try {
      if (argsText.trim()) {
        const parsed: unknown = JSON.parse(argsText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Argumen harus berupa objek JSON.");
        args = parsed as Record<string, unknown>;
      }
    } catch (err: unknown) {
      setCallState((current) => ({ ...current, [key]: { error: messageOf(err) } }));
      return;
    }
    setCallState((current) => ({ ...current, [key]: { loading: true } }));
    try {
      const res = await fetch(`${API}/${encodeURIComponent(server.id)}/call`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: toolName, args }),
      });
      const data = (await res.json()) as ApiError & { result?: unknown };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCallState((current) => ({ ...current, [key]: { result: data.result } }));
    } catch (err: unknown) {
      setCallState((current) => ({ ...current, [key]: { error: messageOf(err) } }));
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
        <button type="button" onClick={openCreate} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Tambah Server</button>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">{error}</div>}
      {servers === null && <p className="text-sm text-text-muted">Memuat…</p>}
      {servers !== null && servers.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
          Belum ada server MCP. Klik "Tambah Server" untuk mulai — contoh: server MCP HTTP seperti Context7, Firecrawl, atau server MCP kamu sendiri.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {(servers || []).map((server) => {
          const probeResult = tools[server.id];
          return (
            <div key={server.id} className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text-main truncate">{server.name}</h3>
                    {transportBadge(server.transport)}
                    {!server.enabled && <span className="text-[10px] text-text-muted">(nonaktif)</span>}
                  </div>
                  <p className="text-xs text-text-muted truncate">{server.description || server.url || server.command}</p>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                  <input type="checkbox" checked={server.enabled !== false} onChange={() => void toggleEnabled(server)} className="size-3.5" />aktif
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => openEdit(server)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-main hover:bg-surface-2">Edit</button>
                <button type="button" onClick={() => void probe(server)} disabled={probing[server.id]} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-main hover:bg-surface-2 disabled:opacity-40">{probing[server.id] ? "Membaca…" : "Baca Tools"}</button>
                <button type="button" onClick={() => void remove(server)} className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-600 hover:bg-red-500/10">Hapus</button>
              </div>

              {server.lastProbe && <p className="text-[11px] text-text-muted">Probe terakhir: {server.lastProbe.ok ? `✓ ${server.lastProbe.toolCount} tools` : `✗ ${server.lastProbe.error || "gagal"}`}</p>}
              {probeResult && !probeResult.ok && probeResult.error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{probeResult.error}</p>}

              {probeResult?.ok && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-text-main">{(probeResult.tools || []).length} tools ditemukan</p>
                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                    {(probeResult.tools || []).map((tool) => {
                      const key = `${server.id}:${tool.name}`;
                      const isOpen = openTool === key;
                      const cs = callState[key] || {};
                      return (
                        <div key={tool.name} className="rounded-lg border border-border-subtle bg-bg/50">
                          <button type="button" onClick={() => setOpenTool(isOpen ? null : key)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                            <span className="truncate text-xs font-medium text-text-main">{tool.name}</span><span className="text-text-muted text-xs">{isOpen ? "▲" : "▼"}</span>
                          </button>
                          {isOpen && (
                            <div className="border-t border-border-subtle px-3 py-2.5 space-y-2">
                              {tool.description && <p className="text-[11px] text-text-muted">{tool.description}</p>}
                              {tool.inputSchema !== undefined && <details className="text-[10px] text-text-muted"><summary className="cursor-pointer">Skema input</summary><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>}
                              <textarea placeholder='Argumen JSON, contoh: {"query": "hello"}' rows={2} className={`${field} text-xs font-mono`} id={`args-${key}`} />
                              <button type="button" onClick={() => {
                                const element = document.getElementById(`args-${key}`) as HTMLTextAreaElement | null;
                                void runTool(server, tool.name, element?.value || "");
                              }} disabled={cs.loading} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">{cs.loading ? "Menjalankan…" : "Jalankan Tool"}</button>
                              {cs.error && <pre className="rounded bg-red-500/10 p-2 text-[10px] text-red-600 whitespace-pre-wrap">{cs.error}</pre>}
                              {cs.result !== undefined && <pre className="max-h-48 overflow-auto rounded bg-black/5 dark:bg-white/5 p-2 text-[10px] text-text-main whitespace-pre-wrap">{JSON.stringify(cs.result, null, 2)}</pre>}
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

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditorOpen(false)}>
          <form onSubmit={save} onClick={(event: MouseEvent<HTMLFormElement>) => event.stopPropagation()} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-5 space-y-3">
            <h2 className="text-lg font-semibold text-text-main">{editingId ? "Edit Server MCP" : "Tambah Server MCP"}</h2>
            <div><label className="mb-1 block text-xs text-text-muted">Nama *</label><input className={field} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="mis. context7" required /></div>
            <div><label className="mb-1 block text-xs text-text-muted">Deskripsi</label><input className={field} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="opsional" /></div>
            <div>
              <label className="mb-1 block text-xs text-text-muted">Transport</label>
              <select className={field} value={form.transport} onChange={(event) => setForm({ ...form, transport: event.target.value as Transport })}>
                <option value="http">HTTP / Streamable HTTP (bisa dibaca & dijalankan dari cloud)</option>
                <option value="sse">SSE (perlu koneksi lokal)</option><option value="stdio">Stdio (dijalankan di komputer via bridge)</option>
              </select>
            </div>
            {(form.transport === "http" || form.transport === "sse") && <div><label className="mb-1 block text-xs text-text-muted">URL server *</label><input className={field} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://mcp.example.com/mcp" required /></div>}
            {form.transport === "stdio" && <>
              <div><label className="mb-1 block text-xs text-text-muted">Command * (npx / uvx / python / node / docker)</label><input className={field} value={form.command} onChange={(event) => setForm({ ...form, command: event.target.value })} placeholder="npx" required /></div>
              <div><label className="mb-1 block text-xs text-text-muted">Args (satu per baris)</label><textarea className={field} rows={2} value={form.argsText} onChange={(event) => setForm({ ...form, argsText: event.target.value })} placeholder={"-y\n@mcp/server-filesystem"} /></div>
            </>}
            <div><label className="mb-1 block text-xs text-text-muted">Headers (JSON, opsional — mis. Authorization)</label><textarea className={`${field} font-mono text-xs`} rows={3} value={form.headersText} onChange={(event) => setForm({ ...form, headersText: event.target.value })} placeholder='{"Authorization": "Bearer ..."}' /></div>
            <label className="flex items-center gap-2 text-sm text-text-main"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="size-4" />Aktifkan server</label>
            {formError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-text-main hover:bg-surface-2">Batal</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">{saving ? "Menyimpan…" : editingId ? "Simpan" : "Tambahkan"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
