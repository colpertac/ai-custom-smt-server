/**
 * Armory profile hero: captured Path 1 portrait when present,
 * else CSS 3D name stub.
 */
"use client"

import { cn } from "@/lib/utils"

export function ArmoryHero({
  name,
  portraitUrl,
  className,
}: {
  name: string
  portraitUrl?: string | null
  className?: string
}) {
  if (portraitUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center",
          className
        )}
      >
        <div
          className="w-fit max-w-full border-2 border-border leading-[0]"
          role="img"
          aria-label={`Character portrait of ${name}`}
        >
          {/* Native aspect ratio; max-h scales down. Do not use object-cover. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portraitUrl}
            alt=""
            className="block h-auto max-h-[28rem] w-auto max-w-full"
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "armory-hero relative flex min-h-[22rem] w-full items-center justify-center overflow-hidden border-2 border-border",
        className
      )}
      role="img"
      aria-label={`Character preview placeholder for ${name}`}
    >
      <div className="armory-hero-stage">
        <span className="armory-hero-name">{name}</span>
      </div>
      <p className="absolute right-2 bottom-2 left-2 text-center text-[10px] tracking-wide text-muted-foreground uppercase">
        Portrait queued — CSS placeholder
      </p>
    </div>
  )
}
