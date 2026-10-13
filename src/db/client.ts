import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

const globalForDb = globalThis as unknown as { __ascendDb?: DB; __ascendSqlite?: Database.Database };

export function resolveDbPath(): string {
  const p = process.env.DATABASE_PATH ?? "./data/ascend.db";
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export function migrationsFolder(): string {
  return path.join(process.cwd(), "src", "db", "migrations");
}

/**
 * Opens (and lazily migrates) the SQLite database. Cached on globalThis so the
 * Next.js dev server's hot reloads do not open hundreds of handles.
 */
export function getDb(): DB {
  if (globalForDb.__ascendDb) return globalForDb.__ascendDb;

  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });

  globalForDb.__ascendDb = db;
  globalForDb.__ascendSqlite = sqlite;
  return db;
}

/** Used by tests and scripts that want an isolated in-memory database. */
export function createTestDb(): DB {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}

export { schema };
