"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { CharacterNameCombobox } from "@/features/admin/components/CharacterNameCombobox"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

type Report = {
  uid: string
  playerName: string
  location: string
  comment: string
  subject: number
  resolved: boolean
  reportTime: number
  resolveTime: number
  reporterUsername: string
  resolverUsername: string
}

type ChatLog = {
  uid: string
  characterName: string
  chatType: number
  targetName: string
  message: string
  timestamp: number
}

const SUBJECT_LABEL: Record<number, string> = {
  0: "Unspecified",
  1: "Chat harassment",
  2: "Abusive action",
  3: "Progress obstruction",
  4: "Cheating",
  5: "Illegal tool use",
  6: "Real money trade",
  7: "Misc harassment",
}

const CHAT_TYPE_LABEL: Record<number, string> = {
  41: "Party",
  44: "Shout",
  45: "Say",
  46: "Tell",
  48: "Clan",
  597: "Versus",
  714: "Team",
}

function formatTs(ts: number): string {
  if (!ts) return "—"
  return new Date(ts * 1000).toLocaleString()
}

export function AdminReportsPanel() {
  const [resolved, setResolved] = useState(false)
  const [filter, setFilter] = useState("")
  const [nameOptions, setNameOptions] = useState<string[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<ChatLog[]>([])
  const [loading, setLoading] = useState(false)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const current = reports.find((r) => r.uid === selected) ?? null

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

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.post("admin/reports", {
        json: {
          resolved,
          playerName: filter.trim() || undefined,
          limit: 100,
        },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { reports?: Report[] }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setReports(json.data?.reports ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports")
    } finally {
      setLoading(false)
    }
  }, [resolved, filter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!current || current.resolved) {
      setEvidence([])
      return
    }
    let cancelled = false
    const run = async () => {
      setEvidenceLoading(true)
      try {
        const response = await api.post("admin/reports/evidence", {
          json: {
            playerName: current.playerName,
            reportTime: current.reportTime,
          },
        })
        const json = (await response.json()) as {
          success?: boolean
          data?: { logs?: ChatLog[] }
        }
        if (!cancelled) {
          setEvidence(json.success ? (json.data?.logs ?? []) : [])
        }
      } catch {
        if (!cancelled) setEvidence([])
      } finally {
        if (!cancelled) setEvidenceLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [current])

  const resolve = async () => {
    if (!current) return
    setResolving(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/reports/resolve", {
        json: { uid: current.uid },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Resolved")
      setSelected(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolve failed")
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-40">
          <FieldLabel>Status</FieldLabel>
          <div className="flex gap-1">
            <button
              type="button"
              className={cn(
                "border px-2.5 py-1 text-xs font-medium",
                !resolved
                  ? "border-gold-dim bg-primary/20"
                  : "border-border text-muted-foreground"
              )}
              onClick={() => setResolved(false)}
            >
              Open
            </button>
            <button
              type="button"
              className={cn(
                "border px-2.5 py-1 text-xs font-medium",
                resolved
                  ? "border-gold-dim bg-primary/20"
                  : "border-border text-muted-foreground"
              )}
              onClick={() => setResolved(true)}
            >
              Resolved
            </button>
          </div>
        </Field>
        <Field className="min-w-[12rem] flex-1">
          <FieldLabel htmlFor="report-filter">Player name</FieldLabel>
          <CharacterNameCombobox
            id="report-filter"
            value={filter}
            onValueChange={setFilter}
            names={nameOptions}
            placeholder="Optional filter…"
            onEnter={() => void load()}
          />
        </Field>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="max-h-[32rem] overflow-auto border border-border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted/80 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-2 py-1.5 font-semibold">When</th>
                <th className="px-2 py-1.5 font-semibold">Player</th>
                <th className="px-2 py-1.5 font-semibold">Reason</th>
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-2 py-6 text-center text-muted-foreground"
                  >
                    {loading ? "Loading…" : "No reports"}
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr
                    key={r.uid}
                    className={cn(
                      "cursor-pointer border-t border-border/60 hover:bg-muted/40",
                      selected === r.uid && "bg-primary/10"
                    )}
                    onClick={() => setSelected(r.uid)}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                      {formatTs(r.reportTime)}
                    </td>
                    <td className="px-2 py-1.5">{r.playerName}</td>
                    <td className="px-2 py-1.5">
                      {SUBJECT_LABEL[r.subject] ?? r.subject}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border border-border/80 bg-muted/20 px-4 py-3">
          {!current ? (
            <p className="text-sm text-muted-foreground">
              Select a report to view details and chat evidence.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Report
                </div>
                <p className="mt-1 font-medium">{current.playerName}</p>
                <p className="text-xs text-muted-foreground">
                  {SUBJECT_LABEL[current.subject] ?? current.subject} ·{" "}
                  {formatTs(current.reportTime)}
                </p>
              </div>
              <FieldGroup className="gap-2">
                <div>
                  <div className="text-[0.65rem] text-muted-foreground uppercase">
                    Reporter
                  </div>
                  {current.reporterUsername ? (
                    <Link
                      href={`/admin/accounts?u=${encodeURIComponent(current.reporterUsername)}`}
                      className="text-gold-hot hover:underline"
                    >
                      {current.reporterUsername}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                </div>
                <div>
                  <div className="text-[0.65rem] text-muted-foreground uppercase">
                    Location
                  </div>
                  <p>{current.location || "—"}</p>
                </div>
                <div>
                  <div className="text-[0.65rem] text-muted-foreground uppercase">
                    Comment
                  </div>
                  <p className="whitespace-pre-wrap">{current.comment || "—"}</p>
                </div>
                {current.resolved ? (
                  <div>
                    <div className="text-[0.65rem] text-muted-foreground uppercase">
                      Resolved
                    </div>
                    <p className="text-xs">
                      {current.resolverUsername || "—"} ·{" "}
                      {formatTs(current.resolveTime)}
                    </p>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={resolving}
                    onClick={() => void resolve()}
                  >
                    {resolving ? "Resolving…" : "Mark resolved"}
                  </Button>
                )}
              </FieldGroup>

              <div>
                <div className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Chat evidence (30m before report)
                </div>
                {evidenceLoading ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Loading chat…
                  </p>
                ) : evidence.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No chat lines found for this player in the window (offline
                    before recording started, or no messages).
                  </p>
                ) : (
                  <div className="mt-2 max-h-64 overflow-auto border border-border bg-background/50 text-xs">
                    {evidence.map((line) => (
                      <div
                        key={line.uid}
                        className="border-b border-border/50 px-2 py-1"
                      >
                        <span className="text-muted-foreground">
                          {formatTs(line.timestamp)} ·{" "}
                          {CHAT_TYPE_LABEL[line.chatType] ?? line.chatType}
                          {line.targetName ? ` → ${line.targetName}` : ""}:{" "}
                        </span>
                        {line.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
