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
          "inline-block border border-border bg-muted/60",
          className
        )}
        style={{ width: size, height: size }}
        aria-hidden
      />
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
