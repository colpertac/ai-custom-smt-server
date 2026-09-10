"use client"

import { MapPin, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  categoryBadgeClass,
  categoryIcon,
} from "@/features/events/lib/category-styles"
import {
  EventSpawnZoneLabel,
  EventZoneLabel,
} from "@/features/events/components/EventZoneLabel"
import type { CompEvent, EventNpcSpawn } from "@/lib/events/types"
import { cn } from "@/lib/utils"

function formatPos(spawn: EventNpcSpawn): string {
  if (spawn.x === null || spawn.y === null) {
    return "location TBD"
  }
  return `(${spawn.x.toLocaleString()}, ${spawn.y.toLocaleString()})`
}

export function PublicEventDetailDialog({
  event,
  open,
  onClose,
}: {
  event: CompEvent | null
  open: boolean
  onClose: () => void
}) {
  if (!event) return null

  const spawns = event.npcSpawns ?? []
  const dateLabel =
    event.year > 2000 && event.year < 9000
      ? `${event.year} / ${String(event.month).padStart(2, "0")}`
      : null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl w-[min(42rem,calc(100vw-2rem))] overflow-hidden p-0 gap-0 max-h-[90vh]">
        <div className="border-b border-border/70 bg-[linear-gradient(180deg,var(--panel-sheen),transparent)] px-6 pt-6 pb-4">
          <DialogHeader className="space-y-2 min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                  categoryBadgeClass(event.category)
                )}
              >
                {categoryIcon(event.category)}
                {event.category}
              </span>
              {dateLabel ? (
                <span className="text-xs text-muted-foreground">{dateLabel}</span>
              ) : null}
            </div>
            <DialogTitle className="font-heading text-2xl font-semibold tracking-[0.06em] break-words">
              {event.titleEn}
            </DialogTitle>
            {event.titleJp ? (
              <DialogDescription className="text-xs text-muted-foreground font-japanese break-words">
                {event.titleJp}
              </DialogDescription>
            ) : null}
          </DialogHeader>
        </div>

        <div className="min-w-0 space-y-5 overflow-y-auto px-6 py-5 text-xs">
          {event.summary ? (
            <p className="text-sm leading-relaxed text-foreground/90">
              {event.summary}
            </p>
          ) : null}

          {event.notes ? (
            <div
              role="note"
              className="rounded border border-[color-mix(in_srgb,var(--gold)_35%,transparent)] bg-[color-mix(in_srgb,var(--gold)_8%,transparent)] px-3 py-2.5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gold-dim)]">
                What to expect
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {event.notes}
              </p>
            </div>
          ) : null}

          {event.affectedZones.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MapPin className="size-3.5 text-[var(--gold-dim)]" />
                Zones &amp; arenas
              </div>
              <div className="flex flex-wrap gap-1.5">
                {event.affectedZones.map((zone) => (
                  <span
                    key={zone}
                    className="rounded border border-border/60 bg-muted/35 px-2.5 py-1 text-[11px] text-foreground"
                  >
                    <EventZoneLabel label={zone} />
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {spawns.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="size-3.5 text-[var(--gold-dim)]" />
                NPCs ({spawns.length})
              </div>
              <div className="max-h-[min(22rem,42vh)] overflow-y-auto rounded border border-border/60 divide-y divide-border/35 bg-card/40">
                {spawns.map((spawn) => (
                  <div
                    key={`${spawn.name}-${spawn.zoneId}-${spawn.spotId}`}
                    className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[var(--gold-hot)] truncate">
                        {spawn.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        <EventSpawnZoneLabel
                          zoneName={spawn.zoneName}
                          zoneId={spawn.zoneId}
                          serverZoneId={spawn.serverZoneId}
                        />
                      </div>
                    </div>
                    <code className="shrink-0 font-mono text-[11px] text-foreground/85">
                      {formatPos(spawn)}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ) : event.featuredNpcs.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="size-3.5 text-[var(--gold-dim)]" />
                Featured NPCs
              </div>
              <div className="flex flex-wrap gap-1.5">
                {event.featuredNpcs.map((npc) => (
                  <span
                    key={npc}
                    className="rounded border border-[color-mix(in_srgb,var(--gold)_28%,transparent)] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] px-2.5 py-1 text-[11px] text-[var(--gold-hot)]"
                  >
                    {npc}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Exact map positions are not listed for this event.
              </p>
            </div>
          ) : (
            <div className="rounded border border-border/60 bg-muted/25 px-3 py-2.5">
              <p className="text-[11px] font-medium text-foreground">
                No dialogue NPCs in the catalog
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                This partial may add enemies, weather, drops, or instance content
                instead of talkable clerks. Read the summary
                {event.notes ? " and notes" : ""} above, then check the listed
                zones in-game.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/70 px-6 py-3 sm:justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
