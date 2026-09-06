"use client"

import { FileCode, FolderTree, MapPin, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import type { EventNpcSpawn, EventStatus } from "@/lib/events/types"

interface EventDetailDrawerProps {
  event: EventStatus | null
  open: boolean
  onClose: () => void
  onToggle: (id: string, enabled: boolean) => void
  disabled?: boolean
  conflictMessage?: string | null
}

function formatPos(spawn: EventNpcSpawn): string {
  if (spawn.x === null || spawn.y === null) {
    return `spot ${spawn.spotId} (coords unresolved)`
  }
  return `(${spawn.x.toLocaleString()}, ${spawn.y.toLocaleString()})`
}

export function EventDetailDrawer({
  event,
  open,
  onClose,
  onToggle,
  disabled = false,
  conflictMessage = null,
}: EventDetailDrawerProps) {
  if (!event) return null

  const spawns = event.npcSpawns ?? []

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl w-[min(48rem,calc(100vw-2rem))] overflow-hidden p-6 gap-5 max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {event.category}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {event.year > 2000 && event.year < 9000
                ? `${event.year} / ${String(event.month).padStart(2, "0")}`
                : event.id}
            </span>
          </div>
          <DialogTitle className="text-base font-semibold text-foreground break-words">
            {event.titleEn}
          </DialogTitle>
          {event.titleJp && (
            <DialogDescription className="text-xs text-muted-foreground font-japanese break-words">
              {event.titleJp}
            </DialogDescription>
          )}
        </DialogHeader>

        {conflictMessage ? (
          <div
            role="alert"
            className="rounded border border-destructive/50 bg-destructive/15 px-3 py-2 text-[11px] leading-snug text-destructive"
          >
            <span className="font-semibold">Can&apos;t enable together · </span>
            {conflictMessage}
          </div>
        ) : null}

        <div className="min-w-0 space-y-4 text-xs">
          <div className="rounded border border-border/70 bg-card/60 p-3 leading-relaxed">
            <p className="text-foreground">{event.summary}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
            <div className="min-w-0 space-y-1.5 rounded border border-border/50 bg-muted/20 p-2.5">
              <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <FolderTree className="size-3.5 text-primary/70 shrink-0" />
                <span>Partial Directory</span>
              </div>
              <code className="block max-w-full overflow-x-auto rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground border border-border/60 break-all whitespace-pre-wrap">
                {event.folder}
              </code>
              <p className="text-[10px] text-muted-foreground">
                Contains {event.xmlCount} data XML definitions loaded via PhysicsFS.
              </p>
            </div>

            <div className="min-w-0 space-y-1.5 rounded border border-border/50 bg-muted/20 p-2.5">
              <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <FileCode className="size-3.5 text-primary/70 shrink-0" />
                <span>Engine Activation</span>
              </div>
              <code className="block max-w-full overflow-x-auto rounded bg-background px-2 py-1 font-mono text-[11px] text-muted-foreground border border-border/60 break-all whitespace-pre-wrap">
                &lt;element&gt;{event.folder}&lt;/element&gt;
              </code>
              <p className="text-[10px] text-muted-foreground">
                Injected into channel.xml &lt;member name=&quot;DataStore&quot;&gt;.
              </p>
            </div>
          </div>

          {event.affectedZones.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <MapPin className="size-3.5 text-muted-foreground" />
                <span>Active Zones &amp; Arenas ({event.affectedZones.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {event.affectedZones.map((zone) => (
                  <span
                    key={zone}
                    className="rounded bg-muted/80 px-2 py-1 text-[11px] text-foreground border border-border/60"
                  >
                    {zone}
                  </span>
                ))}
              </div>
            </div>
          )}

          {spawns.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Users className="size-3.5 text-muted-foreground" />
                <span>NPC Spawns ({spawns.length})</span>
              </div>
              <div className="max-h-[min(22rem,45vh)] overflow-y-auto rounded border border-border/60 divide-y divide-border/40">
                {spawns.map((spawn) => (
                  <div
                    key={`${spawn.name}-${spawn.zoneId}-${spawn.spotId}`}
                    className="flex flex-col gap-0.5 px-2.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-primary truncate">
                        {spawn.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {spawn.zoneName} ({spawn.zoneId}) · spot {spawn.spotId}
                      </div>
                    </div>
                    <code className="shrink-0 font-mono text-[10px] text-foreground/90">
                      {formatPos(spawn)}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ) : event.featuredNpcs.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Users className="size-3.5 text-muted-foreground" />
                <span>Spawned NPCs ({event.featuredNpcs.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {event.featuredNpcs.map((npc) => (
                  <span
                    key={npc}
                    className="rounded bg-primary/10 px-2 py-1 text-[11px] text-primary border border-primary/20"
                  >
                    {npc}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-3 pt-3 border-t border-border/60">
          <div className="flex items-center gap-2">
            <Switch
              checked={event.active}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(event.id, checked)}
              aria-label={`Toggle ${event.titleEn}`}
            />
            <span className="text-xs font-medium text-foreground">
              {event.active ? "Event Enabled in Draft" : "Event Disabled"}
            </span>
          </div>

          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
