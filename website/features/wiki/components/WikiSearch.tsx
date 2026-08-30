"use client"

import { Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function WikiSearch({
  initialQuery = "",
  autoFocus = false,
  size = "default",
  className,
}: {
  initialQuery?: string
  autoFocus?: boolean
  size?: "default" | "sm" | "lg"
  className?: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)

  return (
    <form
      className={cn("flex flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault()
        const q = query.trim()
        if (!q) return
        router.push(`/wiki/search?q=${encodeURIComponent(q)}`)
      }}
    >
      <Field>
        {size !== "sm" ? (
          <FieldLabel htmlFor="wiki-global-search">Search items</FieldLabel>
        ) : null}
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="wiki-global-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or item ID…"
              autoComplete="off"
              autoFocus={autoFocus}
              className={cn(
                "pl-8",
                size === "lg" && "h-11 text-base",
                size === "sm" && "h-8 text-xs"
              )}
            />
          </div>
          <Button
            type="submit"
            size={size === "lg" ? "default" : "sm"}
            className="shrink-0"
          >
            Search
          </Button>
        </div>
      </Field>
      {size === "lg" ? (
        <p className="text-xs text-muted-foreground">
          Try &quot;Ointment&quot;, &quot;1201&quot;, or a gear name. Results
          open across all categories.
        </p>
      ) : null}
    </form>
  )
}
