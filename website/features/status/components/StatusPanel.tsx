"use client"

import { useServerStatus } from "@/features/status/hooks"
import type { ProbeState, ServiceStatus } from "@/lib/status"
import { cn } from "@/lib/utils"

const GAME_IDS = new Set(["lobby", "world", "channel"])

function gameServices(services: ServiceStatus[]): ServiceStatus[] {
  return services.filter((s) => GAME_IDS.has(s.id))
}

function gameOverall(services: ServiceStatus[]): ProbeState {
  const game = gameServices(services)
  if (game.length === 0) return "down"
  if (game.every((s) => s.state === "up")) return "up"
  if (game.some((s) => s.state === "up")) return "skipped"
  return "down"
}

type PublicRow = {
  id: string
  label: string
  state: ProbeState
  hint: string
}

const SERVICE_COPY: Record<
  string,
  { label: string; hint: string; downHint?: string }
> = {
  lobby: {
    label: "Lobby",
    hint: "Sign in, pick a character, and reach the main menu.",
    downHint: "You will not be able to log in at all.",
  },
  world: {
    label: "World",
    hint: "Shared game world and maps after you log in.",
    downHint: "You may log in but get stuck loading or entering the world.",
  },
  channel: {
    label: "Channel",
    hint: "Your live play session — combat, dungeons, and zones.",
    downHint: "You may log in but cannot fully load in or stay connected.",
  },
  updater: {
    label: "Updater",
    hint: "Patches and client files when the game checks for updates.",
    downHint: "Updates may fail — try again later if patching breaks.",
  },
}

function serviceRow(service: ServiceStatus): PublicRow {
  const copy = SERVICE_COPY[service.id]
  const label = copy?.label ?? service.label
  const hint =
    service.state === "down" && copy?.downHint
      ? copy.downHint
      : copy?.hint ?? ""

  return {
    id: service.id,
    label,
    state: service.state === "skipped" ? "down" : service.state,
    hint,
  }
}

function publicRows(services: ServiceStatus[]): PublicRow[] {
  const order = ["lobby", "world", "channel", "updater"] as const
  const byId = new Map(services.map((s) => [s.id, s]))

  return order.flatMap((id) => {
    const service = byId.get(id)
    if (!service || service.state === "skipped") return []
    return [serviceRow(service)]
  })
}

function partialOutageHint(services: ServiceStatus[]): string | null {
  const down = gameServices(services).filter((s) => s.state === "down")
  if (down.length === 0) return null

  const ids = new Set(down.map((s) => s.id))
  if (ids.has("lobby") && ids.size === 1) {
    return "Login is down — nobody can sign in right now."
  }
  if (ids.has("channel") && !ids.has("lobby")) {
    return "Login may work, but loading into the game or staying connected will fail."
  }
  if (ids.has("world") && !ids.has("lobby")) {
    return "You might reach the menu, but entering the world will not work."
  }
  return null
}

function overallCopy(services: ServiceStatus[]): {
  title: string
  body: string
  tone: "ok" | "warn" | "bad"
} {
  const overall = gameOverall(services)
  if (overall === "up") {
    return {
      tone: "ok",
      title: "Servers look healthy",
      body: "If you still cannot log in, disconnect, or crash, the problem is probably on your side — connection, client, or account.",
    }
  }
  if (overall === "skipped") {
    const specific = partialOutageHint(services)
    return {
      tone: "warn",
      title: "Partial outage",
      body:
        specific ??
        "Some game services are offline. Check the list below to see what still works.",
    }
  }
  return {
    tone: "bad",
    title: "Game servers are down",
    body: "This is not just you — wait a bit and check back here. We are likely already working on it.",
  }
}

function stateLabel(state: ProbeState, row?: boolean): string {
  if (state === "up") return "Online"
  if (state === "down") return "Offline"
  return row ? "Offline" : "Partial"
}

function dotClass(state: ProbeState): string {
  if (state === "up") return "bg-emerald-500"
  if (state === "down") return "bg-red-500"
  return "bg-amber-500"
}

function textClass(state: ProbeState): string {
  if (state === "up") return "text-emerald-600 dark:text-emerald-400"
  if (state === "down") return "text-red-600 dark:text-red-400"
  return "text-amber-700 dark:text-amber-400"
}

export function StatusPanel() {
  const { data, isLoading, isError } = useServerStatus()

  if (isLoading) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        Checking whether the game is up…
      </p>
    )
  }

  if (isError) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        We could not refresh status right now. If the game works for you, you
        can ignore this — otherwise try again in a minute.
      </p>
    )
  }

  const services = data?.services ?? []
  const summary = overallCopy(services)
  const rows = publicRows(services)

  return (
    <div className="mt-8 space-y-6">
      <div
        className={cn(
          "border-2 px-4 py-4",
          summary.tone === "ok" && "border-emerald-500/40 bg-emerald-500/5",
          summary.tone === "warn" && "border-amber-500/40 bg-amber-500/5",
          summary.tone === "bad" && "border-red-500/40 bg-red-500/5"
        )}
      >
        <p className="font-heading text-lg font-semibold tracking-wide text-foreground">
          {summary.title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {summary.body}
        </p>
      </div>

      <ul className="divide-y divide-border border border-border bg-muted/40">
        <li className="px-4 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Services
          </p>
        </li>
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className={cn("inline-block size-2.5 shrink-0 rounded-full", dotClass(row.state))}
                aria-hidden
              />
              <span className="text-sm font-medium text-foreground">
                {row.label}
              </span>
              <span className={cn("text-sm font-medium", textClass(row.state))}>
                {stateLabel(row.state, true)}
              </span>
            </div>
            <p className="mt-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
              {row.hint}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Status refreshes automatically every 30 seconds.
      </p>
    </div>
  )
}
