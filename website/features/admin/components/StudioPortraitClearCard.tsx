"use client"

import { useState } from "react"
import Link from "next/link"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/confirm-dialog"
import { api } from "@/lib/kyClient"

/** Clear one character's cached armory portrait so the next visit re-captures. */
export function StudioPortraitClearCard() {
  const confirm = useConfirm()
  const [name, setName] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [armoryPath, setArmoryPath] = useState<string | null>(null)

  async function onClear() {
    const trimmed = name.trim()
    if (!trimmed) return
    const okConfirm = await confirm({
      title: `Clear portrait for ${trimmed}?`,
      description:
        "Deletes the cached PNG and queue row. Opening the armory page will show the placeholder, then re-enqueue capture (worker must be running).",
      confirmLabel: "Clear portrait",
      variant: "destructive",
    })
    if (!okConfirm) return

    setPending(true)
    setError(null)
    setOk(null)
    setArmoryPath(null)
    try {
      const response = await api.post("admin/studio/portraits/clear", {
        json: { name: trimmed },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          armoryPath?: string
          removedFiles?: string[]
          removedJobs?: number
          fingerprints?: string[]
        }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Portrait cleared")
      setArmoryPath(json.data?.armoryPath ?? `/armory/${encodeURIComponent(trimmed)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="border border-border bg-card/60 p-3 space-y-3">
      <div>
        <p className="text-sm font-medium">Clear portrait</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Wipe a character&apos;s armory PNG so{" "}
          <span className="font-mono text-foreground">/armory/name</span> shows
          the placeholder, then recaptures after a few seconds (studio worker
          must be up).
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field className="gap-1 min-w-[10rem] flex-1">
          <FieldLabel htmlFor="studio-portrait-clear-name" className="text-[11px]">
            Character
          </FieldLabel>
          <Input
            id="studio-portrait-clear-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="catm"
            autoComplete="off"
            className="h-8 text-xs font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void onClear()
              }
            }}
          />
        </Field>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !name.trim()}
          onClick={() => void onClear()}
        >
          {pending ? "Clearing…" : "Clear portrait"}
        </Button>
      </div>
      {error && <FormAlert variant="error">{error}</FormAlert>}
      {ok && (
        <FormAlert variant="success">
          {ok}
          {armoryPath ? (
            <>
              {" "}
              <Link
                href={armoryPath}
                className="underline underline-offset-2 font-mono"
                target="_blank"
                rel="noreferrer"
              >
                {armoryPath}
              </Link>
            </>
          ) : null}
        </FormAlert>
      )}
    </div>
  )
}
