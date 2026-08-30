import { cn } from "@/lib/utils"
import type { WikiFusionView } from "@/content/wiki"

export function WikiFusionBox({
  title,
  fusion,
  empty,
  className,
}: {
  title: string
  fusion: WikiFusionView | null
  empty: string
  className?: string
}) {
  const hasLines = fusion != null && fusion.lines.length > 0
  const hasEffectName =
    fusion?.effectName != null && fusion.effectName.length > 0

  return (
    <section
      className={cn("border border-border bg-muted/20 p-4", className)}
    >
      <h2 className="font-heading text-sm font-semibold tracking-[0.12em] uppercase text-gold-dim">
        {title}
      </h2>

      {!fusion || (!hasLines && !hasEffectName) ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="border border-border/80 bg-card/40 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">{fusion.sourceName}</p>
            {hasEffectName ? (
              <p className="mt-1 text-muted-foreground">{fusion.effectName}</p>
            ) : null}
          </div>
          {hasLines ? (
            <ul className="space-y-2 text-sm text-foreground/90">
              {fusion.lines.map((line) => (
                <li
                  key={line}
                  className="border border-border/80 bg-card/40 px-3 py-2"
                >
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  )
}
