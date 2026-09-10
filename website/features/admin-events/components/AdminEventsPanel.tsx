"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Filter,
  Flame,
  Ghost,
  Gift,
  Loader2,
  RotateCcw,
  Search,
  PartyPopper,
  Trophy,
} from "lucide-react"

import { useConfirm } from "@/components/confirm-dialog"
import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  fetchAdminEventSchedule,
  fetchAdminEvents,
  updateAdminEventSchedule,
  updateAdminEvents,
} from "@/features/admin-events/api"
import { EventCard } from "@/features/admin-events/components/EventCard"
import { EventDetailDrawer } from "@/features/admin-events/components/EventDetailDrawer"
import { EventSchedulePanel } from "@/features/admin-events/components/EventSchedulePanel"
import {
  conflictsInActiveSet,
  DEFAULT_CONFLICT_GROUPS,
  findConflictInSet,
} from "@/lib/events/event-conflicts"
import type { EventCategory, EventStatus } from "@/lib/events/types"
import { cn } from "@/lib/utils"

type EventsControlMode = "manual" | "schedule"

const PRESETS = [
  {
    name: "Halloween Pie Battle",
    icon: Ghost,
    ids: ["201510_halloween"],
    desc: "2015 Pie-Throwing Arena & Babel Festivities",
  },
  {
    name: "Summer Beach Festivals",
    icon: Flame,
    ids: ["201208_summer", "201307_summer"],
    desc: "2012/2013 Y-Kiki Beach & Watermelon Splitting",
  },
  {
    name: "Christmas & New Years",
    icon: Gift,
    ids: ["201512_xmasnewyears"],
    desc: "Winter Snow & Year-End Demon Celebrations",
  },
  {
    name: "Anime Collabs",
    icon: PartyPopper,
    ids: ["201105_durarara", "200912_toaru", "201112_guiltycrown"],
    desc: "Durarara!!, Railgun & Guilty Crown Crossovers",
  },
  {
    name: "All Historical Events",
    icon: Trophy,
    ids: ["999999_all"],
    desc: "Community Multi-Event Aggregation Partial",
  },
]

const CATEGORIES: { id: EventCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "halloween", label: "Halloween" },
  { id: "summer", label: "Summer" },
  { id: "xmas", label: "Christmas / New Year" },
  { id: "valentines", label: "Valentines" },
  { id: "anniversary", label: "Anniversary" },
  { id: "collab", label: "Collabs" },
  { id: "gag", label: "Gag / Parody" },
  { id: "special", label: "Special" },
]

export function AdminEventsPanel() {
  const confirm = useConfirm()

  const [events, setEvents] = useState<EventStatus[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [isDirty, setIsDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mutating, setMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<EventCategory>("all")
  const [onlyActive, setOnlyActive] = useState(false)

  // Details drawer
  const [selectedEvent, setSelectedEvent] = useState<EventStatus | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Live conflict UX (Ordeal vs Sage, etc.)
  const [conflictFlashIds, setConflictFlashIds] = useState<string[]>([])
  const [conflictFlashKey, setConflictFlashKey] = useState(0)
  const [conflictNotice, setConflictNotice] = useState<{
    reason: string
    eventIds: string[]
  } | null>(null)

  /** Exclusive ownership of channel.xml event partials. */
  const [controlMode, setControlMode] = useState<EventsControlMode | null>(
    null
  )
  const [modeSwitching, setModeSwitching] = useState(false)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [data, schedule] = await Promise.all([
        fetchAdminEvents(),
        fetchAdminEventSchedule(),
      ])
      setEvents(data.events)
      setActiveCount(data.activeCount)
      setIsDirty(data.isDirty)
      setControlMode(schedule.config.enabled ? "schedule" : "manual")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const refreshEventsQuiet = useCallback(async () => {
    const data = await fetchAdminEvents()
    setEvents(data.events)
    setActiveCount(data.activeCount)
    setIsDirty(data.isDirty)
  }, [])

  const switchControlMode = async (next: EventsControlMode) => {
    if (!controlMode || next === controlMode || modeSwitching) return

    const ok = await confirm(
      next === "schedule"
        ? {
            title: "Switch to Schedule mode?",
            description:
              "The scheduler will own channel.xml event partials. Manual toggles and presets will be locked. Schedule edits autosave; restart the channel on Overview (or wait for the daily flip) to apply live.",
            confirmLabel: "Use Schedule",
          }
        : {
            title: "Switch to Manual mode?",
            description:
              "This disables the event schedule reconciler. Live events stay as they are until you change them manually. You can re-enable the schedule later.",
            confirmLabel: "Use Manual",
          }
    )
    if (!ok) return

    setModeSwitching(true)
    setError(null)
    setSuccess(null)
    try {
      const status = await fetchAdminEventSchedule()
      await updateAdminEventSchedule({
        ...status.config,
        enabled: next === "schedule",
      })
      setControlMode(next)
      setSuccess(
        next === "schedule"
          ? "Schedule mode on — reconciler owns event partials."
          : "Manual mode on — schedule reconciler is idle."
      )
      await refreshEventsQuiet()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to switch control mode"
      )
    } finally {
      setModeSwitching(false)
    }
  }

  const signalConflict = (reason: string, eventIds: string[]) => {
    setConflictFlashIds(eventIds)
    setConflictFlashKey((k) => k + 1)
    setConflictNotice({ reason, eventIds })
    setError(null)
    setSuccess(null)
  }

  const clearConflictNotice = () => {
    setConflictFlashIds([])
    setConflictNotice(null)
  }

  const activeIds = useMemo(
    () => events.filter((e) => e.active).map((e) => e.id),
    [events]
  )

  const activeConflictIds = useMemo(() => {
    const hits = conflictsInActiveSet(activeIds, DEFAULT_CONFLICT_GROUPS)
    const ids = new Set<string>()
    for (const c of hits) {
      for (const id of c.eventIds) ids.add(id)
    }
    for (const id of conflictFlashIds) ids.add(id)
    return ids
  }, [activeIds, conflictFlashIds])

  const displayConflictNotice = useMemo(() => {
    if (conflictNotice) return conflictNotice
    const hits = conflictsInActiveSet(activeIds, DEFAULT_CONFLICT_GROUPS)
    if (!hits.length) return null
    return { reason: hits[0].reason, eventIds: hits[0].eventIds }
  }, [conflictNotice, activeIds])

  const handleToggle = async (eventId: string, enabled: boolean) => {
    if (enabled) {
      const next = [...activeIds, eventId]
      const hit = findConflictInSet(next, DEFAULT_CONFLICT_GROUPS)
      if (hit) {
        signalConflict(hit.reason, hit.eventIds)
        return
      }
    }

    setMutating(true)
    setError(null)
    setSuccess(null)
    clearConflictNotice()
    try {
      const res = await updateAdminEvents({ eventId, enabled })
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, active: enabled } : e))
      )
      setActiveCount(res.activeCount)
      setIsDirty(res.isDirty)
      if (selectedEvent && selectedEvent.id === eventId) {
        setSelectedEvent((prev) => (prev ? { ...prev, active: enabled } : null))
      }
    } catch (err) {
      const e = err as Error & {
        data?: { conflicts?: { reason: string; eventIds: string[] }[] }
      }
      const conflicts = e.data?.conflicts
      if (conflicts?.length) {
        const c = conflicts[0]
        signalConflict(c.reason, c.eventIds)
      } else {
        setError(err instanceof Error ? err.message : "Failed to update event")
      }
    } finally {
      setMutating(false)
    }
  }

  const handleApplyPreset = async (name: string, ids: string[]) => {
    const hit = findConflictInSet(ids, DEFAULT_CONFLICT_GROUPS)
    if (hit) {
      signalConflict(hit.reason, hit.eventIds)
      return
    }

    const ok = await confirm({
      title: `Apply "${name}" Preset?`,
      description: `This will activate ${ids.length} event partial(s) in channel.xml and replace the current selection.`,
      confirmLabel: "Apply Preset",
    })
    if (!ok) return

    setMutating(true)
    setError(null)
    setSuccess(null)
    clearConflictNotice()
    try {
      const res = await updateAdminEvents({ activeIds: ids })
      setEvents((prev) =>
        prev.map((e) => ({ ...e, active: res.activeIds.includes(e.id) }))
      )
      setActiveCount(res.activeCount)
      setIsDirty(res.isDirty)
      setSuccess(
        `Preset "${name}" applied to draft. Publish & restart on Overview to apply live.`
      )
    } catch (err) {
      const e = err as Error & {
        data?: { conflicts?: { reason: string; eventIds: string[] }[] }
      }
      const conflicts = e.data?.conflicts
      if (conflicts?.length) {
        const c = conflicts[0]
        signalConflict(c.reason, c.eventIds)
      } else {
        setError(err instanceof Error ? err.message : "Failed to apply preset")
      }
    } finally {
      setMutating(false)
    }
  }

  const handleResetVanilla = async () => {
    const ok = await confirm({
      title: "Reset to Vanilla (Disable All Events)?",
      description:
        "This will clear all event partials from channel.xml, returning the server to its vanilla state.",
      confirmLabel: "Disable All Events",
      variant: "destructive",
    })
    if (!ok) return

    setMutating(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await updateAdminEvents({ activeIds: [] })
      setEvents((prev) => prev.map((e) => ({ ...e, active: false })))
      setActiveCount(0)
      setIsDirty(res.isDirty)
      setSuccess(
        "All event partials disabled in draft. Publish & restart on Overview to apply live."
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset events")
    } finally {
      setMutating(false)
    }
  }

  const filteredEvents = useMemo(() => {
    let list = events

    if (onlyActive) {
      list = list.filter((e) => e.active)
    }

    if (category !== "all") {
      list = list.filter((e) => e.category === category)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (e) =>
          e.titleEn.toLowerCase().includes(q) ||
          e.titleJp.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.affectedZones.some((z) => z.toLowerCase().includes(q)) ||
          e.featuredNpcs.some((n) => n.toLowerCase().includes(q)) ||
          (e.npcSpawns ?? []).some(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.zoneName.toLowerCase().includes(q) ||
              String(s.zoneId).includes(q)
          )
      )
    }

    // Stable catalog order (year/month) — don't jump active items to the top.
    return [...list].sort((a, b) => {
      if (a.year !== b.year) {
        return b.year - a.year
      }
      return b.month - a.month
    })
  }, [events, onlyActive, category, search])

  const handleScheduleStatus = useCallback(
    (s: { config: { enabled: boolean } }) => {
      setControlMode(s.config.enabled ? "schedule" : "manual")
    },
    []
  )

  const openDrawer = (event: EventStatus) => {
    setSelectedEvent(event)
    setDrawerOpen(true)
  }

  const isSchedule = controlMode === "schedule"
  const isManual = controlMode === "manual"
  const busy = mutating || modeSwitching

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Seasonal Events
            </h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                activeCount > 0
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {activeCount} Active
            </span>
            {isDirty && isManual && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30 animate-pulse">
                <AlertTriangle className="size-3" />
                Draft unpublished
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            Activate modular event partials in{" "}
            <code className="text-foreground">channel.xml</code>. Manual and
            Schedule modes are exclusive — only one owns the active set at a
            time. Edits persist as draft; Publish &amp; restart on Overview to
            apply live.
          </p>
        </div>

        {isManual ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetVanilla}
              disabled={busy || activeCount === 0}
              className="text-xs gap-1.5"
            >
              <RotateCcw className="size-3.5" />
              Reset to Vanilla
            </Button>
          </div>
        ) : null}
      </div>

      {/* Manual vs Schedule ownership */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">Control mode</p>
          <p className="text-[11px] text-muted-foreground">
            {isSchedule
              ? "Schedule owns event partials. Edits autosave; restart the channel on Overview (or wait for the daily flip) to apply live."
              : isManual
                ? "Manual owns event partials. Toggle cards or presets autosave the draft; Publish & restart on Overview to apply live."
                : "Loading ownership…"}
          </p>
        </div>
        <div
          className="inline-flex rounded-md border border-border/70 bg-background p-0.5"
          role="group"
          aria-label="Events control mode"
        >
          <button
            type="button"
            disabled={!controlMode || modeSwitching}
            onClick={() => void switchControlMode("manual")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              isManual
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Manual
          </button>
          <button
            type="button"
            disabled={!controlMode || modeSwitching}
            onClick={() => void switchControlMode("schedule")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-medium transition-colors",
              isSchedule
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {modeSwitching ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                Switching…
              </span>
            ) : (
              "Schedule"
            )}
          </button>
        </div>
      </div>

      {/* Status Alerts */}
      {error && <FormAlert variant="error">{error}</FormAlert>}
      {success && <FormAlert variant="success">{success}</FormAlert>}

      {isSchedule && !loading && events.length > 0 ? (
        <EventSchedulePanel
          events={events}
          onStatusChange={handleScheduleStatus}
        />
      ) : null}

      {isManual ? (
        <>
          {/* Quick Presets Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Featured Event Presets
              </h2>
              <span className="text-[11px] text-muted-foreground">
                Click a preset to quickly configure themed event partials
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {PRESETS.map((preset) => {
                const Icon = preset.icon
                const isPresetActive = preset.ids.every((id) =>
                  events.some((e) => e.id === id && e.active)
                )

                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyPreset(preset.name, preset.ids)}
                    disabled={busy}
                    className={`flex flex-col text-left p-3 rounded-md border transition-all text-xs group cursor-pointer ${
                      isPresetActive
                        ? "border-primary/60 bg-primary/10 shadow-xs"
                        : "border-border/70 bg-card/60 hover:bg-card/90 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="flex items-center gap-1.5 font-semibold text-foreground group-hover:text-primary transition-colors">
                        <Icon className="size-3.5 text-primary shrink-0" />
                        {preset.name}
                      </span>
                      {isPresetActive && (
                        <span className="size-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                      {preset.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Filter & Search Toolbar */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-lg border border-border/80 bg-muted/20">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, demon, pie, beach, zone..."
                  className="pl-8 text-xs h-8.5"
                />
              </div>

              <div className="flex items-center gap-2 px-2 border-l border-border/70">
                <Switch
                  size="sm"
                  checked={onlyActive}
                  onCheckedChange={setOnlyActive}
                  id="active-filter"
                />
                <label
                  htmlFor="active-filter"
                  className="text-xs font-medium cursor-pointer text-muted-foreground select-none hover:text-foreground"
                >
                  Active Only ({activeCount})
                </label>
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1 overflow-x-auto pb-1 md:pb-0">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                    category === cat.id
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {displayConflictNotice ? (
            <div
              role="alert"
              className="sticky top-2 z-20 space-y-1 rounded border border-destructive/50 bg-destructive/15 p-2.5 text-[11px] text-destructive shadow-sm backdrop-blur-sm"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-3.5 shrink-0" />
                Can&apos;t enable together
              </div>
              <p className="leading-snug text-destructive/90">
                {displayConflictNotice.reason} (
                {displayConflictNotice.eventIds.join(" vs ")})
              </p>
            </div>
          ) : null}

          {/* Event Cards Grid */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs">Loading seasonal events catalog...</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border/80 bg-card/20">
              <Filter className="size-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-semibold text-foreground">
                No events found
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Try adjusting your search keywords or resetting the category
                filter.
              </p>
              {(search || category !== "all" || onlyActive) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("")
                    setCategory("all")
                    setOnlyActive(false)
                  }}
                  className="mt-4 text-xs"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredEvents.map((evt) => (
                <EventCard
                  key={`${evt.id}-${activeConflictIds.has(evt.id) ? `c${conflictFlashKey}` : "ok"}`}
                  event={evt}
                  onToggle={handleToggle}
                  onInspect={openDrawer}
                  disabled={busy}
                  conflicted={activeConflictIds.has(evt.id)}
                  conflictMessage={
                    displayConflictNotice?.eventIds.includes(evt.id)
                      ? displayConflictNotice.reason
                      : null
                  }
                />
              ))}
            </div>
          )}

          {/* Details Drawer */}
          <EventDetailDrawer
            event={selectedEvent}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onToggle={handleToggle}
            disabled={busy}
            conflictMessage={
              selectedEvent &&
              displayConflictNotice?.eventIds.includes(selectedEvent.id)
                ? `${displayConflictNotice.reason} (${displayConflictNotice.eventIds.join(" vs ")})`
                : null
            }
          />
        </>
      ) : null}

      {loading && !controlMode ? (
        <div className="flex flex-col items-center justify-center p-16 gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs">Loading seasonal events…</p>
        </div>
      ) : null}
    </div>
  )
}
