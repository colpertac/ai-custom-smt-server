"use client"

import {
  Calendar,
  Flame,
  Ghost,
  Gift,
  Heart,
  Info,
  MapPin,
  PartyPopper,
  Tag,
  Trophy,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { EventZoneLabel } from "@/features/events/components/EventZoneLabel"
import type { EventCategory, EventStatus } from "@/lib/events/types"

interface EventCardProps {
  event: EventStatus
  onToggle: (id: string, enabled: boolean) => void
  onInspect: (event: EventStatus) => void
  disabled?: boolean
  /** Mutual-exclusion conflict — blink red / can’t enable together. */
  conflicted?: boolean
  /** Shown on the card so the user doesn’t need to scroll for the reason. */
  conflictMessage?: string | null
}

function getCategoryColor(category: EventCategory): string {
  switch (category) {
    case "halloween":
      return "border-orange-500/30 bg-orange-500/10 text-orange-400"
    case "summer":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400"
    case "xmas":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    case "valentines":
      return "border-pink-500/30 bg-pink-500/10 text-pink-400"
    case "anniversary":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
    case "collab":
      return "border-purple-500/30 bg-purple-500/10 text-purple-400"
    case "gag":
      return "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
    default:
      return "border-border bg-muted/50 text-muted-foreground"
  }
}

function CategoryIcon({ category }: { category: EventCategory }) {
  switch (category) {
    case "halloween":
      return <Ghost className="size-3" />
    case "summer":
      return <Flame className="size-3" />
    case "xmas":
      return <Gift className="size-3" />
    case "valentines":
      return <Heart className="size-3" />
    case "anniversary":
      return <Trophy className="size-3" />
    case "collab":
      return <PartyPopper className="size-3" />
    case "gag":
      return <Tag className="size-3" />
    default:
      return <Calendar className="size-3" />
  }
}

export function EventCard({
  event,
  onToggle,
  onInspect,
  disabled = false,
  conflicted = false,
  conflictMessage = null,
}: EventCardProps) {
  const categoryBadgeClass = getCategoryColor(event.category)

  return (
    <Card
      className={`relative flex flex-col justify-between transition-colors ${
        conflicted
          ? "animate-conflict-blink border-destructive/60 border-l-2 border-l-destructive"
          : event.active
            ? "border-primary/50 bg-primary/5 shadow-xs"
            : "border-border bg-card/40 hover:border-border/80"
      }`}
    >
      <CardHeader className="p-3.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border uppercase tracking-wider ${categoryBadgeClass}`}
            >
              <CategoryIcon category={event.category} />
              {event.category}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
              {event.year > 2000 && event.year < 9000
                ? `${event.year}/${String(event.month).padStart(2, "0")}`
                : event.id}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${
                event.active ? "text-primary font-bold" : "text-muted-foreground/60"
              }`}
            >
              {event.active ? "Active" : "Off"}
            </span>
            <Switch
              checked={event.active}
              disabled={disabled}
              onCheckedChange={(checked) => onToggle(event.id, checked)}
              aria-label={`Toggle ${event.titleEn}`}
            />
          </div>
        </div>

        {conflicted && conflictMessage ? (
          <p
            role="alert"
            className="mt-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[10px] leading-snug text-destructive"
          >
            Can&apos;t enable together · {conflictMessage}
          </p>
        ) : null}

        <div className="mt-2 space-y-0.5">
          <h3 className="line-clamp-1 text-sm font-semibold tracking-tight text-foreground">
            {event.titleEn}
          </h3>
          {event.titleJp && event.titleJp !== event.titleEn && (
            <p className="line-clamp-1 text-xs font-japanese text-muted-foreground">
              {event.titleJp}
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-3.5 pt-0 flex-1 flex flex-col justify-between gap-3">
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
          {event.summary}
        </p>

        <div className="space-y-2">
          {event.affectedZones.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <MapPin className="size-3 text-muted-foreground/70 shrink-0" />
              {event.affectedZones.slice(0, 3).map((zone) => (
                <span
                  key={zone}
                  className="rounded bg-background/60 px-1 py-0.5 text-[10px] text-muted-foreground border border-border/50 truncate max-w-[140px]"
                >
                  <EventZoneLabel label={zone} detail />
                </span>
              ))}
              {event.affectedZones.length > 3 && (
                <span className="text-[10px] text-muted-foreground/60">
                  +{event.affectedZones.length - 3} more
                </span>
              )}
            </div>
          )}

          {event.featuredNpcs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <Users className="size-3 text-muted-foreground/70 shrink-0" />
              {event.featuredNpcs.slice(0, 3).map((npc) => (
                <span
                  key={npc}
                  className="rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary/80 truncate max-w-[120px]"
                >
                  {npc}
                </span>
              ))}
              {event.featuredNpcs.length > 3 && (
                <span className="text-[10px] text-muted-foreground/60">
                  +{event.featuredNpcs.length - 3}
                </span>
              )}
            </div>
          )}

          <div className="pt-1 flex items-center justify-between border-t border-border/40 text-[11px]">
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {event.id}
            </span>
            <Button
              variant="ghost"
              size="xs"
              className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => onInspect(event)}
            >
              <Info className="size-3" />
              Details
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
