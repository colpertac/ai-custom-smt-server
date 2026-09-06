"use client"

import { useMemo } from "react"
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

interface CalendarModeBoardProps {
  days: EventScheduleCalendarDay[]
  selectedDate: string | null
  titleByEventId: Map<string, string>
  onSelectDate: (date: string) => void
  className?: string
}

export function CalendarModeBoard({
  days,
  selectedDate,
  titleByEventId,
  onSelectDate,
  className,
}: CalendarModeBoardProps) {
  const byDate = useMemo(() => {
    const m = new Map<string, EventScheduleCalendarDay>()
    for (const d of days) m.set(d.date, d)
    return m
  }, [days])

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

  const onDateClick = (arg: DateClickArg) => {
    onSelectDate(arg.dateStr)
  }

  const onEventClick = (arg: EventClickArg) => {
    onSelectDate(arg.event.id)
  }

  return (
    <div
      className={cn(
        "event-schedule-calendar rounded border border-border/60 bg-background p-2 text-xs",
        className
      )}
    >
      <p className="mb-2 px-1 text-[11px] text-muted-foreground">
        Click a date to assign events for that real-world day (manual schedule —
        no auto-loop).
        {selectedDate
          ? ` Selected: ${selectedDate}${
              byDate.get(selectedDate)?.eventIds.length
                ? ""
                : " (empty)"
            }`
          : ""}
      </p>
      <FullCalendar
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
        dayMaxEvents={3}
      />
    </div>
  )
}
