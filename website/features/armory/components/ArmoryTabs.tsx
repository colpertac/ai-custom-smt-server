import Link from "next/link"

import { cn } from "@/lib/utils"

export function ArmoryTabs({
  name,
  active,
}: {
  name: string
  active: "character" | "demons"
}) {
  const base = `/armory/${encodeURIComponent(name)}`
  const tabClass =
    "px-3 py-1.5 text-xs tracking-[0.14em] uppercase no-underline transition-colors"

  return (
    <nav
      aria-label="Armory sections"
      className="flex flex-wrap gap-1 border-b-2 border-border"
    >
      <Link
        href={base}
        className={cn(
          tabClass,
          active === "character"
            ? "border-b-2 border-gold text-gold"
            : "text-muted-foreground hover:text-gold-dim"
        )}
      >
        Character
      </Link>
      <Link
        href={`${base}/demons`}
        className={cn(
          tabClass,
          active === "demons"
            ? "border-b-2 border-gold text-gold"
            : "text-muted-foreground hover:text-gold-dim"
        )}
      >
        Demons
      </Link>
    </nav>
  )
}
