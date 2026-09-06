/**
 * Day-assignment schedule math (loop + calendar modes).
 * Active "schedule day" advances at flipTime in the configured timezone.
 */

import type {
  EventScheduleConfig,
  EventScheduleConfigV1,
  ExpandedScheduleSlot,
} from "./types"

export const DEFAULT_TIMEZONE = "America/New_York"
export const DEFAULT_FLIP_TIME = "04:00"

export function normalizeIds(ids: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(ids)
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ).sort()
}

export function setsEqual(a: Iterable<string>, b: Iterable<string>): boolean {
  const aa = normalizeIds(a)
  const bb = normalizeIds(b)
  if (aa.length !== bb.length) return false
  return aa.every((id, i) => id === bb[i])
}

export function parseFlipTime(flipTime: string): {
  hour: number
  minute: number
} {
  const m = /^(\d{1,2}):(\d{2})$/.exec(flipTime.trim())
  if (!m) return { hour: 4, minute: 0 }
  const hour = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const minute = Math.min(59, Math.max(0, parseInt(m[2], 10)))
  return { hour, minute }
}

/** Format a Date as YYYY-MM-DD in a given IANA timezone. */
export function formatDateInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
    const y = parts.find((p) => p.type === "year")?.value
    const mo = parts.find((p) => p.type === "month")?.value
    const d = parts.find((p) => p.type === "day")?.value
    if (y && mo && d) return `${y}-${mo}-${d}`
  } catch {
    /* fall through */
  }
  return date.toISOString().slice(0, 10)
}

/**
 * Instant when flipTime occurs on calendarDate (YYYY-MM-DD) in timeZone.
 * Uses a noon UTC probe + offset so DST is handled reasonably.
 */
export function flipInstantOnDate(
  calendarDate: string,
  flipTime: string,
  timeZone: string
): Date {
  const { hour, minute } = parseFlipTime(flipTime)
  const [y, mo, d] = calendarDate.split("-").map((x) => parseInt(x, 10))
  // Guess UTC, then correct with timezone offset at that local wall time
  const guess = new Date(Date.UTC(y, mo - 1, d, hour, minute, 0))
  const offsetMs = localOffsetMsAt(guess, timeZone)
  return new Date(guess.getTime() - offsetMs)
}

/** Milliseconds to add to UTC to get local wall in timeZone at `at`. */
function localOffsetMsAt(at: Date, timeZone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    const tzPart = fmt
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value
    // GMT-4 / GMT+5:30 / UTC
    if (!tzPart || tzPart === "UTC" || tzPart === "GMT") return 0
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzPart)
    if (!m) return 0
    const sign = m[1] === "-" ? -1 : 1
    const hh = parseInt(m[2], 10)
    const mm = m[3] ? parseInt(m[3], 10) : 0
    return sign * (hh * 60 + mm) * 60_000
  } catch {
    return 0
  }
}

function addCalendarDays(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split("-").map((x) => parseInt(x, 10))
  const dt = new Date(Date.UTC(y, mo - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/**
 * Schedule-day key for `now`: the calendar date whose flip window contains now.
 * If before flipTime on a civil date, belong to previous date's day.
 */
export function activeScheduleDateKey(
  now: Date,
  flipTime: string,
  timeZone: string
): string {
  const civil = formatDateInTimeZone(now, timeZone)
  const flipToday = flipInstantOnDate(civil, flipTime, timeZone)
  if (now.getTime() < flipToday.getTime()) {
    return addCalendarDays(civil, -1)
  }
  return civil
}

/**
 * Next wall-clock flip instant strictly after `now` (flipTime in config timezone).
 * Used for lead-in announces before the upcoming restart.
 */
export function nextFlipInstant(
  config: Pick<EventScheduleConfig, "flipTime" | "timezone">,
  now: Date = new Date()
): Date {
  const civil = formatDateInTimeZone(now, config.timezone)
  const flipToday = flipInstantOnDate(civil, config.flipTime, config.timezone)
  if (now.getTime() < flipToday.getTime()) return flipToday
  return flipInstantOnDate(
    addCalendarDays(civil, 1),
    config.flipTime,
    config.timezone
  )
}

/**
 * Most recent flip instant at or before `now`.
 * This is the flip that should already have been applied (restart).
 */
export function mostRecentFlipInstant(
  config: Pick<EventScheduleConfig, "flipTime" | "timezone">,
  now: Date = new Date()
): Date {
  const civil = formatDateInTimeZone(now, config.timezone)
  const flipToday = flipInstantOnDate(civil, config.flipTime, config.timezone)
  if (now.getTime() >= flipToday.getTime()) return flipToday
  return flipInstantOnDate(
    addCalendarDays(civil, -1),
    config.flipTime,
    config.timezone
  )
}

/** Days between two YYYY-MM-DD strings (UTC date arithmetic). */
export function daysBetween(a: string, b: string): number {
  const [ay, amo, ad] = a.split("-").map((x) => parseInt(x, 10))
  const [by, bmo, bd] = b.split("-").map((x) => parseInt(x, 10))
  const aMs = Date.UTC(ay, amo - 1, ad)
  const bMs = Date.UTC(by, bmo - 1, bd)
  return Math.floor((bMs - aMs) / (24 * 60 * 60_000))
}

export function activeLoopDayIndex(
  config: EventScheduleConfig,
  now: Date = new Date()
): number | null {
  const n = config.loop.days.length
  if (n === 0) return null
  const today = activeScheduleDateKey(now, config.flipTime, config.timezone)
  const delta = daysBetween(config.loop.anchorDate, today)
  // Wrap before and after the anchor (future anchors still map onto the cycle).
  return ((delta % n) + n) % n
}

export function computeDesiredActiveIds(
  config: EventScheduleConfig,
  now: Date = new Date()
): string[] {
  const ids = new Set(config.alwaysOnIds)
  if (!config.enabled) {
    return normalizeIds(ids)
  }

  if (config.mode === "loop") {
    const idx = activeLoopDayIndex(config, now)
    if (idx !== null) {
      for (const id of config.loop.days[idx]?.eventIds ?? []) ids.add(id)
    }
    return normalizeIds(ids)
  }

  // calendar mode
  const dateKey = activeScheduleDateKey(now, config.flipTime, config.timezone)
  const day = config.calendar.days.find((d) => d.date === dateKey)
  if (day) {
    for (const id of day.eventIds) ids.add(id)
  }
  return normalizeIds(ids)
}

export function expandUpcomingSlots(
  config: EventScheduleConfig,
  from: Date,
  to: Date,
  maxSlots = 40
): ExpandedScheduleSlot[] {
  if (!(to.getTime() > from.getTime())) return []
  const out: ExpandedScheduleSlot[] = []

  if (config.mode === "loop") {
    const n = config.loop.days.length
    if (n === 0) return []
    // Walk schedule days from `from` to `to`
    let cursor = activeScheduleDateKey(from, config.flipTime, config.timezone)
    const endKey = activeScheduleDateKey(to, config.flipTime, config.timezone)
    // Include a few days past endKey
    for (let i = 0; i < 400 && out.length < maxSlots; i++) {
      const startsAt = flipInstantOnDate(
        cursor,
        config.flipTime,
        config.timezone
      )
      const nextDate = addCalendarDays(cursor, 1)
      const endsAt = flipInstantOnDate(
        nextDate,
        config.flipTime,
        config.timezone
      )
      if (endsAt.getTime() <= from.getTime()) {
        cursor = nextDate
        continue
      }
      if (startsAt.getTime() >= to.getTime()) break

      const delta = daysBetween(config.loop.anchorDate, cursor)
      const idx = ((delta % n) + n) % n
      const day = config.loop.days[idx]
      out.push({
        dayKey: `loop-${idx + 1}`,
        title: `Day ${idx + 1}`,
        eventIds: [...(day?.eventIds ?? [])],
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      })
      if (cursor >= endKey && startsAt.getTime() > to.getTime()) break
      cursor = nextDate
    }
    return out
  }

  // calendar: each assigned date
  const sorted = [...config.calendar.days].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  for (const d of sorted) {
    if (out.length >= maxSlots) break
    const startsAt = flipInstantOnDate(d.date, config.flipTime, config.timezone)
    const endsAt = flipInstantOnDate(
      addCalendarDays(d.date, 1),
      config.flipTime,
      config.timezone
    )
    if (
      endsAt.getTime() <= from.getTime() ||
      startsAt.getTime() >= to.getTime()
    ) {
      continue
    }
    out.push({
      dayKey: d.date,
      title: d.date,
      eventIds: [...d.eventIds],
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    })
  }
  return out
}

export function nextScheduleChangeAt(
  config: EventScheduleConfig,
  now: Date = new Date()
): string | null {
  if (!config.enabled) return null
  return nextFlipInstant(config, now).toISOString()
}

export function defaultEventScheduleConfig(
  now: Date = new Date()
): EventScheduleConfig {
  const anchorDate = formatDateInTimeZone(now, DEFAULT_TIMEZONE)
  return {
    version: 2,
    enabled: false,
    mode: "loop",
    timezone: DEFAULT_TIMEZONE,
    flipTime: DEFAULT_FLIP_TIME,
    alwaysOnIds: ["201506_wonder"],
    loop: {
      anchorDate,
      days: [],
    },
    calendar: { days: [] },
  }
}

/** Migrate v1 offset windows → v2 loop days (best-effort). */
export function migrateV1ToV2(v1: EventScheduleConfigV1): EventScheduleConfig {
  const base = defaultEventScheduleConfig()
  const anchorDate = v1.loop?.anchorAt
    ? formatDateInTimeZone(
        new Date(v1.loop.anchorAt),
        v1.timezone || DEFAULT_TIMEZONE
      )
    : base.loop.anchorDate

  const cycleDays = Math.max(1, Math.floor(v1.loop?.cycleDays || 1))
  const dayBuckets: string[][] = Array.from({ length: cycleDays }, () => [])

  for (const w of v1.windows ?? []) {
    const startDay = Math.floor(w.startOffsetMinutes / (24 * 60))
    const endDay = Math.max(
      startDay,
      Math.ceil(w.endOffsetMinutes / (24 * 60)) - 1
    )
    for (let d = startDay; d <= endDay && d < cycleDays; d++) {
      for (const id of w.eventIds ?? []) {
        if (!dayBuckets[d].includes(id)) dayBuckets[d].push(id)
      }
    }
  }

  // Trim trailing empty days but keep at least structure if any had events
  let last = dayBuckets.length - 1
  while (last > 0 && dayBuckets[last].length === 0) last--
  const days = dayBuckets.slice(0, last + 1).map((eventIds) => ({
    id: crypto.randomUUID(),
    eventIds: normalizeIds(eventIds),
  }))

  return {
    version: 2,
    enabled: Boolean(v1.enabled),
    mode: "loop",
    timezone: v1.timezone || DEFAULT_TIMEZONE,
    flipTime: DEFAULT_FLIP_TIME,
    alwaysOnIds: normalizeIds(v1.alwaysOnIds ?? []),
    loop: { anchorDate, days },
    calendar: { days: [] },
  }
}

export function isValidDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}
