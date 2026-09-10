"use client"

import { useMemo, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventClickArg, EventInput } from "@fullcalendar/core"
import type { DateClickArg } from "@fullcalendar/interaction"
import { Sparkles, Users } from "lucide-react"

import { PublicEventDetailDialog } from "@/features/events/components/PublicEventDetailDialog"
import {
  categoryBadgeClass,
  categoryIcon,
} from "@/features/events/lib/category-styles"
import type { CompEvent, PublicEventsResponse } from "@/lib/events/types"
import { cn } from "@/lib/utils"

type DaySlot = {
  dateKey: string
  dayKey: string
  title?: string
  startsAt: string
  endsAt: string
  events: CompEvent[]
}

function dateKeyInZone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

function formatWhen(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatDayHeading(dateKey: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone,
    }).format(new Date(`${dateKey}T12:00:00`))
  } catch {
    return dateKey
  }
}

function formatClock(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function upcomingLabel(slot: DaySlot, timeZone: string, nowMs: number): string {
  const nowKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs))
  if (slot.dateKey === nowKey) {
    return `Later today · ${formatClock(slot.startsAt, timeZone)}`
  }
  const tomorrow = new Date(nowMs + 24 * 60 * 60_000)
  const tomKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrow)
  if (slot.dateKey === tomKey) {
    return `Tomorrow · ${formatClock(slot.startsAt, timeZone)}`
  }
  return formatWhen(slot.startsAt, timeZone)
}

function EventRow({
  event,
  badge,
  onDetails,
}: {
  event: CompEvent
  badge?: string
  onDetails: (event: CompEvent) => void
}) {
  const npc = [
    ...new Set(
      (event.npcSpawns?.length
        ? event.npcSpawns.map((s) => s.name)
        : event.featuredNpcs) ?? []
    ),
  ].slice(0, 2)

  return (
    <button
      type="button"
      onClick={() => onDetails(event)}
      className={cn(
        "group flex w-full items-start gap-3 border-b border-border/40 px-3 py-2.5 text-left last:border-b-0",
        "transition-colors hover:bg-[color-mix(in_srgb,var(--gold)_8%,transparent)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--gold)_50%,transparent)]"
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
          categoryBadgeClass(event.category)
        )}
      >
        {categoryIcon(event.category)}
        {event.category}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-semibold tracking-wide text-foreground transition-colors group-hover:text-[var(--gold-hot)]">
            {event.titleEn}
          </span>
          {badge ? (
            <span className="inline-flex items-center gap-1 rounded border border-[color-mix(in_srgb,var(--gold)_35%,transparent)] bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-[var(--gold-hot)]">
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-[var(--gold-hot)] motion-safe:animate-pulse"
              />
              {badge}
            </span>
          ) : null}
        </span>
        {event.summary ? (
          <span className="mt-0.5 line-clamp-1 block text-[11px] text-muted-foreground">
            {event.summary}
          </span>
        ) : null}
        {npc.length > 0 ? (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="size-3 text-[var(--gold-dim)]" aria-hidden />
            {npc.join(" · ")}
          </span>
        ) : null}
      </span>
      <span className="mt-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground group-hover:text-[var(--gold-hot)]">
        →
      </span>
    </button>
  )
}

export function PublicEventsSchedule({ data }: { data: PublicEventsResponse }) {
  const [selected, setSelected] = useState<CompEvent | null>(null)
  const tz = data.timezone || "UTC"

  const alwaysIds = useMemo(
    () => new Set(data.alwaysOn.map((e) => e.id)),
    [data.alwaysOn]
  )

  const liveExclusive = useMemo(
    () => data.current.filter((e) => !alwaysIds.has(e.id)),
    [data.current, alwaysIds]
  )

  const liveEvents =
    liveExclusive.length > 0
      ? liveExclusive
      : data.current.filter((e) => !alwaysIds.has(e.id))

  const slots: DaySlot[] = useMemo(() => {
    return data.upcoming.map((s) => ({
      dateKey: dateKeyInZone(s.startsAt, tz),
      dayKey: s.dayKey,
      title: s.title,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      events: s.events.filter((e) => !alwaysIds.has(e.id)),
    }))
  }, [data.upcoming, tz, alwaysIds])

  const nowKey = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    [tz]
  )

  const nextTwo = useMemo(() => {
    const now = Date.now()
    return slots.filter((s) => Date.parse(s.startsAt) > now).slice(0, 2)
  }, [slots])

  const [browseDate, setBrowseDate] = useState<string | null>(nowKey)

  const calendarEvents: EventInput[] = useMemo(() => {
    return slots
      .filter((s) => s.events.length > 0)
      .map((s) => ({
        id: s.dateKey,
        title: `${s.events.length}`,
        start: s.dateKey,
        allDay: true,
        backgroundColor: "color-mix(in srgb, var(--gold) 50%, #1a1408)",
        borderColor: "color-mix(in srgb, var(--gold) 35%, transparent)",
        textColor: "#f5edd4",
      }))
  }, [slots])

  const browseSlot = browseDate
    ? (slots.find((s) => s.dateKey === browseDate) ?? null)
    : null

  const browseIsToday = browseDate === nowKey
  const browseEvents = browseIsToday
    ? liveEvents
    : (browseSlot?.events ?? [])

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/40 pb-3">
        <div className="min-w-0 max-w-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-dim)]">
            <Sparkles className="size-3" aria-hidden />
            Seasonal schedule
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.scheduleEnabled
              ? `Flips at ${data.flipTime} (${tz}). Live list on the left — pick any day on the calendar.`
              : "Live seasonal events on this realm right now."}
          </p>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          <span className="text-[var(--gold-hot)]">{liveEvents.length}</span> live
          {data.alwaysOn.length > 0 ? (
            <>
              {" · "}
              <span className="text-foreground">{data.alwaysOn.length}</span>{" "}
              always on
            </>
          ) : null}
        </p>
      </header>

      <div
        className={cn(
          "grid gap-5",
          data.scheduleEnabled
            ? "xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.92fr)] xl:items-start"
            : null
        )}
      >
        {/* Left column */}
        <div className="min-w-0 space-y-5">
          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-dim)]">
                  Right now
                </p>
                <h2 className="font-heading text-xl font-semibold tracking-[0.1em] uppercase sm:text-2xl">
                  Today
                </h2>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {liveEvents.length} rotating
              </span>
            </div>

            <div className="site-panel overflow-hidden">
              {liveEvents.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  No rotating events live right now
                  {data.alwaysOn.length > 0
                    ? " — always-on items still apply."
                    : "."}
                </p>
              ) : (
                <div className="max-h-[min(28rem,55vh)] overflow-y-auto">
                  {liveEvents.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      badge="Live"
                      onDetails={setSelected}
                    />
                  ))}
                </div>
              )}
            </div>

            {data.alwaysOn.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="self-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Always
                </span>
                {data.alwaysOn.map((e) => (
                  <button
                    key={`always-${e.id}`}
                    type="button"
                    onClick={() => setSelected(e)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded border border-border/60 bg-background/40 px-2.5 py-1 text-left text-[11px] transition-colors hover:border-[color-mix(in_srgb,var(--gold)_40%,var(--border))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gold)_50%,transparent)]"
                  >
                    <span
                      className={cn(
                        "inline-flex items-center rounded border px-1 py-px",
                        categoryBadgeClass(e.category)
                      )}
                    >
                      {categoryIcon(e.category)}
                    </span>
                    <span className="truncate font-medium text-foreground">
                      {e.titleEn}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {data.scheduleEnabled ? (
            <section>
              <div className="mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-dim)]">
                  Coming up
                </p>
                <h2 className="font-heading text-lg font-semibold tracking-[0.1em] uppercase">
                  Next flips
                </h2>
              </div>
              {nextTwo.length === 0 ? (
                <div className="site-panel px-4 py-5 text-sm text-muted-foreground">
                  No upcoming windows yet.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {nextTwo.map((slot) => (
                    <button
                      key={`${slot.dayKey}-${slot.startsAt}`}
                      type="button"
                      onClick={() => setBrowseDate(slot.dateKey)}
                      className={cn(
                        "site-panel p-3 text-left transition duration-300",
                        "hover:border-[color-mix(in_srgb,var(--gold)_40%,var(--border))]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--gold)_50%,transparent)]",
                        browseDate === slot.dateKey &&
                          "border-[color-mix(in_srgb,var(--gold)_45%,var(--border))] bg-[color-mix(in_srgb,var(--gold)_6%,transparent)]"
                      )}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gold-dim)]">
                        {upcomingLabel(slot, tz, Date.now())}
                      </p>
                      <p className="font-heading mt-1 text-sm font-semibold tracking-wide">
                        {formatDayHeading(slot.dateKey, tz)}
                      </p>
                      <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
                        {slot.events.length === 0
                          ? "No rotating events"
                          : slot.events
                              .slice(0, 3)
                              .map((e) => e.titleEn)
                              .join(" · ")}
                        {slot.events.length > 3
                          ? ` +${slot.events.length - 3}`
                          : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>

        {/* Right column — calendar */}
        {data.scheduleEnabled && slots.length > 0 ? (
          <aside className="min-w-0 space-y-3 xl:sticky xl:top-20">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--gold-dim)]">
                Browse
              </p>
              <h2 className="font-heading text-lg font-semibold tracking-[0.1em] uppercase">
                Calendar
              </h2>
            </div>

            <div className="public-events-calendar event-schedule-calendar rounded border border-border/60 bg-background/40 p-2">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                timeZone={tz}
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "",
                }}
                height="auto"
                contentHeight={340}
                events={calendarEvents}
                dateClick={(arg: DateClickArg) => setBrowseDate(arg.dateStr)}
                eventClick={(arg: EventClickArg) => {
                  arg.jsEvent.preventDefault()
                  setBrowseDate(arg.event.id)
                }}
                dayCellClassNames={(arg) =>
                  arg.dateStr === browseDate ? ["is-browse-selected"] : []
                }
                dayMaxEvents={1}
                fixedWeekCount={false}
              />
            </div>

            <div
              key={browseDate ?? "none"}
              className="site-panel overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
            >
              <div className="border-b border-border/40 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--gold-dim)]">
                  {browseIsToday
                    ? "Selected · live now"
                    : browseSlot?.dayKey?.replace(/^loop-/, "Loop day ") ||
                      "Selected"}
                </p>
                <p className="font-heading mt-0.5 text-base font-semibold tracking-wide">
                  {browseDate
                    ? formatDayHeading(browseDate, tz)
                    : "Pick a date"}
                </p>
                {!browseIsToday && browseSlot ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatWhen(browseSlot.startsAt, tz)}
                    <span> → </span>
                    {formatWhen(browseSlot.endsAt, tz)}
                  </p>
                ) : null}
              </div>

              {browseDate == null ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  Click a date to list events.
                </p>
              ) : browseEvents.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {browseSlot
                    ? "No rotating events that day. Always-on still applies."
                    : "No scheduled window for this date in the preview range."}
                </p>
              ) : (
                <div className="max-h-[min(22rem,40vh)] overflow-y-auto">
                  {browseEvents.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      badge={browseIsToday ? "Live" : undefined}
                      onDetails={setSelected}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      <PublicEventDetailDialog
        event={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
