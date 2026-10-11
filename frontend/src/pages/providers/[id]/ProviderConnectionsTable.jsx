import {useEffect,useMemo,useState} from "react";
import PropTypes from "prop-types";
import {Badge,Button,Select,Toggle} from "@/shared/components";

const n=v=>v==null?"—":Number(v).toLocaleString("id-ID");
const left=s=>{let x=Math.max(0,Number(s)||0),d=Math.floor(x/86400),h=Math.floor(x%86400/3600),m=Math.floor(x%3600/60);return d?d+"h "+h+"j":h?h+"j "+m+"m":m+"m "+Math.floor(x%60)+"d"};

function Reset({usage}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
 const ws=Array.isArray(usage?.windows)?usage.windows:[];
 if(!ws.length)return <span className="text-text-muted">Belum tersedia</span>;
 const loaded=usage?._loadedAt||now;
 return <div className="space-y-1">{ws.map((w,i)=>{const r=Math.max(0,(Number(w.resets_in_sec)||0)-Math.floor((now-loaded)/1000));const at=r?new Date(Date.now()+r*1000):null;return <div key={w.kind||i} className="text-[10px]"><span className="text-text-muted capitalize">{w.kind||"batas"}:</span> {r?"dalam "+left(r):"siap diperbarui"}{at&&<span className="ml-1 text-text-muted">(~{at.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})})</span>}</div>})}</div>
}
Reset.propTypes={usage:PropTypes.object};

function quotaState(usage){
 const free=usage?.free_tokens;
 const remaining=Number(free?.remaining);
 const limit=Number(free?.limit_per_day);
 if(Number.isFinite(remaining)&&Number.isFinite(limit)&&limit>0)return {kind:"token",remaining,limit,pct:Math.max(0,Math.min(100,remaining/limit*100))};
 const rpm=usage?.rate_limit;
 const rpmRemaining=Number(rpm?.remaining);
 const rpmLimit=Number(rpm?.limit);
 if(Number.isFinite(rpmRemaining)&&Number.isFinite(rpmLimit)&&rpmLimit>0)return {kind:"rpm",remaining:rpmRemaining,limit:rpmLimit,pct:Math.max(0,Math.min(100,rpmRemaining/rpmLimit*100))};
 return null;
}
function QuotaMeter({usage}){
 const q=quotaState(usage);
 const local=usage?.local||{};
 const input=Number(local.inputTokens)||0;
 const output=Number(local.outputTokens)||0;
 const total=input+output;
 const requests=Number(local.requests)||0;
 const cache=Number(local.cacheReadTokens)||0;
 return <div className="min-w-0 space-y-2">
   {q ? <div>
     <div className="flex items-center justify-between gap-2 text-[10px]"><span className="text-text-muted">{q.kind==="token"?"Token tersisa":"Permintaan tersisa"}</span><b>{n(q.remaining)} / {n(q.limit)}</b></div>
     <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border/50"><div className={"h-full rounded-full "+(q.pct<=10?"bg-red-500":q.pct<50?"bg-amber-400":"bg-emerald-500")} style={{width:q.pct+"%"}}/></div>
   </div> : null}
   <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
     <span className="text-text-muted">Token dipakai</span><b>{n(total)}</b>
     <span className="text-text-muted">Input</span><span>{n(input)}</span>
     <span className="text-text-muted">Output</span><span>{n(output)}</span>
     <span className="text-text-muted">Request</span><span>{n(requests)}</span>
     {cache>0&&<><span className="text-text-muted">Cache read</span><span>{n(cache)}</span></>}
   </div>
   {!q&&<div className="text-[9px] text-text-muted">Sisa token akun: tidak disediakan provider</div>}
 </div>
}
QuotaMeter.propTypes={usage:PropTypes.object};
function Row({c,index,total,usage,proxyPools,apiKeys=[],selected,onSelect,onUp,onDown,onToggle,onEdit,onDelete,onTest,onScopeChange,testing}){
 const status=c.isActive===false?"Nonaktif":["active","success"].includes(c.testStatus)?"Aktif":["error","unavailable","expired"].includes(c.testStatus)?"Error":"Belum diuji";
 const proxy=proxyPools.find(p=>p.id===c.providerSpecificData?.proxyPoolId);
 return <tr className="border-t-2 border-border align-top hover:bg-white/[.04]">
  <td className="border-r border-border px-1.5 py-3 text-center"><input type="checkbox" aria-label={"Pilih koneksi "+(c.name||index+1)} checked={selected} onChange={onSelect} className="size-4 accent-primary"/></td>
  <td className="border-r border-border px-1 py-3 text-center"><b className="text-xs">#{index+1}</b><div className="mt-1 flex flex-col items-center gap-1"><button type="button" aria-label="Naikkan prioritas" title="Naikkan prioritas" disabled={!index} onClick={onUp} className="rounded-md border border-border bg-background px-1 disabled:opacity-25"><span className="material-symbols-outlined text-[15px]">keyboard_arrow_up</span></button><button type="button" aria-label="Turunkan prioritas" title="Turunkan prioritas" disabled={index===total-1} onClick={onDown} className="rounded-md border border-border bg-background px-1 disabled:opacity-25"><span className="material-symbols-outlined text-[15px]">keyboard_arrow_down</span></button></div></td>
  <td className="min-w-0 border-r border-border px-2 py-3 break-words"><div className="text-sm font-semibold">{c.name||"Koneksi tanpa nama"}</div><div className="mt-1 flex gap-1"><Badge size="sm" variant={status==="Aktif"?"success":status==="Error"?"error":"default"} dot>{status}</Badge>{proxy&&<Badge size="sm">Proxy: {proxy.name}</Badge>}</div>{c.lastError&&<div className="mt-2 max-w-[270px] truncate text-[10px] text-red-500" title={c.lastError}>{c.lastError}</div>}</td>
  <td className="min-w-0 border-r border-border px-2 py-3"><Select label="Cakupan kunci API" value={c.providerSpecificData?.apiKeyScopeId || "global"} onChange={e=>onScopeChange(c,e.target.value)} options={[{value:"global",label:"Global (semua key)"},...apiKeys.map(k=>({value:k.id,label:k.name||"API key"}))]}/></td>
  <td className="min-w-0 border-r border-border px-2 py-3"><div className="space-y-2"><QuotaMeter usage={usage}/><div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-text-muted">{usage?.plan&&<span>Paket: {usage.plan}</span>}{usage?.wallet?.balance_usd!=null&&<span>Saldo: $ {usage.wallet.balance_usd}</span>}{usage?.rate_limit?.remaining!=null&&<span>RPM: {n(usage.rate_limit.remaining)}/{n(usage.rate_limit.limit)}</span>}</div><div><span className="text-[9px] text-text-muted">Reset: </span><Reset usage={usage}/></div></div></td>
  <td className="min-w-0 px-2 py-3"><div className="flex flex-wrap gap-1.5"><button type="button" title="Uji koneksi API" aria-label="Uji koneksi API" onClick={onTest} disabled={testing} className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5 text-[10px] font-semibold text-primary"><span className="material-symbols-outlined text-[13px]">{testing?"progress_activity":"science"}</span><span>{testing?"Menguji":"Uji"}</span></button><button type="button" title="Ubah pengaturan koneksi" onClick={onEdit} className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-[10px] font-semibold"><span className="material-symbols-outlined text-[13px]">edit</span><span>Ubah</span></button><button type="button" title="Hapus koneksi" onClick={onDelete} className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[10px] font-semibold text-red-500"><span className="material-symbols-outlined text-[13px]">delete</span><span>Hapus</span></button><div className="flex items-center gap-1 text-[10px]"><Toggle size="sm" checked={c.isActive!==false} onChange={onToggle}/><span>{c.isActive!==false?"Aktif":"Mati"}</span></div></div><div className="mt-2 text-[10px] text-text-muted">Terakhir diuji: {c.lastTested?new Date(c.lastTested).toLocaleString("id-ID"):"Belum pernah"}</div></td>
 </tr>
}
Row.propTypes={c:PropTypes.object.isRequired,index:PropTypes.number.isRequired,total:PropTypes.number.isRequired,usage:PropTypes.object,proxyPools:PropTypes.array,selected:PropTypes.bool,onSelect:PropTypes.func.isRequired,onUp:PropTypes.func.isRequired,onDown:PropTypes.func.isRequired,onToggle:PropTypes.func.isRequired,onEdit:PropTypes.func.isRequired,onDelete:PropTypes.func.isRequired,onTest:PropTypes.func.isRequired,onScopeChange:PropTypes.func,apiKeys:PropTypes.array,testing:PropTypes.bool};

export default function ProviderConnectionsTable({connections,proxyPools=[],apiKeys=[],selectedIds=[],allSelected,onSelect,onSelectAll,onMoveUp,onMoveDown,onToggleActive,onEdit,onDelete,onTest,onScopeChange,testingIds=[],providerName,providerIcon,officialWebsite,officialBaseUrl,onAddKey,requireApiKey=false}){
 const [q,setQ]=useState(""),[status,setStatus]=useState("all"),[sort,setSort]=useState("priority"),[usage,setUsage]=useState({});
 useEffect(()=>{let stop=false;const load=async()=>{const out={};await Promise.all(connections.map(async c=>{try{const r=await fetch("/api/usage/"+encodeURIComponent(c.id),{cache:"no-store"}),d=await r.json().catch(()=>null);if(r.ok&&d&&!d.error)out[c.id]={...d,_loadedAt:Date.now()}}catch{}}));if(!stop)setUsage(out)};load();const t=setInterval(load,15000);return()=>{stop=true;clearInterval(t)}},[connections]);
  const rows=useMemo(
    ()=>connections.filter(c=>{
      if(requireApiKey&&!c.hasApiKey)return false;
      const text=[c.name,c.email,c.defaultModel,c.lastError].filter(Boolean).join(" ").toLowerCase();
      return(!q||text.includes(q.toLowerCase()))&&(status==="all"||(status==="active"&&c.isActive!==false)||(status==="inactive"&&c.isActive===false)||(status==="error"&&["error","unavailable","expired"].includes(c.testStatus)));
    }).sort((a,b)=>sort==="name"?String(a.name||"").localeCompare(String(b.name||"")):sort==="status"?String(a.testStatus||"").localeCompare(String(b.testStatus||"")):Number(a.priority||0)-Number(b.priority||0)),
    [connections,q,status,sort,requireApiKey]
  );
 return <div className="mr-provider-connections w-full min-w-0 max-w-full overflow-hidden rounded-xl border-2 border-border bg-background/70"><div className="border-b border-border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Koneksi Penyedia</h2><Badge size="sm">{rows.length} koneksi</Badge><a href={officialWebsite||"#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 hover:border-primary/40" title="Buka situs resmi"><span className="flex size-6 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">{providerIcon||<span className="material-symbols-outlined text-[15px]">hub</span>}</span>{providerName||"Provider"}<span className="material-symbols-outlined text-[12px] text-text-muted">open_in_new</span></a></div><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-text-muted"><span className="material-symbols-outlined text-[14px]">verified</span>Base URL resmi:<code className="rounded border border-border bg-sidebar/50 px-2 py-1 font-mono">{officialBaseUrl||"Belum diketahui"}</code>{officialBaseUrl&&<button onClick={()=>navigator.clipboard?.writeText(officialBaseUrl)} className="rounded p-1 hover:bg-sidebar" title="Salin"><span className="material-symbols-outlined text-[14px]">content_copy</span></button>}</div></div><div className="flex gap-2"><Button size="sm" icon="add" onClick={onAddKey}>Tambah Kunci</Button><Button size="sm" variant="secondary" icon="science" onClick={()=>connections.forEach(c=>onTest(c.id))} disabled={!connections.length||testingIds.length>0}>Uji Semua</Button></div></div><div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_160px]"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari nama, model, atau kesalahan..." className="rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"/><Select label="Status" value={status} onChange={e=>setStatus(e.target.value)} options={[{value:"all",label:"Semua status"},{value:"active",label:"Aktif"},{value:"inactive",label:"Nonaktif"},{value:"error",label:"Error"}]}/><Select label="Urutkan" value={sort} onChange={e=>setSort(e.target.value)} options={[{value:"priority",label:"Prioritas"},{value:"name",label:"Nama"},{value:"status",label:"Status"}]}/></div></div><div className="w-full min-w-0"><table className="w-full table-fixed border-collapse text-left"><colgroup><col style={{width:"4%"}}/><col style={{width:"6%"}}/><col style={{width:"19%"}}/><col style={{width:"17%"}}/><col style={{width:"27%"}}/><col style={{width:"27%"}}/></colgroup><thead className="bg-sidebar/60"><tr className="border-b-2 border-border text-[10px] uppercase tracking-wider text-text-muted"><th className="border-r border-border px-1 py-3 text-center"><input type="checkbox" checked={allSelected} onChange={onSelectAll} className="size-4 accent-primary"/></th><th className="border-r border-border px-1 py-3 text-center">No</th><th className="border-r border-border px-2 py-3">Nama / Status</th><th className="border-r border-border px-2 py-3">Cakupan kunci</th><th className="border-r border-border px-2 py-3">Pemakaian / reset</th><th className="px-2 py-3">Tindakan</th></tr></thead><tbody>{rows.map((c,i)=><Row key={c.id} c={c} index={i} total={rows.length} usage={usage[c.id]} proxyPools={proxyPools} apiKeys={apiKeys} onScopeChange={onScopeChange} selected={selectedIds.includes(c.id)} onSelect={()=>onSelect(c.id)} onMoveUp={()=>onMoveUp(connections.indexOf(c),connections.indexOf(c)-1)} onMoveDown={()=>onMoveDown(connections.indexOf(c),connections.indexOf(c)+1)} onToggle={v=>onToggleActive(c.id,v)} onEdit={()=>onEdit(c)} onDelete={()=>onDelete(c.id)} onTest={()=>onTest(c.id)} testing={testingIds.includes(c.id)}/>)}</tbody></table></div>{!rows.length&&<div className="p-8 text-center text-xs text-text-muted">Tidak ada koneksi yang cocok.</div>}</div>
}
ProviderConnectionsTable.propTypes={connections:PropTypes.array.isRequired,proxyPools:PropTypes.array,selectedIds:PropTypes.array,allSelected:PropTypes.bool,onSelect:PropTypes.func.isRequired,onSelectAll:PropTypes.func.isRequired,onMoveUp:PropTypes.func.isRequired,onMoveDown:PropTypes.func.isRequired,onToggleActive:PropTypes.func.isRequired,onEdit:PropTypes.func.isRequired,onDelete:PropTypes.func.isRequired,onTest:PropTypes.func.isRequired,testingIds:PropTypes.array,providerName:PropTypes.string,providerIcon:PropTypes.node,officialWebsite:PropTypes.string,officialBaseUrl:PropTypes.string,onAddKey:PropTypes.func.isRequired,onScopeChange:PropTypes.func,apiKeys:PropTypes.array,requireApiKey:PropTypes.bool};