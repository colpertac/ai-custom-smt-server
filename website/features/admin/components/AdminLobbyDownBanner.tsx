"use client"

import { useEffect, useState } from "react"
import { TriangleAlert } from "lucide-react"

import { api } from "@/lib/kyClient"

/** Overview callout when login/lobby is down — full admin needs COMP. */
export function AdminLobbyDownBanner() {
  const [lobbyDown, setLobbyDown] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const res = await api.get("status")
        const json = (await res.json()) as {
          success?: boolean
          data?: { services?: Array<{ id: string; state: string }> }
        }
        if (cancelled || !json.success) return
        const lobby = json.data?.services?.find((s) => s.id === "lobby")
        setLobbyDown(lobby?.state === "down")
      } catch {
        if (!cancelled) setLobbyDown(true)
      }
    }

    void refresh()
    const id = window.setInterval(refresh, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  if (!lobbyDown) return null

  return (
    <div
      role="alert"
      className="flex gap-3 border border-amber-500/50 bg-amber-950/50 px-4 py-4 text-amber-50"
    >
      <TriangleAlert
        className="mt-0.5 size-5 shrink-0 text-amber-400"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-wide text-amber-100">
          Lobby is down — full admin features unavailable
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-amber-100/85">
          Start lobby from Power below to restore accounts, shop, studio, wiki
          tools, uploads, and other lobby-backed admin. Sidebar links stay limited
          until login (lobby) is up.
        </p>
      </div>
    </div>
  )
}
