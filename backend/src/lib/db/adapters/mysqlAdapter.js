import { AsyncLocalStorage } from "node:async_hooks";
import mysql from "mysql2/promise";
import pg from "pg";
import { TABLES, buildCreateTableSql } from "../schema.js";
import { latestVersion } from "../migrations/index.js";

const { Pool: PgPool } = pg;
const transactionStorage = new AsyncLocalStorage();
const canonicalColumns = new Map();
for (const def of Object.values(TABLES)) {
  for (const column of Object.keys(def.columns)) canonicalColumns.set(column.toLowerCase(), column);
}

function mapRow(row) {
  if (!row) return row;
  const mapped = {};
  for (const [key, value] of Object.entries(row)) mapped[canonicalColumns.get(key.toLowerCase()) || key] = value;
  return mapped;
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error("Invalid SQL identifier: " + identifier);
  return "`" + identifier + "`";
}

// Translate the small set of SQLite/PostgreSQL-compatible SQL idioms used by
// the repository into MySQL 8 syntax. Parameter values remain parameterized.
function translateSql(sql) {
  let out = String(sql)
    .replace(/\bINSERT\s+OR\s+REPLACE\s+INTO\b/gi, "REPLACE INTO")
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT IGNORE INTO")
    .replace(/\s+ON\s+CONFLICT\s*\([^)]*\)\s+DO\s+UPDATE\s+SET\s+([\s\S]*?)\s*;?\s*$/i, (_all, assignments) =>
      " ON DUPLICATE KEY UPDATE " + assignments.replace(/\bexcluded\.([A-Za-z_][A-Za-z0-9_]*)/gi, (_m, column) => "VALUES(" + quoteIdentifier(column) + ")")
    )
    .replace(/\bREAL\b/gi, "DOUBLE");
  // KEY is reserved in MySQL but is an ordinary column name in the SQLite schema.
  // Only quote it outside SQL string literals and comments.
  let result = "";
  let mode = "normal";
  for (let i = 0; i < out.length; i++) {
    const ch = out[i], next = out[i + 1];
    if (mode === "single" || mode === "double" || mode === "backtick") {
      result += ch;
      const end = mode === "single" ? "'" : mode === "double" ? '"' : "`";
      if (ch === end) {
        if (next === end) { result += next; i++; }
        else mode = "normal";
      } else if (ch === "\\" && mode !== "backtick" && next) { result += next; i++; }
      continue;
    }
    if (mode === "line") { result += ch; if (ch === "\n") mode = "normal"; continue; }
    if (mode === "block") {
      result += ch;
      if (ch === "*" && next === "/") { result += next; i++; mode = "normal"; }
      continue;
    }
    if (ch === "'") { mode = "single"; result += ch; continue; }
    if (ch === '"') { mode = "double"; result += ch; continue; }
    if (ch === "`") { mode = "backtick"; result += ch; continue; }
    if (ch === "-" && next === "-") { mode = "line"; result += ch + next; i++; continue; }
    if (ch === "/" && next === "*") { mode = "block"; result += ch + next; i++; continue; }
    const match = out.slice(i).match(/^key\b/i);
    if (match && (i === 0 || !/[A-Za-z0-9_]/.test(out[i - 1]))) {
      result += "`key`"; i += match[0].length - 1; continue;
    }
    result += ch;
  }
  return result;
}

function mysqlColumnList(def) {
  const indexed = new Set();
  for (const [name, column] of Object.entries(def.columns)) {
    if (/\bPRIMARY\s+KEY\b|\bUNIQUE\b/i.test(column)) indexed.add(name);
  }
  for (const clause of [def.primaryKey, ...(def.unique || []).map((x) => x)]) {
    if (typeof clause === "string") {
      const matches = clause.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
      for (const match of matches) if (def.columns[match]) indexed.add(match);
    }
  }
  for (const indexSql of def.indexes || []) {
    const match = indexSql.match(/\bON\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/i);
    if (match) {
      for (const part of match[1].split(",")) {
        const name = part.trim().split(/\s+/)[0].replace(/[`"]/g, "");
        if (def.columns[name]) indexed.add(name);
      }
    }
  }
  return indexed;
}

function normalizeMysqlDefinition(name, definition, indexed) {
  let result = definition.trim();
  if (/^INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT$/i.test(result)) return "INT NOT NULL AUTO_INCREMENT PRIMARY KEY";
  result = result.replace(/\bAUTOINCREMENT\b/gi, "AUTO_INCREMENT").replace(/\bREAL\b/gi, "DOUBLE");
  if (/\bTEXT\b/i.test(result)) {
    const useVarchar = indexed.has(name) || /\bDEFAULT\b/i.test(result);
    result = result.replace(/\bTEXT\b/gi, useVarchar ? "VARCHAR(191)" : "LONGTEXT");
    if (/LONGTEXT/i.test(result)) result = result.replace(/\bDEFAULT\s+'([^']*)'/i, "DEFAULT ('$1')");
  }
  return result;
}

function mysqlCreateTableSql(name, def) {
  const indexed = mysqlColumnList(def);
  const cols = Object.entries(def.columns).map(([column, definition]) => {
    const columnName = column.toLowerCase() === "key" ? "`key`" : column;
    return columnName + " " + normalizeMysqlDefinition(column, definition, indexed);
  });
  if (def.primaryKey) cols.push(def.primaryKey.replace(/\bkey\b/gi, "`key`"));
  if (def.unique) cols.push("UNIQUE (" + def.unique.map((column) => column.toLowerCase() === "key" ? "`key`" : column).join(", ") + ")");
  return "CREATE TABLE IF NOT EXISTS " + quoteIdentifier(name) + " (" + cols.join(", ") + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
}

async function ensureIndex(pool, indexSql, tableName) {
  const match = indexSql.match(/^CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([A-Za-z_][A-Za-z0-9_]*)\s+ON\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i);
  if (!match) {
    await pool.query(translateSql(indexSql.replace(/\bIF\s+NOT\s+EXISTS\b/i, "")));
    return;
  }
  const [, unique, indexName, actualTable, rawColumns] = match;
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
    [actualTable, indexName],
  );
  if (rows.length) return;
  const columns = rawColumns.split(",").map((part) => {
    const pieces = part.trim().split(/\s+/);
    return quoteIdentifier(pieces[0].replace(/[`"]/g, "")) + (pieces[1] && /^(ASC|DESC)$/i.test(pieces[1]) ? " " + pieces[1].toUpperCase() : "");
  }).join(", ");
  await pool.query("CREATE " + (unique ? "UNIQUE " : "") + "INDEX " + quoteIdentifier(indexName) + " ON " + quoteIdentifier(tableName) + " (" + columns + ")");
}

async function syncSchema(pool) {
  for (const [tableName, def] of Object.entries(TABLES)) {
    await pool.query(mysqlCreateTableSql(tableName, def));
    const [existing] = await pool.query("SHOW COLUMNS FROM " + quoteIdentifier(tableName));
    const existingNames = new Set(existing.map((row) => String(row.Field).toLowerCase()));
    const indexed = mysqlColumnList(def);
    for (const [columnName, definition] of Object.entries(def.columns)) {
      if (!existingNames.has(columnName.toLowerCase())) {
        const columnDef = normalizeMysqlDefinition(columnName, definition, indexed)
          .replace(/\bPRIMARY KEY\b/ig, "")
          .replace(/\bUNIQUE\b/ig, "")
          .trim();
        await pool.query("ALTER TABLE " + quoteIdentifier(tableName) + " ADD COLUMN " + (columnName.toLowerCase() === "key" ? "`key`" : quoteIdentifier(columnName)) + " " + columnDef);
      }
    }
    for (const indexSql of def.indexes || []) await ensureIndex(pool, indexSql, tableName);
  }
}

async function importLegacyPostgres(pool, connectionString) {
  if (!connectionString || !/^postgres(?:ql)?:\/\//i.test(connectionString)) return { imported: false, tables: 0, rows: 0 };
  const [markerRows] = await pool.query("SELECT value FROM `_meta` WHERE `key` = ?", ["postgresImportCompleted"]);
  if (markerRows.length && markerRows[0].value === "true") return { imported: false, tables: 0, rows: 0 };
  const [startedRows] = await pool.query("SELECT value FROM `_meta` WHERE `key` = ?", ["postgresImportStarted"]);
  const retrying = startedRows.length && startedRows[0].value === "true";

  // The target is expected to be a newly provisioned database. Record intent before
  // copying so an interrupted run can safely resume using idempotent upserts.
  if (!retrying) {
    for (const tableName of Object.keys(TABLES).filter((name) => name !== "_meta")) {
      const [countRows] = await pool.query("SELECT COUNT(*) AS c FROM " + quoteIdentifier(tableName));
      if (Number(countRows[0]?.c || 0) > 0) throw new Error("[DB][mysql-migrate] MySQL target is not empty; refusing automatic import.");
    }
    await pool.query("INSERT INTO `_meta` (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", ["postgresImportStarted", "true"]);
  }

  const source = new PgPool({ connectionString, connectionTimeoutMillis: 10000, max: 2 });
  let tables = 0, rowsCopied = 0;
  try {
    await source.query("SELECT 1");
    for (const [tableName, def] of Object.entries(TABLES)) {
      if (tableName === "_meta") continue;
      const sourceName = tableName.toLowerCase();
      const exists = await source.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1",
        [sourceName],
      );
      if (!exists.rowCount) continue;
      const fields = Object.keys(def.columns);
      let offset = 0, tableRows = 0;
      while (true) {
        const batch = await source.query('SELECT * FROM "' + sourceName + '" LIMIT $1 OFFSET $2', [250, offset]);
        if (!batch.rows.length) break;
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          for (const sourceRow of batch.rows) {
            const row = mapRow(sourceRow);
            const columns = fields.filter((field) => Object.prototype.hasOwnProperty.call(row, field));
            if (!columns.length) continue;
            const names = columns.map((field) => field.toLowerCase() === "key" ? "`key`" : quoteIdentifier(field)).join(", ");
            const placeholders = columns.map(() => "?").join(", ");
            const updates = columns.filter((field) => !/\bPRIMARY\s+KEY\b/i.test(def.columns[field]))
              .map((field) => (field.toLowerCase() === "key" ? "`key`" : quoteIdentifier(field)) + "=VALUES(" + (field.toLowerCase() === "key" ? "`key`" : quoteIdentifier(field)) + ")");
            const sql = "INSERT INTO " + quoteIdentifier(tableName) + " (" + names + ") VALUES (" + placeholders + ")" +
              (updates.length ? " ON DUPLICATE KEY UPDATE " + updates.join(", ") : "");
            await connection.execute(sql, columns.map((field) => row[field]));
            tableRows++;
          }
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
        offset += batch.rows.length;
        if (batch.rows.length < 250) break;
      }
      if (tableRows) { tables++; rowsCopied += tableRows; }
      console.log("[DB][mysql-migrate] " + tableName + ": " + tableRows + " rows imported");
    }
    const metaExists = await source.query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_meta' LIMIT 1");
    if (metaExists.rowCount) {
      const metaRows = await source.query('SELECT "key", value FROM "_meta"');
      for (const row of metaRows.rows) {
        if (row.key === "postgresImportCompleted" || row.key === "postgresImportStarted") continue;
        await pool.query("INSERT INTO `_meta` (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [row.key, row.value]);
      }
    }
    await pool.query(
      "INSERT INTO `_meta` (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      ["postgresImportCompleted", "true"],
    );
    console.log("[DB][mysql-migrate] PostgreSQL import complete: " + tables + " tables, " + rowsCopied + " rows");
    return { imported: true, tables, rows: rowsCopied };
  } finally {
    await source.end();
  }
}

export async function createMysqlAdapter(connectionString, legacyConnectionString = null) {
  const parsedUrl = new URL(connectionString);
  if (!["mysql:", "mariadb:"].includes(parsedUrl.protocol.toLowerCase())) throw new Error("[DB] MYSQL_URL must use mysql:// or mariadb://");
  const pool = mysql.createPool({
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port || 3306),
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: decodeURIComponent(parsedUrl.pathname.replace(/^\//, "")),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    charset: "utf8mb4",
    timezone: "Z",
    enableKeepAlive: true,
    multipleStatements: false,
  });
  pool.on("error", (error) => console.error("[DB] MySQL pool error:", error));
  try {
    await pool.query("SELECT 1");
    await syncSchema(pool);
    const migration = await importLegacyPostgres(pool, legacyConnectionString);
    await pool.query(
      "INSERT INTO `_meta` (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      ["schemaVersion", String(latestVersion())],
    );
    if (migration.imported) console.log("[DB][mysql] imported legacy PostgreSQL data:", migration);
  } catch (error) {
    await pool.end();
    throw error;
  }

  function currentConnection() { return transactionStorage.getStore()?.connection || pool; }
  async function query(sql, params = []) { return currentConnection().execute(translateSql(sql), params); }

  return {
    driver: "mysql",
    async run(sql, params = []) {
      const [result] = await query(sql, params);
      return { changes: result.affectedRows ?? 0, lastInsertRowid: result.insertId ?? null, row: undefined };
    },
    async get(sql, params = []) {
      const [rows] = await query(sql, params);
      return rows[0] ? mapRow(rows[0]) : undefined;
    },
    async all(sql, params = []) {
      const [rows] = await query(sql, params);
      return rows.map(mapRow);
    },
    async exec(sql) { await currentConnection().query(translateSql(sql)); },
    async transaction(fn) {
      const current = transactionStorage.getStore();
      if (current) {
        const savepoint = "sp_" + Math.random().toString(36).slice(2);
        await current.connection.query("SAVEPOINT " + savepoint);
        try {
          const value = await fn();
          await current.connection.query("RELEASE SAVEPOINT " + savepoint);
          return value;
        } catch (error) {
          await current.connection.query("ROLLBACK TO SAVEPOINT " + savepoint);
          await current.connection.query("RELEASE SAVEPOINT " + savepoint);
          throw error;
        }
      }
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const value = await transactionStorage.run({ connection }, fn);
        await connection.commit();
        return value;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    checkpoint() {},
    async close() { await pool.end(); },
    raw: pool,
  };
}
