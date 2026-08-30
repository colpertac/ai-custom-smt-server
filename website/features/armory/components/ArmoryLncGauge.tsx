import { cn } from "@/lib/utils"

const LNC_MIN = -10_000
const LNC_MAX = 10_000

/** Same thresholds as ActiveEntityState::CalculateLNCType. */
export function lncAlignment(lnc: number): "Law" | "Neutral" | "Chaos" {
  if (lnc <= -5000) return "Law"
  if (lnc >= 5000) return "Chaos"
  return "Neutral"
}

function clampLnc(lnc: number): number {
  return Math.min(LNC_MAX, Math.max(LNC_MIN, lnc))
}

/** 0 = full Law, 0.5 = Neutral, 1 = full Chaos. */
function lncToPercent(lnc: number): number {
  return (clampLnc(lnc) - LNC_MIN) / (LNC_MAX - LNC_MIN)
}

export function ArmoryLncGauge({
  lnc,
  className,
}: {
  lnc: number
  className?: string
}) {
  const value = clampLnc(lnc)
  const pct = lncToPercent(value)
  const alignment = lncAlignment(value)

  return (
    <div
      className={cn("w-full max-w-md", className)}
      role="meter"
      aria-valuemin={LNC_MIN}
      aria-valuemax={LNC_MAX}
      aria-valuenow={value}
      aria-label={`Alignment ${alignment}, LNC ${value}`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] tracking-[0.16em] uppercase">
        <span className="text-[#6ea8ff]">Law</span>
        <span className="text-muted-foreground">
          {alignment}
          <span className="ml-1.5 tabular-nums tracking-normal normal-case">
            {value > 0 ? `+${value}` : value}
          </span>
        </span>
        <span className="text-[#e07070]">Chaos</span>
      </div>

      <div className="relative h-3 border border-border/90 bg-[#0c1018]">
        {/* Track: Law (blue) → Neutral → Chaos (red) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, #2a5cff 0%, #5a8cff 22%, #9aa3b5 45%, #c8cdd8 50%, #9aa3b5 55%, #d06060 78%, #c02828 100%)",
          }}
        />
        {/* Soft center notch */}
        <div
          className="absolute top-0 bottom-0 w-px bg-foreground/35"
          style={{ left: "50%" }}
          aria-hidden
        />
        {/* Threshold ticks at ±5000 */}
        <div
          className="absolute top-0 bottom-0 w-px bg-black/35"
          style={{ left: `${lncToPercent(-5000) * 100}%` }}
          aria-hidden
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-black/35"
          style={{ left: `${lncToPercent(5000) * 100}%` }}
          aria-hidden
        />

        {/* Needle */}
        <div
          className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${pct * 100}%` }}
        >
          <div className="relative flex flex-col items-center">
            <span
              className="block size-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-gold-hot drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]"
              aria-hidden
            />
            <span
              className="mt-[-1px] block h-3.5 w-[2px] bg-gold-hot shadow-[0_0_6px_rgba(240,210,74,0.55)]"
              aria-hidden
            />
            <span
              className="mt-[-1px] block size-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-gold-hot drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]"
              aria-hidden
            />
          </div>
        </div>
      </div>

      <div className="mt-1 flex justify-between text-[9px] tabular-nums text-muted-foreground/80">
        <span>−10000</span>
        <span>0</span>
        <span>+10000</span>
      </div>
    </div>
  )
}
