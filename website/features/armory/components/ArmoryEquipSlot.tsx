"use client"

import Image from "next/image"

import { ArmoryGearTooltipContent } from "@/features/armory/components/ArmoryGearTooltipContent"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  resolveArmoryGearFeatures,
  type ArmoryGearSlotView,
} from "@/lib/armory-gear-tooltip"
import { cn } from "@/lib/utils"

export function ArmoryEquipSlot({
  slot,
  align,
}: {
  slot: ArmoryGearSlotView
  align: "left" | "right"
}) {
  const empty = slot.itemType == null
  const features = resolveArmoryGearFeatures(slot)

  const rowClass = cn(
    "flex w-full items-center gap-2 border border-border/80 bg-background/40 px-2 py-1.5 text-left transition-colors",
    empty && "opacity-45",
    !empty && "cursor-default hover:border-gold-dim/60 hover:bg-muted/30",
    align === "right" && "flex-row-reverse text-right"
  )

  const body = (
    <>
      {slot.iconSrc ? (
        <Image
          src={slot.iconSrc}
          alt=""
          width={36}
          height={36}
          className="pixelated shrink-0 border border-border bg-black/40"
          unoptimized
        />
      ) : (
        <span
          className="inline-block size-9 shrink-0 border border-border bg-muted/50"
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1">
        {empty ? (
          <span className="block truncate text-xs text-muted-foreground/70">
            {slot.label} · Empty
          </span>
        ) : (
          <span className="block truncate text-sm text-[#c9a0ff]">
            {slot.name}
          </span>
        )}
      </span>
      {!empty && slot.level != null && slot.level > 0 ? (
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {slot.level}
        </span>
      ) : null}
    </>
  )

  if (empty || !features) {
    return <div className={rowClass}>{body}</div>
  }

  return (
    <Tooltip>
      <TooltipTrigger className={rowClass}>{body}</TooltipTrigger>
      <TooltipContent
        side={align === "left" ? "right" : "left"}
        sideOffset={8}
        align="start"
        className="w-[18rem] max-w-[18rem] rounded-none border border-[#4a4f5c] bg-[#12151c] p-0 text-[#e8ecf4] shadow-xl"
      >
        <ArmoryGearTooltipContent features={features} />
      </TooltipContent>
    </Tooltip>
  )
}
