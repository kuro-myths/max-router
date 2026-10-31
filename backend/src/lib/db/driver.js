import { ensureDirs, DATA_FILE } from "./paths.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

async function tryBunSqlite() {
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
  const supabaseDatabaseUrl = process.env.SUPABASE_DATABASE_URL?.trim();
  const isProduction = process.env.NODE_ENV === "production";
  const allowEphemeralSqlite = /^(1|true|yes)$/i.test(process.env.ALLOW_EPHEMERAL_SQLITE || "");

  // Supabase PostgreSQL is an explicit primary database and takes precedence over
  // legacy Railway MySQL variables during the migration.
  const postgresUrl = supabaseDatabaseUrl ||
    (/^postgres(?:ql)?:\/\//i.test(databaseUrl || "") ? databaseUrl : "");
  if (postgresUrl) {
    const { createPostgresAdapter } = await import("./adapters/postgresAdapter.js");
    const adapter = await createPostgresAdapter(postgresUrl);
    if (!state.logged) {
      const parsed = new URL(postgresUrl);
      console.log(`[DB] Driver: ${adapter.driver} | host: ${parsed.hostname} | database: ${parsed.pathname.slice(1)}`);
      state.logged = true;
    }
    return adapter;
  }

  const mysqlUrl = process.env.MYSQL_URL?.trim() ||
    (/^mysql(?:s)?:\/\//i.test(databaseUrl || "") || /^mariadb:\/\//i.test(databaseUrl || "") ? databaseUrl : "");
  if (mysqlUrl) {
    const legacyUrl = process.env.LEGACY_DATABASE_URL?.trim();
    const { createMysqlAdapter } = await import("./adapters/mysqlAdapter.js");
    const adapter = await createMysqlAdapter(mysqlUrl, legacyUrl || null);
    if (!state.logged) {
      const parsed = new URL(mysqlUrl);
      console.log(`[DB] Driver: ${adapter.driver} | host: ${parsed.hostname} | database: ${parsed.pathname.slice(1)}`);
      state.logged = true;
    }
    return adapter;
  }

  if (isProduction && !allowEphemeralSqlite) {
    throw new Error("[DB] Database production belum dikonfigurasi. Set SUPABASE_DATABASE_URL (PostgreSQL), DATABASE_URL, atau MYSQL_URL.");
  }

  ensureDirs();
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
