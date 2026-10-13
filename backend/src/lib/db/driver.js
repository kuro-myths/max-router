import { ensureDirs, DATA_FILE } from "./paths.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

async function tryBunSqlite() {
  // Bun runtime only — built-in, no install needed
  if (!process.versions.bun) return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return await createBunSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] bun:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function tryBetterSqlite() {
  // Skip on Bun — better-sqlite3 native bindings unsupported
  if (process.versions.bun) return null;
  try {
    const { createBetterSqliteAdapter } = await import("./adapters/betterSqliteAdapter.js");
    return createBetterSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] better-sqlite3 unavailable: ${e.message}`);
    return null;
  }
}

async function tryNodeSqlite() {
  // Built-in since Node 22.5.0 — no install needed. Skip under Bun (no node:sqlite).
  if (process.versions.bun) return null;
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return await createNodeSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] node:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function trySqlJs() {
  try {
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] sql.js unavailable: ${e.message}`);
    return null;
  }
}

async function initAdapter() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const allowEphemeralSqlite = /^(1|true|yes)$/i.test(
    process.env.ALLOW_EPHEMERAL_SQLITE || ""
  );

  if (isProduction && !databaseUrl && !allowEphemeralSqlite) {
    throw new Error(
      "[DB] MYSQL_URL wajib di production. SQLite lokal/ephemeral dinonaktifkan agar koneksi OAuth provider tidak hilang saat redeploy. Set MYSQL_URL ke layanan MySQL Railway."
    );
  }

  const mysqlUrl = process.env.MYSQL_URL?.trim() || (/^mysql(?:s)?:\/\//i.test(databaseUrl || "") || /^mariadb:\/\//i.test(databaseUrl || "") ? databaseUrl : "");
  if (mysqlUrl) {
    const legacyUrl = databaseUrl && databaseUrl !== mysqlUrl && /^postgres(?:ql)?:\/\//i.test(databaseUrl) ? databaseUrl : process.env.LEGACY_DATABASE_URL?.trim();
    const { createMysqlAdapter } = await import("./adapters/mysqlAdapter.js");
    const adapter = await createMysqlAdapter(mysqlUrl, legacyUrl || null);
    if (!state.logged) {
      const parsed = new URL(mysqlUrl);
      console.log(`[DB] Driver: ${adapter.driver} | host: ${parsed.hostname} | database: ${parsed.pathname.slice(1)}`);
      state.logged = true;
    }
    return adapter;
  }

  if (isProduction && !databaseUrl) {
    throw new Error("[DB] MYSQL_URL wajib di production. Set MYSQL_URL ke layanan MySQL Railway.");
  }
  if (databaseUrl) {
    if (isProduction) console.warn("[DB] MYSQL_URL belum tersedia; memakai PostgreSQL lama sementara agar layanan tetap hidup selama migrasi disiapkan.");
    const { createPostgresAdapter } = await import("./adapters/postgresAdapter.js");
    const adapter = await createPostgresAdapter(databaseUrl);
    if (!state.logged) {
      const parsed = new URL(databaseUrl);
      console.log(`[DB] Driver: ${adapter.driver} | host: ${parsed.hostname} | database: ${parsed.pathname.slice(1)}`);
      state.logged = true;
    }
    return adapter;
  }

  ensureDirs();
  // Order per runtime:
  //   Bun:  bun:sqlite → sql.js
  //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
  let adapter = await tryBunSqlite();
  if (!adapter) adapter = await tryBetterSqlite();
  if (!adapter) adapter = await tryNodeSqlite();
  if (!adapter) adapter = await trySqlJs();
  if (!adapter) throw new Error("[DB] No SQLite driver available (bun/better/node/sql.js all failed)");

  if (!state.logged) {
    console.log(`[DB] Driver: ${adapter.driver} | file: ${DATA_FILE}`);
    state.logged = true;
  }

  const { runMigrationOnce } = await import("./migrate.js");
  await runMigrationOnce(adapter);
  const { createAsyncAdapter } = await import("./adapters/asyncAdapter.js");
  return createAsyncAdapter(adapter);
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) state.initPromise = initAdapter().then((a) => { state.instance = a; return a; });
  return state.initPromise;
}

export function getAdapterSync() {
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}
