// FILE: sqlite.ts
// Purpose: Defensive, read-only access to VS Code-style ItemTable SQLite databases.
// Supports both Bun and Node runtimes via dynamic imports.

let readSqliteValueFn:
  | ((
      dbPath: string,
      table: string,
      keyCol: string,
      key: string,
      valueCol: string,
    ) => Promise<string | null>)
  | null = null;

export async function readSqliteValue(
  dbPath: string,
  table: string,
  keyCol: string,
  key: string,
  valueCol: string,
): Promise<string | null> {
  if (!readSqliteValueFn) {
    try {
      if (typeof (globalThis as Record<string, unknown>).Bun !== "undefined") {
        const { Database } = await import("bun:sqlite");
        readSqliteValueFn = async (path, t, kc, kv, vc) => {
          try {
            const db = new Database(path, { readonly: true });
            const result = db.query(`SELECT ${vc} FROM ${t} WHERE ${kc} = ?`).get(kv) as
              | Record<string, unknown>
              | undefined;
            db.close();
            return typeof result?.[vc] === "string" ? (result[vc] as string) : null;
          } catch {
            return null;
          }
        };
      } else {
        const betterSqlite3 = await import("better-sqlite3");
        readSqliteValueFn = async (path, t, kc, kv, vc) => {
          try {
            const db = new betterSqlite3.default(path, { readonly: true });
            const result = db.prepare(`SELECT ${vc} FROM ${t} WHERE ${kc} = ?`).get(kv) as
              | Record<string, unknown>
              | undefined;
            db.close();
            return typeof result?.[vc] === "string" ? (result[vc] as string) : null;
          } catch {
            return null;
          }
        };
      }
    } catch {
      readSqliteValueFn = async () => null;
    }
  }
  return readSqliteValueFn(dbPath, table, keyCol, key, valueCol);
}
