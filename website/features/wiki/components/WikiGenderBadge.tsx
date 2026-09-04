import { Mars, Venus, VenusAndMars } from "lucide-react"

import { cn } from "@/lib/utils"

/** COMP gender: 0 male, 1 female, 2 any */
export function WikiGenderBadge({
  gender,
  label,
  iconOnly = false,
  className,
}: {
  gender: number
  label: string
  /** Symbol only; full label stays on `title` / `aria-label`. */
  iconOnly?: boolean
  className?: string
}) {
  const Icon =
    gender === 0 ? Mars : gender === 1 ? Venus : VenusAndMars
  const color =
    gender === 0
      ? "text-sky-400"
      : gender === 1
        ? "text-fuchsia-400"
        : "text-gold-dim"

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium",
        iconOnly ? "gap-0" : "gap-1.5",
        color,
        className
      )}
      title={label}
      aria-label={label}
    >
      <Icon className="size-4 shrink-0" aria-hidden strokeWidth={2.25} />
      {iconOnly ? null : <span>{label}</span>}
    </span>
  )
}
