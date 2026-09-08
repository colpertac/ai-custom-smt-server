/**
 * Armory profile hero: captured Path 1 portrait when present,
 * else CSS 3D name stub + capture progress (auto-polls while queued).
 */
"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

const POLL_MS = 2500
const MAX_POLLS = 48 // ~2 minutes

export function ArmoryHero({
  name,
  portraitUrl,
  portraitStatus = "missing",
  className,
}: {
  name: string
  portraitUrl?: string | null
  portraitStatus?: "ready" | "queued" | "missing"
  className?: string
}) {
  const router = useRouter()
  const polls = useRef(0)
  const [timedOut, setTimedOut] = useState(false)

  const capturing = !portraitUrl && portraitStatus === "queued" && !timedOut

  useEffect(() => {
    if (portraitUrl || portraitStatus !== "queued" || timedOut) return
    polls.current = 0
    const id = setInterval(() => {
      polls.current += 1
      if (polls.current > MAX_POLLS) {
        setTimedOut(true)
        clearInterval(id)
        return
      }
      router.refresh()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [portraitUrl, portraitStatus, timedOut, router])

  if (portraitUrl) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
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

  const statusCopy = timedOut
    ? "Capture is taking longer than usual — try refreshing."
    : portraitStatus === "queued"
      ? "Capturing portrait…"
      : "Portrait not available yet"

  return (
    <div
      className={cn(
        "armory-hero relative flex min-h-[22rem] w-full items-center justify-center overflow-hidden border-2 border-border",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy={capturing}
      aria-label={statusCopy}
    >
      <div
        className={cn(
          "armory-hero-stage transition-opacity duration-300",
          capturing ? "opacity-35" : "opacity-70"
        )}
      >
        <span className="armory-hero-name">{name}</span>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/25 px-4 text-center backdrop-blur-[1px]">
        {capturing ? (
          <Loader2
            className="size-8 animate-spin text-teal-400"
            aria-hidden
          />
        ) : null}
        <p className="text-sm font-medium tracking-wide text-foreground">
          {statusCopy}
        </p>
        {capturing ? (
          <p className="max-w-[16rem] text-[11px] leading-snug text-muted-foreground">
            Studio is dressing a mannequin and snapping your look. This page
            updates automatically.
          </p>
        ) : null}
      </div>
    </div>
  )
}
