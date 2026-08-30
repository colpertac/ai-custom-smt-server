"use client"

import { useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { api } from "@/lib/kyClient"

export function AccountImportPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (!file) {
      setError("Choose an account export XML file.")
      return
    }
    setPending(true)
    try {
      const body = new FormData()
      body.append("accountToImport", file)
      const response = await api("admin/import", {
        method: "POST",
        body,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Import succeeded.")
      setFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="mt-6 max-w-lg space-y-4 border-2 border-border bg-card/60 p-4"
      onSubmit={(e) => void onSubmit(e)}
    >
      <Field>
        <FieldLabel htmlFor="account-import-file">
          Account export XML
        </FieldLabel>
        <input
          id="account-import-file"
          type="file"
          accept=".xml,application/xml,text/xml"
          className="block w-full text-sm text-muted-foreground file:mr-3 file:border file:border-border file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setOk(null)
            setError(null)
          }}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Lobby strips user level and CP by default (
        <code>ImportStripUserLevel</code> / <code>ImportStripCP</code>). Import
        fails if any UUID already exists in lobby or world DB.
      </p>
      {error && <FormAlert variant="error">{error}</FormAlert>}
      {ok && <FormAlert variant="success">{ok}</FormAlert>}
      <Button type="submit" size="sm" disabled={pending || !file}>
        {pending ? "Importing…" : "Import account"}
      </Button>
    </form>
  )
}
