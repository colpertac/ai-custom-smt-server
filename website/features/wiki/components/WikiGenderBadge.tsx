import { Mars, Venus, VenusAndMars } from "lucide-react"

import { cn } from "@/lib/utils"

/** COMP gender: 0 male, 1 female, 2 any */
export function WikiGenderBadge({
  gender,
  label,
  className,
}: {
  gender: number
  label: string
  className?: string
}) {
  if (gender === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium text-sky-400",
          className
        )}
        title={label}
      >
        <Mars className="size-4 shrink-0" aria-hidden strokeWidth={2.25} />
        <span>{label}</span>
      </span>
    )
  }

  if (gender === 1) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium text-fuchsia-400",
          className
        )}
        title={label}
      >
        <Venus className="size-4 shrink-0" aria-hidden strokeWidth={2.25} />
        <span>{label}</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium text-gold-dim",
        className
      )}
      title={label}
    >
      <VenusAndMars className="size-4 shrink-0" aria-hidden strokeWidth={2.25} />
      <span>{label}</span>
    </span>
  )
}
