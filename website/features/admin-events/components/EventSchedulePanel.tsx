"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays, Loader2, Repeat, Save } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fetchAdminEventSchedule,
  updateAdminEventSchedule,
} from "@/features/admin-events/api"
import { CalendarModeBoard } from "@/features/admin-events/components/CalendarModeBoard"
import { EventIdChecklist } from "@/features/admin-events/components/EventIdChecklist"
import { LoopDayBoard } from "@/features/admin-events/components/LoopDayBoard"
import { ScheduleDaySidebar } from "@/features/admin-events/components/ScheduleDaySidebar"
import { ScheduleEventPicker } from "@/features/admin-events/components/ScheduleEventPicker"
import { activeLoopDayIndex } from "@/lib/events/event-schedule-math"
import { cn } from "@/lib/utils"
import type {
  EventScheduleCalendarDay,
  EventScheduleConfig,
  EventScheduleConflict,
  EventScheduleLoopDay,
  EventScheduleMode,
  EventScheduleStatus,
  EventStatus,
} from "@/lib/events/types"

function formatIso(iso: string | null, timeZone: string): string {
  if (!iso) return "—"
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

interface EventSchedulePanelProps {
  events: EventStatus[]
  /** Called after load/save so parent can sync Manual vs Schedule ownership. */
  onStatusChange?: (status: EventScheduleStatus) => void
}

export function EventSchedulePanel({
  events,
  onStatusChange,
}: EventSchedulePanelProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<EventScheduleConflict[]>([])
  const [status, setStatus] = useState<EventScheduleStatus | null>(null)

  // Panel is only shown in Schedule control mode — always persist enabled: true.
  const [mode, setMode] = useState<EventScheduleMode>("loop")
  const [timezone, setTimezone] = useState("America/New_York")
  const [flipTime, setFlipTime] = useState("04:00")
  const [anchorDate, setAnchorDate] = useState("")
  const [alwaysOnIds, setAlwaysOnIds] = useState<string[]>([])
  const [loopDays, setLoopDays] = useState<EventScheduleLoopDay[]>([])
  const [calendarDays, setCalendarDays] = useState<EventScheduleCalendarDay[]>(
    []
  )

  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null)
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null)
  /** Bumps so the “active now” arrow can move at flip without a full reload. */
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const catalogOptions = useMemo(
    () =>
      [...events]
        .sort((a, b) => a.titleEn.localeCompare(b.titleEn))
        .map((e) => ({
          id: e.id,
          label: e.titleEn,
          hint: e.id,
          category: e.category,
        })),
    [events]
  )

  const titleByEventId = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of events) m.set(e.id, e.titleEn)
    return m
  }, [events])

  const applyStatus = useCallback(
    (s: EventScheduleStatus) => {
      setStatus(s)
      const c = s.config
      setMode(c.mode)
      setTimezone(c.timezone)
      setFlipTime(c.flipTime)
      setAnchorDate(c.loop.anchorDate)
      setAlwaysOnIds([...c.alwaysOnIds])
      setLoopDays(c.loop.days.map((d) => ({ ...d, eventIds: [...d.eventIds] })))
      setCalendarDays(
        c.calendar.days.map((d) => ({ ...d, eventIds: [...d.eventIds] }))
      )
      onStatusChange?.(s)
    },
    [onStatusChange]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const s = await fetchAdminEventSchedule()
      applyStatus(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule")
    } finally {
      setLoading(false)
    }
  }, [applyStatus])

  useEffect(() => {
    void load()
  }, [load])

  const buildConfig = (): EventScheduleConfig => ({
    version: 2,
    enabled: true,
    mode,
    timezone,
    flipTime,
    alwaysOnIds,
    loop: {
      anchorDate: anchorDate || new Date().toISOString().slice(0, 10),
      days: loopDays,
    },
    calendar: { days: calendarDays },
  })

  const onSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    setConflicts([])
    try {
      const next = await updateAdminEventSchedule(buildConfig())
      applyStatus(next)
      setSuccess(
        "Schedule saved. Live events are unchanged until you restart the channel on Overview (or the daily flip runs)."
      )
    } catch (err) {
      const e = err as Error & {
        data?: { errors?: string[]; conflicts?: EventScheduleConflict[] }
      }
      if (e.data?.conflicts?.length) {
        setConflicts(e.data.conflicts)
        setError("Schedule has conflicts — fix conflicting events on the day.")
      } else {
        const parts: string[] = [e.message || "Save failed"]
        if (e.data?.errors?.length) parts.push(...e.data.errors)
        setError(parts.join(" · "))
      }
    } finally {
      setSaving(false)
    }
  }

  const selectedLoop = loopDays.find((d) => d.id === selectedLoopId) ?? null
  const selectedCal =
    selectedCalDate != null
      ? (calendarDays.find((d) => d.date === selectedCalDate) ?? {
          date: selectedCalDate,
          eventIds: [] as string[],
        })
      : null

  const editingDay =
    mode === "loop" && selectedLoop
      ? {
          title: `Day ${loopDays.findIndex((d) => d.id === selectedLoop.id) + 1}`,
          eventIds: selectedLoop.eventIds,
          setEventIds: (ids: string[]) => {
            setConflicts([])
            setLoopDays((prev) =>
              prev.map((d) =>
                d.id === selectedLoop.id ? { ...d, eventIds: ids } : d
              )
            )
          },
        }
      : mode === "calendar" && selectedCalDate && selectedCal
        ? {
            title: selectedCalDate,
            eventIds: selectedCal.eventIds,
            setEventIds: (ids: string[]) => {
              setConflicts([])
              setCalendarDays((prev) => {
                const exists = prev.some((d) => d.date === selectedCalDate)
                if (!exists) {
                  return [
                    ...prev,
                    { date: selectedCalDate, eventIds: ids },
                  ].sort((a, b) => a.date.localeCompare(b.date))
                }
                return prev.map((d) =>
                  d.date === selectedCalDate ? { ...d, eventIds: ids } : d
                )
              })
            },
          }
        : null

  const draftActiveLoopIndex = useMemo(() => {
    if (mode !== "loop" || loopDays.length === 0 || !anchorDate) return null
    void nowTick
    return activeLoopDayIndex(
      {
        version: 2,
        enabled: true,
        mode: "loop",
        timezone,
        flipTime,
        alwaysOnIds,
        loop: { anchorDate, days: loopDays },
        calendar: { days: calendarDays },
      },
      new Date()
    )
  }, [
    mode,
    loopDays,
    anchorDate,
    timezone,
    flipTime,
    alwaysOnIds,
    calendarDays,
    nowTick,
  ])

  const ensureCalendarDay = (date: string) => {
    setCalendarDays((prev) => {
      if (prev.some((d) => d.date === date)) return prev
      return [...prev, { date, eventIds: [] }].sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading schedule…
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded border border-border/70 bg-card/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Event schedule
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Schedule owns <code className="text-foreground">channel.xml</code>{" "}
            event partials. Select a loop day or calendar date, then toggle
            event cards below. Save the plan; restart on Overview to apply live.
          </p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center justify-center gap-3 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-medium",
            mode === "loop" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <Repeat className="size-3.5 shrink-0" aria-hidden />
          Loop mode
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={mode === "calendar"}
          onClick={() => setMode((m) => (m === "loop" ? "calendar" : "loop"))}
          className={cn(
            "relative h-6 w-11 rounded-full border transition-colors",
            mode === "calendar"
              ? "border-primary bg-primary/30"
              : "border-border bg-muted/50"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-4 rounded-full bg-foreground transition-transform",
              mode === "calendar" ? "left-6" : "left-0.5"
            )}
          />
        </button>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-medium",
            mode === "calendar" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          Calendar mode
        </span>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}
      {success && <FormAlert variant="success">{success}</FormAlert>}

      <div className="grid gap-3 text-xs sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-muted-foreground">Timezone</span>
          <Input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-8 text-xs"
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">
            Daily flip / restart time
          </span>
          <Input
            type="time"
            value={flipTime}
            onChange={(e) => setFlipTime(e.target.value || "04:00")}
            className="h-8 text-xs"
          />
        </label>
        {mode === "loop" ? (
          <label className="space-y-1">
            <span className="text-muted-foreground">
              Loop day 1 date
              {draftActiveLoopIndex != null ? (
                <span className="ml-1 text-primary">
                  · now Day {draftActiveLoopIndex + 1}
                </span>
              ) : null}
            </span>
            <Input
              type="date"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
              className="h-8 text-xs"
            />
            <p className="text-[10px] leading-snug text-muted-foreground">
              Date when Day 1 is active. The cycle wraps forever. Save updates
              the plan only — restart the channel on Overview to apply today.
            </p>
          </label>
        ) : (
          <div className="self-end pb-2 text-[11px] text-muted-foreground">
            Assign events per real calendar date.
          </div>
        )}
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="font-medium text-foreground">Always on every day</div>
        <p className="text-muted-foreground">
          Stay active across every loop/calendar day (e.g. Under Wonderground).
        </p>
        <EventIdChecklist
          label="Always-on events"
          options={catalogOptions}
          selectedIds={alwaysOnIds}
          onChange={(ids) => {
            setConflicts([])
            setAlwaysOnIds(ids)
          }}
          conflicts={conflicts.filter(
            (c) => c.source === "alwaysOn" || c.source === "alwaysOn+day"
          )}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          {conflicts.length > 0 && !editingDay ? (
            <div
              role="alert"
              className="space-y-1 rounded border border-destructive/50 bg-destructive/15 p-2.5 text-[11px] text-destructive"
            >
              <p className="font-semibold">
                Conflict — select a day and fix conflicting events (they blink
                red).
              </p>
              {conflicts.map((c, i) => (
                <p key={`${c.groupId}-${i}`} className="text-destructive/90">
                  {c.reason} ({c.eventIds.join(" vs ")})
                </p>
              ))}
            </div>
          ) : null}
          {mode === "loop" ? (
            <>
              <div className="text-xs font-medium">
                Loop days · {loopDays.length} day
                {loopDays.length === 1 ? "" : "s"} (then repeats)
              </div>
              <LoopDayBoard
                days={loopDays}
                selectedId={selectedLoopId}
                activeIndex={draftActiveLoopIndex}
                titleByEventId={titleByEventId}
                onSelect={setSelectedLoopId}
                onReorder={(next) => {
                  setConflicts([])
                  setLoopDays(next)
                }}
                onAdd={() => {
                  const id = crypto.randomUUID()
                  setLoopDays((prev) => [...prev, { id, eventIds: [] }])
                  setSelectedLoopId(id)
                }}
              />
            </>
          ) : (
            <>
              <div className="text-xs font-medium">
                Calendar · {calendarDays.length} dated assignment
                {calendarDays.length === 1 ? "" : "s"}
              </div>
              <CalendarModeBoard
                days={calendarDays}
                selectedDate={selectedCalDate}
                titleByEventId={titleByEventId}
                onSelectDate={(date) => {
                  ensureCalendarDay(date)
                  setSelectedCalDate(date)
                }}
              />
            </>
          )}
        </div>

        {editingDay ? (
          <ScheduleDaySidebar
            title={editingDay.title}
            eventIds={editingDay.eventIds}
            events={events}
            onRemoveEventId={(id) =>
              editingDay.setEventIds(
                editingDay.eventIds.filter((x) => x !== id)
              )
            }
            onClearAll={() => editingDay.setEventIds([])}
            onClose={() => {
              setSelectedLoopId(null)
              setSelectedCalDate(null)
            }}
            onDelete={
              mode === "loop" && selectedLoop
                ? () => {
                    setLoopDays((prev) =>
                      prev.filter((d) => d.id !== selectedLoop.id)
                    )
                    setSelectedLoopId(null)
                  }
                : mode === "calendar" && selectedCalDate
                  ? () => {
                      setCalendarDays((prev) =>
                        prev.filter((d) => d.date !== selectedCalDate)
                      )
                      setSelectedCalDate(null)
                    }
                  : undefined
            }
          />
        ) : (
          <aside className="flex w-full flex-col gap-2 rounded border border-dashed border-border/60 bg-muted/10 p-3 text-[11px] text-muted-foreground lg:w-72 lg:shrink-0">
            <p className="font-medium text-foreground">No day selected</p>
            <p>
              Click a loop day card or calendar date to assign events. The
              sidebar will list what’s on that day; cards below add more.
            </p>
          </aside>
        )}
      </div>

      {editingDay ? (
        <ScheduleEventPicker
          title={editingDay.title}
          events={events}
          selectedIds={editingDay.eventIds}
          conflictWithIds={alwaysOnIds}
          onChangeSelectedIds={editingDay.setEventIds}
        />
      ) : null}

      {status && (
        <div className="space-y-0.5 rounded border border-border/40 bg-muted/20 p-2.5 font-mono text-[11px] text-muted-foreground">
          <div>
            Next change: {formatIso(status.nextChangeAt, timezone)} · Desired:{" "}
            {status.desiredActiveIds.join(", ") || "(none)"}
          </div>
          <div>
            Live: {status.liveActiveIds.join(", ") || "(none)"} · Pending
            restart: {formatIso(status.reconciler.pendingRestartAt, timezone)}
          </div>
          {status.reconciler.lastError && (
            <div className="text-destructive">
              Last error: {status.reconciler.lastError}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={saving}
        >
          Reload
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void onSave()}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Save schedule
        </Button>
      </div>
    </div>
  )
}
