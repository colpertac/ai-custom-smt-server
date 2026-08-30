"use client"

import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  id?: string
  "aria-label"?: string
}

/** Search-styled filter input with magnifying glass. */
export function ConfigSearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  id,
  "aria-label": ariaLabel = "Search",
}: Props) {
  return (
    <div className={cn("relative max-w-md", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id={id}
        type="search"
        role="searchbox"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 border-border/80 bg-muted/30 pr-3 pl-8 shadow-none focus-visible:bg-background"
      />
    </div>
  )
}
