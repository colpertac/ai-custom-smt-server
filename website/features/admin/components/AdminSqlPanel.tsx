"use client"

import { useCallback, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import {
  ADMIN_SQL_PRESETS,
} from "@/lib/admin-sql-presets"
import { api } from "@/lib/kyClient"

type AdminSqlCell = string | number | boolean | null

type SqlResult = {
  columns: string[]
  rows: AdminSqlCell[][]
  rowCount: number
  truncated: boolean
  maxRows: number
}

function formatCell(value: AdminSqlCell): string {
  if (value === null) return "NULL"
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

export function AdminSqlPanel() {
  const [sql, setSql] = useState(ADMIN_SQL_PRESETS[0]!.sql)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SqlResult | null>(null)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post("admin/sql", { json: { sql } })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: SqlResult
      }
      if (!response.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${response.status}`)
        setResult(null)
        return
      }
      setResult(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed")
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [sql])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ADMIN_SQL_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            variant="outline"
            size="sm"
            title={preset.description}
            onClick={() => {
              setSql(preset.sql)
              setError(null)
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="admin-sql">SQL</FieldLabel>
          <Textarea
            id="admin-sql"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            spellCheck={false}
            className="min-h-40 resize-y font-mono text-xs"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault()
                void run()
              }
            }}
          />
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void run()} disabled={loading}>
          {loading ? "Running…" : "Run query"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Read-only SELECT against world DB · Ctrl/⌘+Enter
        </span>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      {result ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {result.rowCount.toLocaleString()} row
            {result.rowCount === 1 ? "" : "s"}
            {result.truncated
              ? ` (truncated at ${result.maxRows.toLocaleString()})`
              : ""}
          </p>
          {result.columns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No columns returned.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-max border-collapse text-left text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {result.columns.map((col) => (
                      <th
                        key={col}
                        className="border-b border-border px-3 py-2 font-medium whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={result.columns.length}
                        className="px-3 py-4 text-muted-foreground"
                      >
                        No rows.
                      </td>
                    </tr>
                  ) : (
                    result.rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/60 last:border-0"
                      >
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="max-w-xs truncate px-3 py-1.5 font-mono whitespace-nowrap"
                            title={formatCell(cell)}
                          >
                            {formatCell(cell)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
