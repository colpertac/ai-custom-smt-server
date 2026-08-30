import type { WikiItemStat } from "@/content/wiki"
import { formatWikiStatValue } from "@/content/wiki"
import { cn } from "@/lib/utils"

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

  return (
    <section
      className={cn(
        "border border-border bg-muted/20 p-4",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold tracking-[0.12em] uppercase text-gold-dim">
          {title}
        </h2>
        <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {tag}
        </span>
      </div>
      {hint ? (
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      ) : null}

      {hasStats ? (
        <ul className="mt-3 space-y-2">
          {stats!.map((stat) => (
            <li
              key={`${stat.id}-${stat.type}`}
              className="flex items-center justify-between gap-3 border border-border/80 bg-card/40 px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-mono font-semibold text-gold-hot">
                {formatWikiStatValue(stat)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-foreground/90">
          {lines!.map((line) => (
            <li
              key={line}
              className="border border-border/80 bg-card/40 px-3 py-2"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
