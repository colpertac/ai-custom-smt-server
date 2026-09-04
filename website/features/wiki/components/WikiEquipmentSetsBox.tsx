import Image from "next/image"
import Link from "next/link"

import type { EquipmentSetMembership } from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

export function WikiEquipmentSetsBox({
  sets,
}: {
  sets: EquipmentSetMembership[]
}) {
  if (sets.length === 0) return null

  return (
    <section className="border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
          Equipment set
        </h2>
        <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          SET
        </span>
      </div>
      <p className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">
        Multi-piece bonus — once when all pieces are equipped (S1). Separate
        from this item&apos;s own S1 lines.
      </p>

      <ul className="mt-2.5 space-y-2.5">
        {sets.map((set) => (
          <li
            key={set.id}
            className="border border-border/80 bg-card/40 p-2.5"
          >
            <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              Set #{set.id} · {set.members.length} pieces
            </p>

            <ul className="mt-2 space-y-1">
              {set.members.map((member) => {
                const body = (
                  <>
                    {member.iconSrc ? (
                      <Image
                        src={member.iconSrc}
                        alt=""
                        width={24}
                        height={24}
                        className="pixelated shrink-0 border border-border bg-black/40"
                        unoptimized
                      />
                    ) : (
                      <span className="inline-flex size-6 shrink-0 items-center justify-center border border-border bg-muted/60 font-mono text-[0.5rem] text-muted-foreground">
                        NA
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                        {member.slotLabel}
                      </span>
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          member.isCurrent
                            ? "text-foreground"
                            : "text-gold-dim group-hover:text-gold-hot"
                        )}
                      >
                        {member.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                      #{member.itemId}
                    </span>
                  </>
                )

                if (member.isCurrent) {
                  return (
                    <li
                      key={`${set.id}-${member.itemId}`}
                      className="flex items-center gap-2 border border-gold-dim/40 bg-gold-dim/5 px-2 py-1.5"
                      aria-current="page"
                    >
                      {body}
                    </li>
                  )
                }

                return (
                  <li key={`${set.id}-${member.itemId}`}>
                    <Link
                      href={`/wiki/items/${member.itemId}`}
                      className="group flex items-center gap-2 border border-border/80 bg-muted/20 px-2 py-1.5 no-underline transition-colors hover:border-gold-dim/50 hover:bg-muted/40"
                    >
                      {body}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {set.bonuses.length > 0 ? (
              <ul className="mt-2 space-y-1 border-t border-border/70 pt-2">
                {set.bonuses.map((bonus, i) => (
                  <li
                    key={`${set.id}-${bonus.id}-${i}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">{bonus.label}</span>
                    <span className="font-mono font-semibold text-gold-hot">
                      {bonus.valueText}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
