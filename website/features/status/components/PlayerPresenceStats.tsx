"use client"

import { useServerStatus } from "@/features/status/hooks"
import { cn } from "@/lib/utils"

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return String(n)
}

function OnlineDot() {
  return (
    <span className="relative inline-flex size-2 shrink-0" aria-hidden>
      <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
      <span className="relative size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.65)]" />
    </span>
  )
}

function OfflineDot() {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full bg-muted-foreground/45"
      aria-hidden
    />
  )
}

/** Compact online / offline readout for home + status. */
export function PlayerPresenceStats({
  className,
  compact = false,
  /** Home Status/Players tile — denser, fills the panel. */
  panel = false,
}: {
  className?: string
  compact?: boolean
  panel?: boolean
}) {
  const { data, isLoading, isError } = useServerStatus()
  const players = data?.players

  if (isLoading) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Checking who is online…
      </p>
    )
  }

  if (isError && !players) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Player counts unavailable right now.
      </p>
    )
  }

  const online = players?.online ?? null
  const offline = players?.offline ?? null

  if (panel) {
    return (
      <div className={cn(className)}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              <OnlineDot />
              Online
            </p>
            <p className="mt-1.5 font-heading text-3xl tabular-nums tracking-wide text-foreground">
              {formatCount(online)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              <OfflineDot />
              Offline
            </p>
            <p className="mt-1.5 font-heading text-3xl tabular-nums tracking-wide text-foreground">
              {formatCount(offline)}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(className)}>
      <div
        className={cn(
          "flex flex-wrap gap-x-8 gap-y-3",
          compact ? "items-baseline" : "items-end"
        )}
      >
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            <OnlineDot />
            Online
          </p>
          <p
            className={cn(
              "mt-1 font-heading tabular-nums tracking-wide text-foreground",
              compact ? "text-2xl" : "text-3xl"
            )}
          >
            {formatCount(online)}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            <OfflineDot />
            Offline
          </p>
          <p
            className={cn(
              "mt-1 font-heading tabular-nums tracking-wide text-foreground",
              compact ? "text-2xl" : "text-3xl"
            )}
          >
            {formatCount(offline)}
          </p>
        </div>
      </div>
      {!compact ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Online is players in-world (studio mannequins excluded). Offline is
          registered accounts that are not currently online
          {players?.accounts != null
            ? ` (${players.accounts} accounts total)`
            : ""}
          .
        </p>
      ) : null}
    </div>
  )
}
