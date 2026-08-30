/**
 * Load Node's built-in sqlite without an `import`/`require` of `node:sqlite`.
 * Turbopack breaks both (`require is not defined` / unsupported external Url).
 */
type SqliteModule = typeof import("node:sqlite")

function loadSqlite(): SqliteModule {
  const loader = (
    process as NodeJS.Process & {
      getBuiltinModule?: (id: string) => unknown
    }
  ).getBuiltinModule
  if (typeof loader !== "function") {
    throw new Error(
      "process.getBuiltinModule is required for node:sqlite under Next/Turbopack"
    )
  }
  const sqlite = loader("node:sqlite") as SqliteModule | undefined
  if (!sqlite?.DatabaseSync) {
    throw new Error("Built-in node:sqlite is unavailable in this Node runtime")
  }
  return sqlite
}

const sqlite = loadSqlite()

export const DatabaseSync = sqlite.DatabaseSync
export type DatabaseSync = InstanceType<typeof sqlite.DatabaseSync>
