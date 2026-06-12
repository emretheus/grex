// better-sqlite3 is an optional runtime dependency used only on Node.js
// as a fallback when Bun's native SQLite is unavailable.
declare module "better-sqlite3" {
  class BetterSqlite3 {
    constructor(path: string, opts?: { readonly?: boolean });
    prepare(sql: string): { get(...args: unknown[]): unknown };
    close(): void;
  }
  export default BetterSqlite3;
}
