"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CircleHelp, Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  DEFAULT_CONFLICT_GROUPS,
  findConflictInSet,
} from "@/lib/events/event-conflicts"
import type { EventCategory, EventScheduleConflict } from "@/lib/events/types"

export type EventChecklistOption = {
  id: string
  label: string
  /** Optional secondary line (id, etc.). */
  hint?: string
  category?: EventCategory | string
}

const CATEGORY_PILLS: { id: EventCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "summer", label: "Summer" },
  { id: "halloween", label: "Halloween" },
  { id: "xmas", label: "Xmas / NY" },
  { id: "valentines", label: "Valentines" },
  { id: "anniversary", label: "Anniversary" },
  { id: "collab", label: "Collabs" },
  { id: "gag", label: "Gag" },
  { id: "special", label: "Special" },
]

interface EventIdChecklistProps {
  options: EventChecklistOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  /** Accessible name for the list. */
  label: string
  emptyText?: string
  className?: string
  maxHeightClass?: string
  /**
   * Extra ids always treated as selected for conflict checks
   * (e.g. always-on when editing a day).
   */
  conflictWithIds?: string[]
  /** Server-side / parent conflicts to display + blink. */
  conflicts?: EventScheduleConflict[]
  /** Called when a toggle is blocked by a conflict. */
  onConflictBlocked?: (conflict: {
    reason: string
    eventIds: string[]
  }) => void
  /** Optional per-row details affordance (e.g. open event modal). */
  onInspect?: (id: string) => void
}

export function EventIdChecklist({
  options,
  selectedIds,
  onChange,
  label,
  emptyText = "No events match your filters.",
  className,
  maxHeightClass = "max-h-56",
  conflictWithIds = [],
  conflicts = [],
  onConflictBlocked,
  onInspect,
}: EventIdChecklistProps) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<EventCategory>("all")
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [flashIds, setFlashIds] = useState<string[]>([])
  const [flashKey, setFlashKey] = useState(0)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  const conflictIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of conflicts) {
      for (const id of c.eventIds) ids.add(id)
    }
    for (const id of flashIds) ids.add(id)
    return ids
  }, [conflicts, flashIds])

  const conflictMessages = useMemo(() => {
    const msgs: string[] = []
    if (localNotice) msgs.push(localNotice)
    for (const c of conflicts) {
      const line = `${c.reason} (${c.eventIds.join(" vs ")})`
      if (!msgs.includes(line)) msgs.push(line)
    }
    return msgs
  }, [conflicts, localNotice])

  // Re-trigger blink when flashIds change
  useEffect(() => {
    if (flashIds.length === 0) return
    setFlashKey((k) => k + 1)
    const t = window.setTimeout(() => setFlashIds([]), 2200)
    return () => window.clearTimeout(t)
  }, [flashIds])

  const availablePills = useMemo(() => {
    const present = new Set(
      options.map((o) => o.category).filter(Boolean) as string[]
    )
    return CATEGORY_PILLS.filter(
      (p) => p.id === "all" || present.has(p.id)
    )
  }, [options])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let matched = options
    if (category !== "all") {
      matched = matched.filter((o) => o.category === category)
    }
    if (q) {
      matched = matched.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.hint?.toLowerCase().includes(q) ?? false) ||
          (o.category?.toLowerCase().includes(q) ?? false)
      )
    }
    if (q) return matched
    return [...matched].sort((a, b) => {
      const aConflict = conflictIds.has(a.id) ? 0 : 1
      const bConflict = conflictIds.has(b.id) ? 0 : 1
      if (aConflict !== bConflict) return aConflict - bConflict
      return a.label.localeCompare(b.label)
    })
  }, [options, query, category, conflictIds])

  const triggerConflict = (reason: string, eventIds: string[]) => {
    setLocalNotice(reason)
    setFlashIds(eventIds)
    onConflictBlocked?.({ reason, eventIds })
  }

  const toggle = (id: string) => {
    if (selected.has(id)) {
      setLocalNotice(null)
      onChange(selectedIds.filter((x) => x !== id))
      return
    }

    const next = [...selectedIds, id]
    const probe = [...conflictWithIds, ...next]
    const hit = findConflictInSet(probe, DEFAULT_CONFLICT_GROUPS)
    if (hit) {
      triggerConflict(hit.reason, hit.eventIds)
      return
    }
    setLocalNotice(null)
    onChange(next)
  }

  const clearSelected = () => {
    setLocalNotice(null)
    onChange([])
  }
  const filtering = Boolean(query.trim()) || category !== "all"

  return (
    <div className={cn("space-y-2", className)}>
      {conflictMessages.length > 0 ? (
        <div
          role="alert"
          className="space-y-1 rounded border border-destructive/50 bg-destructive/15 p-2 text-[11px] text-destructive"
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5 shrink-0" />
            Can&apos;t enable together
          </div>
          {conflictMessages.map((m) => (
            <p key={m} className="leading-snug text-destructive/90">
              {m}
            </p>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          aria-label={`Search ${label}`}
          className="h-8 pl-8 pr-8 text-xs"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div
        role="toolbar"
        aria-label="Filter by event type"
        className="flex flex-wrap gap-1"
      >
        {availablePills.map((pill) => {
          const active = category === pill.id
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setCategory(pill.id)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors",
                active
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {pill.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {selectedIds.length} selected
          {filtering
            ? ` · ${filtered.length} shown`
            : ` · ${options.length} total`}
        </span>
        {selectedIds.length > 0 ? (
          <button
            type="button"
            onClick={clearSelected}
            className="text-primary hover:underline"
          >
            Clear selection
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label={label}
        className={cn(
          "overflow-y-auto rounded border border-border/60 bg-background divide-y divide-border/40",
          maxHeightClass
        )}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          filtered.map((o) => {
            const checked = selected.has(o.id)
            const conflicted = conflictIds.has(o.id)
            return (
              <div
                key={`${o.id}-${conflicted ? flashKey : "ok"}`}
                className={cn(
                  "flex items-start gap-1 px-1.5 py-1.5 text-xs transition-colors hover:bg-muted/40",
                  checked && !conflicted && "bg-primary/5",
                  conflicted &&
                    "animate-conflict-blink border-l-2 border-l-destructive"
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.id)}
                    className="mt-0.5 size-3.5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block font-medium leading-snug",
                        conflicted ? "text-destructive" : "text-foreground"
                      )}
                    >
                      {o.label}
                    </span>
                    {o.hint ? (
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                        {o.hint}
                      </span>
                    ) : null}
                  </span>
                </label>
                {onInspect ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onInspect(o.id)
                    }}
                    className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    aria-label={`Details for ${o.label}`}
                    title="More details"
                  >
                    <CircleHelp className="size-3.5" />
                  </button>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
