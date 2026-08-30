"use client"

import { Cat } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type DemonBoostIndicatorProps = {
  /** Live channel: partner is out. Undefined when summon state is unknown (offline). */
  summoned?: boolean
}

export function DemonBoostIndicator({ summoned }: DemonBoostIndicatorProps) {
  const active = summoned === true

  const tooltip =
    summoned === true
      ? "Stats include bonuses from your summoned partner demon."
      : summoned === false
        ? "Partner demon is not summoned — stats shown without summon bonuses."
        : "Summon status unknown while offline. Play in-game for the live state."

  const ariaLabel =
    summoned === true
      ? "Stats boosted by summoned partner demon"
      : summoned === false
        ? "Partner demon not summoned"
        : "Partner demon summon state unknown"

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2",
          active
            ? "text-[#f97316] hover:text-[#fb923c] focus-visible:ring-[#f97316]/50"
            : "text-muted-foreground/45 hover:text-muted-foreground/65 focus-visible:ring-muted-foreground/30"
        )}
        aria-label={ariaLabel}
      >
        <Cat className="size-4" strokeWidth={2.25} aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[16rem] text-center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
