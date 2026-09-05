import { getWorldDb, WorldDbMissingError } from "@/lib/world-db"

export { WorldDbMissingError }
export {
  ADMIN_SQL_PRESETS,
  type AdminSqlPreset,
} from "@/lib/admin-sql-presets"

export const ADMIN_SQL_MAX_LENGTH = 10_000
export const ADMIN_SQL_MAX_ROWS = 500

export class AdminSqlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdminSqlError"
  }
}

const WRITE_KEYWORD =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|VACUUM|REINDEX|PRAGMA|TRUNCATE|GRANT|REVOKE|REPLACE\s+INTO)\b/i

/** Strip SQL comments so validators see the real statement text. */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Normalize and enforce read-only SELECT (or WITH / EXPLAIN) against world DB.
 * Throws AdminSqlError on violation.
 */
export function assertReadOnlySelect(sql: string): string {
  const raw = sql.trim()
  if (!raw) {
    throw new AdminSqlError("Query is empty")
  }
  if (raw.length > ADMIN_SQL_MAX_LENGTH) {
    throw new AdminSqlError(
      `Query exceeds ${ADMIN_SQL_MAX_LENGTH.toLocaleString()} characters`
    )
  }

  const normalized = stripSqlComments(raw)
  if (!normalized) {
    throw new AdminSqlError("Query is empty")
  }

  const body = normalized.replace(/;\s*$/, "")
  if (body.includes(";")) {
    throw new AdminSqlError("Multiple statements are not allowed")
  }

  if (WRITE_KEYWORD.test(body)) {
    throw new AdminSqlError("Only read-only SELECT queries are allowed")
  }

  if (!/^(WITH|SELECT|EXPLAIN)\b/i.test(body)) {
    throw new AdminSqlError("Query must start with SELECT, WITH, or EXPLAIN")
  }

  return body
}

export type AdminSqlCell = string | number | boolean | null

export type AdminSqlResult = {
  columns: string[]
  rows: AdminSqlCell[][]
  rowCount: number
  truncated: boolean
  maxRows: number
}

function serializeCell(value: unknown): AdminSqlCell {
  if (value === null || value === undefined) return null
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "boolean" || typeof value === "number") return value
  if (typeof value === "string") return value
  if (Buffer.isBuffer(value)) return value.toString("hex")
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex")
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Run a validated read-only query against world SQLite. */
export function runAdminSql(sql: string): AdminSqlResult {
  const statement = assertReadOnlySelect(sql)
  const db = getWorldDb()

  let rawRows: Record<string, unknown>[]
  try {
    rawRows = db.prepare(statement).all() as Record<string, unknown>[]
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed"
    throw new AdminSqlError(message)
  }

  const truncated = rawRows.length > ADMIN_SQL_MAX_ROWS
  const sliced = truncated ? rawRows.slice(0, ADMIN_SQL_MAX_ROWS) : rawRows
  const columns = sliced.length > 0 ? Object.keys(sliced[0]!) : []

  const rows = sliced.map((row) =>
    columns.map((col) => serializeCell(row[col]))
  )

  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated,
    maxRows: ADMIN_SQL_MAX_ROWS,
  }
}
