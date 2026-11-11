"use client"

import Link from "next/link"
import { Heart } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useSessionUser } from "@/features/auth/hooks"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function BuildLikeButton({
  buildId,
  likeCount: initialCount,
  likedByMe: initialLiked = false,
  size = "sm",
}: {
  buildId: string
  likeCount: number
  likedByMe?: boolean
  size?: "xs" | "sm"
}) {
  const { data: session } = useSessionUser()
  const [likeCount, setLikeCount] = useState(initialCount)
  const [liked, setLiked] = useState(initialLiked)
  const inFlight = useRef(false)

  useEffect(() => {
    setLikeCount(initialCount)
    setLiked(initialLiked)
  }, [buildId, initialCount, initialLiked])

  const toggle = async () => {
    if (!session || inFlight.current) return

    const prevLiked = liked
    const prevCount = likeCount
    const nextLiked = !prevLiked
    const nextCount = Math.max(0, prevCount + (nextLiked ? 1 : -1))

    // Optimistic UI — sync with server after.
    setLiked(nextLiked)
    setLikeCount(nextCount)
    inFlight.current = true

    try {
      const res = await fetch(
        `/api/builder/builds/${encodeURIComponent(buildId)}/like`,
        { method: "POST" }
      )
      const json = (await res.json()) as {
        data?: { liked: boolean; likeCount: number }
      }
      if (!res.ok || !json.data) {
        setLiked(prevLiked)
        setLikeCount(prevCount)
        return
      }
      setLiked(json.data.liked)
      setLikeCount(json.data.likeCount)
    } catch {
      setLiked(prevLiked)
      setLikeCount(prevCount)
    } finally {
      inFlight.current = false
    }
  }

  if (!session) {
    return (
      <Link
        href="/login"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xs border border-border bg-background px-2 text-[11px] text-muted-foreground no-underline hover:border-gold-dim hover:text-gold-hot",
          size === "xs" ? "h-6" : "h-8"
        )}
        title="Log in to like"
      >
        <Heart className="size-3.5" aria-hidden />
        <span className="tabular-nums">{likeCount}</span>
      </Link>
    )
  }

  return (
    <Button
      type="button"
      size={size}
      variant={liked ? "outline" : "ghost"}
      onClick={() => void toggle()}
      className={cn(liked && "border-rose-400/50 text-rose-300")}
      title={liked ? "Unlike" : "Like"}
    >
      <Heart
        className={cn("size-3.5", liked && "fill-current")}
        aria-hidden
      />
      <span className="tabular-nums">{likeCount}</span>
    </Button>
  )
}
