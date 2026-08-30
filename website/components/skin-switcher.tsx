"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

import { DEFAULT_SKIN, SKINS, isSkinId } from "@/lib/skins"
import { cn } from "@/lib/utils"

export function SkinSwitcher({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const active = isSkinId(theme)
    ? theme
    : isSkinId(resolvedTheme)
      ? resolvedTheme
      : DEFAULT_SKIN

  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 text-[0.65rem] tracking-[0.12em] uppercase text-nav-muted",
        className
      )}
    >
      <span className="hidden sm:inline">Skin</span>
      <select
        aria-label="Site skin"
        className="cursor-pointer border border-chrome-border bg-chrome px-1.5 py-1 text-[0.65rem] tracking-[0.1em] text-foreground uppercase outline-none hover:border-gold-dim focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        value={mounted ? active : DEFAULT_SKIN}
        disabled={!mounted}
        onChange={(e) => {
          if (isSkinId(e.target.value)) setTheme(e.target.value)
        }}
      >
        {SKINS.map((skin) => (
          <option key={skin.id} value={skin.id}>
            {skin.label}
          </option>
        ))}
      </select>
    </label>
  )
}
