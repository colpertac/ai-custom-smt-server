"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetcher } from "@/lib/fetcher"
import {
  formatPresencePos,
  type OnlinePresencePlayer,
} from "@/lib/presence"
import { cn } from "@/lib/utils"

type OnlineRosterResponse = {
  total: number
  players: OnlinePresencePlayer[]
}

const REFRESH_MS = 12_000

export function AdminPlayersPanel() {
  const [roster, setRoster] = useState<OnlineRosterResponse | null>(null)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetcher<OnlineRosterResponse>("admin/players/online")
      setRoster(data)
      setUpdatedAt(Date.now())
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load online players"
      )
      if (!silent) setRoster(null)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(true), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const players = useMemo(() => {
    const list = roster?.players ?? []
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (p) =>
        p.character.toLowerCase().includes(q) ||
        p.account.toLowerCase().includes(q)
    )
  }, [roster, filter])

  return (
    <div className="mt-3 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {roster ? (
              <>
                <span className="tabular-nums text-foreground">
                  {roster.total}
                </span>{" "}
                player{roster.total === 1 ? "" : "s"} online
              </>
            ) : loading ? (
              "Loading…"
            ) : (
              "—"
            )}
          </p>
          {updatedAt ? (
            <p className="text-[11px] text-muted-foreground">
              Updated {new Date(updatedAt).toLocaleTimeString()} · auto-refresh
              every {REFRESH_MS / 1000}s
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter character or account"
            className="h-8 w-56"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Character</th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Zone</th>
              <th className="px-3 py-2 font-medium">Position</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && !roster ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Loading online players…
                </td>
              </tr>
            ) : players.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  {filter.trim()
                    ? "No matches for that filter."
                    : "Nobody is online right now."}
                </td>
              </tr>
            ) : (
              players.map((p) => (
                <tr
                  key={`${p.account}:${p.character}:${p.zoneId}`}
                  className="border-b border-border/70 last:border-0"
                >
                  <td className="px-3 py-2 font-medium">{p.character}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/accounts?u=${encodeURIComponent(p.account)}`}
                      className="text-gold-dim hover:text-gold"
                    >
                      {p.account}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {p.zoneId > 0 ? p.zoneId : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums">
                    {formatPresencePos(p.x, p.y)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        p.status === "online"
                          ? "text-emerald-400"
                          : "text-amber-400"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          p.status === "online"
                            ? "bg-emerald-400"
                            : "bg-amber-400"
                        )}
                      />
                      {p.status === "online" ? "In zone" : "In world"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
