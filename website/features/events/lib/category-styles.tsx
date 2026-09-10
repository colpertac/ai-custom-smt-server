import {
  Calendar,
  Flame,
  Ghost,
  Gift,
  Heart,
  PartyPopper,
  Tag,
  Trophy,
} from "lucide-react"
import type { ReactNode } from "react"

import type { EventCategory } from "@/lib/events/types"

export function categoryBadgeClass(category: EventCategory | string): string {
  switch (category) {
    case "halloween":
      return "border-orange-500/35 bg-orange-500/12 text-orange-300"
    case "summer":
      return "border-amber-500/35 bg-amber-500/12 text-amber-300"
    case "xmas":
      return "border-emerald-500/35 bg-emerald-500/12 text-emerald-300"
    case "valentines":
      return "border-rose-500/35 bg-rose-500/12 text-rose-300"
    case "anniversary":
      return "border-[color-mix(in_srgb,var(--gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] text-[var(--gold-hot)]"
    case "collab":
      return "border-sky-500/35 bg-sky-500/12 text-sky-300"
    case "gag":
      return "border-cyan-500/35 bg-cyan-500/12 text-cyan-300"
    default:
      return "border-border/70 bg-muted/40 text-muted-foreground"
  }
}

export function categoryIcon(category: EventCategory | string): ReactNode {
  const cls = "size-3 shrink-0"
  switch (category) {
    case "halloween":
      return <Ghost className={cls} aria-hidden />
    case "summer":
      return <Flame className={cls} aria-hidden />
    case "xmas":
      return <Gift className={cls} aria-hidden />
    case "valentines":
      return <Heart className={cls} aria-hidden />
    case "anniversary":
      return <Trophy className={cls} aria-hidden />
    case "collab":
      return <PartyPopper className={cls} aria-hidden />
    case "gag":
      return <Tag className={cls} aria-hidden />
    default:
      return <Calendar className={cls} aria-hidden />
  }
}

/** Strip trailing zone/map id suffixes for short public copy. */
export function friendlyZoneLabel(zone: string): string {
  return (
    zone
      .replace(/\s*\(zone\s+\d+\s*[·•]\s*map\s+\d+\)\s*$/i, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim() || zone
  )
}
