import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, Check, ChevronDown, Cloud, Code2, Database, ExternalLink,
  Globe, Mail, MessageSquare, Puzzle, Search, Settings2, ShieldCheck, Sparkles,
  X, Zap,
} from "lucide-react";

const CATALOG = [
  { id: "gmail", name: "Gmail", category: "Produktivitas", description: "Akses pesan, pencarian email, dan penyusunan draft.", detail: "OAuth Google diperlukan. Aplikasi harus memiliki OAuth Client ID dan izin Gmail API.", auth: "Google OAuth 2.0", scopes: "gmail.readonly, gmail.compose", icon: Mail, color: "text-red-500", popular: true },
  { id: "google-drive", name: "Google Drive", category: "Produktivitas", description: "Cari, baca, dan kelola dokumen di Drive.", detail: "OAuth Google diperlukan. Aktifkan Google Drive API pada Google Cloud Project.", auth: "Google OAuth 2.0", scopes: "drive.readonly", icon: Cloud, color: "text-emerald-500", popular: true },
  { id: "google-calendar", name: "Google Calendar", category: "Produktivitas", description: "Baca kalender dan kelola jadwal.", detail: "OAuth Google diperlukan. Aktifkan Google Calendar API dan atur redirect URI.", auth: "Google OAuth 2.0", scopes: "calendar.events", icon: Activity, color: "text-blue-500", popular: true },
  { id: "github", name: "GitHub", category: "Developer", description: "Repositori, issue, pull request, dan commit.", detail: "Gunakan GitHub App atau OAuth App. Simpan client secret hanya di backend.", auth: "GitHub OAuth / App", scopes: "repo, read:user", icon: Code2, color: "text-text-main", popular: true },
  { id: "slack", name: "Slack", category: "Produktivitas", description: "Pesan tim, channel, dan notifikasi.", detail: "Buat Slack App dan konfigurasi OAuth V2 serta bot scopes.", auth: "Slack OAuth V2", scopes: "channels:read, chat:write", icon: MessageSquare, color: "text-fuchsia-500" },
  { id: "notion", name: "Notion", category: "Produktivitas", description: "Cari dan kelola halaman serta database Notion.", detail: "Buat integrasi Notion dan berikan akses ke halaman yang diperlukan.", auth: "Notion OAuth", scopes: "read content, update content" , icon: Puzzle, color: "text-text-main" },
  { id: "supabase", name: "Supabase", category: "Developer", description: "Database, Auth, Storage, dan Edge Functions.", detail: "Hubungkan project URL dan service role key melalui backend secret. Jangan gunakan service role key di browser.", auth: "Project URL + server secret", scopes: "database, auth, storage", icon: Database, color: "text-emerald-500" },
  { id: "vercel", name: "Vercel", category: "Developer", description: "Proyek, deployment, domain, dan log.", detail: "Gunakan Vercel OAuth atau token yang disimpan aman di backend.", auth: "OAuth / Access Token", scopes: "projects, deployments", icon: Globe, color: "text-text-main" },
  { id: "railway", name: "Railway", category: "Developer", description: "Project, service, deployment, dan environment.", detail: "Gunakan Railway API token melalui penyimpanan secret backend.", auth: "API Token", scopes: "project, deployment", icon: Zap, color: "text-purple-500" },
  { id: "openai", name: "OpenAI", category: "AI & Model", description: "Gunakan API model OpenAI sebagai sumber data AI.", detail: "Provider AI dikelola melalui menu Penyedia. Connector ini disiapkan untuk tool/API integration.", auth: "API Key", scopes: "models, responses", icon: Sparkles, color: "text-text-main" },
  { id: "custom-api", name: "Custom REST API", category: "Lainnya", description: "Hubungkan API eksternal dengan konfigurasi sendiri.", detail: "Tambahkan nama dan base URL API. Kredensial harus dipasang di backend sebelum request produksi.", auth: "API Key / Bearer / None", scopes: "sesuai API" , icon: Code2, color: "text-primary" },
];

const CATEGORIES = ["Semua", "Produktivitas", "AI & Model", "Developer", "Lainnya"];
const STORAGE_KEY = "max-router-connectors-config-v1";

export default function ConnectorsPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [selected, setSelected] = useState(null);
  const [configs, setConfigs] = useState({});
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);

  useEffect(() => {
    try { setConfigs(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")); } catch { setConfigs({}); }
    fetch("/api/connectors/github/status", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.ok ? r.json() : null).then((v) => setGithubConnected(Boolean(v?.connected))).catch(() => setGithubConnected(false));
  }, []);

  const save = (next) => {
    setConfigs(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const filtered = useMemo(() => CATALOG.filter((item) => {
    const matchCategory = category === "Semua" || item.category === category;
    const matchQuery = [item.name, item.description, item.category].join(" ").toLowerCase().includes(query.toLowerCase());
    return matchCategory && matchQuery;
  }), [category, query]);

  const configuredCount = Object.values(configs).filter((item) => item?.configured).length;
  const handleSave = () => {
    if (!selected) return;
    const next = { ...configs, [selected.id]: { configured: true, clientId: selected.clientId || "", authUrl: selected.authUrl || "", redirectUri: selected.redirectUri || "" } };
    save(next);
    setSelected(null);
  };

  const addCustom = () => {
    if (!customName.trim() || !/^https?:\/\//i.test(customUrl.trim())) return;
    const id = `custom-${Date.now()}`;
    const next = { ...configs, [id]: { configured: true, name: customName.trim(), baseUrl: customUrl.trim(), custom: true } };
    save(next);
    setCustomName("");
    setCustomUrl("");
    setShowCustom(false);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Puzzle size={25} /></div>
          <div><h1 className="text-2xl font-bold tracking-tight text-text-main">Connectors</h1><p className="mt-1 max-w-2xl text-sm text-text-muted">Hubungkan layanan eksternal agar Max Router dapat bekerja lintas aplikasi dan sumber data.</p></div>
        </div>
        <button onClick={() => setShowCustom(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90"><span>+</span> Connector kustom</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-text-muted">Katalog tersedia</p><p className="mt-1 text-2xl font-bold text-text-main">{CATALOG.length}</p></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-text-muted">Konfigurasi tersimpan</p><p className="mt-1 text-2xl font-bold text-text-main">{configuredCount}</p></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs text-text-muted">Koneksi aktif terverifikasi</p><p className="mt-1 text-2xl font-bold text-amber-500">0</p><p className="mt-1 text-[11px] text-text-muted">Menunggu OAuth/API backend</p></div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3"><Search size={17} className="text-text-muted" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari connector, misalnya Gmail atau Drive..." className="h-11 w-full bg-transparent text-sm text-text-main outline-none placeholder:text-text-muted" /></label>
        <div className="flex flex-wrap gap-2">{CATEGORIES.map((item) => <button key={item} onClick={() => setCategory(item)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${category === item ? "bg-primary text-white" : "border border-border bg-surface text-text-muted hover:text-text-main"}`}>{item}</button>)}</div>
      </div>

      <GitHubWorkspace />

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-text-main">Katalog connector</h2><span className="text-xs text-text-muted">{filtered.length} layanan</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const Icon = item.icon;
            const configured = Boolean(configs[item.id]?.configured || (item.id === "github" && githubConnected));
            return <article key={item.id} className="flex min-h-[174px] flex-col rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
              <div className="flex items-start gap-3"><div className="rounded-xl border border-border bg-bg p-3"><Icon size={23} className={item.color} /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-text-main">{item.name}</h3>{configured ? <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600">Disiapkan</span> : <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] text-text-muted">Belum diatur</span>}</div><p className="mt-1 text-xs leading-relaxed text-text-muted">{item.description}</p></div></div>
              <div className="mt-auto flex items-center justify-between gap-3 pt-4"><span className="text-[11px] text-text-muted">{item.category}</span><button onClick={() => item.id === "github" ? (window.location.href = "/api/connectors/github/oauth/start") : setSelected(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10">{configured ? "Kelola" : "Atur koneksi"} <ArrowUpRight size={13} /></button></div>
            </article>;
          })}
        </div>
        {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-text-muted">Tidak ada connector yang cocok dengan pencarian.</div>}
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-text-muted"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-amber-500" /><p><strong className="text-text-main">Keamanan koneksi:</strong> GitHub memakai OAuth server-side. Token disimpan terenkripsi di database backend dan tidak dikirim ke browser. Akses private repository mengikuti izin akun GitHub yang terhubung. Connector lain pada katalog masih berupa konfigurasi metadata dan belum tentu memiliki backend aktif.</p></div>

      {selected && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-text-main">Atur {selected.name}</h2><p className="mt-1 text-xs text-text-muted">{selected.auth}</p></div><button onClick={() => setSelected(null)} className="rounded-lg p-1 text-text-muted hover:bg-surface-2"><X size={18} /></button></div>
          <p className="mt-4 text-sm text-text-muted">{selected.detail}</p>
          <div className="mt-4 rounded-xl bg-bg p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Permission / scope yang diperlukan</p><p className="mt-1 break-all text-xs text-text-main">{selected.scopes}</p></div>
          <label className="mt-4 block text-xs font-medium text-text-main">OAuth Client ID (opsional, metadata saja)<input value={selected.clientId || ""} onChange={(e) => setSelected({ ...selected, clientId: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-primary" placeholder="Client ID dari console layanan" /></label>
          <label className="mt-3 block text-xs font-medium text-text-main">Redirect URI yang perlu didaftarkan<input readOnly value={`${window.location.origin}/api/connectors/${selected.id}/callback`} className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-xs text-text-muted outline-none" /></label>
          <div className="mt-5 flex flex-wrap justify-between gap-2"><button onClick={() => { const next = { ...configs }; delete next[selected.id]; save(next); setSelected(null); }} className="rounded-lg px-3 py-2 text-xs text-red-500 hover:bg-red-500/10">Hapus konfigurasi</button><div className="flex gap-2"><button onClick={() => setSelected(null)} className="rounded-lg border border-border px-3 py-2 text-xs text-text-muted">Tutup</button><button onClick={handleSave} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white">Simpan konfigurasi</button></div></div>
        </div>
      </div>}

      {showCustom && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCustom(false); }}><div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-bold text-text-main">Connector REST kustom</h2><button onClick={() => setShowCustom(false)} className="text-text-muted"><X size={18} /></button></div><p className="mt-1 text-xs text-text-muted">Simpan identitas API untuk dilanjutkan ke konfigurasi backend.</p><label className="mt-4 block text-xs text-text-main">Nama layanan<input value={customName} onChange={(e) => setCustomName(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm" placeholder="Contoh: CRM internal" /></label><label className="mt-3 block text-xs text-text-main">Base URL<input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm" placeholder="https://api.example.com" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowCustom(false)} className="rounded-lg border border-border px-3 py-2 text-xs">Batal</button><button disabled={!customName.trim() || !/^https?:\/\//i.test(customUrl.trim())} onClick={addCustom} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Simpan</button></div></div></div>}
    </div>
  );
}


function GitHubWorkspace() {
  const [status,setStatus]=useState(null),[repos,setRepos]=useState([]),[repo,setRepo]=useState("");
  const [folder,setFolder]=useState(""),[entries,setEntries]=useState([]),[file,setFile]=useState(null);
  const [branches,setBranches]=useState([]),[branch,setBranch]=useState(""),[newBranch,setNewBranch]=useState("");
  const [pulls,setPulls]=useState([]),[tab,setTab]=useState("files"),[dirty,setDirty]=useState(false);
  const [commitMessage,setCommitMessage]=useState(""),[prTitle,setPrTitle]=useState(""),[prBody,setPrBody]=useState("");
  const [showPR,setShowPR]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const api=async(url,options={})=>{const r=await fetch(url,{credentials:"same-origin",cache:"no-store",...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"GitHub API gagal.");return d;};
  const repoParts=()=>repo.split("/");
  const loadFolder=async(path)=>{if(!repo)return;setBusy(true);try{const p=repoParts();const q=new URLSearchParams({owner:p[0],repo:p[1],path:path||"",...(branch?{ref:branch}:{})});const d=await api("/api/connectors/github/contents?"+q);setFolder(path||"");setEntries(d.entries||[]);setFile(null);setDirty(false);}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  const loadRepo=async(value)=>{setRepo(value);setFile(null);setFolder("");if(!value)return;setBusy(true);try{const p=value.split("/");const [r,b,pr]=await Promise.all([api("/api/connectors/github/repos?per_page=100"),api("/api/connectors/github/branches?owner="+encodeURIComponent(p[0])+"&repo="+encodeURIComponent(p[1])),api("/api/connectors/github/pulls?owner="+encodeURIComponent(p[0])+"&repo="+encodeURIComponent(p[1]))]);setRepos(r.repositories||[]);setBranches(b.branches||[]);setPulls(pr.pullRequests||[]);const def=(r.repositories||[]).find(x=>x.fullName===value)?.defaultBranch||b.branches?.[0]?.name||"";setBranch(def);const q=new URLSearchParams({owner:p[0],repo:p[1],path:""});const root=await api("/api/connectors/github/contents?"+q);setEntries(root.entries||[]);}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  const refresh=async()=>{const d=await api("/api/connectors/github/status");setStatus(d);if(d.connected){const r=await api("/api/connectors/github/repos?per_page=100");setRepos(r.repositories||[]);}};
  useEffect(()=>{refresh().catch(e=>setMessage(e.message));},[]);
  const readFile=async(item)=>{setBusy(true);try{const p=repoParts();const q=new URLSearchParams({owner:p[0],repo:p[1],path:item.path,...(branch?{ref:branch}:{})});const d=await api("/api/connectors/github/contents?"+q);setFile(d);setCommitMessage("Update "+d.path);setDirty(false);}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  const makeBranch=async()=>{if(!newBranch.trim())return;setBusy(true);try{const p=repoParts();await api("/api/connectors/github/branches",{method:"POST",body:JSON.stringify({owner:p[0],repo:p[1],branch:newBranch.trim(),from:branch})});const d=await api("/api/connectors/github/branches?owner="+encodeURIComponent(p[0])+"&repo="+encodeURIComponent(p[1]));setBranches(d.branches||[]);setBranch(newBranch.trim());setNewBranch("");setMessage("Branch dibuat. Pilih file dan lakukan perubahan.");}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  const saveFile=async()=>{if(!file||!branch||!commitMessage.trim())return;setBusy(true);try{const p=repoParts();const d=await api("/api/connectors/github/contents",{method:"PUT",body:JSON.stringify({owner:p[0],repo:p[1],path:file.path,content:file.content,sha:file.sha,branch:branch,message:commitMessage})});setFile({...file,sha:d.content?.sha||file.sha});setDirty(false);setMessage("Commit & push berhasil: "+(d.commit?.sha||"OK"));}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  const makePR=async()=>{if(!prTitle.trim()||!branch)return;setBusy(true);try{const p=repoParts();const base=repoInfo?.defaultBranch||"main";const d=await api("/api/connectors/github/pulls",{method:"POST",body:JSON.stringify({owner:p[0],repo:p[1],title:prTitle,body:prBody,head:branch,base:base})});setMessage("Pull Request #"+d.number+" berhasil dibuat.");setShowPR(false);const pr=await api("/api/connectors/github/pulls?owner="+encodeURIComponent(p[0])+"&repo="+encodeURIComponent(p[1]));setPulls(pr.pullRequests||[]);}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  const repoInfo=repos.find(r=>r.fullName===repo);
  if(!status?.connected)return <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-text-main">GitHub Workspace</h2><p className="mt-1 text-xs text-text-muted">Hubungkan GitHub untuk menjelajah source code, membuat branch, commit, push, dan Pull Request.</p></div><button onClick={()=>window.location.assign("/api/connectors/github/oauth/start")} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Hubungkan GitHub</button></div>{message&&<p className="mt-3 text-xs text-red-500">{message}</p>}</section>;
  const priv=repos.filter(r=>r.private).length;
  return <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-text-main">GitHub Workspace</h2><p className="mt-1 text-xs text-text-muted">Terhubung sebagai <strong>{status.account?.login}</strong> · {repos.length} repo · {priv} private</p></div><div className="flex gap-2"><button onClick={()=>refresh().catch(e=>setMessage(e.message))} className="rounded-lg border border-border px-3 py-2 text-xs">Refresh</button><button onClick={()=>api("/api/connectors/github/status",{method:"DELETE"}).then(()=>setStatus({connected:false}))} className="rounded-lg border border-border px-3 py-2 text-xs text-red-500">Putuskan</button></div></div>
    <label className="block text-xs text-text-muted">Repository<select value={repo} onChange={e=>loadRepo(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text-main"><option value="">Pilih repository...</option>{repos.map(r=><option key={r.id} value={r.fullName}>{r.fullName}{r.private?" · PRIVATE":""}</option>)}</select></label>
    {repo&&<><div className="grid gap-2 rounded-xl border border-border bg-bg p-3 md:grid-cols-[1fr_1fr_auto_auto]">
      <label className="text-xs text-text-muted">Branch aktif<select value={branch} onChange={e=>{setBranch(e.target.value);setFile(null);loadFolder(folder);}} className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm text-text-main">{branches.map(b=><option key={b.name} value={b.name}>{b.name}{b.protected?" · protected":""}</option>)}</select></label>
      <label className="text-xs text-text-muted">Branch AI baru<input value={newBranch} onChange={e=>setNewBranch(e.target.value)} placeholder="ai/update-feature" className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-main"/></label>
      <button disabled={busy||!newBranch.trim()} onClick={makeBranch} className="mt-5 h-10 rounded-lg border border-primary/40 px-3 text-xs font-semibold text-primary disabled:opacity-40">+ Branch</button>
      <button onClick={()=>setShowPR(true)} className="mt-5 h-10 rounded-lg bg-primary px-3 text-xs font-semibold text-white">Buat PR</button></div>
      <div className="flex gap-2 border-b border-border pb-2"><button onClick={()=>setTab("files")} className={"rounded-lg px-3 py-2 text-xs "+(tab==="files"?"bg-primary text-white":"text-text-muted")}>Source Code</button><button onClick={()=>setTab("pulls")} className={"rounded-lg px-3 py-2 text-xs "+(tab==="pulls"?"bg-primary text-white":"text-text-muted")}>Pull Requests ({pulls.length})</button></div>
      {tab==="files"?<div className="grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.5fr)]"><div className="rounded-xl border border-border bg-bg p-3"><div className="mb-2 flex justify-between"><strong className="text-xs">Explorer</strong><button onClick={()=>loadFolder("")} className="text-xs text-primary">Root</button></div><p className="mb-2 truncate text-[11px] text-text-muted">/{folder}</p>{folder&&<button onClick={()=>loadFolder(folder.split("/").slice(0,-1).join("/"))} className="mb-2 text-xs text-primary">← Kembali</button>}<div className="max-h-[440px] space-y-1 overflow-auto">{entries.map(item=><button key={item.path} onClick={()=>item.type==="dir"?loadFolder(item.path):readFile(item)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-text-main hover:bg-surface">{item.type==="dir"?<Database size={14}/>:<Code2 size={14}/>}<span className="truncate">{item.name}</span></button>)}{!entries.length&&<p className="py-5 text-center text-xs text-text-muted">Folder kosong.</p>}</div></div>
      <div className="min-w-0 space-y-2">{file?<><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-semibold text-text-main">{file.path}</p><p className="text-[10px] text-text-muted">{dirty?"Ada perubahan belum disimpan":"Tersinkron"}</p></div><button disabled={busy||!dirty||!branch} onClick={saveFile} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy?"Menyimpan...":"Commit & Push"}</button></div><textarea value={file.content} onChange={e=>{setFile({...file,content:e.target.value});setDirty(true);}} spellCheck={false} className="min-h-[360px] w-full rounded-xl border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-text-main"/><label className="block text-xs text-text-muted">Pesan commit<input value={commitMessage} onChange={e=>setCommitMessage(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-text-main"/></label></>:<div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-border p-6 text-center"><div><Code2 size={30} className="mx-auto text-text-muted"/><p className="mt-3 text-sm font-semibold text-text-main">Pilih file untuk melihat kode repository</p></div></div>}</div></div>:<div className="space-y-2">{pulls.map(p=><a key={p.number} href={p.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-border p-3 hover:bg-bg"><p className="text-xs font-semibold text-text-main">#{p.number} {p.title}</p><p className="mt-1 text-[11px] text-text-muted">{p.head} → {p.base}</p></a>)}{!pulls.length&&<p className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-text-muted">Belum ada Pull Request terbuka.</p>}</div>}</>}
    {message&&<p className="rounded-lg bg-primary/5 p-3 text-xs text-text-main">{message}</p>}
    {showPR&&<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setShowPR(false);}}><div className="w-full max-w-lg space-y-3 rounded-2xl border border-border bg-surface p-5"><div className="flex justify-between"><strong className="text-text-main">Buat Pull Request</strong><button onClick={()=>setShowPR(false)}><X size={18}/></button></div><input value={prTitle} onChange={e=>setPrTitle(e.target.value)} placeholder="Judul PR" className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"/><textarea value={prBody} onChange={e=>setPrBody(e.target.value)} placeholder="Ringkasan perubahan..." className="min-h-28 w-full rounded-lg border border-border bg-bg p-3 text-sm"/><div className="flex justify-end gap-2"><button onClick={()=>setShowPR(false)} className="rounded-lg border border-border px-3 py-2 text-xs">Batal</button><button disabled={busy||!prTitle.trim()} onClick={makePR} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white">Buat PR</button></div></div></div>}
  </section>;
}
