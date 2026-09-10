"use client"

import { useEffect, useMemo, useRef } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventClickArg, EventInput } from "@fullcalendar/core"
import type { DateClickArg } from "@fullcalendar/interaction"

import { cn } from "@/lib/utils"
import type { EventScheduleCalendarDay } from "@/lib/events/types"

const COLORS = [
  "#e67e22",
  "#9b59b6",
  "#27ae60",
  "#e74c3c",
  "#3498db",
  "#1abc9c",
]

const SELECTED_CLASS = "is-day-selected"

interface CalendarModeBoardProps {
  days: EventScheduleCalendarDay[]
  selectedDate: string | null
  titleByEventId: Map<string, string>
  onSelectDate: (date: string) => void
  className?: string
}

function applySelectedDayClass(
  calendarEl: HTMLElement | null | undefined,
  selectedDate: string | null
) {
  if (!calendarEl) return
  calendarEl
    .querySelectorAll(`.fc-daygrid-day.${SELECTED_CLASS}`)
    .forEach((el) => el.classList.remove(SELECTED_CLASS))
  if (!selectedDate) return
  const cell = calendarEl.querySelector(
    `.fc-daygrid-day[data-date="${selectedDate}"]`
  )
  cell?.classList.add(SELECTED_CLASS)
}

export function CalendarModeBoard({
  days,
  selectedDate,
  titleByEventId,
  onSelectDate,
  className,
}: CalendarModeBoardProps) {
  const calendarRef = useRef<FullCalendar>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedDateRef = useRef(selectedDate)
  selectedDateRef.current = selectedDate

  const byDate = useMemo(() => {
    const m = new Map<string, EventScheduleCalendarDay>()
    for (const d of days) m.set(d.date, d)
    return m
  }, [days])

  const selectedCount = selectedDate
    ? (byDate.get(selectedDate)?.eventIds.length ?? 0)
    : 0

  const events: EventInput[] = useMemo(() => {
    return days.flatMap((d, i) => {
      if (!d.eventIds.length) return []
      const names = d.eventIds
        .map((id) => titleByEventId.get(id) || id)
        .slice(0, 3)
      const color = COLORS[i % COLORS.length]
      return [
        {
          id: d.date,
          title: names.join(", ") || d.date,
          start: d.date,
          allDay: true,
          backgroundColor: color,
          borderColor: color,
          textColor: "#fff",
        },
      ]
    })
  }, [days, titleByEventId])

  useEffect(() => {
    const el =
      calendarRef.current?.getApi()?.el ??
      rootRef.current?.querySelector<HTMLElement>(".fc")
    // Defer one frame so FullCalendar finishes painting day cells.
    const id = window.requestAnimationFrame(() => {
      applySelectedDayClass(el, selectedDate)
    })
    return () => window.cancelAnimationFrame(id)
  }, [selectedDate, events])

  const onDateClick = (arg: DateClickArg) => {
    onSelectDate(arg.dateStr)
  }

  const onEventClick = (arg: EventClickArg) => {
    arg.jsEvent.preventDefault()
    onSelectDate(arg.event.id)
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "event-schedule-calendar rounded border border-border/60 bg-background p-2 text-xs",
        className
      )}
    >
      <p className="mb-2 px-1 text-[11px] text-muted-foreground">
        Click a date to assign events for that real-world day (manual schedule —
        no auto-loop).
      </p>
      {selectedDate ? (
        <div
          className="mb-2 flex flex-wrap items-center gap-2 rounded border border-sky-500/50 bg-sky-500/15 px-2.5 py-1.5 text-[11px]"
          role="status"
        >
          <span className="font-semibold text-foreground">Selected day</span>
          <span className="tabular-nums text-sky-300">{selectedDate}</span>
          <span className="text-muted-foreground">
            · {selectedCount} event{selectedCount === 1 ? "" : "s"}
            {selectedCount === 0 ? " (empty — pick events below)" : ""}
          </span>
        </div>
      ) : (
        <p className="mb-2 px-1 text-[11px] text-muted-foreground">
          No day selected yet.
        </p>
      )}
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "",
        }}
        height="auto"
        contentHeight={480}
        events={events}
        dateClick={onDateClick}
        eventClick={onEventClick}
        datesSet={() => {
          const el = calendarRef.current?.getApi()?.el
          applySelectedDayClass(el, selectedDateRef.current)
        }}
        dayMaxEvents={3}
      />
    </div>
  )
}
