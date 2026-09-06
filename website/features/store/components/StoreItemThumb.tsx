"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

/** Compact item glyph for cart / history / related rows. */
export function StoreItemThumb({
  name,
  iconSrc,
  size = 36,
  className,
}: {
  name: string
  iconSrc: string | null | undefined
  size?: number
  className?: string
}) {
  if (!iconSrc) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center border border-border bg-muted/60 font-mono text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground",
          className
        )}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {name.slice(0, 2)}
      </span>
    )
  }

  return (
    <Image
      src={iconSrc}
      alt=""
      width={size}
      height={size}
      className={cn("pixelated shrink-0 border border-border bg-black/40", className)}
      unoptimized
    />
  )
}
