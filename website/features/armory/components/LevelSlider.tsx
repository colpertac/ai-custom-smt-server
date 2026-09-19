"use client"

import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

type LevelSliderProps = {
  label: string
  value: number
  min?: number
  max: number
  disabled?: boolean
  valueLabel?: string
  className?: string
  onChange: (value: number) => void
}

/** Compact integer slider for armory owner edit (shadcn / Base UI). */
export function LevelSlider({
  label,
  value,
  min = 0,
  max,
  disabled,
  valueLabel,
  className,
  onChange,
}: LevelSliderProps) {
  const safeMax = Math.max(min, max)
  const clamped = Math.min(safeMax, Math.max(min, value))
  const locked = disabled || safeMax <= min

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1.5 text-[10px] text-muted-foreground",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="uppercase tracking-wide">{label}</span>
        <span className="font-medium tabular-nums text-foreground">
          {valueLabel ?? clamped}
          <span className="ml-1 font-normal text-muted-foreground">
            / {safeMax}
          </span>
        </span>
      </div>
      <Slider
        min={min}
        max={safeMax}
        step={1}
        disabled={locked}
        value={clamped}
        onValueChange={(next) => {
          const n = typeof next === "number" ? next : next[0]
          if (typeof n === "number" && Number.isFinite(n)) onChange(n)
        }}
        aria-label={label}
        className="w-full"
      />
    </div>
  )
}
