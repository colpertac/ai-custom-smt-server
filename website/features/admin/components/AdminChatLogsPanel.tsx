"use client"

import { useCallback, useEffect, useState } from "react"

import { CharacterNameCombobox } from "@/features/admin/components/CharacterNameCombobox"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/kyClient"

type ChatLog = {
  uid: string
  characterName: string
  chatType: number
  targetName: string
  message: string
  zoneId: number
  channelId: number
  timestamp: number
}

const CHAT_TYPE_LABEL: Record<number, string> = {
  41: "Party",
  44: "Shout",
  45: "Say",
  46: "Tell",
  47: "Self",
  48: "Clan",
  597: "Versus",
  714: "Team",
}

function formatTs(ts: number): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toLocaleString()
}

function chatTypeLabel(t: number): string {
  return CHAT_TYPE_LABEL[t] ?? String(t)
}

export function AdminChatLogsPanel() {
  const [characterName, setCharacterName] = useState("")
  const [hours, setHours] = useState(24)
  const [logs, setLogs] = useState<ChatLog[]>([])
  const [nameOptions, setNameOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await api("admin/characters/names")
        const json = (await response.json()) as {
          success?: boolean
          data?: { names?: string[] }
        }
        if (!cancelled && response.ok && json.success) {
          setNameOptions(json.data?.names ?? [])
        }
      } catch {
        /* suggestions optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const search = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const until = Math.floor(Date.now() / 1000)
      const since = until - Math.max(1, hours) * 3600
      const response = await api.post("admin/chat-logs", {
        json: {
          ...(characterName.trim()
            ? { characterName: characterName.trim() }
            : {}),
          since,
          until,
          limit: 200,
        },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { logs?: ChatLog[] }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setLogs(json.data?.logs ?? [])
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }, [characterName, hours])

  useEffect(() => {
    void search()
    // Initial load only — later searches are manual / Enter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4">
      <FieldGroup className="gap-3 sm:flex-row sm:items-end">
        <Field className="flex-1">
          <FieldLabel htmlFor="chat-log-name">Character name</FieldLabel>
          <CharacterNameCombobox
            id="chat-log-name"
            value={characterName}
            onValueChange={setCharacterName}
            names={nameOptions}
            onEnter={() => void search()}
          />
        </Field>
        <Field className="w-28">
          <FieldLabel htmlFor="chat-log-hours">Hours</FieldLabel>
          <Input
            id="chat-log-hours"
            type="number"
            min={1}
            max={336}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value) || 24)}
          />
        </Field>
        <Button
          type="button"
          size="sm"
          disabled={loading}
          onClick={() => void search()}
        >
          {loading ? "Searching…" : "Search"}
        </Button>
      </FieldGroup>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <p className="text-[0.65rem] text-muted-foreground">
        Chat is retained for 14 days. Leave the name blank to list all
        characters in the selected time window (loads on open). Name
        suggestions: {nameOptions.length} characters.
      </p>

      <div className="max-h-[32rem] overflow-auto border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted/80 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Time</th>
              <th className="px-2 py-1.5 font-semibold">Type</th>
              <th className="px-2 py-1.5 font-semibold">From</th>
              <th className="px-2 py-1.5 font-semibold">To</th>
              <th className="px-2 py-1.5 font-semibold">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-2 py-6 text-center text-muted-foreground"
                >
                  {loading
                    ? "Loading…"
                    : searched
                      ? "No chat in this window"
                      : "No rows — run a search"}
                </td>
              </tr>
            ) : (
              logs.map((row) => (
                <tr
                  key={row.uid}
                  className="border-t border-border/60 align-top"
                >
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                    {formatTs(row.timestamp)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {chatTypeLabel(row.chatType)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {row.characterName}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                    {row.targetName || "—"}
                  </td>
                  <td className="px-2 py-1.5 break-words">{row.message}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
