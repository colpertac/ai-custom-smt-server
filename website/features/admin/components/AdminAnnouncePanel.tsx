"use client"

import { useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

/** Same color modes as in-game `@announce` / PACKET_SYSTEM_MSG. */
const ANNOUNCE_COLORS = [
  { mode: 0, label: "Red", swatch: "#e05555" },
  { mode: 1, label: "White", swatch: "#e8e8e8" },
  { mode: 2, label: "Blue", swatch: "#5b9bd5" },
  { mode: 3, label: "Purple", swatch: "#b07cc6" },
  { mode: 4, label: "Shop", swatch: "#c9a227" },
] as const

export function AdminAnnouncePanel() {
  const [message, setMessage] = useState("")
  const [mode, setMode] = useState(0)
  const [alsoConsole, setAlsoConsole] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const send = async () => {
    const trimmed = message.trim()
    if (!trimmed) {
      setError("Enter a message")
      setOk(null)
      return
    }

    setSending(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/announce", {
        json: { message: trimmed, mode, alsoConsole },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Announcement sent")
      setMessage("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Announce failed")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border border-border/80 bg-muted/20 px-4 py-3">
      <div className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Announce
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        World-wide ticker (same as in-game{" "}
        <code className="text-[0.65rem]">@announce</code>). Reaches all
        channels on the active world.
      </p>

      <FieldGroup className="mt-3 gap-3">
        <Field>
          <FieldLabel>Color</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {ANNOUNCE_COLORS.map((c) => (
              <button
                key={c.mode}
                type="button"
                onClick={() => setMode(c.mode)}
                className={cn(
                  "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === c.mode
                    ? "border-gold-dim bg-primary/20 text-foreground"
                    : "border-border bg-background/50 text-muted-foreground hover:border-gold-dim/60 hover:text-foreground"
                )}
              >
                <span
                  className="size-2.5 shrink-0 border border-black/40"
                  style={{ backgroundColor: c.swatch }}
                  aria-hidden
                />
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="admin-announce-message">Message</FieldLabel>
          <textarea
            id="admin-announce-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={512}
            placeholder="Server restart in 10 minutes…"
            className="w-full min-w-0 resize-y rounded-none border border-border bg-background/70 px-(--density-control-px) py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-gold-dim focus-visible:ring-2 focus-visible:ring-ring/30"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
            }}
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={alsoConsole}
            onChange={(e) => setAlsoConsole(e.target.checked)}
            className="size-3.5 accent-[var(--color-primary)]"
          />
          Also send chat console line (matches{" "}
          <code className="text-[0.65rem]">@announce</code>)
        </label>
      </FieldGroup>

      {error ? (
        <FormAlert className="mt-3" variant="error">
          {error}
        </FormAlert>
      ) : null}
      {ok ? (
        <FormAlert className="mt-3" variant="success">
          {ok}
        </FormAlert>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={sending || !message.trim()}
          onClick={() => void send()}
        >
          {sending ? "Sending…" : "Send announcement"}
        </Button>
        <span className="text-[0.65rem] text-muted-foreground">
          Ctrl/⌘+Enter to send
        </span>
      </div>
    </div>
  )
}
