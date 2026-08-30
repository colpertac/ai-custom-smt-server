import Image from "next/image"

import type { WikiItem } from "@/content/wiki"
import { cn } from "@/lib/utils"

export function WikiItemIcon({
  item,
  size = 32,
  className,
}: {
  item: WikiItem
  size?: number
  className?: string
}) {
  if (!item.iconSrc) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center border border-border bg-muted/60 font-mono font-semibold uppercase tracking-wide text-muted-foreground",
          className
        )}
        style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.28)) }}
        aria-label="Icon not available"
        title="Icon not available"
      >
        NA
      </span>
    )
  }

  return (
    <Image
      src={item.iconSrc}
      alt=""
      width={size}
      height={size}
      className={cn("pixelated border border-border bg-black/40", className)}
      unoptimized
    />
  )
}
