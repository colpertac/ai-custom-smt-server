"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Filter, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { EventCard } from "@/features/admin-events/components/EventCard"
import { EventDetailDrawer } from "@/features/admin-events/components/EventDetailDrawer"
import {
  DEFAULT_CONFLICT_GROUPS,
  findConflictInSet,
} from "@/lib/events/event-conflicts"
import type { EventCategory, EventStatus } from "@/lib/events/types"

const CATEGORIES: { id: EventCategory; label: string }[] = [
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

interface ScheduleEventPickerProps {
  title: string
  events: EventStatus[]
  selectedIds: string[]
  /** Extra ids always treated as selected for conflict checks (e.g. always-on). */
  conflictWithIds?: string[]
  onChangeSelectedIds: (ids: string[]) => void
}

export function ScheduleEventPicker({
  title,
  events,
  selectedIds,
  conflictWithIds = [],
  onChangeSelectedIds,
}: ScheduleEventPickerProps) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<EventCategory>("all")
  const [onlyAssigned, setOnlyAssigned] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [conflictNotice, setConflictNotice] = useState<{
    reason: string
    eventIds: string[]
  } | null>(null)

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])

  // Day switches replace selectedIds wholesale — clear stale conflict UI.
  useEffect(() => {
    setConflictNotice(null)
  }, [title])

  const filtered = useMemo(() => {
    let list = events
    if (category !== "all") {
      list = list.filter((e) => e.category === category)
    }
    if (onlyAssigned) {
      list = list.filter((e) => selected.has(e.id))
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (e) =>
          e.titleEn.toLowerCase().includes(q) ||
          e.titleJp.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.affectedZones.some((z) => z.toLowerCase().includes(q)) ||
          e.featuredNpcs.some((n) => n.toLowerCase().includes(q))
      )
    }
    return [...list].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      if (a.month !== b.month) return b.month - a.month
      return a.titleEn.localeCompare(b.titleEn)
    })
  }, [events, category, onlyAssigned, search])

  const conflictIds = useMemo(() => {
    const ids = new Set<string>()
    if (conflictNotice) {
      for (const id of conflictNotice.eventIds) ids.add(id)
    }
    return ids
  }, [conflictNotice])

  const detailEvent = detailId
    ? (() => {
        const base = events.find((e) => e.id === detailId)
        if (!base) return null
        return { ...base, active: selected.has(detailId) }
      })()
    : null

  const onToggle = (id: string, enabled: boolean) => {
    if (!enabled) {
      setConflictNotice(null)
      onChangeSelectedIds(selectedIds.filter((x) => x !== id))
      return
    }
    if (selected.has(id)) return
    const next = [...selectedIds, id]
    const probe = [...conflictWithIds, ...next]
    const hit = findConflictInSet(probe, DEFAULT_CONFLICT_GROUPS)
    if (hit) {
      setConflictNotice({ reason: hit.reason, eventIds: hit.eventIds })
      return
    }
    setConflictNotice(null)
    onChangeSelectedIds(next)
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Catalog · assign to {title}
        </h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Same cards as Manual mode. Toggle on to add to this day; toggle off or
          uncheck in the sidebar to remove.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, demon, zone…"
              className="h-8.5 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2 border-l border-border/70 px-2">
            <Switch
              size="sm"
              checked={onlyAssigned}
              onCheckedChange={setOnlyAssigned}
              id="schedule-assigned-filter"
            />
            <label
              htmlFor="schedule-assigned-filter"
              className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground"
            >
              Assigned only ({selectedIds.length})
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                category === cat.id
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {conflictNotice ? (
        <div
          role="alert"
          className="space-y-1 rounded border border-destructive/50 bg-destructive/15 p-2.5 text-[11px] text-destructive"
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5 shrink-0" />
            Can&apos;t enable together
          </div>
          <p className="leading-snug text-destructive/90">
            {conflictNotice.reason} ({conflictNotice.eventIds.join(" vs ")})
          </p>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-card/20 p-10 text-center">
          <Filter className="mb-2 size-8 text-muted-foreground/60" />
          <p className="text-sm font-semibold text-foreground">No events found</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Try adjusting search or category filters.
          </p>
          {(search || category !== "all" || onlyAssigned) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("")
                setCategory("all")
                setOnlyAssigned(false)
              }}
              className="mt-4 text-xs"
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((evt) => {
            const active = selected.has(evt.id)
            const conflicted = conflictIds.has(evt.id)
            return (
              <EventCard
                key={evt.id}
                event={{ ...evt, active }}
                onToggle={onToggle}
                onInspect={(e) => setDetailId(e.id)}
                conflicted={conflicted}
                conflictMessage={
                  conflictNotice?.eventIds.includes(evt.id)
                    ? conflictNotice.reason
                    : null
                }
              />
            )
          })}
        </div>
      )}

      <EventDetailDrawer
        event={detailEvent}
        open={detailId != null && detailEvent != null}
        onClose={() => setDetailId(null)}
        onToggle={onToggle}
      />
    </div>
  )
}
