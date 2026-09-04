import type { WikiItemStat } from "@/content/wiki"
import { formatWikiStatValue } from "@/content/wiki"
import { cn } from "@/lib/utils"

const LAYER_HUE: Record<string, { box: string; tag: string; row: string }> = {
  S1: {
    box: "border-sky-500/35 bg-sky-500/[0.07]",
    tag: "text-sky-300/90",
    row: "border-sky-500/20 bg-sky-950/20",
  },
  S2: {
    box: "border-emerald-500/35 bg-emerald-500/[0.07]",
    tag: "text-emerald-300/90",
    row: "border-emerald-500/20 bg-emerald-950/20",
  },
  S3: {
    box: "border-rose-500/35 bg-rose-500/[0.07]",
    tag: "text-rose-300/90",
    row: "border-rose-500/20 bg-rose-950/20",
  },
}

export function WikiFeatureBox({
  title,
  tag,
  hint,
  stats,
  lines,
  className,
}: {
  title: string
  tag: string
  hint?: string
  stats?: WikiItemStat[]
  lines?: string[]
  className?: string
}) {
  const hasStats = stats != null && stats.length > 0
  const hasLines = lines != null && lines.length > 0
  if (!hasStats && !hasLines) return null

  const hue = LAYER_HUE[tag.toUpperCase()]

  return (
    <section
      className={cn(
        "border p-3",
        hue?.box ?? "border-border bg-muted/20",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
          {title}
        </h2>
        <span
          className={cn(
            "font-mono text-[0.65rem] uppercase tracking-wider",
            hue?.tag ?? "text-muted-foreground"
          )}
        >
          {tag}
        </span>
      </div>
      {hint ? (
        <p className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">{hint}</p>
      ) : null}

      {hasStats ? (
        <ul className="mt-2 space-y-1">
          {stats!.map((stat) => (
            <li
              key={`${stat.id}-${stat.type}`}
              className={cn(
                "flex items-center justify-between gap-3 border px-2.5 py-1.5 text-sm",
                hue?.row ?? "border-border/80 bg-card/40"
              )}
            >
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-mono font-semibold text-gold-hot">
                {formatWikiStatValue(stat)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-foreground/90">
          {lines!.map((line) => (
            <li
              key={line}
              className={cn(
                "border px-2.5 py-1.5",
                hue?.row ?? "border-border/80 bg-card/40"
              )}
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
