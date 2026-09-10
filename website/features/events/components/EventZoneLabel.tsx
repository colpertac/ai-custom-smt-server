"use client"

import type { ReactNode } from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { parseAffectedZoneLabel } from "@/features/events/lib/zone-label"
import { cn } from "@/lib/utils"

function dynamicTooltip(opts: {
  serverZoneId: number | null
  dynamicMapId: number | null
  detail?: boolean
}): string {
  const { serverZoneId, dynamicMapId, detail } = opts
  if (detail && serverZoneId != null && dynamicMapId != null) {
    return `Dynamic map ${dynamicMapId} (ServerZone ${serverZoneId}). Not a @zone ID — use the zone ID or @instance when Global=false.`
  }
  if (detail && dynamicMapId != null) {
    return `Dynamic map ${dynamicMapId}. Not a @zone ID — resolve via ServerZone / @instance.`
  }
  return "Dynamic map — not a normal @zone ID."
}

function DashedHelp({
  children,
  tip,
  className,
}: {
  children: ReactNode
  tip: string
  className?: string
}) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          className={cn(
            "cursor-help underline decoration-dashed decoration-muted-foreground/55 underline-offset-2",
            className
          )}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-xs text-left">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Dashed-underline label with tooltip when the catalog ID is a DynamicMapID. */
export function EventZoneLabel({
  label,
  className,
  detail = false,
}: {
  /** Catalog affectedZones string, or a plain display name. */
  label: string
  className?: string
  /** Admin copy with IDs / @zone hint. */
  detail?: boolean
}) {
  const parsed = parseAffectedZoneLabel(label)
  const text =
    detail && parsed.isDynamicMap && parsed.serverZoneId != null && parsed.dynamicMapId != null
      ? `${parsed.displayName} (zone ${parsed.serverZoneId} · map ${parsed.dynamicMapId})`
      : detail && parsed.isDynamicMap && parsed.dynamicMapId != null
        ? `${parsed.displayName} (map ${parsed.dynamicMapId})`
        : detail && parsed.serverZoneId != null
          ? `${parsed.displayName} (${parsed.serverZoneId})`
          : parsed.displayName

  if (!parsed.isDynamicMap) {
    return <span className={className}>{text}</span>
  }

  return (
    <DashedHelp
      className={className}
      tip={dynamicTooltip({
        serverZoneId: parsed.serverZoneId,
        dynamicMapId: parsed.dynamicMapId,
        detail,
      })}
    >
      {text}
    </DashedHelp>
  )
}

/** Inline zone name for NPC spawn rows (uses structured IDs when available). */
export function EventSpawnZoneLabel({
  zoneName,
  zoneId,
  serverZoneId,
  className,
  detail = false,
}: {
  zoneName: string
  zoneId: number
  serverZoneId?: number | null
  className?: string
  detail?: boolean
}) {
  const isDynamic =
    serverZoneId != null ? serverZoneId !== zoneId : /^Zone\s+\d+$/i.test(zoneName)

  let text: string
  if (detail && isDynamic && serverZoneId != null) {
    text = `${zoneName} (zone ${serverZoneId} · map ${zoneId})`
  } else if (detail) {
    text = `${zoneName} (${zoneId})`
  } else if (/^Zone\s+\d+$/i.test(zoneName)) {
    text = zoneName.replace(/^Zone\s+/i, "Map ")
  } else {
    text = zoneName
  }

  if (!isDynamic) {
    return <span className={className}>{text}</span>
  }

  return (
    <DashedHelp
      className={className}
      tip={dynamicTooltip({
        serverZoneId: serverZoneId ?? null,
        dynamicMapId: zoneId,
        detail,
      })}
    >
      {text}
    </DashedHelp>
  )
}
