
import { getAdapter } from "../../lib/db/driver.js";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BACKEND_ROOT = fs.existsSync(path.join(process.cwd(), "src", "routes")) ? process.cwd() : path.join(process.cwd(), "backend");
const ROOT = path.dirname(BACKEND_ROOT);
const WORKFLOWS = path.join(ROOT, ".github", "workflows");
const issue = (id, area, severity, title, detail, evidence = "", fix = "") =>
  ({ id, area, severity, title, detail, evidence, fix });

function walk(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, test, out);
    else if (!test || test(file)) out.push(file);
  }
  return out;
}


async function scanRemoteGithub() {
  const repo = process.env.GITHUB_REPOSITORY || "rizki-habibi/max-router";
  const result = [];
  try {
    const headers = { Accept: "application/vnd.github+json", "User-Agent": "Max-Router-Diagnostics" };
    const listRes = await fetch("https://api.github.com/repos/" + repo + "/contents/.github/workflows", { headers });
    if (!listRes.ok) return [issue("YML-REMOTE", "YML / CI", "warning", "Workflow GitHub tidak dapat dibaca", "GitHub API mengembalikan HTTP " + listRes.status, repo, "Periksa nama repository atau GitHub API rate limit.")];
    const files = (await listRes.json()).filter(x => /\.(yml|yaml)$/i.test(x.name));
    for (const file of files) {
      const raw = await fetch(file.download_url, { headers: { "User-Agent": "Max-Router-Diagnostics" } });
      if (!raw.ok) {
        result.push(issue("YML-REMOTE-404", "YML / CI", "error", "Workflow gagal dibaca", file.path, "HTTP " + raw.status, "Periksa file workflow di GitHub."));
        continue;
      }
      const source = await raw.text();
      const lines = source.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/\t/.test(line)) result.push(issue("YML-REMOTE-001", "YML / CI", "error", "Tab ditemukan dalam YAML", file.path, "Baris " + (index + 1), "Ganti tab dengan spasi."));
        if (/\$\{\{[^}]*$/.test(line)) result.push(issue("YML-REMOTE-002", "YML / CI", "error", "Expression GitHub Actions tidak tertutup", file.path, "Baris " + (index + 1), "Periksa expression GitHub Actions."));
      });
    }

    const runsRes = await fetch("https://api.github.com/repos/" + repo + "/actions/runs?per_page=10", { headers });
    if (runsRes.ok) {
      const runs = await runsRes.json();
      for (const run of runs.workflow_runs || []) {
        if (["failure", "cancelled", "timed_out", "action_required"].includes(run.conclusion)) {
          result.push(issue("CI-RUN-" + run.id, "GitHub Actions", "error",
            "Workflow gagal: " + run.name,
            "Conclusion: " + run.conclusion + " · " + (run.head_branch || "unknown"),
            run.html_url || "", "Buka workflow run dan periksa job/log yang gagal."));
        }
      }
    }
  } catch (error) {
    result.push(issue("YML-REMOTE-500", "YML / CI", "warning", "Pemeriksaan GitHub gagal", error?.message || String(error), repo, "Periksa koneksi GitHub API."));
  }
  return result;
}

function scanYml() {
  const result = [];
  const files = walk(WORKFLOWS, f => /\.(yml|yaml)$/i.test(f));
  if (!files.length) return [issue("YML-000","YML / CI","info","YML tidak tersedia di runtime","Folder .github/workflows tidak ikut deployment runtime.","Pemeriksaan YML penuh membutuhkan source repository.")];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    const source = lines.join("\n");
    lines.forEach((line, index) => {
      if (/\t/.test(line)) result.push(issue("YML-001","YML / CI","error","Tab ditemukan dalam YAML",rel,"Baris " + (index + 1),"Ganti tab dengan spasi."));
      if (/\$\{\{[^}]*$/.test(line)) result.push(issue("YML-002","YML / CI","error","Expression GitHub Actions tidak tertutup",rel,"Baris " + (index + 1) + ": " + line.trim(),"Periksa expression GitHub Actions."));
    });
    if (!/^name:\s*/m.test(source)) result.push(issue("YML-003","YML / CI","warning","Workflow tidak memiliki name",rel,"Key name tidak ditemukan","Tambahkan name."));
    if (!/^on:\s*/m.test(source) && !/^['"]on['"]:\s*/m.test(source)) result.push(issue("YML-004","YML / CI","error","Trigger workflow tidak ditemukan",rel,"Key on tidak ditemukan","Tambahkan trigger GitHub Actions."));
  }
  return result;
}

async function scanDatabase() {
  try {
    const db = await getAdapter();
    const driver = db.driver || "unknown";
    const rows = /postgres/i.test(driver)
      ? await db.all("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'")
      : /mysql/i.test(driver)
        ? await db.all("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()")
        : await db.all("SELECT name FROM sqlite_master WHERE type = 'table'");
    const tables = rows || [];
    const result = [];
    if (!tables.some(x => x.name === "settings")) result.push(issue("DB-001","Database","error","Tabel settings tidak ditemukan","Database aktif tidak memiliki tabel settings.","Driver: " + driver,"Jalankan migration database."));
    return { result, meta: { driver, tableCount: tables.length } };
  } catch (error) {
    return { result: [issue("DB-500","Database","error","Database tidak dapat diperiksa",error?.message || String(error),"","Periksa DATABASE_URL, kredensial dan migration.")], meta: { driver:"unknown", tableCount:0 } };
  }
}

async function probe(req, pathname) {
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = protocol + "://" + host + pathname;
  const started = Date.now();
  try {
    const response = await fetch(url,{headers:{"x-diagnostic-probe":"1"},redirect:"manual"});
    return {ok:response.ok,status:response.status,ms:Date.now()-started,url};
  } catch (error) {
    return {ok:false,status:0,ms:Date.now()-started,url,error:error?.message || String(error)};
  }
}

async function scanApplication(req) {
  const result = [];
  const probes = await Promise.all([probe(req,"/api/health"),probe(req,"/dashboard")]);
  const health = probes[0], dashboard = probes[1];
  if (!health.ok) result.push(issue("API-001","Backend","error","Health API gagal","HTTP " + (health.status || "NETWORK") + " setelah " + health.ms + " ms",health.error || health.url,"Periksa backend, deployment dan runtime log."));
  if (!dashboard.ok && dashboard.status !== 302 && dashboard.status !== 401) result.push(issue("UI-001","UI / UX","error","Dashboard tidak dapat diakses","HTTP " + (dashboard.status || "NETWORK") + " setelah " + dashboard.ms + " ms",dashboard.error || dashboard.url,"Periksa frontend build dan SPA fallback."));
  if (health.ok && health.ms > 3000) result.push(issue("PERF-001","Performance","warning","Health API lambat","Respons " + health.ms + " ms",health.url,"Periksa cold start, database dan service latency."));
  return {result,probes};
}

function scanEnvironment() {
  const result = [];
  if (process.env.NODE_ENV === "production") {
    for (const key of ["JWT_SECRET"]) {
      if (!String(process.env[key] || "").trim()) result.push(issue("ENV-001","Environment","error",key + " belum dikonfigurasi","Variable wajib production tidak tersedia.",key,"Set sebagai environment secret."));
    }
    if (!String(process.env.MYSQL_URL || "").trim() && !/^mysql(?:s)?:\/\//i.test(String(process.env.DATABASE_URL || "")) && !/^mariadb:\/\//i.test(String(process.env.DATABASE_URL || ""))) result.push(issue("ENV-002","Environment","error","MYSQL_URL belum dikonfigurasi","Production harus menggunakan MySQL persisten.","NODE_ENV=production","Set MYSQL_URL ke layanan MySQL Railway."));
  }
  return result;
}

export async function GET_handler(req,res) {
  const started = Date.now();
  try {
    const [database,application,remoteGithub] = await Promise.all([scanDatabase(),scanApplication(req),scanRemoteGithub()]);
    const routeCount = walk(path.join(BACKEND_ROOT,"src","routes"),f => /\/route\.(ts|js)$/i.test(f)).length;
    const findings = [...scanYml(),...remoteGithub,...database.result,...application.result,...scanEnvironment()];
    if (!routeCount) findings.push(issue("ROUTE-001","Backend","error","Route module tidak ditemukan","Tidak ada route.ts/route.js yang terdeteksi."));
    const summary = findings.reduce((acc,item) => { acc[item.severity]=(acc[item.severity]||0)+1; return acc; },{error:0,warning:0,info:0});
    res.set("Cache-Control","no-store");
    return res.json({ok:summary.error===0,scannedAt:new Date().toISOString(),durationMs:Date.now()-started,summary,findings,database:database.meta,routes:{count:routeCount},probes:application.probes,capabilities:{yml:fs.existsSync(WORKFLOWS),database:true,backend:true,uiAssets:true,environment:true,githubActions:true}});
  } catch (error) {
    return res.status(500).json({ok:false,summary:{error:1,warning:0,info:0},findings:[issue("DIAG-500","System","error","Diagnostic engine gagal",error?.message || String(error),"","Periksa runtime logs.")]});
  }
}
